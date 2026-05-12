# { "Depends": "py-genlayer:test" }

# SlashShield v0.5 -- GenLayer Studio deploy guide
#
#   VERSION:          slashshield-v0.5-claim-bound-report
#   Class:            SlashShield
#   Constructor arg:  initial_pool_balance_wei (u256). Pass 0 to use the prototype default pool.
#
#   Public read views (must appear in the Studio "Read Methods" list after deploy):
#     - contract_version()       -> "slashshield-v0.5-claim-bound-report"
#     - pool_balance()           -> u256
#     - latest_report()          -> str   (debug/back-compat only; do NOT use as frontend proof)
#     - report_for_claim(str)    -> str   (per-claim report, frontend proof source)
#
#   Public write:
#     - evaluate_slashing_claim(claim_id, evidence_url, provider, covered_region,
#                               slashing_window_utc, slash_amount_wei, max_payout_wei) -> str
#
#   Disabled by design (raises):
#     - evaluate_slashing_claim_text(...)  -- inline text evidence is not allowed.
#
#   Studio storage compatibility:
#     This contract uses ONLY `str` and `u256` storage fields. `bool` storage was
#     dropped because some GenLayer Studio Python contract analyzers reject it
#     and surface only "Error deploying contract". Settled flags are stored as
#     SETTLED_TRUE / SETTLED_FALSE string literals.
#
#   Deploy verification sequence (run in Studio after deploy):
#     1. contract_version()                       -> "slashshield-v0.5-claim-bound-report"
#     2. report_for_claim("SS-INC-04812-URL")     -> "{}" (empty until evaluated)
#     3. report_for_claim("SS-INC-99999-URL")     -> raises "unsupported claim id"
#     4. evaluate_slashing_claim(...)             -> see docs/STUDIO_TEST_STEPS.md
#     5. report_for_claim("SS-INC-04812-URL")     -> matching APPROVED report JSON
#
#   If Studio still shows "Error deploying contract" with no detail, follow
#   docs/STUDIO_DEPLOY_DEBUG.md (renamed-class workaround + Network/Console capture).

from genlayer import *
import json


class SlashShield(gl.Contract):
    DEFAULT_POOL_BALANCE_WEI = 10000000000000000000
    VERSION = "slashshield-v0.5-claim-bound-report"
    PROVIDER_OUTAGE_CLAIM_ID = "SS-INC-04812-URL"
    OPERATOR_MAINTENANCE_CLAIM_ID = "SS-INC-04813-URL"
    PROVIDER_OUTAGE_EVIDENCE_URL = "https://slashshield.vercel.app/evidence/aws-us-east-1-incident"
    OPERATOR_MAINTENANCE_EVIDENCE_URL = "https://slashshield.vercel.app/evidence/operator-maintenance"
    SETTLED_TRUE = "1"
    SETTLED_FALSE = "0"

    pool_balance_wei: u256
    last_claim_id: str
    last_verdict: str
    last_report_json: str
    provider_outage_report_json: str
    operator_maintenance_report_json: str
    provider_outage_settled: str
    operator_maintenance_settled: str

    def __init__(self, initial_pool_balance_wei: u256):
        if initial_pool_balance_wei > 0:
            self.pool_balance_wei = initial_pool_balance_wei
        else:
            self.pool_balance_wei = self.DEFAULT_POOL_BALANCE_WEI
        self.last_claim_id = ""
        self.last_verdict = "NO_CLAIM"
        self.last_report_json = "{}"
        self.provider_outage_report_json = "{}"
        self.operator_maintenance_report_json = "{}"
        self.provider_outage_settled = self.SETTLED_FALSE
        self.operator_maintenance_settled = self.SETTLED_FALSE

    @gl.public.view
    def pool_balance(self) -> u256:
        return self.pool_balance_wei

    @gl.public.view
    def latest_report(self) -> str:
        return self.last_report_json

    @gl.public.view
    def report_for_claim(self, claim_id: str) -> str:
        if claim_id == self.PROVIDER_OUTAGE_CLAIM_ID:
            return self.provider_outage_report_json
        if claim_id == self.OPERATOR_MAINTENANCE_CLAIM_ID:
            return self.operator_maintenance_report_json
        raise Exception("unsupported claim id")

    @gl.public.view
    def contract_version(self) -> str:
        return self.VERSION

    def _claim_already_settled(self, claim_id: str) -> bool:
        if claim_id == self.PROVIDER_OUTAGE_CLAIM_ID:
            return self.provider_outage_settled == self.SETTLED_TRUE
        if claim_id == self.OPERATOR_MAINTENANCE_CLAIM_ID:
            return self.operator_maintenance_settled == self.SETTLED_TRUE
        raise Exception("unsupported claim id")

    def _store_report_for_claim(self, claim_id: str, report_json: str) -> None:
        if self._claim_already_settled(claim_id):
            raise Exception("claim already evaluated")
        if claim_id == self.PROVIDER_OUTAGE_CLAIM_ID:
            self.provider_outage_report_json = report_json
            self.provider_outage_settled = self.SETTLED_TRUE
            return
        if claim_id == self.OPERATOR_MAINTENANCE_CLAIM_ID:
            self.operator_maintenance_report_json = report_json
            self.operator_maintenance_settled = self.SETTLED_TRUE
            return
        raise Exception("unsupported claim id")

    def _validate_demo_claim_inputs(
        self,
        claim_id: str,
        evidence_url: str,
        provider: str,
        covered_region: str,
        slashing_window_utc: str,
        slash_amount_wei: u256,
        max_payout_wei: u256,
    ) -> None:
        if self._claim_already_settled(claim_id):
            raise Exception("claim already evaluated")
        if claim_id == self.PROVIDER_OUTAGE_CLAIM_ID:
            if evidence_url != self.PROVIDER_OUTAGE_EVIDENCE_URL:
                raise Exception("unsupported evidence url")
            if provider != "AWS":
                raise Exception("provider does not match demo claim")
            if covered_region != "us-east-1":
                raise Exception("region does not match demo claim")
            if slashing_window_utc != "2026-04-26 14:08 to 14:44 UTC":
                raise Exception("slashing window does not match demo claim")
            if slash_amount_wei != 1000000000000000000:
                raise Exception("slash amount does not match demo claim")
            if max_payout_wei != 1000000000000000000:
                raise Exception("max payout does not match demo claim")
            return
        if claim_id == self.OPERATOR_MAINTENANCE_CLAIM_ID:
            if evidence_url != self.OPERATOR_MAINTENANCE_EVIDENCE_URL:
                raise Exception("unsupported evidence url")
            if provider != "AWS":
                raise Exception("provider does not match demo claim")
            if covered_region != "us-east-1":
                raise Exception("region does not match demo claim")
            if slashing_window_utc != "2026-04-26 19:42 to 20:05 UTC":
                raise Exception("slashing window does not match demo claim")
            if slash_amount_wei != 310000000000000000:
                raise Exception("slash amount does not match demo claim")
            if max_payout_wei != 310000000000000000:
                raise Exception("max payout does not match demo claim")
            return
        raise Exception("unsupported claim id")

    def _validate_report(self, leader_result) -> bool:
        try:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            report = leader_result.calldata
            if not isinstance(report, dict):
                return False
            verdict = report.get("verdict")
            if verdict not in ["APPROVED", "PARTIAL", "REJECTED"]:
                return False
            ratio = report.get("payout_ratio_bps")
            if not isinstance(ratio, int) or ratio < 0 or ratio > 10000:
                return False
            for key in [
                "provider_match",
                "region_match",
                "time_overlap",
                "non_malicious_liveness_loss",
                "excluded_cause_found",
            ]:
                if not isinstance(report.get(key), bool):
                    return False
            reason = report.get("reason")
            if not isinstance(reason, str) or len(reason) > 280:
                return False
            if verdict == "REJECTED" and ratio != 0:
                return False
            if verdict == "APPROVED" and ratio == 0:
                return False
            if verdict == "PARTIAL" and (ratio == 0 or ratio == 10000):
                return False
            if ratio > 0 and not report["non_malicious_liveness_loss"]:
                return False
            if report["excluded_cause_found"] and ratio != 0:
                return False
            return True
        except Exception:
            return False

    def _build_prompt(
        self,
        provider: str,
        covered_region: str,
        slashing_window_utc: str,
        slash_amount_wei: u256,
        evidence_text: str,
    ) -> str:
        return f"""
You are evaluating a parametric validator slashing insurance claim.

Policy:
- Covered provider: {provider}
- Covered region: {covered_region}
- Covered loss type: non-malicious liveness loss caused by infrastructure outage
- Excluded: double-signing, key compromise, unpaid premium, operator maintenance

Claim:
- Slashing window UTC: {slashing_window_utc}
- Claimed slash amount wei: {slash_amount_wei}

Evidence:
{evidence_text[:12000]}

Return JSON only with this schema:
{{
  "verdict": "APPROVED" | "PARTIAL" | "REJECTED",
  "payout_ratio_bps": integer from 0 to 10000,
  "provider_match": true | false,
  "region_match": true | false,
  "time_overlap": true | false,
  "non_malicious_liveness_loss": true | false,
  "excluded_cause_found": true | false,
  "reason": "short explanation under 280 characters"
}}
"""

    def _settle_report(
        self,
        claim_id: str,
        slash_amount_wei: u256,
        max_payout_wei: u256,
        result_json: dict,
    ) -> str:
        verdict = result_json["verdict"]
        ratio_bps = result_json["payout_ratio_bps"]
        payout_wei = slash_amount_wei * ratio_bps // 10000
        if verdict == "REJECTED":
            payout_wei = 0
        if payout_wei > max_payout_wei:
            payout_wei = max_payout_wei
        if payout_wei > self.pool_balance_wei:
            payout_wei = self.pool_balance_wei

        report = {
            "claim_id": claim_id,
            "verdict": verdict,
            "payout_wei": str(payout_wei),
            "provider_match": result_json["provider_match"],
            "region_match": result_json["region_match"],
            "time_overlap": result_json["time_overlap"],
            "non_malicious_liveness_loss": result_json["non_malicious_liveness_loss"],
            "excluded_cause_found": result_json["excluded_cause_found"],
            "reason": result_json["reason"],
        }

        report_json = json.dumps(report, sort_keys=True)
        self._store_report_for_claim(claim_id, report_json)
        self.last_claim_id = claim_id
        self.last_verdict = verdict
        self.last_report_json = report_json
        return self.last_report_json

    @gl.public.write
    def evaluate_slashing_claim(
        self,
        claim_id: str,
        evidence_url: str,
        provider: str,
        covered_region: str,
        slashing_window_utc: str,
        slash_amount_wei: u256,
        max_payout_wei: u256,
    ) -> str:
        if slash_amount_wei <= 0:
            raise Exception("slash amount must be positive")
        if max_payout_wei <= 0:
            raise Exception("policy has no remaining coverage")
        self._validate_demo_claim_inputs(
            claim_id,
            evidence_url,
            provider,
            covered_region,
            slashing_window_utc,
            slash_amount_wei,
            max_payout_wei,
        )

        def read_and_decide():
            page = gl.nondet.web.get(evidence_url).body.decode("utf-8")
            prompt = self._build_prompt(
                provider,
                covered_region,
                slashing_window_utc,
                slash_amount_wei,
                page,
            )
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise Exception("coverage model returned non-json result")
            return result

        result_json = gl.vm.run_nondet_unsafe(
            read_and_decide,
            self._validate_report,
        )

        return self._settle_report(
            claim_id,
            slash_amount_wei,
            max_payout_wei,
            result_json,
        )

    @gl.public.write
    def evaluate_slashing_claim_text(
        self,
        claim_id: str,
        evidence_text: str,
        provider: str,
        covered_region: str,
        slashing_window_utc: str,
        slash_amount_wei: u256,
        max_payout_wei: u256,
    ) -> str:
        raise Exception("inline text evaluation disabled; use allowlisted evidence URL")
