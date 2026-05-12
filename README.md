# SlashShield

Parametric validator downtime claim decisions, powered by GenLayer evidence reasoning.

SlashShield is a prototype claim console for one narrow question:

> Does the submitted outage evidence qualify this validator downtime/slashing claim for payout eligibility under the policy?

It is intentionally scoped. This is not real-money insurance, not a live validator feed, and not production settlement.

## Demo

- Live app: https://slashshield.vercel.app/
- Claim console: https://slashshield.vercel.app/claim
- Provider outage evidence: https://slashshield.vercel.app/evidence/aws-us-east-1-incident
- Operator maintenance evidence: https://slashshield.vercel.app/evidence/operator-maintenance

## Why This Needs GenLayer

Normal smart contracts are good at deterministic checks. This claim flow needs something else: reasoning over messy text evidence.

SlashShield asks GenLayer to evaluate:

- whether the provider matches the policy,
- whether the region matches,
- whether the outage window overlaps the slashing/downtime window,
- whether the loss looks non-malicious,
- whether an exclusion applies, such as operator maintenance.

The contract returns a bounded structured result:

```json
{
  "decision": "APPROVED",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": false,
  "payout_allowed": true,
  "reason": "Provider outage overlapped the covered downtime window."
}
```

## Demo Scenarios

### Provider Outage -> APPROVED

The evidence describes an AWS `us-east-1` outage overlapping the covered slashing window.

Expected fields:

```json
{
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": false,
  "payout_allowed": true
}
```

### Operator Maintenance -> REJECTED

The evidence describes a voluntary operator maintenance window. That is an exclusion, even though provider and region fields match.

Expected fields:

```json
{
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": true,
  "payout_allowed": false
}
```

## Contract

The GenLayer contract draft lives at:

```text
contracts/SlashShield.py
```

Main methods:

- `evaluate_slashing_claim(...)` reads public evidence URLs.
- `report_for_claim(claim_id)` returns the structured report for one claim.
- `latest_report()` is retained only as a debug/backwards-compatible read.
- `evaluate_slashing_claim_text(...)` is disabled in the patched proof contract; use allowlisted public evidence URLs.
- `contract_version()` returns the current contract version.

Frontend contract-call config:

- `VITE_GENLAYER_CONTRACT_ADDRESS` is required for `/claim` to call the deployed contract.
- Production uses the Studio deployment config: `VITE_GENLAYER_NETWORK=studio`, `VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api`, and `VITE_GENLAYER_WALLET_RPC_URL=https://studio.genlayer.com/api`.
- If the address is missing, `/claim` shows `Contract address not configured` and keeps the local result labeled as an expected demo fallback.

Current contract version:

```text
slashshield-v0.5-claim-bound-report
```

Current deployed GenLayer contract:

```text
0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D
```

## Proof Artifacts

- Studio proof screenshots: `docs/screenshots/`
- Frontend live contract proof screenshots: `docs/screenshots/frontend-live-provider-outage-approved.png` and `docs/screenshots/frontend-live-operator-maintenance-rejected.png`
- Studio test inputs: `docs/STUDIO_TEST_STEPS.md`
- Submission copy: `docs/FINAL_SUBMISSION_COPY.md`
- Contract logic notes: `docs/CONTRACT_LOGIC.md`
- Known limitations: `docs/LIMITATIONS.md`

Latest Studio deploy status: `slashshield-v0.5-claim-bound-report` is deployed and `contract_version()` is visible in Studio. The patched contract stores reports by `claim_id` using two fixed demo slots, rejects duplicate or unknown demo claims, allowlists exact evidence URLs, and no longer mutates prototype pool balance from public demo methods. Older Studio scenario screenshots from v0.4 remain stale.

Frontend integration status: verified on 2026-05-12. `/claim` called `evaluate_slashing_claim(...)` through `genlayer-js` and read matching `report_for_claim(claim_id)` output for both demo scenarios: provider outage returned `APPROVED` / `1.0000 GEN`; operator maintenance returned `REJECTED` / `0.0000 GEN`. Screenshots are committed under `docs/screenshots/`.

## Run Locally

```bash
npm install
npm run dev
```

Local URL:

```text
http://127.0.0.1:5173/
```

## Verify

```bash
npm run check
```

This runs:

- TypeScript build
- Vite production build
- Python compile check for `contracts/SlashShield.py`

## Limits

- Prototype only.
- Synthetic evidence only.
- No real-money insurance.
- No live validator feed.
- No automatic production settlement.
- Not legal or financial advice.
