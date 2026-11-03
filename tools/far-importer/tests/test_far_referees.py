import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_referees import (
    format_matchready_name,
    select_active_referee_names,
)


class FarRefereesTest(unittest.TestCase):

    def test_format_matchready_name(self):
        self.assertEqual(
            "Ulloa Alba, Alan Martín",
            format_matchready_name(
                first_name="Alan Martín",
                last_name="Ulloa Alba",
            ),
        )

    def test_active_referee_is_included(self):
        rows = [{
            "person_id": "1",
            "first_name": "Alan Martín",
            "last_name": "Ulloa Alba",
            "membership_status": "ACTIVE",
            "membership_role_code": "REFEREE",
            "role_code": "REFEREE",
            "role_category": "REFEREE",
        }]

        self.assertEqual(
            ["Ulloa Alba, Alan Martín"],
            select_active_referee_names(rows),
        )

    def test_inactive_referee_is_excluded(self):
        rows = [{
            "person_id": "1",
            "first_name": "Alan",
            "last_name": "Ulloa",
            "membership_status": "ENDED",
            "membership_role_code": "REFEREE",
            "role_code": "REFEREE",
            "role_category": "REFEREE",
        }]

        self.assertEqual(
            [],
            select_active_referee_names(rows),
        )

    def test_coach_is_not_referee(self):
        rows = [{
            "person_id": "1",
            "first_name": "Alan",
            "last_name": "Ulloa",
            "membership_status": "ACTIVE",
            "membership_role_code": "COACH",
            "role_code": "COACH",
            "role_category": "COACH",
        }]

        self.assertEqual(
            [],
            select_active_referee_names(rows),
        )

    def test_referee_coordinator_alone_is_not_referee(self):
        rows = [{
            "person_id": "1",
            "first_name": "Alan",
            "last_name": "Ulloa",
            "membership_status": "ACTIVE",
            "membership_role_code": "REFEREE_COORDINATOR",
            "role_code": "REFEREE_COORDINATOR",
            "role_category": "REFEREE_COORDINATOR",
        }]

        self.assertEqual(
            [],
            select_active_referee_names(rows),
        )

    def test_multiple_referees_are_returned(self):
        rows = [
            {
                "person_id": "1",
                "first_name": "Domingo",
                "last_name": "Fernandez Calancha",
                "membership_status": "ACTIVE",
                "membership_role_code": "REFEREE",
                "role_code": "REFEREE",
                "role_category": "REFEREE",
            },
            {
                "person_id": "2",
                "first_name": "Sergio",
                "last_name": "Ramos Calle",
                "membership_status": "ACTIVE",
                "membership_role_code": "REFEREE",
                "role_code": "REFEREE",
                "role_category": "REFEREE",
            },
        ]

        self.assertEqual(
            [
                "Fernandez Calancha, Domingo",
                "Ramos Calle, Sergio",
            ],
            select_active_referee_names(rows),
        )

    def test_same_person_is_not_duplicated(self):
        rows = [
            {
                "person_id": "1",
                "first_name": "Alan Martín",
                "last_name": "Ulloa Alba",
                "membership_status": "ACTIVE",
                "membership_role_code": "REFEREE",
                "role_code": "REFEREE",
                "role_category": "REFEREE",
            },
            {
                "person_id": "1",
                "first_name": "Alan Martín",
                "last_name": "Ulloa Alba",
                "membership_status": "ACTIVE",
                "membership_role_code": "REFEREE",
                "role_code": "REFEREE",
                "role_category": "REFEREE",
            },
        ]

        self.assertEqual(
            ["Ulloa Alba, Alan Martín"],
            select_active_referee_names(rows),
        )


if __name__ == "__main__":
    unittest.main()
