import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apply_core import (
    assert_local_target,
    deterministic_uuid,
    metadata_from_row,
)


class ApplyCoreTest(unittest.TestCase):

    def test_uuid_is_deterministic(self):
        a = deterministic_uuid(
            "person",
            "PER_123",
        )

        b = deterministic_uuid(
            "person",
            "PER_123",
        )

        self.assertEqual(a, b)

    def test_different_entities_get_different_ids(self):
        person = deterministic_uuid(
            "person",
            "ABC",
        )

        team = deterministic_uuid(
            "team",
            "ABC",
        )

        self.assertNotEqual(
            person,
            team,
        )

    def test_remote_is_blocked_by_default(self):
        with self.assertRaises(RuntimeError):
            assert_local_target(
                "https://example.supabase.co",
                False,
            )

    def test_local_is_allowed(self):
        assert_local_target(
            "http://127.0.0.1:54321",
            False,
        )

    def test_sensitive_metadata_is_removed(self):
        row = {
            "name": "Test",
            "passwordHash": "SECRET",
            "passwordSalt": "SECRET2",
            "sessionToken": "SECRET3",
        }

        metadata = metadata_from_row(
            row,
            {"name"},
        )

        self.assertEqual(
            metadata,
            {},
        )


if __name__ == "__main__":
    unittest.main()
