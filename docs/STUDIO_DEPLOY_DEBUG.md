# GenLayer Studio Deploy Debug Guide (SlashShield v0.5)

Use this when GenLayer Studio shows only `Error deploying contract` for
`contracts/SlashShield.py` and the previous deployed instance still returns
`slashshield-v0.4-consistent-report`.

The repo-side fix for the most common cause has already been applied:
`provider_outage_settled` and `operator_maintenance_settled` are now `str`
(`"0"` / `"1"`) instead of `bool`, so the contract's storage uses only `str`
and `u256`. That alone resolves the deploy error on Studio analyzers that
reject `bool` storage.

If deploy still fails, work through the steps below in order.

## 1. Confirm the local v0.5 source is what Studio sees

```bash
cd /Users/alireza/slashshield
python3 -m py_compile contracts/SlashShield.py
python3 -m pytest tests
grep -n "VERSION =" contracts/SlashShield.py
```

Expected:

- `py_compile` exits 0.
- All tests pass.
- `VERSION = "slashshield-v0.5-claim-bound-report"`.

If any of those fail, fix locally before retrying Studio.

## 2. Deploy a fresh v0.5 contract in Studio

Do not redeploy the existing `0x34...8f59` instance. That instance is the old
v0.4 contract and cannot be upgraded in place; v0.5 is a separate deployment.

1. Open GenLayer Studio.
2. `Contracts` -> `New contract`.
3. Paste the entire contents of `contracts/SlashShield.py` into the Studio
   editor, or upload the file. Keep the class name `SlashShield`.
4. Save.
5. Click `Deploy`.
6. Constructor input:

   ```text
   initial_pool_balance_wei: 0
   ```

   `0` triggers the prototype default pool (`10000000000000000000`). Any
   positive `u256` is also accepted.

7. Confirm and wait for the deployed contract address.

## 3. Verify v0.5 is what Studio actually deployed

Call the read methods in this exact order:

1. `contract_version()`

   Expected:

   ```text
   slashshield-v0.5-claim-bound-report
   ```

   If the value is `slashshield-v0.4-consistent-report`, Studio is still
   pointing at the old `0x34...8f59` instance. Pick the new contract address
   from the `Contracts` list and try again.

2. `pool_balance()`

   Expected: the constructor value, or `10000000000000000000` if you passed `0`.

3. `report_for_claim("SS-INC-04812-URL")`

   Expected:

   ```text
   {}
   ```

   This is the empty default before any claim has been evaluated.

4. `report_for_claim("SS-INC-99999-URL")`

   Expected: error response containing `unsupported claim id`.

5. `latest_report()`

   Expected:

   ```text
   {}
   ```

   `latest_report()` is debug only. The frontend reads
   `report_for_claim(claim_id)`, not `latest_report()`.

If `report_for_claim` does not appear under `Read Methods`, Studio cached
the old ABI for this file name. Use the renamed-class workaround in step 5.

## 4. Run the URL-ingestion proofs

After step 3 succeeds, run the two scenarios in
`docs/STUDIO_TEST_STEPS.md`:

- Provider outage -> `APPROVED`.
- Operator maintenance -> `REJECTED`.

For each scenario, capture:

- the deployed contract address,
- the `evaluate_slashing_claim(...)` transaction or hash,
- the matching `report_for_claim(claim_id)` output.

## 5. If deploy still fails: renamed-class fallback

Some Studio sessions cache the contract under the source file name even
after the file content changes. Symptoms:

- `Error deploying contract` repeats with no detail.
- The new file shows old read methods.
- `report_for_claim` is missing.

Workaround:

1. In Studio, create a NEW contract file (do not edit the existing one).
2. Name the file `SlashShieldV05.py`.
3. Paste the contents of `contracts/SlashShield.py`.
4. In the pasted source, change ONLY the class line:

   ```python
   class SlashShieldV05(gl.Contract):
   ```

   Do not change `VERSION`, do not change storage, do not change methods.
5. Save and deploy the new contract.
6. Repeat step 3 against the new instance. `contract_version()` must still
   return `slashshield-v0.5-claim-bound-report`.

This is a Studio-side workaround only. Do not commit a renamed class to
the repo.

## 6. If deploy still fails: capture the real error

Studio surfaces only `Error deploying contract` in the UI. The actual
diagnostic is in the browser. Capture both:

1. DevTools `Console` tab: copy any red error lines emitted while clicking
   `Deploy`. Common signals:
   - `unknown storage type ...` -> a storage field type is not supported.
   - `unable to parse contract` -> Python/Studio analyzer rejected source.
   - Anything mentioning a class or method name -> that symbol is the cause.
2. DevTools `Network` tab: find the failing request triggered by `Deploy`
   (usually a JSON-RPC POST to the Studio backend). Copy the response body.

Save those captures next to the screenshot, then update
`docs/PROOF_PACK.md` Studio rows to `Failed` with the captured error.

Do not mark Studio deploy as `Done` from the UI alone. The evidence is the
captured error or the verified `report_for_claim(...)` output.

## 7. Frontend proof is still gated

Even after Studio deploy is verified:

- `VITE_GENLAYER_CONTRACT_ADDRESS` must be updated to the new v0.5 address.
- `/claim` must show a real `evaluate_slashing_claim(...)` call returning a
  matching `report_for_claim(claim_id)` output.
- Until both are captured, the frontend contract-call row in
  `docs/PROOF_PACK.md` stays `Pending`.

This file is intentionally a debug runbook, not a verification claim.
