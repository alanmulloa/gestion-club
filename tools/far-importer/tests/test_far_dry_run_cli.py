import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import far_dry_run


SAMPLE_HTML = """
<div class="row workingDayRow">
  <a name="workingDay" id="workingDay_1"></a>
  <h4>Grupo 1. Jornada 1. Organizador: TEST</h4>

  <tbody class="calendarEventsTable">
    <tr class="eventRow eventPending">
      <td>01/12/2026</td>
      <td><font>Marbella R.C.</font></td>
      <td></td>
      <td></td>
      <td></td>
      <td><font>Club A</font></td>
      <td></td>
    </tr>
  </tbody>
</div>
"""


class FarDryRunCliTest(unittest.TestCase):

    @patch("far_dry_run.fetch_calendar_html")
    def test_live_snapshot_is_written(self, mocked):
        mocked.return_value = SAMPLE_HTML

        import tempfile

        with tempfile.TemporaryDirectory() as td:
            path = far_dry_run.write_live_snapshot(
                Path(td),
                key="35/65",
                filename="m16.html",
            )

            self.assertTrue(path.exists())
            self.assertIn(
                "Marbella R.C.",
                path.read_text(),
            )

            mocked.assert_called_once_with("35/65")

    def test_calendar_definitions(self):
        calendars = far_dry_run.build_calendar_definitions(
            "m16.html",
            "m18.html",
        )

        self.assertEqual("35/65", calendars[0]["key"])
        self.assertEqual("M16", calendars[0]["category"])
        self.assertEqual("35/66", calendars[1]["key"])
        self.assertEqual("M18", calendars[1]["category"])


if __name__ == "__main__":
    unittest.main()
