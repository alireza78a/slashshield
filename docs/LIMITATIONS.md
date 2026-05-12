# SlashShield Limitations

SlashShield is a GenLayer Builder prototype, not production infrastructure.

## Explicit Non-Claims
- Not real-money insurance.
- No live validator feed.
- No automatic settlement.
- No production oracle network.
- No production-ready policy admin or underwriting system.
- Not legal advice.
- Not financial advice.

## Evidence Boundary
The current evidence pages are synthetic public fixtures:
- `https://slashshield.vercel.app/evidence/aws-us-east-1-incident`
- `https://slashshield.vercel.app/evidence/operator-maintenance`

They are designed to be readable by reviewers and GenLayer Studio. They are not real AWS, operator, or validator incident records.

## Studio Boundary
Inline Studio scenarios were tested previously for:
- `SS-INC-04812` -> APPROVED
- `SS-INC-04813` -> REJECTED

Public URL-ingestion still needs a fresh Studio test using the production evidence URLs before it should be described as verified.

## Future Work
- Publish GitHub repository.
- Add public contract/source URL.
- Add Studio screenshot or exported transaction output.
- Re-test URL ingestion with production evidence URLs.
- Add real validator/slashing data source if one becomes available.
- Add production settlement only after explicit scope, audits, and real policy design.
