import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apply_auth_pre import assert_target


class ApplyAuthPreTest(unittest.TestCase):

    def test_local_allowed(self):
        assert_target(
            "http://127.0.0.1:54321",
            False,
        )

    def test_remote_blocked_by_default(self):
        with self.assertRaises(RuntimeError):
            assert_target(
                "https://project.supabase.co",
                False,
            )

    def test_remote_requires_explicit_opt_in(self):
        assert_target(
            "https://project.supabase.co",
            True,
        )


if __name__ == "__main__":
    unittest.main()

class ApplyAuthPreReportTest(unittest.TestCase):

    def test_pre_script_uses_pre_apply_mode(self):
        source = (
            ROOT / "apply_auth_pre.py"
        ).read_text()

        self.assertIn(
            '"mode": "PRE_APPLY"',
            source,
        )

        self.assertNotIn(
            '"mode": "LOCAL_APPLY"',
            source,
        )
