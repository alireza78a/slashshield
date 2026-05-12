# SlashShield Studio Test Inputs

## Step 1 - Verify Contract Version

Call:

```text
contract_version
```

Expected:

```text
slashshield-v0.4-consistent-report
```

## Step 2 - Approved Scenario

Method:

```text
evaluate_slashing_claim_text
```

Inputs:

```text
claim_id:
SS-INC-04812

evidence_text:
AWS Health Dashboard incident SS-AWS-USE1-2026-04-26 reports elevated EBS API error rates and degraded EBS control plane availability in AWS us-east-1 from 2026-04-26 14:02 UTC to 14:38 UTC. status.aws.amazon.com RSS confirms increased EBS error rates in US-EAST-1 during the same window. beaconcha.in reports validator index 1483321 missed 12 attestations across epochs 312402-312414. Ethereum RPC witness reports effective balance reduced by 1.0000 ETH at slot 9997184. Hetzner control source is green, showing this was not a broad internet failure. Operator signed attestation says the validator was hosted in AWS us-east-1 use1-az2 and no maintenance window was active.

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
  "claim_id": "SS-INC-04812",
  "verdict": "APPROVED",
  "payout_wei": "1000000000000000000",
  "provider_match": true,
  "region_match": true,
  "time_overlap": true,
  "non_malicious_liveness_loss": true,
  "excluded_cause_found": false
}
```

## Step 3 - Rejected Scenario

Method:

```text
evaluate_slashing_claim_text
```

Inputs:

```text
claim_id:
SS-INC-04813

evidence_text:
Operator runbook signed by Helix Staking declared voluntary maintenance from 2026-04-26 19:00 UTC to 20:30 UTC for Prysm 5.0.4 rollout and signer migration. AWS Health Dashboard reports no active incident in AWS us-east-1 during the window. status.aws.amazon.com RSS reports no EBS or EC2 networking advisory in US-EAST-1. beaconcha.in reports validator index 1483321 missed duties during the declared maintenance window. Client release notes confirm the Prysm 5.0.4 rollout was operator scheduled. Operator self-report acknowledges signer migration during the downtime.

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
  "claim_id": "SS-INC-04813",
  "verdict": "REJECTED",
  "payout_wei": "0",
  "excluded_cause_found": true
}
```

## Step 4 - Public URL Ingestion Check

Use this only after the production deploy is reachable. This proves the URL path works and avoids the
`PORT_FORBIDDEN` error from localhost.

Method:

```text
evaluate_slashing_claim
```

Approved URL inputs:

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

Rejected URL inputs:

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
