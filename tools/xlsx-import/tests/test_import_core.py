import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from import_core import validate


class ImportCoreTest(unittest.TestCase):

    def make_book(self):
        wb = Workbook()
        wb.remove(wb.active)

        sheets = {
            "ClubConfig": [
                "organizationId", "officialName",
                "shortName", "activeSeasonId"
            ],
            "Seasons": [
                "seasonId", "name", "startDate",
                "endDate", "status"
            ],
            "Divisions": [
                "divisionId", "name", "code", "status"
            ],
            "Teams": [
                "teamId", "divisionId", "name",
                "code", "seasonId", "status"
            ],
            "Persons": [
                "personId", "firstName", "lastName",
                "displayName", "status"
            ],
            "Users": [
                "userId", "personId", "email",
                "status", "securityRole"
            ],
            "Roles": [
                "roleId", "name", "category",
                "scopeType", "status"
            ],
            "Assignments": [
                "assignmentId", "personId", "roleId",
                "divisionId", "seasonId", "status"
            ],
            "FederationLicenses": [
                "licenseId", "personId", "federation",
                "licenseNumber", "status"
            ],
        }

        for name, header in sheets.items():
            ws = wb.create_sheet(name)
            ws.append(header)

        wb["Seasons"].append([
            "SEA_1", "2026/2027",
            "2026-09-01", "2027-06-30",
            "ACTIVE"
        ])

        wb["ClubConfig"].append([
            "ORG_1", "Club", "CLUB", "SEA_1"
        ])

        wb["Divisions"].append([
            "DIV_1", "M18", "M18", "ACTIVE"
        ])

        wb["Teams"].append([
            "TEAM_1", "DIV_1", "M18 A",
            "M18-A", "SEA_1", "ACTIVE"
        ])

        wb["Persons"].append([
            "PER_1", "Test", "Player",
            "Player, Test", "ACTIVE"
        ])

        wb["Users"].append([
            "USR_1", "PER_1",
            "test@example.com",
            "ACTIVE", "MEMBER"
        ])

        wb["Roles"].append([
            "ROL_1", "Jugador",
            "PLAYER", "DIVISION",
            "ACTIVE"
        ])

        wb["Assignments"].append([
            "ASN_1", "PER_1", "ROL_1",
            "DIV_1", "SEA_1", "ACTIVE"
        ])

        wb["FederationLicenses"].append([
            "LIC_1", "PER_1",
            "FAR", "0001234", "ACTIVE"
        ])

        return wb

    def write_book(self, wb):
        tmp = tempfile.NamedTemporaryFile(
            suffix=".xlsx",
            delete=False,
        )
        tmp.close()

        wb.save(tmp.name)

        return Path(tmp.name)

    def test_valid_workbook(self):
        p = self.write_book(self.make_book())

        report = validate(p)

        self.assertTrue(report["valid"])
        self.assertEqual(
            report["checks"]["broken_references"],
            0,
        )

    def test_broken_reference_fails(self):
        wb = self.make_book()

        wb["Assignments"]["B2"] = "PER_DOES_NOT_EXIST"

        p = self.write_book(wb)
        report = validate(p)

        self.assertFalse(report["valid"])

        codes = {
            e["code"]
            for e in report["errors"]
        }

        self.assertIn(
            "BROKEN_ASSIGNMENT_PERSON",
            codes,
        )

    def test_duplicate_id_fails(self):
        wb = self.make_book()

        wb["Persons"].append([
            "PER_1", "Duplicate", "Person",
            "Person, Duplicate", "ACTIVE"
        ])

        p = self.write_book(wb)
        report = validate(p)

        self.assertFalse(report["valid"])

        codes = {
            e["code"]
            for e in report["errors"]
        }

        self.assertIn(
            "DUPLICATE_IDS",
            codes,
        )

    def test_new_role_categories_supported(self):
        wb = self.make_book()

        ws = wb["Roles"]

        ws.append([
            "ROL_COORD",
            "Coordinador",
            "COORDINATOR",
            "TRANSVERSAL",
            "ACTIVE",
        ])

        ws.append([
            "ROL_REF_COORD",
            "Coordinador de Arbitros",
            "REFEREE_COORDINATOR",
            "TRANSVERSAL",
            "ACTIVE",
        ])

        p = self.write_book(wb)
        report = validate(p)

        self.assertTrue(report["valid"])

    def test_passwords_are_never_migrated(self):
        p = self.write_book(self.make_book())

        report = validate(p)

        self.assertFalse(
            report["security"][
                "legacy_password_hashes_migrated"
            ]
        )

        self.assertFalse(
            report["security"][
                "legacy_password_salts_migrated"
            ]
        )


if __name__ == "__main__":
    unittest.main()
