import { chains, createClient } from "genlayer-js";

export const GENLAYER_CONTRACT_METHOD = "evaluate_slashing_claim";
export const GENLAYER_LATEST_REPORT_METHOD = "latest_report";
export const GENLAYER_REPORT_FOR_CLAIM_METHOD = "report_for_claim";
export const GENLAYER_CONFIGURED_CONTRACT_ADDRESS = (import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS || "").trim();
export const GENLAYER_NETWORK = (import.meta.env.VITE_GENLAYER_NETWORK || "bradbury").trim().toLowerCase();
export const GENLAYER_CHAIN = GENLAYER_NETWORK === "studio" || GENLAYER_NETWORK === "studionet"
  ? chains.studionet
  : chains.testnetBradbury;
export const GENLAYER_NETWORK_LABEL = GENLAYER_CHAIN.name;
export const GENLAYER_CHAIN_ID = GENLAYER_CHAIN.id;
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN.id.toString(16)}`;
const DEFAULT_READ_RPC_ENDPOINT = GENLAYER_CHAIN.rpcUrls.default.http[0];
const DEFAULT_WALLET_RPC_ENDPOINT = GENLAYER_CHAIN === chains.studionet
  ? DEFAULT_READ_RPC_ENDPOINT
  : "https://rpc.testnet-chain.genlayer.com";
export const GENLAYER_RPC_ENDPOINT = (import.meta.env.VITE_GENLAYER_RPC_URL || DEFAULT_READ_RPC_ENDPOINT).trim();
export const GENLAYER_WALLET_RPC_ENDPOINT = (import.meta.env.VITE_GENLAYER_WALLET_RPC_URL || DEFAULT_WALLET_RPC_ENDPOINT).trim();
export const GENLAYER_EFFECTIVE_RPC_ENDPOINT = GENLAYER_RPC_ENDPOINT;
export const GENLAYER_SNAP_ID = "npm:genlayer-wallet-plugin";
export const METAMASK_REQUIRED_MESSAGE = "MetaMask Extension with GenLayer Wallet Snap is required for live evaluation.";

export type BrowserEthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: BrowserEthereumProvider[];
  selectedAddress?: string;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type ProviderMethodName =
  | "eth_accounts"
  | "eth_chainId"
  | "eth_getBalance"
  | "eth_getTransactionCount"
  | "eth_requestAccounts"
  | "eth_sendTransaction"
  | "wallet_addEthereumChain"
  | "wallet_getSnaps"
  | "wallet_requestSnaps"
  | "wallet_switchEthereumChain"
  | "wallet_invokeSnap"
  | "evaluate_slashing_claim"
  | "report_for_claim"
  | "wallet_detail_read";

export type GenLayerSnapStatus = {
  snapsAvailable: boolean;
  installed: boolean;
  error: string;
  pendingRequest: boolean;
};

type ProviderRequestError = {
  code?: number | string;
  message?: string;
};

function providerErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const code = (error as ProviderRequestError).code;
  return code === undefined ? "" : String(code);
}

function providerErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as ProviderRequestError).message === "string") {
    return (error as ProviderRequestError).message || "";
  }
  return "";
}

export function describeProviderRequestError(error: unknown, fallback: string, method?: ProviderMethodName) {
  const code = providerErrorCode(error);
  const message = providerErrorText(error);
  const methodPrefix = method ? `${method} failed: ` : "";

  if (code === "4001") return `${methodPrefix}Request rejected by user.`;
  if (isPendingProviderRequest(error)) {
    return `${methodPrefix}A MetaMask request is already pending. Open MetaMask and finish or reject it, then click Retry.`;
  }
  if (/wallet_invokeSnap/i.test(message)) return `${methodPrefix}wallet_invokeSnap failed: Open MetaMask, confirm the GenLayer Snap is enabled, then try again.`;
  if (/wallet_getSnaps/i.test(message)) return `${methodPrefix}This wallet does not expose wallet_getSnaps. Use MetaMask with Snaps enabled.`;
  if (/wallet_requestSnaps/i.test(message)) return `${methodPrefix}Could not request ${GENLAYER_SNAP_ID}. Use MetaMask with Snaps enabled.`;
  if (/cannot unmarshal string into Go struct field Request\.id|Parse error as single request/i.test(message)) {
    return `${methodPrefix}${GENLAYER_NETWORK_LABEL} RPC rejected MetaMask's JSON-RPC request id format. In MetaMask, set the RPC URL to ${GENLAYER_WALLET_RPC_ENDPOINT}, then reconnect and retry.`;
  }
  if (/MetaMask is not installed|Injected wallet not found|No injected wallet/i.test(message)) {
    return `${methodPrefix}${METAMASK_REQUIRED_MESSAGE}`;
  }
  if (/Wallet address not configured/i.test(message)) return `${methodPrefix}Connect a MetaMask account before evaluating with the GenLayer contract.`;
  if (message) return `${methodPrefix}${message}`;
  return `${methodPrefix}${fallback}`;
}

export function isPendingProviderRequest(error: unknown) {
  const code = providerErrorCode(error);
  const message = providerErrorText(error);
  return code === "-32002" || /pending request|request already pending|already has a pending/i.test(message);
}

export function getMetaMaskProvider(provider: BrowserEthereumProvider | undefined): BrowserEthereumProvider | undefined {
  if (!provider) return undefined;
  const providers = Array.isArray(provider.providers) ? provider.providers : [];
  const metamaskFromList = providers.find((candidate) => candidate?.isMetaMask && typeof candidate.request === "function");
  if (metamaskFromList) return metamaskFromList;
  if (provider.isMetaMask && typeof provider.request === "function") return provider;
  return undefined;
}

function normalizeAccounts(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((account): account is string => typeof account === "string");
}

export async function readConnectedMetaMaskAccounts(provider: BrowserEthereumProvider): Promise<string[]> {
  try {
    return normalizeAccounts(await provider.request({ method: "eth_accounts" }));
  } catch (error) {
    throw new Error(describeProviderRequestError(error, "Unable to read connected MetaMask accounts.", "eth_accounts"));
  }
}

export async function requestMetaMaskAccounts(provider: BrowserEthereumProvider): Promise<string[]> {
  try {
    return normalizeAccounts(await provider.request({ method: "eth_requestAccounts" }));
  } catch (error) {
    throw new Error(describeProviderRequestError(error, "Wallet account access failed.", "eth_requestAccounts"));
  }
}

function hasGenLayerSnap(snaps: unknown) {
  if (!snaps || typeof snaps !== "object") return false;
  return Object.values(snaps as Record<string, { id?: string }>).some((snap) => snap?.id === GENLAYER_SNAP_ID);
}

export async function readGenLayerSnapStatus(provider: BrowserEthereumProvider | undefined): Promise<GenLayerSnapStatus> {
  if (!provider) {
    return {
      snapsAvailable: false,
      installed: false,
      error: METAMASK_REQUIRED_MESSAGE,
      pendingRequest: false,
    };
  }

  try {
    const snaps = await provider.request({ method: "wallet_getSnaps" });
    return { snapsAvailable: true, installed: hasGenLayerSnap(snaps), error: "", pendingRequest: false };
  } catch (error) {
    return {
      snapsAvailable: false,
      installed: false,
      error: describeProviderRequestError(error, "Unable to read MetaMask Snaps.", "wallet_getSnaps"),
      pendingRequest: isPendingProviderRequest(error),
    };
  }
}

export async function requestGenLayerSnapInstall(provider: BrowserEthereumProvider): Promise<GenLayerSnapStatus> {
  try {
    await provider.request({
      method: "wallet_requestSnaps",
      params: {
        [GENLAYER_SNAP_ID]: {},
      },
    });
  } catch (error) {
    throw new Error(describeProviderRequestError(error, `Could not install ${GENLAYER_SNAP_ID}.`, "wallet_requestSnaps"));
  }

  const status = await readGenLayerSnapStatus(provider);
  if (!status.installed) {
    throw new Error(`MetaMask did not report ${GENLAYER_SNAP_ID} after wallet_requestSnaps completed.`);
  }
  return status;
}

export type SlashShieldContractInput = {
  claimId: string;
  evidenceUrl: string;
  provider: string;
  coveredRegion: string;
  slashingWindowUtc: string;
  slashAmountWei: string;
  maxPayoutWei: string;
};

export type GenLayerEvaluationResult = {
  contractAddress: string;
  methodName: string;
  claimReportMethod: string;
  latestReportMethod: string;
  transactionHash: string;
  receiptStatus: string;
  executionResult: string;
  claimReportRaw: string;
  claimReport: unknown;
  latestReportRaw: string;
  latestReport: unknown;
  calledAt: string;
  scenarioInput: SlashShieldContractInput;
};

export type GenLayerCallStage = "connect_network" | "write_contract" | "wait_receipt" | "read_claim_report";

type TxHashLike =
  | string
  | {
      transactionHash?: string;
      txHash?: string;
      hash?: string;
      txId?: string;
    };

type Address = `0x${string}`;
type TransactionHash = `0x${string}`;

type GenLayerReceiptLike = {
  status?: string | number;
  statusName?: string;
  txExecutionResult?: string | number;
  txExecutionResultName?: string;
};

function assertAddress(value: string, label: string): Address {
  const clean = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    throw new Error(`${label} not configured`);
  }
  return clean as Address;
}

function parseWei(value: string, label: string) {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) throw new Error(label);
    return parsed;
  } catch {
    throw new Error(`${label} must be a positive wei integer`);
  }
}

function createReadClient() {
  return createClient({
    chain: GENLAYER_CHAIN,
    endpoint: GENLAYER_EFFECTIVE_RPC_ENDPOINT,
  });
}

function createWriteClient(account: Address, provider: BrowserEthereumProvider) {
  return createClient({
    chain: GENLAYER_CHAIN,
    account,
    provider: provider as never,
    endpoint: GENLAYER_EFFECTIVE_RPC_ENDPOINT,
  });
}

async function ensureMetaMaskOnConfiguredNetwork(provider: BrowserEthereumProvider) {
  const chain = GENLAYER_CHAIN;
  const expectedChainId = `0x${chain.id.toString(16)}`;
  const explorerUrl = chain.blockExplorers?.default?.url;
  const chainParams = {
    chainId: expectedChainId,
    chainName: chain.name,
    rpcUrls: [GENLAYER_WALLET_RPC_ENDPOINT],
    nativeCurrency: chain.nativeCurrency,
    ...(explorerUrl ? { blockExplorerUrls: [explorerUrl] } : {}),
  };

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [chainParams],
    });
  } catch (error) {
    const code = providerErrorCode(error);
    const message = providerErrorText(error);
    if (code === "4001") {
      throw new Error(
        `wallet_addEthereumChain failed: Approve the ${GENLAYER_NETWORK_LABEL} RPC update in MetaMask so requests use ${GENLAYER_WALLET_RPC_ENDPOINT}.`,
      );
    }
    if (!/already added|already exists|chain.*exists/i.test(message)) {
      throw new Error(describeProviderRequestError(error, `Could not add or update the ${GENLAYER_NETWORK_LABEL} RPC in MetaMask.`, "wallet_addEthereumChain"));
    }
  }

  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (typeof currentChainId === "string" && currentChainId.toLowerCase() === expectedChainId) {
    return;
  }

  const switchParams = [{ chainId: expectedChainId }];
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: switchParams,
    });
  } catch (error) {
    throw new Error(describeProviderRequestError(error, `Could not switch MetaMask to ${GENLAYER_NETWORK_LABEL}.`, "wallet_switchEthereumChain"));
  }
}

function normalizeTransactionHash(result: TxHashLike): TransactionHash {
  const hash =
    typeof result === "string"
      ? result
      : result.transactionHash || result.txHash || result.hash || result.txId || "";

  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error("GenLayer write did not return a transaction hash");
  }

  return hash as TransactionHash;
}

function normalizeReport(raw: unknown) {
  const latestReportRaw = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    return { latestReportRaw, latestReport: JSON.parse(latestReportRaw) as unknown };
  } catch {
    return { latestReportRaw, latestReport: latestReportRaw };
  }
}

function reportClaimId(report: unknown) {
  if (!report || typeof report !== "object") return "";
  const claimId = (report as { claim_id?: unknown }).claim_id;
  return typeof claimId === "string" ? claimId : "";
}

function describeReceipt(receipt: GenLayerReceiptLike) {
  return {
    receiptStatus: String(receipt.statusName || receipt.status || "unknown"),
    executionResult: String(receipt.txExecutionResultName || receipt.txExecutionResult || "unknown"),
  };
}

export async function evaluateClaimWithGenLayer({
  contractAddress,
  accountAddress,
  provider,
  scenarioInput,
  onStage,
}: {
  contractAddress: string;
  accountAddress: string;
  provider: BrowserEthereumProvider | undefined;
  scenarioInput: SlashShieldContractInput;
  onStage?: (stage: GenLayerCallStage) => void;
}): Promise<GenLayerEvaluationResult> {
  const address = assertAddress(contractAddress, "Contract address");
  const account = assertAddress(accountAddress, "Wallet address");
  if (!provider) {
    throw new Error("Injected wallet not found");
  }

  const slashAmountWei = parseWei(scenarioInput.slashAmountWei, "slash_amount_wei");
  const maxPayoutWei = parseWei(scenarioInput.maxPayoutWei, "max_payout_wei");
  const readClient = createReadClient();
  const writeClient = createWriteClient(account, provider);

  onStage?.("connect_network");
  await ensureMetaMaskOnConfiguredNetwork(provider);

  onStage?.("write_contract");
  const transactionHash = normalizeTransactionHash(
    await writeClient.writeContract({
      address,
      functionName: GENLAYER_CONTRACT_METHOD,
      args: [
        scenarioInput.claimId,
        scenarioInput.evidenceUrl,
        scenarioInput.provider,
        scenarioInput.coveredRegion,
        scenarioInput.slashingWindowUtc,
        slashAmountWei,
        maxPayoutWei,
      ],
      value: 0n,
    }),
  );

  onStage?.("wait_receipt");
  const receipt = await readClient.waitForTransactionReceipt({
    hash: transactionHash as never,
    status: "ACCEPTED" as never,
    interval: 5_000,
    retries: 120,
  });

  const { receiptStatus, executionResult } = describeReceipt(receipt);
  if (receipt.txExecutionResultName === "FINISHED_WITH_ERROR") {
    throw new Error(`GenLayer transaction execution failed: ${executionResult}`);
  }

  onStage?.("read_claim_report");
  const claimReportResult = await readClient.readContract({
    address,
    functionName: GENLAYER_REPORT_FOR_CLAIM_METHOD,
    args: [scenarioInput.claimId],
  });
  const { latestReportRaw: claimReportRaw, latestReport: claimReport } = normalizeReport(claimReportResult);
  const returnedClaimId = reportClaimId(claimReport);
  if (returnedClaimId !== scenarioInput.claimId) {
    throw new Error(
      `${GENLAYER_REPORT_FOR_CLAIM_METHOD} returned claim_id "${returnedClaimId || "missing"}" for "${scenarioInput.claimId}"`,
    );
  }

  return {
    contractAddress: address,
    methodName: GENLAYER_CONTRACT_METHOD,
    claimReportMethod: GENLAYER_REPORT_FOR_CLAIM_METHOD,
    latestReportMethod: GENLAYER_LATEST_REPORT_METHOD,
    transactionHash,
    receiptStatus,
    executionResult,
    claimReportRaw,
    claimReport,
    latestReportRaw: claimReportRaw,
    latestReport: claimReport,
    calledAt: new Date().toISOString(),
    scenarioInput,
  };
}
