# SlashShield Submission

## Project Title
SlashShield

## One-Line Description
GenLayer-powered prototype for deciding validator downtime/slashing claim payout eligibility from public outage evidence and policy exclusions.

## Recommended Category
Builder -> dApps & Tools

## Secondary Category
Builder -> Smart Contracts, if the contract source is included in the submission.

## Links
- Live app: https://slashshield.vercel.app/
- Claim console: https://slashshield.vercel.app/claim
- Provider outage evidence: https://slashshield.vercel.app/evidence/aws-us-east-1-incident
- Operator maintenance evidence: https://slashshield.vercel.app/evidence/operator-maintenance
- GitHub repo URL: https://github.com/alireza78a/slashshield
- Demo video URL: TODO / Pending
- Contract/source URL: https://github.com/alireza78a/slashshield/blob/main/contracts/SlashShield.py
- Deployed GenLayer contract: `0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D`
- Public docs URL: https://github.com/alireza78a/slashshield/tree/main/docs
- Studio result artifact: `docs/screenshots/studio-approved.png`, `docs/screenshots/studio-rejected.png`
- Studio APPROVED artifact: `docs/screenshots/studio-approved.png`
- Studio REJECTED artifact: `docs/screenshots/studio-rejected.png`
- Studio URL-ingestion result: older v0.4 screenshots are stale after `slashshield-v0.5-claim-bound-report`; optional fresh Studio scenario screenshots can be added
- Studio v0.5 version artifact: `docs/screenshots/studio-v05-contract-version.png`
- Frontend-to-contract proof: verified on 2026-05-12 with live `/claim` results for both scenarios
- Frontend APPROVED proof artifact: `docs/screenshots/frontend-live-provider-outage-approved.png`
- Frontend REJECTED proof artifact: `docs/screenshots/frontend-live-operator-maintenance-rejected.png`
- App screenshot pack: `docs/screenshots/`

## What SlashShield Demonstrates
SlashShield tests whether a GenLayer Intelligent Contract can evaluate evidence for a validator downtime/slashing claim and return a bounded payout-eligibility decision.

The prototype includes two public scenarios:
- Provider outage claim -> APPROVED
- Operator maintenance claim -> REJECTED

The `/claim` page includes a real GenLayer contract-call path. It calls `evaluate_slashing_claim(...)` with the selected scenario and reads `report_for_claim(claim_id)` after the transaction. This path was verified against the deployed v0.5 contract on 2026-05-12 for both scenarios.

## Why This Needs GenLayer
Normal smart contracts can compare deterministic values, but they cannot read and reason over outage reports, operator maintenance notes, public evidence, and policy exclusions. SlashShield uses GenLayer for the natural-language evidence reasoning step, then renders a structured result:

```json
{
  "decision": "APPROVED or REJECTED",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "exclusion_detected": false,
  "payout_allowed": true,
  "reason": "short evidence-based explanation"
}
```

## Scope Boundary
This is a prototype. It is not real-money insurance, not a live validator feed, not automatic settlement, and not production-ready infrastructure.

The deployed v0.5 contract includes per-claim reports, duplicate-claim rejection, exact evidence URL allowlisting, disabled inline text evaluation, and no public pool balance decrement. Older Studio scenario screenshots remain stale, but the reviewer-facing frontend proof has been captured from the deployed v0.5 contract.

## Proof Artifacts
- Proof checklist: `docs/PROOF_PACK.md`
- Screenshot checklist: `docs/SCREENSHOTS.md`
- Studio test steps: `docs/STUDIO_TEST_STEPS.md`
- Studio deploy debug guide: `docs/STUDIO_DEPLOY_DEBUG.md`
- Studio APPROVED screenshot: `docs/screenshots/studio-approved.png`
- Studio REJECTED screenshot: `docs/screenshots/studio-rejected.png`
- Studio v0.5 version screenshot: `docs/screenshots/studio-v05-contract-version.png`
- Frontend live APPROVED screenshot: `docs/screenshots/frontend-live-provider-outage-approved.png`
- Frontend live REJECTED screenshot: `docs/screenshots/frontend-live-operator-maintenance-rejected.png`
- Final submission copy: `docs/FINAL_SUBMISSION_COPY.md`
