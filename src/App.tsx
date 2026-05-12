import {
  Activity,
  ArrowUpRight,
  Blocks,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Database,
  FileText,
  Gauge,
  Landmark,
  Link,
  RefreshCw,
  Search,
  Server,
  Shield,
  Wallet,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GENLAYER_CONFIGURED_CONTRACT_ADDRESS,
  GENLAYER_CHAIN_ID,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_CONTRACT_METHOD,
  GENLAYER_EFFECTIVE_RPC_ENDPOINT,
  GENLAYER_LATEST_REPORT_METHOD,
  GENLAYER_NETWORK_LABEL,
  GENLAYER_REPORT_FOR_CLAIM_METHOD,
  GENLAYER_SNAP_ID,
  GENLAYER_WALLET_RPC_ENDPOINT,
  METAMASK_REQUIRED_MESSAGE,
  describeProviderRequestError,
  evaluateClaimWithGenLayer,
  getMetaMaskProvider,
  readConnectedMetaMaskAccounts,
  readGenLayerSnapStatus,
  requestMetaMaskAccounts,
  requestGenLayerSnapInstall,
  isPendingProviderRequest,
  type BrowserEthereumProvider,
  type GenLayerEvaluationResult,
  type ProviderMethodName,
  type SlashShieldContractInput,
} from "./lib/genlayerClient";

type Route = "home" | "claim" | "network" | "wallet" | "contract" | "blocks" | "scenario";
type ScenarioKey = "provider-outage" | "operator-maintenance";

type RpcHealth = {
  chainIdHex: string;
  chainId: number | null;
  latestBlock: number | null;
  blockHash: string;
  parentHash: string;
  timestamp: number | null;
  gasPriceWei: bigint | null;
  baseFeeWei: bigint | null;
  gasUsed: number | null;
  gasLimit: number | null;
  txCount: number | null;
  syncing: boolean | string;
  latencyMs: number | null;
  checkedAt: string;
  error: string;
};

type BlockRow = {
  number: number;
  hash: string;
  timestamp: number;
  txCount: number;
  gasUsed: number;
  gasLimit: number;
  miner: string;
};

type WalletState = {
  address: string;
  chainIdHex: string;
  balanceWei: bigint | null;
  nonce: number | null;
  error: string;
};

type ContractState = {
  address: string;
  balanceWei: bigint | null;
  nonce: number | null;
  codeSize: number | null;
  codeHash: string;
  lastChecked: string;
  error: string;
};

type ClaimReport = {
  claim_id: string;
  verdict: "APPROVED" | "PARTIAL" | "REJECTED";
  payout_wei: string;
  provider_match: boolean;
  region_match: boolean;
  time_overlap: boolean;
  non_malicious_liveness_loss: boolean;
  excluded_cause_found: boolean;
  reason: string;
};

type ContractCallState = {
  status:
    | "idle"
    | "connecting_wallet"
    | "wallet_ready"
    | "evaluating"
    | "succeeded"
    | "failed"
    | "pending_stuck";
  result: GenLayerEvaluationResult | null;
  error: string;
};

type WalletLoadResult = {
  address: string;
  error: string;
};

type SnapConnectionState = {
  status:
    | "idle"
    | "metamask-missing"
    | "metamask-found"
    | "snap-missing"
    | "installing-snap"
    | "snap-installed"
    | "wallet-connected"
    | "snap-rejected"
    | "error";
  metamaskDetected: boolean;
  snapInstalled: boolean;
  message: string;
  error: string;
};

const INITIAL_SNAP_CONNECTION: SnapConnectionState = {
  status: "idle",
  metamaskDetected: false,
  snapInstalled: false,
  message: "Authorize MetaMask to check account access and the GenLayer plugin.",
  error: "",
};

declare global {
  interface Window {
    ethereum?: BrowserEthereumProvider;
  }
}

const RPC_URL = GENLAYER_WALLET_RPC_ENDPOINT;
const READ_RPC_URL = GENLAYER_EFFECTIVE_RPC_ENDPOINT;
const PUBLIC_APP_URL = "https://slashshield.vercel.app";
const DISPLAY_NETWORK_LABEL = GENLAYER_NETWORK_LABEL.replace(/^Genlayer\b/, "GenLayer");
const NETWORK_PAGE_TITLE = DISPLAY_NETWORK_LABEL.toLowerCase().includes("network")
  ? DISPLAY_NETWORK_LABEL
  : `${DISPLAY_NETWORK_LABEL} network`;
const WALLET_REQUEST_TIMEOUT_MS = 30_000;
const EVALUATION_WRITE_TIMEOUT_MS = 90_000;
const EVALUATION_WAIT_TIMEOUT_MS = 180_000;
let rpcId = 0;
const APPROVED_EVIDENCE_URL = `${PUBLIC_APP_URL}/evidence/aws-us-east-1-incident`;
const REJECTED_EVIDENCE_URL = `${PUBLIC_APP_URL}/evidence/operator-maintenance`;
const APPROVED_STUDIO_REPORT = `{"claim_id":"SS-INC-04812-URL","excluded_cause_found":false,"non_malicious_liveness_loss":true,"payout_wei":"1000000000000000000","provider_match":true,"reason":"AWS us-east-1 EBS outage overlapped the slashing window, validator evidence shows missed attestations and 1 ETH slash, and no maintenance, key compromise, double-signing, or unpaid premium evidence was provided.","region_match":true,"time_overlap":true,"verdict":"APPROVED"}`;
const REJECTED_STUDIO_REPORT = `{"claim_id":"SS-INC-04813-URL","excluded_cause_found":true,"non_malicious_liveness_loss":false,"payout_wei":"0","provider_match":true,"reason":"Claim excluded due to operator maintenance. Evidence confirms voluntary Prysm 5.0.4 rollout and signer migration, and no AWS infrastructure outage occurred during the window.","region_match":true,"time_overlap":true,"verdict":"REJECTED"}`;
const POLICY_SCHEMA = {
  operator: "validator operator submitting the claim",
  provider: "covered infrastructure provider, e.g. AWS",
  region: "covered provider region, e.g. us-east-1",
  coverage_window: "slashing/downtime window that evidence must overlap",
  max_payout: "maximum prototype payout eligibility for the claim",
  exclusions: ["operator maintenance", "key compromise", "double signing", "unpaid premium"],
};

const SCENARIOS: Record<ScenarioKey, {
  key: ScenarioKey;
  label: string;
  title: string;
  shortTitle: string;
  claimId: string;
  provider: string;
  region: string;
  timeWindow: string;
  evidenceType: string;
  evidenceUrl: string;
  slashAmountWei: string;
  maxPayoutWei: string;
  expectedDecision: "APPROVED" | "REJECTED";
  reportJson: string;
  summary: string;
  policyRelevance: string;
  studioNote: string;
}> = {
  "provider-outage": {
    key: "provider-outage",
    label: "Provider outage claim",
    title: "Provider outage claim",
    shortTitle: "Provider outage",
    claimId: "SS-INC-04812-URL",
    provider: "AWS",
    region: "us-east-1",
    timeWindow: "2026-04-26 14:08 to 14:44 UTC",
    evidenceType: "Synthetic provider outage report",
    evidenceUrl: APPROVED_EVIDENCE_URL,
    slashAmountWei: "1000000000000000000",
    maxPayoutWei: "1000000000000000000",
    expectedDecision: "APPROVED",
    reportJson: APPROVED_STUDIO_REPORT,
    summary: "AWS us-east-1 EBS control-plane degradation overlaps the covered downtime/slashing window.",
    policyRelevance: "Provider, region, and time window match the policy. No maintenance or operator-error exclusion is present.",
    studioNote: "Studio-tested result: APPROVED. Screenshot committed under docs/screenshots.",
  },
  "operator-maintenance": {
    key: "operator-maintenance",
    label: "Operator maintenance claim",
    title: "Operator maintenance claim",
    shortTitle: "Operator maintenance",
    claimId: "SS-INC-04813-URL",
    provider: "AWS",
    region: "us-east-1",
    timeWindow: "2026-04-26 19:42 to 20:05 UTC",
    evidenceType: "Synthetic operator maintenance report",
    evidenceUrl: REJECTED_EVIDENCE_URL,
    slashAmountWei: "310000000000000000",
    maxPayoutWei: "310000000000000000",
    expectedDecision: "REJECTED",
    reportJson: REJECTED_STUDIO_REPORT,
    summary: "Downtime occurs during a voluntary Prysm rollout and signer migration.",
    policyRelevance: "Scheduled operator maintenance is an exclusion, even though provider and region fields match.",
    studioNote: "Studio-tested result: REJECTED. Screenshot committed under docs/screenshots.",
  },
};

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function hexToNumber(hex?: string | null) {
  return hex ? Number.parseInt(hex, 16) : null;
}

function hexToBigInt(hex?: string | null) {
  return hex ? BigInt(hex) : null;
}

function formatWei(value: bigint | null, unit = "GEN") {
  if (value === null) return "—";
  const base = 10n ** 18n;
  const whole = value / base;
  const fraction = (value % base).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fraction} ${unit}`;
}

function formatWeiString(value: string) {
  try {
    return formatWei(BigInt(value), "GEN");
  } catch {
    return "invalid";
  }
}

function formatGwei(value: bigint | null) {
  if (value === null) return "—";
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").slice(0, 4);
  return `${whole.toLocaleString()}.${fraction} gwei`;
}

function shortHash(value: string) {
  if (!value) return "—";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function timeFromUnix(seconds: number | null) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

function pct(used: number | null, limit: number | null) {
  if (!used || !limit) return "—";
  return `${((used / limit) * 100).toFixed(2)}%`;
}

function isFullAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

async function rpc<T>(method: string, params: unknown[] = [], url = RPC_URL): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || method);
  return payload.result as T;
}

function useAppRoute(): [Route, (route: Route) => void] {
  const read = () => {
    const path = window.location.pathname.replace(/\/$/, "");
    const raw = window.location.hash.replace("#", "");
    if (raw === "network" || raw === "wallet" || raw === "contract" || raw === "blocks" || raw === "scenario") return raw;
    if (path === "/claim") return "claim";
    if (path === "") return "home";
    return "home";
  };
  const [route, setRouteState] = useState<Route>(read);
  useEffect(() => {
    const onRouteChange = () => setRouteState(read());
    window.addEventListener("hashchange", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    return () => {
      window.removeEventListener("hashchange", onRouteChange);
      window.removeEventListener("popstate", onRouteChange);
    };
  }, []);
  return [
    route,
    (next) => {
      const target = next === "home" ? "/" : next === "claim" ? "/claim" : `/#${next}`;
      window.history.pushState(null, "", target);
      setRouteState(next);
    },
  ];
}

function useBradbury() {
  const [health, setHealth] = useState<RpcHealth>({
    chainIdHex: "",
    chainId: null,
    latestBlock: null,
    blockHash: "",
    parentHash: "",
    timestamp: null,
    gasPriceWei: null,
    baseFeeWei: null,
    gasUsed: null,
    gasLimit: null,
    txCount: null,
    syncing: "unknown",
    latencyMs: null,
    checkedAt: "",
    error: "",
  });
  const [blocks, setBlocks] = useState<BlockRow[]>([]);

  async function refresh() {
    const started = performance.now();
    try {
      const [chainIdHex, gasPriceHex, syncing, latest] = await Promise.all([
        rpc<string>("eth_chainId"),
        rpc<string>("eth_gasPrice"),
        rpc<boolean | string>("eth_syncing"),
        rpc<Record<string, string | string[]>>("eth_getBlockByNumber", ["latest", false]),
      ]);
      const latestNumber = hexToNumber(latest.number as string);
      const rows: BlockRow[] = [];
      if (latestNumber !== null) {
        const wanted = Array.from({ length: 6 }, (_, index) => latestNumber - index).filter((n) => n >= 0);
        const fetched = await Promise.all(
          wanted.map((n) => rpc<Record<string, string | string[]>>("eth_getBlockByNumber", [`0x${n.toString(16)}`, false])),
        );
        for (const block of fetched) {
          rows.push({
            number: hexToNumber(block.number as string) || 0,
            hash: block.hash as string,
            timestamp: hexToNumber(block.timestamp as string) || 0,
            txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
            gasUsed: hexToNumber(block.gasUsed as string) || 0,
            gasLimit: hexToNumber(block.gasLimit as string) || 0,
            miner: block.miner as string,
          });
        }
      }
      setBlocks(rows);
      setHealth({
        chainIdHex,
        chainId: hexToNumber(chainIdHex),
        latestBlock: latestNumber,
        blockHash: latest.hash as string,
        parentHash: latest.parentHash as string,
        timestamp: hexToNumber(latest.timestamp as string),
        gasPriceWei: hexToBigInt(gasPriceHex),
        baseFeeWei: hexToBigInt(latest.baseFeePerGas as string),
        gasUsed: hexToNumber(latest.gasUsed as string),
        gasLimit: hexToNumber(latest.gasLimit as string),
        txCount: Array.isArray(latest.transactions) ? latest.transactions.length : null,
        syncing,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: new Date().toLocaleTimeString(),
        error: "",
      });
    } catch (error) {
      setHealth((current) => ({
        ...current,
        latencyMs: null,
        checkedAt: new Date().toLocaleTimeString(),
        error: error instanceof Error ? error.message : `${DISPLAY_NETWORK_LABEL} RPC unavailable`,
      }));
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return { health, blocks, refresh };
}

function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: "",
    chainIdHex: "",
    balanceWei: null,
    nonce: null,
    error: "",
  });

  async function load(
    address?: string,
    options: { requestAccounts?: boolean; readDetails?: boolean } = {},
  ): Promise<WalletLoadResult> {
    const provider = getMetaMaskProvider(window.ethereum);
    if (!provider) {
      const message = METAMASK_REQUIRED_MESSAGE;
      setWallet((current) => ({ ...current, error: message }));
      return { address: "", error: message };
    }
    try {
      let accounts = address ? [address] : await readConnectedMetaMaskAccounts(provider);
      if (!accounts[0] && options.requestAccounts) {
        accounts = await requestMetaMaskAccounts(provider);
      }
      const selected = accounts[0] || "";
      if (!isFullAddress(selected)) {
        const message = options.requestAccounts
          ? "MetaMask did not return a usable 0x account. Open MetaMask and approve account access."
          : "No MetaMask account is authorized for this site. Click Authorize MetaMask to request account access.";
        setWallet((current) => ({ ...current, address: "", error: message }));
        return { address: "", error: message };
      }

      const detailRequests = options.readDetails
        ? [
            provider.request({ method: "eth_chainId" }) as Promise<string>,
            provider.request({ method: "eth_getBalance", params: [selected, "latest"] }) as Promise<string>,
            provider.request({ method: "eth_getTransactionCount", params: [selected, "latest"] }) as Promise<string>,
          ]
        : [provider.request({ method: "eth_chainId" }) as Promise<string>];
      const [chainIdResult, balanceResult, nonceResult] = await Promise.allSettled(detailRequests);
      const chainIdHex = chainIdResult.status === "fulfilled" ? chainIdResult.value : "";
      const balanceHex = balanceResult?.status === "fulfilled" ? balanceResult.value : "";
      const nonceHex = nonceResult?.status === "fulfilled" ? nonceResult.value : "";
      const detailErrors = [chainIdResult, balanceResult, nonceResult]
        .filter(Boolean)
        .filter((result) => result.status === "rejected")
        .map((result) => describeProviderRequestError((result as PromiseRejectedResult).reason, "Wallet detail read failed.", "wallet_detail_read"));
      const detailError = detailErrors.length ? `Account authorized; ${detailErrors.join(" ")}` : "";

      setWallet({
        address: selected,
        chainIdHex,
        balanceWei: hexToBigInt(balanceHex),
        nonce: hexToNumber(nonceHex),
        error: detailError,
      });
      return { address: selected, error: options.readDetails ? detailError : "" };
    } catch (error) {
      const failedMethod: ProviderMethodName = address ? "wallet_detail_read" : options.requestAccounts ? "eth_requestAccounts" : "eth_accounts";
      const message = describeProviderRequestError(error, "Wallet account access failed.", failedMethod);
      setWallet((current) => ({
        ...current,
        error: message,
      }));
      return { address: "", error: message };
    }
  }

  useEffect(() => {
    const provider = getMetaMaskProvider(window.ethereum);
    if (!provider?.on) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts?.[0]) load(accounts[0], { requestAccounts: false, readDetails: false });
      else setWallet({ address: "", chainIdHex: "", balanceWei: null, nonce: null, error: "" });
    };
    const chainChanged = () => {
      if (wallet.address) load(wallet.address, { requestAccounts: false, readDetails: false });
    };
    provider.on("accountsChanged", accountsChanged);
    provider.on("chainChanged", chainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [wallet.address]);

  return {
    wallet,
    connectWallet: async () => (await load(undefined, { requestAccounts: true, readDetails: true })).address,
    connectWalletDetailed: () => load(undefined, { requestAccounts: true, readDetails: false }),
    refreshWallet: async () => (wallet.address ? (await load(wallet.address, { requestAccounts: false, readDetails: true })).address : ""),
    resetWallet: () => setWallet({ address: "", chainIdHex: "", balanceWei: null, nonce: null, error: "" }),
  };
}

async function readContract(address: string): Promise<ContractState> {
  const clean = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    throw new Error("Enter a full 0x contract address");
  }
  const [balanceHex, nonceHex, code] = await Promise.all([
    rpc<string>("eth_getBalance", [clean, "latest"]),
    rpc<string>("eth_getTransactionCount", [clean, "latest"]),
    rpc<string>("eth_getCode", [clean, "latest"]),
  ]);
  const codeSize = code === "0x" ? 0 : (code.length - 2) / 2;
  return {
    address: clean,
    balanceWei: hexToBigInt(balanceHex),
    nonce: hexToNumber(nonceHex),
    codeSize,
    codeHash: code === "0x" ? "0x" : `${code.slice(0, 18)}...${code.slice(-12)}`,
    lastChecked: new Date().toLocaleTimeString(),
    error: "",
  };
}

function Brand() {
  return (
    <div className="brand">
      <div className="mark"><Shield size={15} /></div>
      <div>
        <strong>SlashShield</strong>
        <span>CLAIM CONSOLE</span>
      </div>
    </div>
  );
}

function Nav({ route, setRoute }: { route: Route; setRoute: (route: Route) => void }) {
  const items = [
    ["home", "Overview", Shield],
    ["claim", "Claim console", Landmark],
    ["network", "Network", Server],
    ["wallet", "Wallet", Wallet],
    ["contract", "Contract", Database],
    ["blocks", "Blocks", Blocks],
    ["scenario", "Scope", ClipboardList],
  ] as const;
  return (
    <aside className="app-nav">
      <Brand />
      <nav>
        <p>CONSOLE</p>
        {items.map(([key, label, Icon]) => (
          <button key={key} className={cx("nav-item", route === key && "active")} onClick={() => setRoute(key)}>
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="nav-note">
        <b>Submission framing</b>
        <span>Lead with the GenLayer coverage decision. RPC data is proof, not the product.</span>
      </div>
    </aside>
  );
}

function PageHead({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function parseReport(raw: string): { report: ClaimReport | null; error: string } {
  if (!raw.trim()) return { report: null, error: "" };
  try {
    const parsed = JSON.parse(raw) as ClaimReport;
    const required = ["claim_id", "verdict", "payout_wei", "reason"];
    const missing = required.filter((key) => !(key in parsed));
    if (missing.length) return { report: null, error: `Missing fields: ${missing.join(", ")}` };
    if (!["APPROVED", "PARTIAL", "REJECTED"].includes(parsed.verdict)) {
      return { report: null, error: `Unsupported verdict: ${parsed.verdict}` };
    }
    return { report: parsed, error: "" };
  } catch (error) {
    return { report: null, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

function DecisionRow({ label, value, detail }: { label: string; value: boolean; detail: string }) {
  return (
    <div className={cx("decision-row", value ? "ok" : "bad")}>
      {value ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <b>{value ? "MET" : "NOT MET"}</b>
    </div>
  );
}

function ReadinessGate({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={cx("readiness-gate", ok ? "ok" : "warn")}>
      {ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function decisionPayload(report: ClaimReport | null) {
  if (!report) return null;
  const payoutWei = BigInt(report.payout_wei || "0");
  return {
    decision: report.verdict,
    provider_match: report.provider_match,
    region_match: report.region_match,
    time_overlap: report.time_overlap,
    exclusion_detected: report.excluded_cause_found,
    payout_allowed: (report.verdict === "APPROVED" || report.verdict === "PARTIAL") && payoutWei > 0n,
    reason: report.reason,
  };
}

function ScenarioActions({ scenario }: { scenario: (typeof SCENARIOS)[ScenarioKey] }) {
  return (
    <div className="scenario-actions">
      <a className="btn" href={scenario.evidenceUrl} target="_blank" rel="noreferrer">
        View evidence <ArrowUpRight size={13} />
      </a>
      <a className="btn primary" href={`/claim?scenario=${scenario.key}`}>
        Open in claim console
      </a>
    </div>
  );
}

function ScenarioCard({
  title,
  provider,
  region,
  evidenceType,
  expectedDecision,
  actualDecision,
  report,
  scenario,
}: {
  title: string;
  provider: string;
  region: string;
  evidenceType: string;
  expectedDecision: "APPROVED" | "REJECTED";
  actualDecision: "APPROVED" | "REJECTED";
  report: ClaimReport;
  scenario?: (typeof SCENARIOS)[ScenarioKey];
}) {
  const payload = decisionPayload(report);
  return (
    <article className="scenario-card">
      <div className="scenario-title">
        <h3>{title}</h3>
        <span className={cx("verdict-chip", expectedDecision === "APPROVED" ? "ok" : "bad")}>{expectedDecision}</span>
      </div>
      <div className="scenario-meta">
        <Kv label="Provider" value={provider} />
        <Kv label="Region" value={region} />
        <Kv label="Evidence type" value={evidenceType} />
        <Kv label="Expected" value={expectedDecision} />
        <Kv label="Actual" value={actualDecision} />
      </div>
      {scenario && <ScenarioActions scenario={scenario} />}
      <pre className="decision-code">{JSON.stringify(payload, null, 2)}</pre>
    </article>
  );
}

function FlowCard({ title, body, icon: Icon }: { title: string; body: string; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <article className="flow-card">
      <Icon size={18} />
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function MarketingNav({ active }: { active: "home" | "claim" | "evidence" }) {
  return (
    <header className="marketing-nav">
      <a className="marketing-brand" href="/" aria-label="SlashShield home">
        <span className="marketing-mark"><Shield size={17} /></span>
        <strong>SlashShield</strong>
        <span>v0.5</span>
      </a>
      <nav aria-label="Primary">
        <a className={cx(active === "home" && "active")} href="/">Home</a>
        <a className={cx(active === "claim" && "active")} href="/claim">Claim console</a>
        <a className={cx(active === "evidence" && "active")} href="/evidence">Evidence</a>
        <a href="https://github.com/alireza78a/slashshield" target="_blank" rel="noreferrer">
          Docs <ArrowUpRight size={13} />
        </a>
      </nav>
      <div className="marketing-actions">
        <span><i /> Studio · live</span>
        <a className="marketing-console-btn" href="/claim">Open console <ArrowUpRight size={13} /></a>
      </div>
    </header>
  );
}

function LandingReasonCard({ index, title, body, code }: { index: string; title: string; body: string; code: string }) {
  return (
    <article className="landing-reason-card">
      <span>{index}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      <code>$ {code}</code>
    </article>
  );
}

function LandingCaseCard({
  scenario,
  quote,
  checks,
}: {
  scenario: (typeof SCENARIOS)[ScenarioKey];
  quote: string;
  checks: Array<[string, boolean]>;
}) {
  const approved = scenario.expectedDecision === "APPROVED";
  return (
    <article className={cx("landing-case-card", approved ? "approved" : "rejected")}>
      <div className="landing-case-top">
        <span className={cx("verdict-chip", approved ? "ok" : "bad")}>
          <i /> {scenario.expectedDecision}
        </span>
        <b>{scenario.claimId.replace("-URL", "")}</b>
      </div>
      <h3>{approved ? "Provider outage" : "Operator maintenance"}</h3>
      <blockquote>{quote}</blockquote>
      <div className="landing-json-lines" aria-label={`${scenario.title} decision fields`}>
        {checks.map(([label, value]) => (
          <p key={label}>
            <span>"{label}":</span>
            <b className={value ? "ok" : "bad"}>{String(value)}</b>
          </p>
        ))}
      </div>
      <div className="landing-case-bottom">
        <span>Payout</span>
        <strong>{approved ? "1.0000 GEN" : "0.0000 GEN"}</strong>
      </div>
      <a className="btn" href={`/claim?scenario=${approved ? "provider-outage" : "operator-maintenance"}`}>
        Open case <ArrowUpRight size={14} />
      </a>
    </article>
  );
}

function HomePage() {
  const providerScenario = SCENARIOS["provider-outage"];
  const maintenanceScenario = SCENARIOS["operator-maintenance"];
  const contractShort = GENLAYER_CONFIGURED_CONTRACT_ADDRESS ? shortHash(GENLAYER_CONFIGURED_CONTRACT_ADDRESS) : "not configured";
  return (
    <>
      <MarketingNav active="home" />
      <div className="page-body home-body">
        <section className="hero-panel home-hero">
          <div className="hero-copy">
            <div className="hero-kicker"><Shield size={14} /> GenLayer Studio · v0.5 claim-bound</div>
            <h1>
              Was it<br />
              the cloud,<br />
              or was it <em>you</em>?
            </h1>
            <p>
              SlashShield reads the same outage notes a human adjuster would and turns
              them into a bounded, on-chain verdict for validator downtime claims.
            </p>
            <div className="hero-actions" aria-label="Primary demo links">
              <a className="btn primary hero-cta" href="/claim">Submit a claim <ArrowUpRight size={15} /></a>
              <a className="btn hero-secondary" href="#demo-cases">See sample evidence</a>
            </div>
            <div className="landing-stats" aria-label="Prototype stats">
              <div><strong>2</strong><span>Demo scenarios</span></div>
              <div><strong>1.0 GEN</strong><span>Max payout</span></div>
              <div><strong>v0.5</strong><span>Claim-bound reports</span></div>
            </div>
          </div>
          <div className="hero-proof" aria-label="Claim review proof preview">
            <div className="artifact-verdict-card approved">
              <div>
                <span className="verdict-chip ok"><i /> APPROVED</span>
                <b>SS-INC-04812</b>
              </div>
              <strong>AWS us-east-1 outage</strong>
              <p>Provider · region · time window all matched the policy. No exclusion.</p>
              <small><span>Payout</span><b>1.0000 GEN</b></small>
            </div>
            <div className="artifact-verdict-card rejected">
              <div>
                <b>SS-INC-04813</b>
              </div>
              <strong>Operator maintenance</strong>
              <p>Voluntary stoppage is an excluded cause under section 4.2.</p>
              <small><span>Payout</span><b>0.0000 GEN</b></small>
            </div>
          </div>
        </section>

        <section className="landing-flow-strip" aria-label="Claim flow">
          {["Policy", "Claim", "Evidence", "Reasoning", "Decision"].map((item, index) => (
            <div key={item}>
              <span>{index + 1}</span>
              <b>{item}</b>
            </div>
          ))}
        </section>

        <section className="landing-section landing-why" id="how-it-works">
          <div className="landing-section-head">
            <div>
              <span>§ 01 · Why GenLayer</span>
              <h2>Outage reports aren’t <em>oracle ticks</em>.</h2>
            </div>
            <p>
              They’re messy English from AWS status pages and operator changelogs.
              A normal contract can’t tell the difference between <em>“us-east-1 EBS degraded”</em>
              and <em>“scheduled key rotation”</em>. GenLayer can.
            </p>
          </div>
          <div className="landing-reason-grid">
            <LandingReasonCard
              index="01"
              title="Natural-language evidence"
              body="AWS status posts, operator changelogs, validator dashboards. We point at the URL; the contract reads."
              code="evidence_url"
            />
            <LandingReasonCard
              index="02"
              title="Five-point reasoning"
              body="Provider match, region match, time overlap, exclusion check, payout eligibility. Bounded, auditable, JSON."
              code="evaluate_slashing_claim"
            />
            <LandingReasonCard
              index="03"
              title="Verdict on-chain"
              body="GenLayer commits the result. SlashShield reads it back and renders a verdict the operator can inspect."
              code="report_for_claim"
            />
          </div>
        </section>

        <section className="landing-section landing-cases" id="demo-cases">
          <div className="landing-section-head">
            <div>
              <span>§ 02 · Demo cases</span>
              <h2>Two scenarios. <em>No ambiguity.</em></h2>
            </div>
            <p>
              Same provider, same region, same window. One pays out, one doesn’t.
              The difference is the kind of evidence and the contract can tell.
            </p>
          </div>
          <div className="landing-case-grid">
            <LandingCaseCard
              scenario={providerScenario}
              quote="AWS us-east-1 outage overlapped slashing window; cause is infrastructure-related and non-malicious; no exclusions apply."
              checks={[
                ["provider_match", true],
                ["region_match", true],
                ["time_overlap", true],
                ["exclusion_detected", false],
                ["payout_allowed", true],
              ]}
            />
            <LandingCaseCard
              scenario={maintenanceScenario}
              quote="Claim excluded due to operator maintenance. Intentional service stoppage is not a covered infrastructure outage."
              checks={[
                ["provider_match", true],
                ["region_match", true],
                ["time_overlap", true],
                ["exclusion_detected", true],
                ["payout_allowed", false],
              ]}
            />
          </div>
        </section>

        <section className="landing-cta-band">
          <div>
            <span>Ready to test</span>
            <h2>Run the demo, watch the contract decide.</h2>
            <p>
              Wallet-gated evaluation. Two scenarios. Bounded JSON. Audit trail.
              Demo evidence only; no real settlement claim.
            </p>
          </div>
          <div className="landing-cta-actions">
            <a className="btn primary" href="/claim">Open claim console <ArrowUpRight size={15} /></a>
            <a className="btn" href="/evidence">Read sample evidence <ArrowUpRight size={15} /></a>
          </div>
        </section>

        <footer className="landing-footer">
          <div>
            <a className="marketing-brand" href="/" aria-label="SlashShield home">
              <span className="marketing-mark"><Shield size={15} /></span>
              <strong>SlashShield</strong>
            </a>
            <p>Parametric validator downtime claims, adjudicated by GenLayer evidence reasoning. Prototype only, synthetic evidence, no real settlement.</p>
          </div>
          <div>
            <span>Product</span>
            <a href="/claim">Claim console</a>
            <a href="/evidence">Evidence</a>
            <a href="/#scenario">Policy</a>
            <a href="https://github.com/alireza78a/slashshield" target="_blank" rel="noreferrer">Docs</a>
          </div>
          <div>
            <span>Contract</span>
            <p>v0.5 claim-bound</p>
            <p>{contractShort}</p>
            <p>Studio · Bradbury</p>
            <p>{GENLAYER_CONTRACT_METHOD}</p>
          </div>
          <div>
            <span>Limits</span>
            <p>Prototype only</p>
            <p>Synthetic evidence</p>
            <p>No live feed</p>
            <p>Not legal advice</p>
          </div>
          <div className="landing-footer-bottom">
            <span>© 2026 SlashShield · prototype</span>
            <a href="https://github.com/alireza78a/slashshield" target="_blank" rel="noreferrer">
              alireza78a / slashshield <ArrowUpRight size={13} />
            </a>
            <span>Updated · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        </footer>
      </div>
    </>
  );
}

function ClaimConsolePage({
  wallet,
  connectWalletDetailed,
  resetWallet,
}: {
  wallet: WalletState;
  connectWalletDetailed: () => Promise<WalletLoadResult>;
  resetWallet: () => void;
}) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>(() => {
    const query = new URLSearchParams(window.location.search).get("scenario");
    return query === "operator-maintenance" ? "operator-maintenance" : "provider-outage";
  });
  const [contractAddress, setContractAddress] = useState(() => GENLAYER_CONFIGURED_CONTRACT_ADDRESS || localStorage.getItem("slashshield.contract") || "");
  const [contractCall, setContractCall] = useState<ContractCallState>({ status: "idle", result: null, error: "" });
  const [walletConnectError, setWalletConnectError] = useState("");
  const [snapConnection, setSnapConnection] = useState<SnapConnectionState>(INITIAL_SNAP_CONNECTION);
  const [walletRequestInFlight, setWalletRequestInFlight] = useState(false);
  const [evaluationRequestInFlight, setEvaluationRequestInFlight] = useState(false);
  const [lastFailedMethod, setLastFailedMethod] = useState("none");
  const [lastErrorMessage, setLastErrorMessage] = useState("");
  const [reviewerProofOpen, setReviewerProofOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const walletRequestInFlightRef = useRef(false);
  const evaluationRequestInFlightRef = useRef(false);
  const pendingTimerRef = useRef<number | null>(null);
  const activeRequestMethodRef = useRef("none");
  const requestSerialRef = useRef(0);
  const scenario = SCENARIOS[selectedScenario];
  const scenarioInput = useMemo<SlashShieldContractInput>(() => ({
    claimId: scenario.claimId,
    evidenceUrl: scenario.evidenceUrl,
    provider: scenario.provider,
    coveredRegion: scenario.region,
    slashingWindowUtc: scenario.timeWindow,
    slashAmountWei: scenario.slashAmountWei,
    maxPayoutWei: scenario.maxPayoutWei,
  }), [scenario]);
  const { report: expectedReport, error: expectedReportError } = parseReport(scenario.reportJson);
  const liveReportParse = contractCall.result
    ? parseReport(contractCall.result.claimReportRaw)
    : { report: null, error: "" };
  const liveReport = liveReportParse.report;
  const liveDecision = decisionPayload(liveReport);
  const liveCallSucceeded = contractCall.status === "succeeded";
  const liveCallFailed = contractCall.status === "failed" || contractCall.status === "pending_stuck";
  const walletSetupFailed = contractCall.status === "failed" && Boolean(walletConnectError || snapConnection.error);
  const liveVerdict = liveReport?.verdict || (liveCallSucceeded ? "RETURNED" : "NOT RUN");
  const livePayoutValue = liveReport ? formatWeiString(liveReport.payout_wei) : "—";
  const expectedPayoutValue = expectedReport ? formatWeiString(expectedReport.payout_wei) : "—";
  const contractReady = isFullAddress(contractAddress);
  const evidenceReady = /^https?:\/\//.test(scenario.evidenceUrl.trim()) && !scenario.evidenceUrl.includes("127.0.0.1") && !scenario.evidenceUrl.includes("localhost");
  const walletReady = isFullAddress(wallet.address);
  const snapReady = snapConnection.snapInstalled;
  const busy = walletRequestInFlight || evaluationRequestInFlight;
  const canEvaluateContract = contractReady && evidenceReady && walletReady && snapReady && !busy;
  const evaluateDisabledReason = !contractReady
    ? "Add a deployed contract address before evaluating."
    : !evidenceReady
      ? "Use a public evidence URL before evaluating."
      : !walletReady && !snapReady
        ? "Authorize MetaMask account access and approve the GenLayer plugin before live evaluation."
        : !snapReady
          ? "Approve the GenLayer plugin before live evaluation."
          : !walletReady
            ? "Authorize account access before live evaluation."
            : busy
              ? "A MetaMask or contract request is already in progress."
              : "";
  const statusLabel = contractCall.status === "connecting_wallet"
    ? "AUTHORIZING"
    : contractCall.status === "wallet_ready"
      ? "ACCOUNT READY"
      : contractCall.status === "evaluating"
        ? "EVALUATING"
        : contractCall.status === "succeeded"
          ? "CONTRACT RETURNED"
          : contractCall.status === "failed"
            ? "CALL FAILED"
            : contractCall.status === "pending_stuck"
              ? "REQUEST STUCK"
              : "READY";
  const liveStatusTone = liveCallSucceeded ? "ok" : liveCallFailed ? "bad" : "warn";
  const stuckRequestMessage = "A MetaMask request is already pending. Open MetaMask and finish or reject it, then click Retry.";
  const proofSummary = JSON.stringify({
    contract_address: contractReady ? contractAddress : null,
    method: GENLAYER_CONTRACT_METHOD,
    report_read: GENLAYER_REPORT_FOR_CLAIM_METHOD,
    debug_latest_report: GENLAYER_LATEST_REPORT_METHOD,
    network: GENLAYER_NETWORK_LABEL,
    chain_id: GENLAYER_CHAIN_ID,
    rpc_url: GENLAYER_EFFECTIVE_RPC_ENDPOINT,
    wallet_rpc_url: GENLAYER_WALLET_RPC_ENDPOINT,
    wallet_address: walletReady ? wallet.address : null,
    scenario_input: scenarioInput,
    transaction_hash: contractCall.result?.transactionHash || null,
    receipt_status: contractCall.result?.receiptStatus || null,
    execution_result: contractCall.result?.executionResult || null,
    called_at: contractCall.result?.calledAt || null,
    claim_report: contractCall.result?.claimReport || null,
    error: contractCall.error || walletConnectError || snapConnection.error || null,
    request_debug: {
      walletRequestInFlight,
      evaluationRequestInFlight,
      lastFailedMethod,
      lastErrorMessage,
    },
  }, null, 2);
  const evaluationSteps = [
    {
      number: 1,
      label: "Select scenario",
      state: "done",
    },
    {
      number: 2,
      label: "Connect wallet",
      state: walletReady && snapReady ? "done" : walletRequestInFlight ? "active" : "idle",
    },
    {
      number: 3,
      label: "Run evaluation",
      state: liveCallSucceeded || liveCallFailed ? "done" : evaluationRequestInFlight ? "active" : walletReady && snapReady ? "active" : "idle",
    },
    {
      number: 4,
      label: "Review result",
      state: liveCallSucceeded || liveCallFailed ? "active" : "idle",
    },
  ];
  const failureReason = contractCall.status === "pending_stuck"
    ? contractCall.error || stuckRequestMessage
    : walletSetupFailed
      ? walletConnectError || snapConnection.error || "Account authorization did not complete. Retry the connection check and approve the MetaMask prompts."
      : liveCallFailed
        ? contractCall.error || "The deployed contract call did not return reviewer proof."
        : "";
  const primaryAction = liveCallSucceeded
    ? {
        label: copyStatus || "Copy proof summary",
        disabled: false,
        onClick: copyProofSummary,
        icon: Copy,
      }
    : liveCallFailed
      ? {
          label: "Try again",
          disabled: false,
          onClick: retryAfterFailedCall,
          icon: RefreshCw,
        }
      : evaluationRequestInFlight
        ? {
            label: "Evaluating...",
            disabled: true,
            onClick: () => undefined,
            icon: RefreshCw,
          }
        : walletReady && snapReady
          ? {
              label: "Run GenLayer evaluation",
              disabled: !canEvaluateContract,
              onClick: evaluateWithGenLayerContract,
              icon: Activity,
            }
          : {
              label: walletRequestInFlight ? "Connecting..." : "Connect wallet",
              disabled: walletRequestInFlight || evaluationRequestInFlight,
              onClick: () => connectClaimWallet(),
              icon: Wallet,
            };
  const PrimaryIcon = primaryAction.icon;

  function clearPendingTimer() {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }

  function recordRequestFailure(method: string, message: string) {
    setLastFailedMethod(method || "unknown");
    setLastErrorMessage(message);
  }

  function clearRequestFailure() {
    setLastFailedMethod("none");
    setLastErrorMessage("");
  }

  function methodFromMessage(message: string, fallback: string) {
    const match = message.match(/^([a-zA-Z0-9_]+) failed:/);
    return match?.[1] || fallback;
  }

  function releaseRequestLock(kind: "wallet" | "evaluation") {
    if (kind === "wallet") {
      walletRequestInFlightRef.current = false;
      setWalletRequestInFlight(false);
    } else {
      evaluationRequestInFlightRef.current = false;
      setEvaluationRequestInFlight(false);
    }
    activeRequestMethodRef.current = "none";
  }

  function releaseAllRequestLocks() {
    walletRequestInFlightRef.current = false;
    evaluationRequestInFlightRef.current = false;
    setWalletRequestInFlight(false);
    setEvaluationRequestInFlight(false);
    activeRequestMethodRef.current = "none";
  }

  function failActiveRequest(requestId: number, kind: "wallet" | "evaluation", method: string, message: string) {
    if (requestSerialRef.current !== requestId) return;
    requestSerialRef.current += 1;
    clearPendingTimer();
    releaseRequestLock(kind);
    recordRequestFailure(method, message);
    if (kind === "wallet") setWalletConnectError(message);
    setContractCall({ status: "failed", result: null, error: message });
  }

  function armRequestTimeout(requestId: number, kind: "wallet" | "evaluation", timeoutMs: number) {
    clearPendingTimer();
    pendingTimerRef.current = window.setTimeout(() => {
      if (requestSerialRef.current !== requestId) return;
      const timeoutSeconds = Math.round(timeoutMs / 1000);
      const method = activeRequestMethodRef.current === "none"
        ? kind === "wallet"
          ? "wallet_request_timeout"
          : GENLAYER_CONTRACT_METHOD
        : activeRequestMethodRef.current;
      const message = kind === "wallet"
        ? `Wallet request timed out after ${timeoutSeconds} seconds. The app request lock was released. Open MetaMask and finish or reject any pending request, then click Retry.`
        : `Contract evaluation timed out after ${timeoutSeconds} seconds. The app request lock was released. Open MetaMask and finish or reject any pending request, then click Try again.`;
      failActiveRequest(requestId, kind, method, message);
    }, timeoutMs);
  }

  function rearmEvaluationTimeout(requestId: number, stage: string) {
    const timeoutMs = stage === "wait_receipt" || stage === GENLAYER_REPORT_FOR_CLAIM_METHOD
      ? EVALUATION_WAIT_TIMEOUT_MS
      : EVALUATION_WRITE_TIMEOUT_MS;
    armRequestTimeout(requestId, "evaluation", timeoutMs);
  }

  function resetClaimWalletState() {
    requestSerialRef.current += 1;
    clearPendingTimer();
    releaseAllRequestLocks();
    resetWallet();
    setWalletConnectError("");
    clearRequestFailure();
    setCopyStatus("");
    setSnapConnection({ ...INITIAL_SNAP_CONNECTION });
    setContractCall({ status: "idle", result: null, error: "" });
  }

  function retryAfterFailedCall() {
    requestSerialRef.current += 1;
    clearPendingTimer();
    releaseAllRequestLocks();
    setWalletConnectError("");
    setContractCall({ status: "idle", result: null, error: "" });
    window.setTimeout(() => {
      if (walletReady && snapReady) evaluateWithGenLayerContract();
      else connectClaimWallet();
    }, 0);
  }

  function showAdvancedError() {
    setReviewerProofOpen(true);
    window.setTimeout(() => document.getElementById("reviewer-proof")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function copyProofSummary() {
    try {
      await navigator.clipboard.writeText(proofSummary);
      setCopyStatus("Copied proof summary.");
    } catch {
      setCopyStatus("Copy failed. Open reviewer proof details and select the summary manually.");
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("scenario");
    if (query === "provider-outage" || query === "operator-maintenance") {
      setSelectedScenario(query);
    }
  }, []);

  function loadScenario(next: ScenarioKey) {
    setSelectedScenario(next);
    setContractCall({ status: "idle", result: null, error: "" });
    setWalletConnectError("");
    clearRequestFailure();
    setCopyStatus("");
    window.history.replaceState(null, "", `/claim?scenario=${next}`);
  }

  async function connectClaimWallet() {
    if (walletRequestInFlightRef.current || evaluationRequestInFlightRef.current) return;
    const requestId = requestSerialRef.current + 1;
    requestSerialRef.current = requestId;
    walletRequestInFlightRef.current = true;
    setWalletRequestInFlight(true);
    setWalletConnectError("");
    clearRequestFailure();
    activeRequestMethodRef.current = "detect_provider";
    setCopyStatus("");
    setContractCall({ status: "connecting_wallet", result: null, error: "" });
    armRequestTimeout(requestId, "wallet", WALLET_REQUEST_TIMEOUT_MS);

    try {
      const provider = getMetaMaskProvider(window.ethereum);
      if (!provider) {
        const message = METAMASK_REQUIRED_MESSAGE;
        recordRequestFailure("detect_provider", message);
        setSnapConnection({
          status: "metamask-missing",
          metamaskDetected: false,
          snapInstalled: false,
          message,
          error: message,
        });
        setWalletConnectError(message);
        setContractCall({ status: "failed", result: null, error: message });
        return;
      }

      if (walletReady && snapReady) {
        setSnapConnection({
          status: "wallet-connected",
          metamaskDetected: true,
          snapInstalled: true,
          message: `Account authorized: ${wallet.address}. Evaluation will reuse this account without another wallet prompt.`,
          error: "",
        });
        setContractCall({ status: "wallet_ready", result: null, error: "" });
        return;
      }

      setSnapConnection({
        status: "metamask-found",
        metamaskDetected: true,
        snapInstalled: false,
        message: "MetaMask found. Checking the GenLayer plugin.",
        error: "",
      });

      activeRequestMethodRef.current = "wallet_getSnaps";
      const initialSnapStatus = await readGenLayerSnapStatus(provider);
      if (requestSerialRef.current !== requestId) return;
      if (!initialSnapStatus.snapsAvailable) {
        const message = initialSnapStatus.error || "MetaMask Snaps are unavailable in this wallet.";
        const method = initialSnapStatus.pendingRequest ? "failed_pending_request" : "wallet_getSnaps";
        recordRequestFailure(method, message);
        setSnapConnection({
          status: initialSnapStatus.pendingRequest ? "error" : "snap-missing",
          metamaskDetected: true,
          snapInstalled: false,
          message,
          error: message,
        });
        setWalletConnectError(message);
        setContractCall({ status: "failed", result: null, error: message });
        return;
      }

      let snapInstalled = initialSnapStatus.installed;
      if (!snapInstalled) {
        setSnapConnection({
          status: "snap-missing",
          metamaskDetected: true,
          snapInstalled: false,
          message: `GenLayer plugin missing: ${GENLAYER_SNAP_ID}.`,
          error: "",
        });
        setSnapConnection({
          status: "installing-snap",
          metamaskDetected: true,
          snapInstalled: false,
          message: `Requesting GenLayer plugin approval. Approve ${GENLAYER_SNAP_ID} in MetaMask.`,
          error: "",
        });

        try {
          activeRequestMethodRef.current = "wallet_requestSnaps";
          const installedStatus = await requestGenLayerSnapInstall(provider);
          if (requestSerialRef.current !== requestId) return;
          snapInstalled = installedStatus.installed;
        } catch (error) {
          const described = error instanceof Error
            ? error.message
            : describeProviderRequestError(error, `Could not install ${GENLAYER_SNAP_ID}.`, "wallet_requestSnaps");
          const message = described.includes("Request rejected by user")
            ? `wallet_requestSnaps failed: Snap install rejected by user. Reopen MetaMask and approve ${GENLAYER_SNAP_ID} to continue.`
            : described;
          const pending = /pending request|already pending/i.test(described);
          recordRequestFailure(pending ? "failed_pending_request" : methodFromMessage(message, "wallet_requestSnaps"), message);
          setSnapConnection({
            status: described.includes("Request rejected by user") ? "snap-rejected" : "error",
            metamaskDetected: true,
            snapInstalled: false,
            message,
            error: message,
          });
          setWalletConnectError(message);
          setContractCall({
            status: "failed",
            result: null,
            error: message,
          });
          return;
        }
      }

      if (!snapInstalled) {
        const message = `MetaMask did not report ${GENLAYER_SNAP_ID} after install. Open MetaMask Snaps and verify it is enabled.`;
        recordRequestFailure("wallet_requestSnaps", message);
        setSnapConnection({
          status: "error",
          metamaskDetected: true,
          snapInstalled: false,
          message,
          error: message,
        });
        setWalletConnectError(message);
        setContractCall({ status: "failed", result: null, error: message });
        return;
      }

      setSnapConnection({
        status: "snap-installed",
        metamaskDetected: true,
        snapInstalled: true,
        message: `GenLayer plugin approved: ${GENLAYER_SNAP_ID}. Reading the authorized account for genlayer-js.`,
        error: "",
      });

      if (walletReady) {
        setSnapConnection({
          status: "wallet-connected",
          metamaskDetected: true,
          snapInstalled: true,
          message: `Account authorized: ${wallet.address}. Evaluation will reuse this account without another wallet prompt.`,
          error: "",
        });
        setWalletConnectError("");
        setContractCall({ status: "wallet_ready", result: null, error: "" });
        return;
      }

      activeRequestMethodRef.current = "eth_requestAccounts";
      const walletResult = await connectWalletDetailed();
      if (requestSerialRef.current !== requestId) return;
      if (!isFullAddress(walletResult.address)) {
        const message = walletResult.error || "MetaMask did not return a usable 0x account. Open MetaMask and approve account access.";
        const pending = /pending request|already pending/i.test(message);
        recordRequestFailure(pending ? "failed_pending_request" : methodFromMessage(message, "eth_requestAccounts"), message);
        setSnapConnection({
          status: "error",
          metamaskDetected: true,
          snapInstalled: true,
          message,
          error: message,
        });
        setWalletConnectError(message);
        setContractCall({ status: "failed", result: null, error: message });
        return;
      }

      setSnapConnection({
        status: "wallet-connected",
        metamaskDetected: true,
        snapInstalled: true,
        message: walletResult.error
          ? `Account authorized: ${walletResult.address}. This address is passed to genlayer-js. Note: ${walletResult.error}`
          : `Account authorized: ${walletResult.address}. This address is passed to genlayer-js.`,
        error: "",
      });
      setContractCall({ status: "wallet_ready", result: null, error: "" });
    } finally {
      if (requestSerialRef.current === requestId) {
        clearPendingTimer();
        releaseRequestLock("wallet");
      }
    }
  }

  async function evaluateWithGenLayerContract() {
    if (evaluationRequestInFlightRef.current || walletRequestInFlightRef.current) return;
    const requestId = requestSerialRef.current + 1;
    requestSerialRef.current = requestId;
    activeRequestMethodRef.current = GENLAYER_CONTRACT_METHOD;

    try {
      if (!contractReady) {
        throw new Error("Contract address not configured");
      }
      if (!evidenceReady) {
        throw new Error("Public evidence URL not configured");
      }
      if (!walletReady) {
        throw new Error("Authorize account access before evaluating with the GenLayer contract.");
      }
      if (!snapReady) {
        throw new Error("Approve the GenLayer plugin before evaluating with the GenLayer contract.");
      }
      const provider = getMetaMaskProvider(window.ethereum);
      if (!provider) {
        throw new Error(METAMASK_REQUIRED_MESSAGE);
      }

      evaluationRequestInFlightRef.current = true;
      setEvaluationRequestInFlight(true);
      setCopyStatus("");
      clearRequestFailure();
      setContractCall({ status: "evaluating", result: null, error: "" });
      rearmEvaluationTimeout(requestId, GENLAYER_CONTRACT_METHOD);
      const result = await evaluateClaimWithGenLayer({
        contractAddress,
        accountAddress: wallet.address,
        provider,
        scenarioInput,
        onStage: (stage) => {
          if (requestSerialRef.current !== requestId) return;
          const method = stage === "read_claim_report"
            ? GENLAYER_REPORT_FOR_CLAIM_METHOD
            : stage === "wait_receipt"
              ? "wait_receipt"
              : GENLAYER_CONTRACT_METHOD;
          activeRequestMethodRef.current = method;
          rearmEvaluationTimeout(requestId, method);
        },
      });

      if (requestSerialRef.current !== requestId) return;
      setContractCall({ status: "succeeded", result, error: "" });
    } catch (err) {
      if (requestSerialRef.current !== requestId) return;
      const described = describeProviderRequestError(err, "GenLayer contract call failed.", "evaluate_slashing_claim");
      const pending = isPendingProviderRequest(err) || /pending request|already pending/i.test(described);
      const method = pending ? "failed_pending_request" : methodFromMessage(described, activeRequestMethodRef.current);
      recordRequestFailure(method, described);
      setContractCall({
        status: "failed",
        result: null,
        error: described,
      });
    } finally {
      if (requestSerialRef.current === requestId) {
        clearPendingTimer();
        releaseRequestLock("evaluation");
      }
    }
  }

  function retryClaimWalletCheck() {
    requestSerialRef.current += 1;
    clearPendingTimer();
    releaseAllRequestLocks();
    setWalletConnectError("");
    setContractCall({ status: "idle", result: null, error: "" });
    window.setTimeout(() => connectClaimWallet(), 0);
  }

  useEffect(() => {
    if (walletReady) setWalletConnectError("");
  }, [walletReady]);

  useEffect(() => {
    if (walletReady && snapReady && walletConnectError) setWalletConnectError("");
  }, [walletReady, snapReady, walletConnectError]);

  useEffect(() => {
    localStorage.setItem("slashshield.contract", contractAddress);
  }, [contractAddress]);

  useEffect(() => {
    return clearPendingTimer;
  }, []);

  return (
    <>
      <MarketingNav active="claim" />
      <div className="claim-review-console">
        <section className="claim-console-head" aria-label="Claim console heading">
          <div>
            <div className="claim-breadcrumb" aria-label="Current route">
              <span>~/home</span>
              <b>/</b>
              <span>claim/console</span>
              <b>/</b>
              <em>?scenario={selectedScenario}</em>
            </div>
            <h1>Claim console</h1>
          </div>
          <div className="claim-head-actions" aria-label="Review status">
            <span className={cx("status-pill", walletReady ? "ok" : "warn")}>
              {walletReady ? `Wallet ${shortHash(wallet.address)}` : "Wallet not connected"}
            </span>
            <a className="btn" href="https://studio.genlayer.com/run-debug" target="_blank" rel="noreferrer">
              Studio explorer <ArrowUpRight size={14} />
            </a>
          </div>
        </section>

        <div className="claim-workspace">
          <aside className="claim-scenario-column" aria-label="Scenario selector">
            <div className="column-heading">
              <span>Scenario selector</span>
              <strong>Choose review case</strong>
            </div>
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => {
              const item = SCENARIOS[key];
              return (
                <button
                  key={key}
                  className={cx("scenario-choice-card", selectedScenario === key && "active")}
                  onClick={() => loadScenario(key)}
                  disabled={busy}
                  aria-pressed={selectedScenario === key}
                >
                  <span className="scenario-choice-index">{key === "provider-outage" ? "A" : "B"}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>expected {item.expectedDecision}</small>
                  </span>
                  <b className={cx("decision-badge", item.expectedDecision === "APPROVED" ? "ok" : "bad")}>{item.expectedDecision}</b>
                </button>
              );
            })}
          </aside>

          <div className="claim-main-column">
            <section className="claim-card claim-dossier-card">
              <div className="claim-card-head">
                <div>
                  <span>Claim dossier</span>
                  <h2>{scenario.title}</h2>
                </div>
                <span className={cx("decision-badge large", scenario.expectedDecision === "APPROVED" ? "ok" : "bad")}>
                  {scenario.expectedDecision}
                </span>
              </div>
              <div className="dossier-grid">
                <Kv label="Claim ID" value={scenario.claimId} />
                <Kv label="Provider / region" value={`${scenario.provider} / ${scenario.region}`} />
                <Kv label="Slashing window" value={scenario.timeWindow} />
                <Kv label="Evidence type" value={scenario.evidenceType} />
                <Kv label="Evidence URL" value={<a href={scenario.evidenceUrl} target="_blank" rel="noreferrer">{scenario.evidenceUrl}</a>} />
              </div>
              <div className="policy-note">
                <FileText size={16} />
                <p>
                  <strong>Policy relevance</strong>
                  <span>{scenario.policyRelevance}</span>
                </p>
              </div>
            </section>

            <div className="evaluation-result-grid">
              <section className="claim-card evaluation-card" aria-label="Evaluation">
                <div className="claim-card-head compact">
                  <div>
                    <span>Evaluation</span>
                    <h2>Run GenLayer evaluation</h2>
                  </div>
                  <b>{statusLabel}</b>
                </div>
                <div className="evaluation-stepper">
                  {evaluationSteps.map((step) => (
                    <div key={step.number} className={cx("stepper-item", step.state)}>
                      <span>{step.state === "done" ? <Check size={13} /> : step.number}</span>
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>
                <div className="evaluation-action-line">
                  <button
                    className="btn primary evaluation-primary-cta"
                    onClick={primaryAction.onClick}
                    disabled={primaryAction.disabled}
                  >
                    <PrimaryIcon size={15} />
                    {primaryAction.label}
                  </button>
                  {!liveCallSucceeded && !liveCallFailed && evaluateDisabledReason && (
                    <span>{evaluateDisabledReason}</span>
                  )}
                </div>
                {(snapConnection.message || walletConnectError) && !liveCallFailed && (
                  <p className={cx("wallet-inline-note", walletConnectError || snapConnection.error ? "bad" : walletReady && snapReady ? "ok" : "warn")}>
                    {walletConnectError || snapConnection.message}
                  </p>
                )}
              </section>

              <section className={cx("claim-card result-card", liveStatusTone, !liveCallSucceeded && !liveCallFailed && "pending")}>
                <div className="claim-card-head compact">
                  <div>
                    <span>Result</span>
                    <h2>{liveCallSucceeded ? "Live GenLayer result" : liveCallFailed ? "Contract call did not complete" : "Live GenLayer result"}</h2>
                  </div>
                  <span className={cx("status-pill", liveStatusTone)}>
                    {!liveCallSucceeded && !liveCallFailed ? "AWAITING" : statusLabel}
                  </span>
                </div>
                {liveCallSucceeded ? (
                  <>
                    <div className="result-verdict-line">
                      <strong className={cx("decision-badge result", liveReport?.verdict === "REJECTED" ? "bad" : "ok")}>{liveVerdict}</strong>
                      <span>{livePayoutValue}</span>
                    </div>
                    <p>{liveReport?.reason || "GenLayer call returned, but report_for_claim was not parsed into the SlashShield report shape."}</p>
                    <div className="result-metrics">
                      <Kv label="payout_allowed" value={liveDecision ? String(liveDecision.payout_allowed) : "not parsed"} />
                      <Kv label="tx/hash" value={shortHash(contractCall.result?.transactionHash || "")} />
                      <Kv label="receipt" value={contractCall.result?.receiptStatus || "—"} />
                      <Kv label="report_for_claim" value={liveReport ? `${liveReport.verdict} · ${formatWeiString(liveReport.payout_wei)}` : liveReportParse.error || "not parsed"} />
                    </div>
                  </>
                ) : liveCallFailed ? (
                  <>
                    <p>{failureReason}</p>
                    <small>Frontend proof remains pending until a deployed-contract call returns reviewer proof.</small>
                    <div className="result-actions">
                      <button className="btn" onClick={resetClaimWalletState}>Reset local connection state</button>
                      <button className="btn" onClick={retryClaimWalletCheck}>Retry connection check</button>
                      <button className="btn" onClick={showAdvancedError}>Show technical details</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="awaiting-result">
                      <div>
                        <span>verdict</span>
                        <b>awaiting run</b>
                      </div>
                      <pre className="decision-code compact">{`{
  "decision": "",
  "provider_match": "",
  "region_match": "",
  "time_overlap": "",
  "exclusion_detected": "",
  "payout_allowed": ""
}`}</pre>
                    </div>
                    <small>No demo result is treated as live contract proof.</small>
                  </>
                )}
              </section>
            </div>

            <section className="claim-card demo-fallback-card">
              <div className="claim-card-head compact">
                <div>
                  <span>Demo fallback</span>
                  <h2>Expected demo result — not live contract proof</h2>
                </div>
                <span className={cx("decision-badge", scenario.expectedDecision === "APPROVED" ? "ok" : "bad")}>{scenario.expectedDecision}</span>
              </div>
              {expectedReport ? (
                <div className="demo-fallback-body">
                  <strong>{expectedReport.verdict}</strong>
                  <span>{expectedPayoutValue}</span>
                  <p>{expectedReport.reason}</p>
                  <small>Synthetic evidence fixture. Not AWS, operator, validator, or payout production data.</small>
                </div>
              ) : (
                <div className="inline-error">{expectedReportError || "Expected demo report did not parse."}</div>
              )}
            </section>

            <details
              id="reviewer-proof"
              className="claim-card technical-details reviewer-proof-details"
              open={reviewerProofOpen}
              onToggle={(event) => setReviewerProofOpen(event.currentTarget.open)}
            >
              <summary>
                <span>
                  Reviewer proof
                  <small>Collapsed by default. Technical inputs, outputs, receipts, and raw errors stay here.</small>
                </span>
                <b>{liveCallSucceeded ? "RETURNED" : "PENDING"} <ChevronDown size={13} /></b>
              </summary>
              <div className="proof-data-grid">
                <Kv label="Contract address" value={contractReady ? contractAddress : "missing"} />
                <Kv label="Method" value={GENLAYER_CONTRACT_METHOD} />
                <Kv label="Report read" value={GENLAYER_REPORT_FOR_CLAIM_METHOD} />
                <Kv label="Debug read" value={GENLAYER_LATEST_REPORT_METHOD} />
                <Kv label="RPC URL" value={GENLAYER_EFFECTIVE_RPC_ENDPOINT} />
                <Kv label="Wallet RPC URL" value={GENLAYER_WALLET_RPC_ENDPOINT} />
                <Kv label="Wallet address" value={walletReady ? wallet.address : "not connected"} />
                <Kv label="Transaction hash" value={contractCall.result?.transactionHash || "—"} />
                <Kv label="Receipt" value={contractCall.result?.receiptStatus || "—"} />
                <Kv label="Execution result" value={contractCall.result?.executionResult || "—"} />
                <Kv label="Call timestamp" value={contractCall.result?.calledAt || "—"} />
                <Kv label="Request lock debug" value={`walletRequestInFlight=${walletRequestInFlight}; evaluationRequestInFlight=${evaluationRequestInFlight}; lastFailedMethod=${lastFailedMethod}; lastErrorMessage=${lastErrorMessage || "none"}`} />
              </div>
              <div className="reviewer-proof-blocks">
                <div>
                  <h3>Scenario input JSON</h3>
                  <pre className="decision-code compact">{JSON.stringify(scenarioInput, null, 2)}</pre>
                </div>
                <div>
                  <h3>report_for_claim output</h3>
                  <pre className="decision-code compact">{contractCall.result ? JSON.stringify(contractCall.result.claimReport, null, 2) : "No deployed-contract report_for_claim output yet."}</pre>
                </div>
                <div>
                  <h3>tx/hash/receipt</h3>
                  <pre className="decision-code compact">{JSON.stringify({
                    transaction_hash: contractCall.result?.transactionHash || null,
                    receipt_status: contractCall.result?.receiptStatus || null,
                    execution_result: contractCall.result?.executionResult || null,
                    called_at: contractCall.result?.calledAt || null,
                  }, null, 2)}</pre>
                </div>
                <div>
                  <h3>Raw error</h3>
                  <pre className="decision-code compact">{contractCall.error || walletConnectError || snapConnection.error || "No raw error captured."}</pre>
                </div>
              </div>
              <div className="proof-summary-row">
                <button className="btn" onClick={copyProofSummary}><Copy size={14} /> Copy proof summary</button>
                {copyStatus && <span>{copyStatus}</span>}
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, meta, tone }: { label: string; value: string; meta?: string; tone?: "ok" | "bad" | "warn" }) {
  return (
    <section className="card stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {meta && <small className={tone}>{meta}</small>}
    </section>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="kv">
      <span>{label}</span>
      <b>{value}</b>
    </p>
  );
}

function NetworkPage({ health, refresh }: { health: RpcHealth; refresh: () => void }) {
  const ok = !health.error && health.chainId === GENLAYER_CHAIN_ID;
  return (
    <>
      <PageHead title={NETWORK_PAGE_TITLE} sub={`All metrics on this page are read live from ${DISPLAY_NETWORK_LABEL} RPC`}>
        <button className="btn primary" onClick={refresh}><RefreshCw size={14} /> Refresh RPC</button>
      </PageHead>
      <div className="page-body">
        <div className="truth-banner">
          {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <p>
            <strong>{ok ? "Live testnet data" : "RPC not healthy"}</strong>
            <span>{ok ? `Connected to ${RPC_URL}` : health.error || "Waiting for RPC response"}</span>
          </p>
        </div>
        <div className="grid-4">
          <Stat label="Chain id" value={health.chainId ? `${health.chainId}` : "—"} meta={health.chainIdHex || GENLAYER_CHAIN_ID_HEX} tone={ok ? "ok" : "bad"} />
          <Stat label="Latest block" value={health.latestBlock?.toLocaleString() || "—"} meta={health.checkedAt ? `checked ${health.checkedAt}` : "not checked"} />
          <Stat label="Gas price" value={formatGwei(health.gasPriceWei)} meta={`base ${formatGwei(health.baseFeeWei)}`} />
          <Stat label="RPC latency" value={health.latencyMs === null ? "—" : `${health.latencyMs} ms`} meta={health.syncing === false ? "not syncing" : String(health.syncing)} tone={health.syncing === false ? "ok" : "warn"} />
        </div>
        <div className="two-col">
          <section className="card panel">
            <div className="card-head"><h2>Latest block</h2><span>RPC RESULT</span></div>
            <Kv label="Hash" value={shortHash(health.blockHash)} />
            <Kv label="Parent" value={shortHash(health.parentHash)} />
            <Kv label="Timestamp" value={timeFromUnix(health.timestamp)} />
            <Kv label="Transactions" value={health.txCount ?? "—"} />
            <Kv label="Gas used" value={health.gasUsed?.toLocaleString() || "—"} />
            <Kv label="Gas limit" value={health.gasLimit?.toLocaleString() || "—"} />
            <Kv label="Utilization" value={pct(health.gasUsed, health.gasLimit)} />
          </section>
          <section className="card panel">
            <div className="card-head"><h2>Real data boundary</h2><span>NO SYNTHETIC CLAIMS</span></div>
            <div className="fact-list">
              <p><CheckCircle2 size={15} /> Network, block, gas, and sync status are live RPC reads.</p>
              <p><CheckCircle2 size={15} /> Wallet data is live only after wallet connection.</p>
              <p><CheckCircle2 size={15} /> Contract data is live only after a full contract address is entered.</p>
              <p><XCircle size={15} /> No pool TVL, APY, validator count, or payouts are shown unless backed by chain data.</p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function WalletPage({ wallet, connectWallet, refreshWallet }: { wallet: WalletState; connectWallet: () => Promise<string>; refreshWallet: () => Promise<string> }) {
  const onConfiguredNetwork = wallet.chainIdHex.toLowerCase() === GENLAYER_CHAIN_ID_HEX;
  return (
    <>
      <PageHead title="Wallet" sub="Injected wallet values only; no stored or mocked account data">
        <div className="actions">
          <button className="btn" onClick={refreshWallet} disabled={!wallet.address}><RefreshCw size={14} /> Refresh wallet</button>
          <button className="btn primary" onClick={connectWallet}><Wallet size={14} /> Connect wallet</button>
        </div>
      </PageHead>
      <div className="page-body">
        <div className="grid-4">
          <Stat label="Address" value={wallet.address ? shortHash(wallet.address) : "Not connected"} meta={wallet.error || "MetaMask / injected provider"} tone={wallet.address ? "ok" : "warn"} />
          <Stat label="Wallet chain" value={wallet.chainIdHex || "—"} meta={wallet.chainIdHex ? (onConfiguredNetwork ? DISPLAY_NETWORK_LABEL : "Different network") : "connect wallet"} tone={onConfiguredNetwork ? "ok" : "warn"} />
          <Stat label="Balance" value={formatWei(wallet.balanceWei)} meta="native token from wallet RPC" />
          <Stat label="Nonce" value={wallet.nonce === null ? "—" : String(wallet.nonce)} meta="eth_getTransactionCount" />
        </div>
        <section className="card panel">
          <div className="card-head"><h2>Wallet read status</h2><span>LIVE IF CONNECTED</span></div>
          <Kv label="Full address" value={wallet.address || "—"} />
          <Kv label={`Expected ${DISPLAY_NETWORK_LABEL} chain`} value={`${GENLAYER_CHAIN_ID} / ${GENLAYER_CHAIN_ID_HEX}`} />
          <Kv label="Observed wallet chain" value={wallet.chainIdHex || "—"} />
          <Kv label="Error" value={wallet.error || "—"} />
        </section>
      </div>
    </>
  );
}

function ContractPage() {
  const [address, setAddress] = useState(() => localStorage.getItem("slashshield.contract") || "");
  const [contract, setContract] = useState<ContractState | null>(null);
  const [error, setError] = useState("");

  async function inspect() {
    try {
      setError("");
      const next = await readContract(address);
      localStorage.setItem("slashshield.contract", address.trim());
      setContract(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contract read failed");
    }
  }

  return (
    <>
      <PageHead title="Contract monitor" sub="Enter the real SlashShield/GenLayer contract address to read chain state">
        <button className="btn primary" onClick={inspect}><Search size={14} /> Inspect address</button>
      </PageHead>
      <div className="page-body">
        <section className="card address-bar">
          <Link size={16} />
          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x full contract address from GenLayer Studio / deployment" />
          <button className="btn" onClick={inspect}>Read</button>
        </section>
        {(error || contract?.error) && <div className="truth-banner bad"><XCircle size={18} /><p><strong>Contract read failed</strong><span>{error || contract?.error}</span></p></div>}
        <div className="grid-4">
          <Stat label="Address" value={contract?.address ? shortHash(contract.address) : "—"} meta="user supplied" />
          <Stat label="Code size" value={contract?.codeSize === null || contract?.codeSize === undefined ? "—" : `${contract.codeSize} bytes`} meta={contract?.codeSize === 0 ? "no code at address" : "eth_getCode"} tone={contract?.codeSize ? "ok" : "warn"} />
          <Stat label="Balance" value={formatWei(contract?.balanceWei ?? null)} meta="eth_getBalance" />
          <Stat label="Nonce" value={contract?.nonce === null || contract?.nonce === undefined ? "—" : String(contract.nonce)} meta={contract?.lastChecked || "not checked"} />
        </div>
        <section className="card panel">
          <div className="card-head"><h2>Contract facts</h2><span>CHAIN READS ONLY</span></div>
          <Kv label="Full address" value={contract?.address || "—"} />
          <Kv label="Code preview" value={contract?.codeHash || "—"} />
          <Kv label="Wallet RPC endpoint" value={RPC_URL} />
          <Kv label="Read RPC endpoint" value={READ_RPC_URL} />
        </section>
      </div>
    </>
  );
}

function BlocksPage({ blocks }: { blocks: BlockRow[] }) {
  return (
    <>
      <PageHead title="Recent blocks" sub={`Latest ${DISPLAY_NETWORK_LABEL} blocks read from eth_getBlockByNumber`} />
      <div className="page-body">
        <section className="card">
          <table className="table">
            <thead>
              <tr><th>Block</th><th>Hash</th><th>Time</th><th>Txs</th><th>Gas used</th><th>Gas limit</th><th>Miner</th></tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.hash}>
                  <td>{block.number.toLocaleString()}</td>
                  <td>{shortHash(block.hash)}</td>
                  <td>{timeFromUnix(block.timestamp)}</td>
                  <td>{block.txCount}</td>
                  <td>{block.gasUsed.toLocaleString()}</td>
                  <td>{block.gasLimit.toLocaleString()}</td>
                  <td>{shortHash(block.miner)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function ScenarioPage() {
  return (
    <>
      <PageHead title="Scope and boundaries" sub={`Kept separate so prototype facts cannot be mistaken for live ${DISPLAY_NETWORK_LABEL} production data`} />
      <div className="page-body">
        <div className="truth-banner warn">
          <Activity size={18} />
          <p>
            <strong>Not live network data</strong>
            <span>This section is only a product scenario for explaining the SlashShield idea.</span>
          </p>
        </div>
        <section className="card panel">
          <div className="card-head"><h2>What remains prototype</h2><span>DISCLOSURE</span></div>
          <div className="fact-list">
            <p><XCircle size={15} /> Insurance pool TVL, APY, coverage ratios, claim IDs, and outage rows are not read from {DISPLAY_NETWORK_LABEL}.</p>
            <p><XCircle size={15} /> AWS outage evidence pages are synthetic until publicly hosted and tested by Studio URL ingestion.</p>
            <p><CheckCircle2 size={15} /> GenLayer Studio already verified the inline evidence decision path for approved and rejected cases.</p>
          </div>
        </section>
      </div>
    </>
  );
}

function EvidenceIndexPage() {
  const providerScenario = SCENARIOS["provider-outage"];
  const maintenanceScenario = SCENARIOS["operator-maintenance"];
  return (
    <>
      <MarketingNav active="evidence" />
      <main className="evidence-index evidence-hub">
        <div className="evidence-breadcrumb">
          <span>~/home</span>
          <b>/</b>
          <em>evidence</em>
        </div>
        <section className="landing-section-head evidence-hub-head">
          <div>
            <span>§ evidence fixtures</span>
            <h1>Sample evidence for the two demo claims.</h1>
          </div>
          <p>
            Public synthetic pages used by the claim console and the GenLayer contract URL path.
            They are not real AWS, operator, validator, or payout production records.
          </p>
        </section>
        <div className="landing-case-grid evidence-card-grid">
          <article className="landing-case-card approved">
            <div className="landing-case-top">
              <span className="verdict-chip ok"><i /> APPROVED</span>
              <b>{providerScenario.claimId.replace("-URL", "")}</b>
            </div>
            <h3>AWS us-east-1 outage</h3>
            <blockquote>Provider, region, and window match the policy. No exclusion is present.</blockquote>
            <div className="landing-case-bottom">
              <span>Evidence URL</span>
              <strong>provider outage</strong>
            </div>
            <a className="btn" href="/evidence/aws-us-east-1-incident">Open evidence <ArrowUpRight size={14} /></a>
          </article>
          <article className="landing-case-card rejected">
            <div className="landing-case-top">
              <span className="verdict-chip bad"><i /> REJECTED</span>
              <b>{maintenanceScenario.claimId.replace("-URL", "")}</b>
            </div>
            <h3>Operator maintenance</h3>
            <blockquote>Voluntary service stoppage is excluded, even though provider and region match.</blockquote>
            <div className="landing-case-bottom">
              <span>Evidence URL</span>
              <strong>maintenance</strong>
            </div>
            <a className="btn" href="/evidence/operator-maintenance">Open evidence <ArrowUpRight size={14} /></a>
          </article>
        </div>
      </main>
    </>
  );
}

function EvidenceDetailPage({ scenarioKey }: { scenarioKey: ScenarioKey }) {
  const scenario = SCENARIOS[scenarioKey];
  const approved = scenarioKey === "provider-outage";
  const timeline = approved
    ? [
        ["14:08 UTC", "Customers begin reporting attach/detach failures in us-east-1d."],
        ["14:13 UTC", "AWS confirms elevated error rates on EBS API. P1 declared."],
        ["14:22 UTC", "EBS control-plane metadata service identified as failure mode."],
        ["14:38 UTC", "Failover to standby metadata replica complete; recovery starting."],
        ["14:44 UTC", "API error rates returned to baseline. Customers fully recovered."],
      ]
    : [
        ["19:00 UTC", "Operator posts maintenance notice for Prysm rollout and signer migration."],
        ["19:42 UTC", "Validator services are stopped for controlled migration."],
        ["19:51 UTC", "Missed duties observed while signer keys are rotated."],
        ["20:05 UTC", "Services return after operator-controlled rollout completes."],
        ["20:30 UTC", "Maintenance window closed. No provider outage reported."],
      ];
  return (
    <>
      <MarketingNav active="evidence" />
      <main className="evidence-doc-page">
        <div className="evidence-breadcrumb">
          <span>~/home</span>
          <b>/</b>
          <span>evidence</span>
          <b>/</b>
          <em>{approved ? "aws-us-east-1-incident" : "operator-maintenance"}</em>
        </div>
        <div className="evidence-chip-row">
          <span className="evidence-chip dark">AWS us-east-1</span>
          <span className="evidence-chip">{approved ? "Validator 0xAA...F7" : "Operator maintenance"}</span>
        </div>
        <div className="evidence-document-layout">
          <article className="evidence-document">
            <header>
              <div className="evidence-document-topline">
                <span className={cx("verdict-chip", approved ? "bad" : "bad")}>
                  <i /> {approved ? "Provider outage" : "Operator maintenance"}
                </span>
                <b>Synthetic evidence · demo</b>
              </div>
              <h1>{approved ? "AWS us-east-1 — EBS API degradation" : "Prysm 5.0.4 — signer migration"}</h1>
              <div className="evidence-document-meta">
                <span><b>Incident</b> · {approved ? "AWS-RCA-2026-04-26-USE1" : "OP-MAINT-2026-04-26"}</span>
                <span><b>Window</b> · {scenario.timeWindow.replace(" to ", " → ")}</span>
                <span><b>Duration</b> · {approved ? "36 min" : "23 min"}</span>
              </div>
            </header>
            <div className="evidence-document-body">
              <p className="evidence-lead">
                {approved
                  ? "A failure in the metadata service of the EBS control plane in the us-east-1 region resulted in elevated API error rates and timeouts for volume attach/detach operations. Validators relying on EBS-backed state were unable to write checkpoints during the incident window."
                  : "The operator intentionally stopped validator services to roll out Prysm 5.0.4 and migrate signing infrastructure. Missed duties occurred inside the signed maintenance window."}
              </p>
              <EvidenceSectionTitle index="01" title="Timeline" />
              <div className="evidence-timeline">
                {timeline.map(([time, text]) => (
                  <p key={time}><b>{time}</b><span>{text}</span></p>
                ))}
              </div>
              <EvidenceSectionTitle index="02" title="Cause" />
              <p className="evidence-quote">
                {approved
                  ? "Control-plane metadata service quorum loss following a network partition between two availability zones. Non-malicious. Operator action not implicated."
                  : "Intentional operator action. The interruption is tied to scheduled maintenance, not AWS us-east-1 infrastructure failure."}
              </p>
              <EvidenceSectionTitle index="03" title="Impact" />
              <div className="evidence-impact-grid">
                <div><span>Validators affected</span><b>{approved ? "Demo cohort with EBS-backed state" : "Demo operator cohort during maintenance"}</b></div>
                <div><span>Slashing events</span><b>Synthetic missed-duty slash in window</b></div>
                <div><span>Geography</span><b>{approved ? "Limited to us-east-1; other regions unaffected" : "Provider and region match, but cause is excluded"}</b></div>
              </div>
              <EvidenceSectionTitle index="04" title="Machine-readable classification" />
              <pre className="decision-code compact">{JSON.stringify({
                kind: approved ? "INFRASTRUCTURE_OUTAGE" : "OPERATOR_MAINTENANCE",
                provider_attributed: approved,
                operator_attributed: !approved,
                malicious: false,
                excluded_under_policy: !approved,
              }, null, 2)}</pre>
              <p className="evidence-note"><b>Note.</b> This document is synthetic, written to demonstrate the kind of evidence SlashShield's GenLayer contract reasons over. No real-world outage, operator incident, or validator impact is referenced.</p>
            </div>
          </article>
          <aside className="evidence-side-rail">
            <section className="evidence-run-card">
              <span>Run on this evidence</span>
              <p>Open the claim console with this evidence pre-attached. GenLayer will produce a verdict from the deployed contract path.</p>
              <a className="btn primary" href={`/claim?scenario=${scenarioKey}`}>Run in console <ArrowUpRight size={14} /></a>
            </section>
            <section className="evidence-side-card">
              <span>Metadata</span>
              <dl>
                <div><dt>kind</dt><dd>{scenarioKey}</dd></div>
                <div><dt>duration</dt><dd>{approved ? "36 min" : "23 min"}</dd></div>
                <div><dt>provider</dt><dd>{approved ? "attributed" : "not attributed"}</dd></div>
                <div><dt>operator</dt><dd>{approved ? "—" : "attributed"}</dd></div>
                <div><dt>excluded</dt><dd>{String(!approved)}</dd></div>
              </dl>
            </section>
            <section className="evidence-side-card policy">
              <span>Policy excerpt</span>
              <p>§4.2 — Voluntary operator stoppage, including scheduled maintenance and key rotation, is excluded from coverage regardless of provider or region alignment.</p>
              <a href={`/claim?scenario=${scenarioKey}`}>Read full policy <ArrowUpRight size={13} /></a>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

function EvidenceSectionTitle({ index, title }: { index: string; title: string }) {
  return (
    <div className="evidence-section-title">
      <span>§ {index}</span>
      <h2>{title}</h2>
    </div>
  );
}

function AppBody({
  route,
  health,
  blocks,
  refresh,
  wallet,
  connectWallet,
  connectWalletDetailed,
  resetWallet,
  refreshWallet,
}: {
  route: Route;
  health: RpcHealth;
  blocks: BlockRow[];
  refresh: () => void;
  wallet: WalletState;
  connectWallet: () => Promise<string>;
  connectWalletDetailed: () => Promise<WalletLoadResult>;
  resetWallet: () => void;
  refreshWallet: () => Promise<string>;
}) {
  if (route === "home") return <HomePage />;
  if (route === "claim") return <ClaimConsolePage wallet={wallet} connectWalletDetailed={connectWalletDetailed} resetWallet={resetWallet} />;
  if (route === "wallet") return <WalletPage wallet={wallet} connectWallet={connectWallet} refreshWallet={refreshWallet} />;
  if (route === "contract") return <ContractPage />;
  if (route === "blocks") return <BlocksPage blocks={blocks} />;
  if (route === "scenario") return <ScenarioPage />;
  return <NetworkPage health={health} refresh={refresh} />;
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/evidence") return <EvidenceIndexPage />;
  if (path === "/evidence/aws-us-east-1-incident") return <EvidenceDetailPage scenarioKey="provider-outage" />;
  if (path === "/evidence/operator-maintenance") return <EvidenceDetailPage scenarioKey="operator-maintenance" />;
  return <ShellApp />;
}

function ShellApp() {
  const [route, setRoute] = useAppRoute();
  const { health, blocks, refresh } = useBradbury();
  const { wallet, connectWallet, connectWalletDetailed, resetWallet, refreshWallet } = useWallet();
  const appKey = useMemo(() => route, [route]);
  const isLanding = route === "home";
  const isClaim = route === "claim";

  return (
    <main className={cx("app", isLanding && "app-landing", isClaim && "app-claim")} key={appKey}>
      <Nav route={route} setRoute={setRoute} />
      <section className="main-panel">
        <AppBody
          route={route}
          health={health}
          blocks={blocks}
          refresh={refresh}
          wallet={wallet}
          connectWallet={connectWallet}
          connectWalletDetailed={connectWalletDetailed}
          resetWallet={resetWallet}
          refreshWallet={refreshWallet}
        />
      </section>
    </main>
  );
}
