import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_reconciliation import classify_matches


class FarReconciliationTest(unittest.TestCase):

    def test_new_match_when_no_existing_match(self):
        incoming = [{
            "external_id": "matchready:5000",
            "reconciliation_key": "35/65|2287|21/11/2026|a|b",
        }]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=[],
        )

        self.assertEqual(1, len(result["new_matches"]))
        self.assertEqual(0, len(result["unchanged_matches"]))
        self.assertEqual(0, len(result["reconciliations"]))
        self.assertEqual(0, len(result["conflicts"]))

    def test_unchanged_when_external_id_already_exists(self):
        incoming = [{
            "external_id": "matchready:5000",
            "reconciliation_key": "35/65|2287|21/11/2026|a|b",
        }]

        existing = [{
            "external_id": "matchready:5000",
            "reconciliation_key": "35/65|2287|21/11/2026|a|b",
        }]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=existing,
        )

        self.assertEqual(0, len(result["new_matches"]))
        self.assertEqual(1, len(result["unchanged_matches"]))
        self.assertEqual(0, len(result["reconciliations"]))
        self.assertEqual(0, len(result["conflicts"]))

    def test_provisional_is_upgraded_to_stable_id(self):
        key = "35/65|2287|21/11/2026|san roque r.c.|marbella r.c."

        incoming = [{
            "external_id": "matchready:5000",
            "reconciliation_key": key,
        }]

        existing = [{
            "external_id": (
                "matchready:35/65:"
                "working-day:2287:slot:1"
            ),
            "reconciliation_key": key,
        }]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=existing,
        )

        self.assertEqual(0, len(result["new_matches"]))
        self.assertEqual(0, len(result["unchanged_matches"]))
        self.assertEqual(1, len(result["reconciliations"]))
        self.assertEqual(0, len(result["conflicts"]))

        reconciliation = result["reconciliations"][0]

        self.assertEqual(
            existing[0]["external_id"],
            reconciliation["from_external_id"],
        )

        self.assertEqual(
            "matchready:5000",
            reconciliation["to_external_id"],
        )

        self.assertEqual(
            key,
            reconciliation["reconciliation_key"],
        )

    def test_same_key_with_two_stable_ids_is_conflict(self):
        key = "35/65|2287|21/11/2026|a|b"

        incoming = [{
            "external_id": "matchready:5001",
            "reconciliation_key": key,
        }]

        existing = [{
            "external_id": "matchready:5000",
            "reconciliation_key": key,
        }]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=existing,
        )

        self.assertEqual(0, len(result["new_matches"]))
        self.assertEqual(0, len(result["unchanged_matches"]))
        self.assertEqual(0, len(result["reconciliations"]))
        self.assertEqual(1, len(result["conflicts"]))

        self.assertEqual(
            "STABLE_ID_MISMATCH",
            result["conflicts"][0]["reason"],
        )

    def test_duplicate_existing_reconciliation_key_is_conflict(self):
        key = "35/65|2287|21/11/2026|a|b"

        incoming = [{
            "external_id": "matchready:5000",
            "reconciliation_key": key,
        }]

        existing = [
            {
                "external_id": "matchready:old-1",
                "reconciliation_key": key,
            },
            {
                "external_id": "matchready:old-2",
                "reconciliation_key": key,
            },
        ]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=existing,
        )

        self.assertEqual(1, len(result["conflicts"]))
        self.assertEqual(
            "MULTIPLE_EXISTING_RECONCILIATION_KEY",
            result["conflicts"][0]["reason"],
        )

    def test_missing_reconciliation_key_is_conflict(self):
        incoming = [{
            "external_id": "matchready:5000",
            "reconciliation_key": "",
        }]

        result = classify_matches(
            incoming_matches=incoming,
            existing_matches=[],
        )

        self.assertEqual(1, len(result["conflicts"]))
        self.assertEqual(
            "MISSING_RECONCILIATION_KEY",
            result["conflicts"][0]["reason"],
        )


if __name__ == "__main__":
    unittest.main()
