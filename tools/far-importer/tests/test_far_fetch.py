import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_fetch import (
    FarFetchError,
    calendar_url,
    fetch_calendar_html,
)


class FakeHeaders:
    def get_content_charset(self):
        return "utf-8"


class FakeResponse:
    status = 200
    headers = FakeHeaders()

    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return self.payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FarFetchTest(unittest.TestCase):

    def test_calendar_url(self):
        self.assertEqual(
            (
                "https://farugby.matchready.es/"
                "es/public/calendar/35/65/combined/"
            ),
            calendar_url("35/65"),
        )

    def test_invalid_calendar_key_is_rejected(self):
        with self.assertRaises(ValueError):
            calendar_url("bad-key")

    @patch("urllib.request.urlopen")
    def test_fetch_calendar_html(self, mocked):
        mocked.return_value = FakeResponse(
            b'<div class="workingDayRow"></div>'
        )

        html = fetch_calendar_html("35/65")

        self.assertIn("workingDayRow", html)

    @patch("urllib.request.urlopen")
    def test_unexpected_page_is_rejected(self, mocked):
        mocked.return_value = FakeResponse(
            b"<html>login page</html>"
        )

        with self.assertRaises(FarFetchError):
            fetch_calendar_html("35/65")


if __name__ == "__main__":
    unittest.main()
