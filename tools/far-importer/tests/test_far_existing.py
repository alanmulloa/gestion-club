import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_existing import load_existing_matches


class FakeResult:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, data):
        self.data = data
        self.filters = []

    def select(self, *args, **kwargs):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def execute(self):
        data = self.data

        for field, value in self.filters:
            data = [
                row for row in data
                if row.get(field) == value
            ]

        return FakeResult(data)


class FakeClient:
    def __init__(self, data):
        self.data = data
        self.requested_table = None

    def table(self, name):
        self.requested_table = name
        return FakeQuery(self.data)


class FarExistingTest(unittest.TestCase):

    def test_loads_matchready_events_for_scope(self):
        client = FakeClient([
            {
                "id": "event-1",
                "organization_id": "marbella",
                "season_id": "2026",
                "source_code": "MATCHREADY_FAR",
                "external_id": "matchready:5000",
                "event_type": "MATCH",
                "metadata": {
                    "reconciliation_key": (
                        "35/65|2287|21/11/2026|a|b"
                    ),
                },
            },
            {
                "id": "event-2",
                "organization_id": "other",
                "season_id": "2026",
                "source_code": "MATCHREADY_FAR",
                "external_id": "matchready:9999",
                "event_type": "MATCH",
                "metadata": {
                    "reconciliation_key": "other",
                },
            },
        ])

        matches = load_existing_matches(
            client,
            organization_id="marbella",
            season_id="2026",
        )

        self.assertEqual("events", client.requested_table)
        self.assertEqual(
            [{
                "event_id": "event-1",
                "external_id": "matchready:5000",
                "reconciliation_key": (
                    "35/65|2287|21/11/2026|a|b"
                ),
            }],
            matches,
        )

    def test_missing_scope_is_rejected(self):
        client = FakeClient([])

        with self.assertRaises(ValueError):
            load_existing_matches(
                client,
                organization_id="",
                season_id="",
            )


if __name__ == "__main__":
    unittest.main()
