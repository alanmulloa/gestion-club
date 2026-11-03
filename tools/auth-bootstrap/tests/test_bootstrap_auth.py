import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bootstrap_auth import (
    build_plan,
    normalize_email,
)


class AuthBootstrapTest(unittest.TestCase):

    def make_book(self):
        wb = Workbook()
        ws = wb.active
        ws.title = "Users"

        ws.append([
            "userId",
            "personId",
            "email",
            "status",
            "securityRole",
            "passwordHash",
            "passwordSalt",
        ])

        ws.append([
            "USR_ADMIN",
            "PER_ADMIN",
            "Admin@Example.com",
            "ACTIVE",
            "ADMIN",
            "HASH",
            "SALT",
        ])

        ws.append([
            "USR_MEMBER",
            "PER_MEMBER",
            "member@example.com",
            "ACTIVE",
            "MEMBER",
            "HASH2",
            "SALT2",
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

    def test_email_normalization(self):
        self.assertEqual(
            normalize_email(
                " Admin@Example.COM "
            ),
            "admin@example.com",
        )

    def test_admin_mapping(self):
        report = build_plan(
            self.write_book(
                self.make_book()
            )
        )

        admin = report[
            "identities"
        ][0]

        self.assertEqual(
            admin["tenant_role"],
            "ADMIN",
        )

        self.assertEqual(
            admin["organization_roles"],
            ["ORG_ADMIN"],
        )

    def test_member_mapping(self):
        report = build_plan(
            self.write_book(
                self.make_book()
            )
        )

        member = report[
            "identities"
        ][1]

        self.assertEqual(
            member["tenant_role"],
            "VIEWER",
        )

        self.assertEqual(
            member["organization_roles"],
            ["VIEWER"],
        )

    def test_legacy_passwords_not_used(self):
        report = build_plan(
            self.write_book(
                self.make_book()
            )
        )

        self.assertFalse(
            report["security"][
                "legacy_password_hashes_used"
            ]
        )

        self.assertFalse(
            report["security"][
                "legacy_password_salts_used"
            ]
        )

    def test_sport_roles_do_not_grant_access(self):
        report = build_plan(
            self.write_book(
                self.make_book()
            )
        )

        self.assertFalse(
            report["security"][
                "sport_roles_grant_access"
            ]
        )

    def test_unknown_security_role_fails(self):
        wb = self.make_book()

        wb["Users"]["E3"] = "SUPER_ADMIN"

        report = build_plan(
            self.write_book(wb)
        )

        self.assertFalse(
            report["valid"]
        )

        codes = {
            e["code"]
            for e in report["errors"]
        }

        self.assertIn(
            "UNSUPPORTED_SECURITY_ROLE",
            codes,
        )


if __name__ == "__main__":
    unittest.main()
