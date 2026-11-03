import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_referees import load_active_referee_names


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
            if field == "organization_id":
                data = [
                    row for row in data
                    if row.get("organization_id") == value
                ]
            elif field == "status":
                data = [
                    row for row in data
                    if row.get("status") == value
                ]
            elif field == "seasons.status":
                data = [
                    row for row in data
                    if (row.get("seasons") or {}).get("status") == value
                ]

        return FakeResult(data)


class FakeClient:
    def __init__(self, data):
        self.data = data

    def table(self, name):
        if name != "person_memberships":
            raise AssertionError(name)

        return FakeQuery(self.data)


class FarRefereesSupabaseTest(unittest.TestCase):

    def test_loads_only_active_referees_for_organization_and_active_season(self):
        client = FakeClient([
            {
                "person_id": "alan",
                "organization_id": "marbella",
                "status": "ACTIVE",
                "role_code": "REFEREE",
                "persons": {
                    "first_name": "Alan Martín",
                    "last_name": "Ulloa Alba",
                },
                "membership_roles": {
                    "code": "REFEREE",
                    "category": "REFEREE",
                },
                "seasons": {
                    "status": "ACTIVE",
                },
            },
            {
                "person_id": "other-club",
                "organization_id": "other",
                "status": "ACTIVE",
                "role_code": "REFEREE",
                "persons": {
                    "first_name": "Otro",
                    "last_name": "Arbitro",
                },
                "membership_roles": {
                    "code": "REFEREE",
                    "category": "REFEREE",
                },
                "seasons": {
                    "status": "ACTIVE",
                },
            },
            {
                "person_id": "planned",
                "organization_id": "marbella",
                "status": "ACTIVE",
                "role_code": "REFEREE",
                "persons": {
                    "first_name": "Futuro",
                    "last_name": "Arbitro",
                },
                "membership_roles": {
                    "code": "REFEREE",
                    "category": "REFEREE",
                },
                "seasons": {
                    "status": "PLANNED",
                },
            },
        ])

        self.assertEqual(
            ["Ulloa Alba, Alan Martín"],
            load_active_referee_names(
                client,
                organization_id="marbella",
            ),
        )

    def test_organization_id_is_required(self):
        client = FakeClient([])

        with self.assertRaises(ValueError):
            load_active_referee_names(
                client,
                organization_id="",
            )


if __name__ == "__main__":
    unittest.main()
