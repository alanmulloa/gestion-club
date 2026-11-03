import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_organization import load_matchready_configuration


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

    def limit(self, value):
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


class FarOrganizationTest(unittest.TestCase):

    def test_loads_matchready_configuration(self):
        client = FakeClient([
            {
                "id": "marbella",
                "display_name": "MARBELLA RUGBY CLUB",
                "metadata": {
                    "primaryColor": "#8a8c03",
                    "integrations": {
                        "matchready_far": {
                            "club_aliases": [
                                "Marbella R.C.",
                                "MARBELLA RC",
                            ],
                            "home_venues": [
                                (
                                    "Instalaciones Deportivas "
                                    "Roberto Osborne"
                                ),
                            ],
                        },
                    },
                },
            },
        ])

        config = load_matchready_configuration(
            client,
            organization_id="marbella",
        )

        self.assertEqual(
            [
                "Marbella R.C.",
                "MARBELLA RC",
                "MARBELLA RUGBY CLUB",
            ],
            config["club_names"],
        )

        self.assertEqual(
            [
                (
                    "Instalaciones Deportivas "
                    "Roberto Osborne"
                ),
            ],
            config["home_venues"],
        )

    def test_display_name_is_used_as_fallback_alias(self):
        client = FakeClient([
            {
                "id": "club-x",
                "display_name": "CLUB X",
                "metadata": {},
            },
        ])

        config = load_matchready_configuration(
            client,
            organization_id="club-x",
        )

        self.assertEqual(
            ["CLUB X"],
            config["club_names"],
        )

        self.assertEqual(
            [],
            config["home_venues"],
        )

    def test_organization_id_is_required(self):
        client = FakeClient([])

        with self.assertRaises(ValueError):
            load_matchready_configuration(
                client,
                organization_id="",
            )


if __name__ == "__main__":
    unittest.main()
