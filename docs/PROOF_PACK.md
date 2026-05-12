# SlashShield Proof Pack

This checklist is intentionally strict. Missing proof should stay marked Missing / Pending until the artifact exists.

| Item | Status | Evidence |
| --- | --- | --- |
| Live app works | Verified | https://slashshield.vercel.app/ returned HTTP 200 on 2026-04-28. |
| `/claim` works | Verified | https://slashshield.vercel.app/claim returned HTTP 200 on 2026-04-28. |
| Provider outage evidence page works | Verified | https://slashshield.vercel.app/evidence/aws-us-east-1-incident returned HTTP 200 on 2026-04-28. |
| Operator maintenance evidence page works | Verified | https://slashshield.vercel.app/evidence/operator-maintenance returned HTTP 200 on 2026-04-28. |
| APPROVED decision visible | Verified | `/claim?scenario=provider-outage` rendered APPROVED JSON in browser verification on 2026-04-28. |
| REJECTED decision visible | Verified | `/claim?scenario=operator-maintenance` rendered REJECTED JSON in browser verification on 2026-04-28. |
| Structured JSON outputs visible | Verified | Browser verification showed decision JSON for APPROVED and REJECTED scenarios on 2026-04-28. |
| Frontend contract-call path exists | Done | `/claim` includes `Evaluate with GenLayer Contract`, calls `evaluate_slashing_claim(...)` through `genlayer-js`, then reads `report_for_claim(claim_id)`. |
| Deployed v0.5 contract address | Done | `0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D`; Studio shows `contract_version()` -> `slashshield-v0.5-claim-bound-report`. |
| Frontend contract-call proof | Verified | `/claim` returned live `evaluate_slashing_claim(...)` + matching `report_for_claim(claim_id)` output for both scenarios on 2026-05-12. Screenshots: `frontend-live-provider-outage-approved.png`, `frontend-live-operator-maintenance-rejected.png`. |
| GitHub repo available | Done | https://github.com/alireza78a/slashshield |
| Contract source available | Done | https://github.com/alireza78a/slashshield/blob/main/contracts/SlashShield.py |
| Public docs available | Done | https://github.com/alireza78a/slashshield/tree/main/docs |
| Studio APPROVED artifact available | Stale | Existing screenshot predates `slashshield-v0.5-claim-bound-report`; optional fresh Studio scenario screenshot can be added. |
| Studio REJECTED artifact available | Stale | Existing screenshot predates `slashshield-v0.5-claim-bound-report`; optional fresh Studio scenario screenshot can be added. |
| Studio rerun after consistency patch | Stale | `URL ingestion: passed v0.4` is no longer current after the per-claim report, duplicate guard, and evidence allowlist patch. |
| Studio v0.5 version screenshot | Done | `docs/screenshots/studio-v05-contract-version.png`. |
| Fresh Studio URL-ingestion test | Optional / Pending | Frontend proof against deployed v0.5 is captured. Fresh Studio scenario screenshots can still be added for extra evidence. |
| Screenshots available | Done | App screenshots and Studio proof screenshots are committed under `docs/screenshots/`. |
| Demo video available | Pending | TODO. |
| Limitations visible | Verified | App and docs state prototype limits: no real-money insurance, no live validator feed, no production settlement. |
| Screenshot checklist exists | Done | `docs/SCREENSHOTS.md` lists required screenshots and marks committed Studio screenshots as Done. |
| Studio URL-ingestion steps exist | Done | `docs/STUDIO_TEST_STEPS.md` includes exact manual test inputs and failure rule. |
| Final submission copy exists | Done | `docs/FINAL_SUBMISSION_COPY.md` includes ready-to-paste copy with pending artifacts clearly marked. |

## Studio-Tested Scenario Values

Provider outage:

```json
{
  "claim_id": "SS-INC-04812-URL",
  "decision": "APPROVED",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": false,
  "payout_allowed": true
}
```

Operator maintenance:

```json
{
  "claim_id": "SS-INC-04813-URL",
  "decision": "REJECTED",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": true,
  "payout_allowed": false
}
```

## Missing Proof Rule
Do not mark demo video or fresh Studio scenario screenshots complete until the actual artifact exists. Frontend integration is complete only because `/claim` returned deployed-contract output for both scenarios with matching `report_for_claim(claim_id)` output.

## Studio URL-Ingestion Proof

Status: v0.5 deployment/version verified; older v0.4 scenario screenshots remain stale.

Current-source note: the contract changed to `slashshield-v0.5-claim-bound-report`. It now stores reports by `claim_id` using two fixed demo slots, rejects duplicate or unknown demo claims, allowlists exact public evidence URLs, disables inline text evaluation, and no longer mutates prototype pool balance from public demo methods. Storage was simplified to `str` + `u256` only (settled flags are stored as `"0"` / `"1"` strings) so the contract deploys on GenLayer Studio analyzers that reject `bool` storage. If Studio still returns only `Error deploying contract`, follow `docs/STUDIO_DEPLOY_DEBUG.md`.

Screenshots:
- `docs/screenshots/studio-approved.png`
- `docs/screenshots/studio-rejected.png`
- `docs/screenshots/studio-v05-contract-version.png`

Previous URL-ingestion result, now stale:

```text
URL ingestion: passed v0.4
```

## Frontend Contract Integration

Status: Verified on 2026-05-12.

Implemented path:
- `/claim` selects provider-outage or operator-maintenance scenario.
- User clicks `Evaluate with GenLayer Contract`.
- Frontend calls `evaluate_slashing_claim(...)` through `genlayer-js`.
- Frontend reads `report_for_claim(selected claim_id)` after the accepted transaction and renders returned output only if the returned `claim_id` matches the selected scenario.

Captured proof:
- Contract address: `0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D`
- Provider outage claim `SS-INC-04812-URL`: live result `APPROVED`, payout `1.0000 GEN`, visible tx/hash `0xaab4bd09...6d4fd675`, screenshot `docs/screenshots/frontend-live-provider-outage-approved.png`.
- Operator maintenance claim `SS-INC-04813-URL`: live result `REJECTED`, payout `0.0000 GEN`, visible tx/hash `0x1f58ce16...15873a6b`, screenshot `docs/screenshots/frontend-live-operator-maintenance-rejected.png`.
- Full tx hashes were not copied into this repo; the committed screenshots show truncated UI hashes and receipt status.
