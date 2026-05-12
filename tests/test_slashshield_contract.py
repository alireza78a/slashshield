import ast
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "SlashShield.py"
APP_PATH = ROOT / "src" / "App.tsx"
CLIENT_PATH = ROOT / "src" / "lib" / "genlayerClient.ts"

PROVIDER_CLAIM_ID = "SS-INC-04812-URL"
MAINTENANCE_CLAIM_ID = "SS-INC-04813-URL"
PROVIDER_URL = "https://slashshield.vercel.app/evidence/aws-us-east-1-incident"
MAINTENANCE_URL = "https://slashshield.vercel.app/evidence/operator-maintenance"

PROVIDER_ARGS = (
    PROVIDER_CLAIM_ID,
    PROVIDER_URL,
    "AWS",
    "us-east-1",
    "2026-04-26 14:08 to 14:44 UTC",
    1000000000000000000,
    1000000000000000000,
)

MAINTENANCE_ARGS = (
    MAINTENANCE_CLAIM_ID,
    MAINTENANCE_URL,
    "AWS",
    "us-east-1",
    "2026-04-26 19:42 to 20:05 UTC",
    310000000000000000,
    310000000000000000,
)

APPROVED_RESULT = {
    "verdict": "APPROVED",
    "payout_ratio_bps": 10000,
    "provider_match": True,
    "region_match": True,
    "time_overlap": True,
    "non_malicious_liveness_loss": True,
    "excluded_cause_found": False,
    "reason": "Provider outage matched the policy conditions.",
}

REJECTED_RESULT = {
    "verdict": "REJECTED",
    "payout_ratio_bps": 0,
    "provider_match": True,
    "region_match": True,
    "time_overlap": True,
    "non_malicious_liveness_loss": False,
    "excluded_cause_found": True,
    "reason": "Operator maintenance is excluded by policy.",
}


class FakeReturn:
    def __init__(self, calldata):
        self.calldata = calldata


class FakePublic:
    @staticmethod
    def view(fn):
        return fn

    @staticmethod
    def write(fn):
        return fn


class FakeVM:
    Return = FakeReturn

    @staticmethod
    def run_nondet_unsafe(fn, validator):
        result = fn()
        wrapped = FakeReturn(result)
        if not validator(wrapped):
            raise Exception("validator rejected result")
        return result


class FakeWebResponse:
    def __init__(self, text):
        self.body = text.encode("utf-8")


class FakeWeb:
    requested = []

    @classmethod
    def get(cls, url):
        cls.requested.append(url)
        return FakeWebResponse(f"synthetic evidence from {url}")


class FakeNondet:
    web = FakeWeb
    next_result = APPROVED_RESULT

    @classmethod
    def exec_prompt(cls, *_args, **_kwargs):
        return dict(cls.next_result)


class FakeGL:
    Contract = object
    public = FakePublic()
    vm = FakeVM()
    nondet = FakeNondet


def load_contract_module():
    fake_genlayer = types.ModuleType("genlayer")
    fake_genlayer.gl = FakeGL
    fake_genlayer.u256 = int
    sys.modules["genlayer"] = fake_genlayer
    FakeWeb.requested = []
    FakeNondet.next_result = APPROVED_RESULT

    spec = importlib.util.spec_from_file_location("slashshield_contract_under_test", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class SlashShieldContractTests(unittest.TestCase):
    def setUp(self):
        self.module = load_contract_module()
        self.contract = self.module.SlashShield(0)

    def test_report_for_claim_returns_matching_claim_report(self):
        raw_report = self.contract.evaluate_slashing_claim(*PROVIDER_ARGS)
        stored_report = self.contract.report_for_claim(PROVIDER_CLAIM_ID)
        parsed = json.loads(stored_report)

        self.assertEqual(stored_report, raw_report)
        self.assertEqual(parsed["claim_id"], PROVIDER_CLAIM_ID)
        self.assertEqual(parsed["verdict"], "APPROVED")

    def test_report_for_claim_rejects_unknown_claim_id(self):
        with self.assertRaisesRegex(Exception, "unsupported claim id"):
            self.contract.report_for_claim("SS-INC-99999-URL")

    def test_latest_report_is_not_the_frontend_proof_source(self):
        self.contract.evaluate_slashing_claim(*PROVIDER_ARGS)
        FakeNondet.next_result = REJECTED_RESULT
        self.contract.evaluate_slashing_claim(*MAINTENANCE_ARGS)

        first_report = json.loads(self.contract.report_for_claim(PROVIDER_CLAIM_ID))
        latest_report = json.loads(self.contract.latest_report())
        app_source = APP_PATH.read_text(encoding="utf-8")
        client_source = CLIENT_PATH.read_text(encoding="utf-8")

        self.assertEqual(first_report["claim_id"], PROVIDER_CLAIM_ID)
        self.assertEqual(latest_report["claim_id"], MAINTENANCE_CLAIM_ID)
        self.assertIn("report_read: GENLAYER_REPORT_FOR_CLAIM_METHOD", app_source)
        self.assertIn("functionName: GENLAYER_REPORT_FOR_CLAIM_METHOD", client_source)
        self.assertNotIn("functionName: GENLAYER_LATEST_REPORT_METHOD", client_source)

    def test_duplicate_claim_id_is_rejected_without_pool_mutation(self):
        initial_pool = self.contract.pool_balance()
        self.contract.evaluate_slashing_claim(*PROVIDER_ARGS)
        after_first = self.contract.pool_balance()

        with self.assertRaisesRegex(Exception, "claim already evaluated"):
            self.contract.evaluate_slashing_claim(*PROVIDER_ARGS)

        self.assertEqual(after_first, initial_pool)
        self.assertEqual(self.contract.pool_balance(), initial_pool)

    def test_unknown_claim_id_is_rejected_before_fetch(self):
        bad_args = ("SS-INC-99999-URL", *PROVIDER_ARGS[1:])

        with self.assertRaisesRegex(Exception, "unsupported claim id"):
            self.contract.evaluate_slashing_claim(*bad_args)

        self.assertEqual(FakeWeb.requested, [])

    def test_unsupported_evidence_url_is_rejected_before_fetch(self):
        bad_args = (PROVIDER_CLAIM_ID, "https://attacker.example/evidence", *PROVIDER_ARGS[2:])

        with self.assertRaisesRegex(Exception, "unsupported evidence url"):
            self.contract.evaluate_slashing_claim(*bad_args)

        self.assertEqual(FakeWeb.requested, [])

    def test_allowed_evidence_urls_are_accepted(self):
        provider_report = json.loads(self.contract.evaluate_slashing_claim(*PROVIDER_ARGS))
        FakeNondet.next_result = REJECTED_RESULT
        maintenance_report = json.loads(self.contract.evaluate_slashing_claim(*MAINTENANCE_ARGS))

        self.assertEqual(provider_report["claim_id"], PROVIDER_CLAIM_ID)
        self.assertEqual(maintenance_report["claim_id"], MAINTENANCE_CLAIM_ID)
        self.assertEqual(FakeWeb.requested, [PROVIDER_URL, MAINTENANCE_URL])

    def test_inline_text_evaluation_is_disabled(self):
        with self.assertRaisesRegex(Exception, "inline text evaluation disabled"):
            self.contract.evaluate_slashing_claim_text(
                PROVIDER_CLAIM_ID,
                "synthetic inline evidence",
                "AWS",
                "us-east-1",
                "2026-04-26 14:08 to 14:44 UTC",
                1000000000000000000,
                1000000000000000000,
            )

    def test_contract_uses_simple_studio_storage_slots(self):
        source = CONTRACT_PATH.read_text(encoding="utf-8")

        self.assertIn("provider_outage_report_json: str", source)
        self.assertIn("operator_maintenance_report_json: str", source)
        self.assertIn("provider_outage_settled: str", source)
        self.assertIn("operator_maintenance_settled: str", source)
        self.assertNotIn("provider_outage_settled: bool", source)
        self.assertNotIn("operator_maintenance_settled: bool", source)
        self.assertNotIn("reports_by_claim_id_json", source)
        self.assertNotIn("json.loads(self.", source)

    def test_contract_storage_uses_only_str_and_u256(self):
        source = CONTRACT_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source)
        contract_class = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ClassDef) and node.name == "SlashShield"
        )

        storage_annotations = []
        for node in contract_class.body:
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                storage_annotations.append((node.target.id, ast.unparse(node.annotation)))

        self.assertGreater(len(storage_annotations), 0)
        for name, annotation in storage_annotations:
            self.assertIn(
                annotation,
                {"str", "u256"},
                msg=f"storage field {name!r} has unsupported annotation {annotation!r}",
            )

    def test_contract_has_no_float_literals_and_compiles(self):
        tree = ast.parse(CONTRACT_PATH.read_text(encoding="utf-8"))
        float_literals = [
            node.value
            for node in ast.walk(tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, float)
        ]

        self.assertEqual(float_literals, [])
        compile(CONTRACT_PATH.read_text(encoding="utf-8"), str(CONTRACT_PATH), "exec")


if __name__ == "__main__":
    unittest.main()
