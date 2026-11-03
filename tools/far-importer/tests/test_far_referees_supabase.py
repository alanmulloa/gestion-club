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
        self.status = None

    def select(self, *args, **kwargs):
        return self

    def eq(self, field, value):
        if field == "status":
            self.status = value
        return self

    def execute(self):
        data = self.data

        if self.status is not None:
            data = [
                row for row in data
                if row.get("status") == self.status
            ]

        return FakeResult(data)


class FakeClient:
    def __init__(self, data):
        self.data = data
        self.requested_table = None

    def table(self, name):
        self.requested_table = name
        return FakeQuery(self.data)


class FarRefereesSupabaseTest(unittest.TestCase):

    def test_loads_only_active_referees(self):
        client = FakeClient([
            {
                "person_id": "alan",
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
            },
            {
                "person_id": "domingo",
                "status": "ACTIVE",
                "role_code": "REFEREE",
                "persons": {
                    "first_name": "Domingo",
                    "last_name": "Fernandez Calancha",
                },
                "membership_roles": {
                    "code": "REFEREE",
                    "category": "REFEREE",
                },
            },
            {
                "person_id": "coordinator",
                "status": "ACTIVE",
                "role_code": "REFEREE_COORDINATOR",
                "persons": {
                    "first_name": "Solo",
                    "last_name": "Coordinador",
                },
                "membership_roles": {
                    "code": "REFEREE_COORDINATOR",
                    "category": "REFEREE_COORDINATOR",
                },
            },
        ])

        self.assertEqual(
            [
                "Fernandez Calancha, Domingo",
                "Ulloa Alba, Alan Martín",
            ],
            load_active_referee_names(client),
        )

        self.assertEqual(
            "person_memberships",
            client.requested_table,
        )

    def test_duplicate_person_is_deduplicated(self):
        client = FakeClient([
            {
                "person_id": "alan",
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
            },
            {
                "person_id": "alan",
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
            },
        ])

        self.assertEqual(
            ["Ulloa Alba, Alan Martín"],
            load_active_referee_names(client),
        )


if __name__ == "__main__":
    unittest.main()
