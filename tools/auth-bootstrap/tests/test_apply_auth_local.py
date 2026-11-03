import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apply_auth_local import assert_local


class ApplyAuthLocalTest(unittest.TestCase):

    def test_localhost_allowed(self):
        assert_local(
            "http://127.0.0.1:54321"
        )

    def test_localhost_name_allowed(self):
        assert_local(
            "http://localhost:54321"
        )

    def test_remote_blocked(self):
        with self.assertRaises(
            RuntimeError
        ):
            assert_local(
                "https://example.supabase.co"
            )


if __name__ == "__main__":
    unittest.main()
