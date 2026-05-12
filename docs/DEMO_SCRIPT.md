# SlashShield Demo Script

Target length: 60-90 seconds.

## Script

Open with the problem:

> Validator operators can be penalized for downtime even when the cause is outside their control, like a cloud-provider outage. A normal smart contract cannot read an outage report and decide whether it matches an insurance policy.

Open SlashShield:

> SlashShield is a GenLayer prototype for validator downtime/slashing claim decisions. It does not claim to be real-money insurance. It shows the claim decision primitive.

Show the overview:

> The flow is policy, claim, evidence, GenLayer reasoning, decision, and payout eligibility.

Open `/claim`:

> This is the claim console. The policy covers a provider and region, and excludes operator maintenance, key compromise, double signing, and unpaid premium.

Show provider outage:

> First scenario: provider outage. The evidence is synthetic and public. It describes AWS us-east-1 EBS control-plane degradation overlapping the submitted downtime/slashing window.

Show APPROVED:

> GenLayer returns a structured APPROVED decision: provider match true, region match true, time overlap true, no exclusion detected, payout allowed true.

Show maintenance:

> Second scenario: operator maintenance. The evidence is also synthetic and public. It says the downtime happened during a voluntary Prysm rollout and signer migration.

Show REJECTED:

> GenLayer returns REJECTED because operator maintenance is an exclusion. The JSON shows exclusion_detected true and payout_allowed false.

Close with limits:

> This is a prototype demo. There is no real-money insurance, no live validator feed, and no production settlement. The point is the GenLayer evidence-reasoning step: converting messy public text into a bounded claim decision.

## Screens To Show
- https://slashshield.vercel.app/
- https://slashshield.vercel.app/claim?scenario=provider-outage
- https://slashshield.vercel.app/evidence/aws-us-east-1-incident
- https://slashshield.vercel.app/claim?scenario=operator-maintenance
- https://slashshield.vercel.app/evidence/operator-maintenance
