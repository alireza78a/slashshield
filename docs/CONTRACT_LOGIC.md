# SlashShield Contract Logic

Contract draft: `contracts/SlashShield.py`

## Purpose
The contract models a GenLayer decision primitive for validator downtime/slashing claim payout eligibility.

It does not implement production settlement or real-money insurance.

## Decision Flow
1. Parse the submitted claim:
   - `claim_id`
   - evidence source or evidence text
   - covered provider
   - covered region
   - downtime/slashing window
   - slash amount
   - max payout
2. Read evidence:
   - `evaluate_slashing_claim` reads a public evidence URL.
   - `evaluate_slashing_claim_text` accepts inline evidence text for Studio testing.
3. Ask GenLayer for structured coverage reasoning over the evidence.
4. Check provider match.
5. Check region match.
6. Check outage window versus downtime/slashing window.
7. Detect exclusions:
   - operator maintenance
   - key compromise
   - double signing
   - unpaid premium
8. Validate bounded output shape.
9. Return and store the latest structured report.

## Structured Decision Rendered By The App
The frontend renders the contract-shaped result as:

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

## Current Contract Methods
- `contract_version()` returns the draft version string.
- `pool_balance()` returns prototype pool balance state.
- `latest_report()` returns the last stored decision report.
- `evaluate_slashing_claim(...)` reads a public evidence URL and evaluates it.
- `evaluate_slashing_claim_text(...)` evaluates inline evidence text.

## Known Contract Limits
- The contract is a hackathon draft.
- Public URL ingestion still needs a fresh production-evidence Studio test.
- The contract stores payout eligibility and prototype pool accounting, not real settlement.
- The frontend does not claim that settlement happened.
