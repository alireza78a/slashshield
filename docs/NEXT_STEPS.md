# SlashShield Next Steps

## A. GitHub Source

Done:

- GitHub repo: https://github.com/alireza78a/slashshield
- Contract source: https://github.com/alireza78a/slashshield/blob/main/contracts/SlashShield.py
- Public docs: https://github.com/alireza78a/slashshield/tree/main/docs

## B. GenLayer Studio

Status: v0.5 deploy/version is verified. Previous Studio scenario artifacts are still stale because they predate `slashshield-v0.5-claim-bound-report`.

Current deployed contract:

```text
0x9dCeF95b8D543eB9a8ec74076b9Bb4efBEd0b30D
```

Studio screenshot:

```text
docs/screenshots/studio-v05-contract-version.png
```

Storage is now `str` + `u256` only (settled flags became `"0"` / `"1"` strings) so v0.5 deploys on Studio analyzers that previously failed with `Error deploying contract`. If Studio still surfaces only that error, follow:

```text
docs/STUDIO_DEPLOY_DEBUG.md
```

Then follow:

```text
docs/STUDIO_TEST_STEPS.md
```

Optional extra capture:

```text
docs/screenshots/studio-approved.png
docs/screenshots/studio-rejected.png
```

Or add exported Studio transaction output files under:

```text
docs/studio/
```

Keep any fresh Studio scenario result Pending if Studio returns `ERROR`, `UNDETERMINED`, or a mismatched report.

## C. Frontend Contract Verification

Status: verified on 2026-05-12.

Captured:

- Provider outage `SS-INC-04812-URL` -> `APPROVED`, `1.0000 GEN`, visible tx/hash `0xaab4bd09...6d4fd675`, screenshot `docs/screenshots/frontend-live-provider-outage-approved.png`.
- Operator maintenance `SS-INC-04813-URL` -> `REJECTED`, `0.0000 GEN`, visible tx/hash `0x1f58ce16...15873a6b`, screenshot `docs/screenshots/frontend-live-operator-maintenance-rejected.png`.

Do not rerun these same demo claim IDs against the same contract unless you intentionally want to show duplicate-claim rejection. The v0.5 contract rejects duplicate claim IDs.

Optional cleanup before submission:

- Open the existing success page if still available.
- Click `Reviewer proof`.
- Click `Copy proof summary`.
- Paste the full summaries into a proof note so full transaction hashes are archived as text.

## D. Demo Video

Record 60-90 seconds using:

```text
docs/DEMO_SCRIPT.md
```

Then add the public video URL to:

```text
docs/SUBMISSION.md
docs/FINAL_SUBMISSION_COPY.md
docs/PROOF_PACK.md
```

## E. Final Artifact Commit

After adding GitHub URLs, Studio artifacts, frontend contract-call proof, and demo video URL:

```bash
cd /Users/alireza/slashshield
npm run check
git add README.md docs package.json .gitignore
git commit -m "docs: add SlashShield submission proof artifacts"
git push
```
