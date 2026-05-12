# GenLayer Contract Deployment Steps

Frontend-to-contract proof was captured on 2026-05-12. Keep these steps as the manual recovery/redeployment runbook if the contract is redeployed again. Do not mark a future proof Done from a Studio screenshot alone; `/claim` must return output from the deployed `SlashShield` contract.

## Local Tooling Audit

Current repo status:

- `package.json` has `dev`, `build`, `check`, and `preview`; it has no contract deployment script.
- `node_modules/.bin` does not include a `genlayer` CLI.
- `npx --no-install genlayer --help` fails because `genlayer` is not installed locally.
- `python3` cannot import `genlayer` or `py_genlayer` from this environment.
- `genlayer-js` exposes SDK transaction/deployment APIs, but this repo has no funded signer/private-key configuration, and no secrets should be committed.

Conclusion: deployment is manual from this repo state. Use GenLayer Studio/Portal unless a separate deploy script and external funded signer are added later.

## Manual Deploy

1. Open GenLayer Studio/Portal.
2. Create a new contract or open the existing SlashShield workspace.
3. Load `contracts/SlashShield.py` exactly from this repo.
4. Deploy `SlashShield`.
5. Constructor input:

```text
initial_pool_balance_wei: 0
```

`0` uses the contract default prototype pool balance (`10000000000000000000` wei). Use a different value only if the reviewer proof needs a specific prototype balance.

6. After deploy, call:

```text
contract_version
```

Expected:

```text
slashshield-v0.5-claim-bound-report
```

7. Copy the deployed contract address. It must be a full `0x` address.

## Configure Vercel

Set the public contract address as a Vercel environment variable. This is not a private key, but it still should be environment config, not hard-coded into source.

Required key:

```text
VITE_GENLAYER_CONTRACT_ADDRESS=<deployed SlashShield contract address>
VITE_GENLAYER_NETWORK=studio
VITE_GENLAYER_RPC_URL=https://studio.genlayer.com/api
VITE_GENLAYER_WALLET_RPC_URL=https://studio.genlayer.com/api
```

Dashboard path:

1. Open Vercel.
2. Open the `slashshield` project.
3. Go to Settings -> Environment Variables.
4. Add `VITE_GENLAYER_CONTRACT_ADDRESS`.
5. Paste the deployed contract address as the value.
6. Select Production. Add Preview too if you want to verify on preview deploys.
7. Save.

CLI path from the linked repo:

```bash
npx vercel env add VITE_GENLAYER_CONTRACT_ADDRESS production
```

Paste the deployed contract address when prompted.

Then redeploy:

```bash
npx vercel --prod
```

## Verify Frontend Contract Call

1. Open:

```text
https://slashshield.vercel.app/claim?scenario=provider-outage
```

2. Confirm the contract status no longer says `Contract address not configured`.
3. Click `Run GenLayer evaluation`.
4. Connect/sign with a wallet on the expected GenLayer network if prompted.
5. Wait for the UI to show returned output.
6. Capture proof showing:
   - configured contract address
   - method `evaluate_slashing_claim`
   - selected scenario input
   - returned transaction hash or receipt
   - returned `report_for_claim(claim_id)` output
   - timestamp
7. Expected provider-outage result:

```json
{
  "claim_id": "SS-INC-04812-URL",
  "verdict": "APPROVED",
  "payout_wei": "1000000000000000000",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "non_malicious_liveness_loss": true,
  "excluded_cause_found": false
}
```

8. Repeat with:

```text
https://slashshield.vercel.app/claim?scenario=operator-maintenance
```

9. Expected operator-maintenance result:

```json
{
  "claim_id": "SS-INC-04813-URL",
  "verdict": "REJECTED",
  "payout_wei": "0",
  "excluded_cause_found": true
}
```

## Failure Rule

Keep frontend proof Pending if any of these happen:

- no deployed contract address is available
- `/claim` still says `Contract address not configured`
- wallet/signing fails
- transaction fails or stays unresolved
- `report_for_claim(claim_id)` is missing
- returned report mismatches the selected scenario

Do not rerun the same demo `claim_id` against the same v0.5 contract when trying to recapture success proof. The contract intentionally rejects duplicate claim IDs.
