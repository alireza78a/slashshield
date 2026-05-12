# GenLayer Studio Test Steps

These steps are for final proof. Record any mismatch as a failure, not a success.

## Setup
1. Open GenLayer Studio.
2. Create or open a contract using `contracts/SlashShield.py`.
3. Deploy a fresh instance if needed.
4. Call `contract_version()`.
5. Expected response:

```text
slashshield-v0.4-consistent-report
```

## Provider Outage URL-Ingestion Test
Method:

```text
evaluate_slashing_claim
```

Inputs:

```text
claim_id:
SS-INC-04812-URL

evidence_url:
https://slashshield.vercel.app/evidence/aws-us-east-1-incident

provider:
AWS

covered_region:
us-east-1

slashing_window_utc:
2026-04-26 14:08 to 14:44 UTC

slash_amount_wei:
1000000000000000000

max_payout_wei:
1000000000000000000
```

Expected latest report:

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

Save:
- screenshot or export of the transaction result
- `latest_report()` output after the run

## Operator Maintenance URL-Ingestion Test
Method:

```text
evaluate_slashing_claim
```

Inputs:

```text
claim_id:
SS-INC-04813-URL

evidence_url:
https://slashshield.vercel.app/evidence/operator-maintenance

provider:
AWS

covered_region:
us-east-1

slashing_window_utc:
2026-04-26 19:42 to 20:05 UTC

slash_amount_wei:
310000000000000000

max_payout_wei:
310000000000000000
```

Expected latest report:

```json
{
  "claim_id": "SS-INC-04813-URL",
  "verdict": "REJECTED",
  "payout_wei": "0",
  "excluded_cause_found": true
}
```

Save:
- screenshot or export of the transaction result
- `latest_report()` output after the run

## Failure Rule
If the result is `UNDETERMINED`, `ERROR`, mismatched, or cannot read the public URL, keep the artifact status as failed/pending. Do not present it as verified.
