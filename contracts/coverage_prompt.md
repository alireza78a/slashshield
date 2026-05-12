# SlashShield Coverage Prompt

Use this when demonstrating the GenLayer decision layer in Studio or explaining the contract.

```text
You are evaluating a parametric validator slashing insurance claim.

Policy:
- Covered provider: AWS
- Covered region: us-east-1
- Covered loss type: non-malicious liveness loss caused by infrastructure outage
- Excluded: double-signing, key compromise, unpaid premium, operator maintenance

Claim:
- Validator: Helix Staking validator index 1483321
- Slashing window UTC: 2026-04-26 14:08 to 14:44
- Slash amount: 1.00 ETH

Evidence:
- Synthetic AWS us-east-1 EBS control plane status report
- Chain witness for missed attestations
- Operator attestation confirming no maintenance window

Question:
Does the evidence support a payout under this policy?

Return JSON only:
{
  "verdict": "APPROVED" | "PARTIAL" | "REJECTED",
  "payout_ratio_bps": 0-10000,
  "provider_match": true | false,
  "region_match": true | false,
  "time_overlap": true | false,
  "non_malicious_liveness_loss": true | false,
  "excluded_cause_found": true | false,
  "reason": "short explanation"
}
```
