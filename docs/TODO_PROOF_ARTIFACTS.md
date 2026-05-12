# TODO Proof Artifacts

These items track remaining submission artifacts. The frontend-to-contract proof is now captured; do not rerun the same claim IDs against the same contract unless testing duplicate rejection.

## Required Remaining
- Add demo video URL.
- Update `docs/SUBMISSION.md` and `docs/FINAL_SUBMISSION_COPY.md` with demo video artifact URL.

## Optional
- Capture fresh Studio provider-outage and operator-maintenance screenshots against v0.5. The current reviewer-facing frontend proof is already captured.
- Paste full `/claim` proof summaries so full transaction hashes are archived as text. Current screenshots show truncated UI hashes and receipt status.

## Stale After Contract Patch
- Existing Studio screenshots and `URL ingestion: passed v0.4` predate `slashshield-v0.5-claim-bound-report`.
- Previous deployed-contract proof, if any, predates per-claim reports, duplicate guard, evidence URL allowlist, and disabled inline text evaluation.

## Done
- Added manual GenLayer deployment runbook: `docs/DEPLOY_CONTRACT_STEPS.md`.
- Deployed patched `slashshield-v0.5-claim-bound-report` contract:
  - `0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D`
- Updated production Vercel env for the v0.5 contract and Studio RPC.
- Captured Studio `contract_version()` proof:
  - `docs/screenshots/studio-v05-contract-version.png`
- Added GitHub repo URL: https://github.com/alireza78a/slashshield
- Added public contract/source URL: https://github.com/alireza78a/slashshield/blob/main/contracts/SlashShield.py
- Added public docs URL: https://github.com/alireza78a/slashshield/tree/main/docs
- Added submission screenshots under `docs/screenshots/`:
  - `homepage-hero.png`
  - `claim-provider-outage-approved.png`
  - `claim-operator-maintenance-rejected.png`
  - `evidence-provider-outage.png`
  - `evidence-operator-maintenance.png`
- Added GenLayer Studio proof screenshots:
  - `studio-approved.png`
  - `studio-rejected.png`
- Re-tested `evaluate_slashing_claim` with public production evidence URLs before the v0.5 integrity patch.
- Re-tested `evaluate_slashing_claim` after contract consistency patch `slashshield-v0.4-consistent-report`; this is now stale after v0.5.
- URL ingestion result: `passed v0.4`; stale after v0.5.
- Added `/claim` frontend call path for `evaluate_slashing_claim(...)`.
- Captured live frontend-to-contract proof against deployed v0.5:
  - Provider outage `SS-INC-04812-URL` -> `APPROVED`, `1.0000 GEN`, visible tx/hash `0xaab4bd09...6d4fd675`, screenshot `docs/screenshots/frontend-live-provider-outage-approved.png`.
  - Operator maintenance `SS-INC-04813-URL` -> `REJECTED`, `0.0000 GEN`, visible tx/hash `0x1f58ce16...15873a6b`, screenshot `docs/screenshots/frontend-live-operator-maintenance-rejected.png`.

## Current Known Production Deployment
- App: https://slashshield.vercel.app/
- Latest verified deployment ID: `dpl_9QtPSZq1dgYt7abGRpagshqYKF9N`
- Verified date in project records: 2026-05-12

## Rule
Do not move any item to complete unless the actual artifact exists and is linked or committed.
