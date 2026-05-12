# Final Submission Copy

## Title
SlashShield

## Category
Builder -> dApps & Tools

## Secondary Category
Builder -> Smart Contracts

## Short Description
SlashShield is a GenLayer prototype for validator downtime/slashing claim decisions. It evaluates public outage evidence and policy exclusions to return APPROVED or REJECTED payout eligibility.

## Long Description
SlashShield demonstrates a claim adjudication primitive for validator downtime/slashing coverage.

The demo uses two clearly labeled synthetic public evidence scenarios:

1. Provider outage claim -> APPROVED
2. Operator maintenance claim -> REJECTED

The claim console shows the policy, evidence link, contract-call controls, and structured JSON output:

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

## Why GenLayer Is Required
Normal smart contracts cannot interpret natural-language outage reports, operator maintenance notes, and policy exclusions. SlashShield uses GenLayer for the evidence-reasoning step, then renders a bounded structured result that a contract or app can consume.

## Evidence Links
- Live app: https://slashshield.vercel.app/
- Claim console: https://slashshield.vercel.app/claim
- Provider outage evidence: https://slashshield.vercel.app/evidence/aws-us-east-1-incident
- Operator maintenance evidence: https://slashshield.vercel.app/evidence/operator-maintenance
- GitHub repo: https://github.com/alireza78a/slashshield
- Contract source: https://github.com/alireza78a/slashshield/blob/main/contracts/SlashShield.py
- Deployed GenLayer contract: `0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D`
- Submission docs: https://github.com/alireza78a/slashshield/tree/main/docs
- Studio APPROVED screenshot: `docs/screenshots/studio-approved.png`
- Studio REJECTED screenshot: `docs/screenshots/studio-rejected.png`
- Studio v0.5 version screenshot: `docs/screenshots/studio-v05-contract-version.png`
- Frontend live APPROVED proof: `docs/screenshots/frontend-live-provider-outage-approved.png`
- Frontend live REJECTED proof: `docs/screenshots/frontend-live-operator-maintenance-rejected.png`
- Frontend contract-call proof: verified on 2026-05-12. `/claim` returned live `evaluate_slashing_claim(...)` plus matching `report_for_claim(claim_id)` output for both demo scenarios.

## Limitations
- Prototype only.
- Synthetic evidence.
- Not real-money insurance.
- No live validator feed.
- No production settlement.
- Synthetic evidence fixtures.
- Older Studio scenario screenshots predate `slashshield-v0.5-claim-bound-report`; use the frontend live proof screenshots for the current deployed-contract proof.
- The frontend reads `report_for_claim(claim_id)`, not global `latest_report()`, for reviewer proof.

## Pending Artifacts To Attach
- Demo video URL: TODO / Pending
- App screenshot pack: `docs/screenshots/`
- Optional: paste full proof summaries from the `/claim` Copy proof summary button so full transaction hashes are archived as text, not only as truncated UI hashes in screenshots.
