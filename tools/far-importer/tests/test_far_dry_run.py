import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_dry_run import build_report


class FarDryRunTest(unittest.TestCase):

    def test_club_and_referee_selection(self):
        html = """
        <div class="row workingDayRow">
          <a name="workingDay" id="workingDay_1"></a>
          <h4>Grupo 1. Jornada 1. Organizador: TEST</h4>

          <tbody class="calendarEventsTable">

            <tr class="eventRow eventEnded">
              <td>01/11/2026<br>10:00</td>
              <td>
                <font>Marbella R.C.</font>
              </td>
              <td></td>
              <td>
                <a href="/es/public/competition/100/match_statistics/">
                  10 - 5
                </a>
              </td>
              <td></td>
              <td>
                <font>Club A</font>
              </td>
              <td></td>
            </tr>

            <tr class="eventRow eventEnded">
              <td>01/11/2026<br>11:00</td>
              <td>
                <font>Club B</font>
                <span>
                  <b><small>Árbitro: </small></b>
                  <small class="text-success">
                    Ulloa Alba, Alan Martin
                  </small>
                </span>
              </td>
              <td></td>
              <td>
                <a href="/es/public/competition/101/match_statistics/">
                  0 - 0
                </a>
              </td>
              <td></td>
              <td>
                <font>Club C</font>
              </td>
              <td></td>
            </tr>

            <tr class="eventRow eventEnded">
              <td>01/11/2026<br>12:00</td>
              <td>
                <font>Club D</font>
              </td>
              <td></td>
              <td>
                <a href="/es/public/competition/102/match_statistics/">
                  3 - 3
                </a>
              </td>
              <td></td>
              <td>
                <font>Club E</font>
              </td>
              <td></td>
            </tr>

          </tbody>
        </div>
        """

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "sample.html"
            path.write_text(html)

            report = build_report(
                [
                    {
                        "key": "35/65",
                        "name": "Test",
                        "category": "M16",
                        "file": path,
                    }
                ],
                club_names=["Marbella R.C."],
                referee_names=["Ulloa Alba, Alan Martin"],
            )

        self.assertEqual(
            3,
            report["counts"]["matches_detected"],
        )

        self.assertEqual(
            2,
            report["counts"]["selected_matches"],
        )

        self.assertEqual(
            1,
            report["counts"]["selected_only_by_referee"],
        )

        self.assertEqual(
            1,
            report["counts"]["ignored_matches"],
        )

    def test_triangular_is_detected(self):
        html = """
        <div class="row workingDayRow">
          <a name="workingDay" id="workingDay_99"></a>
          <h4>Grupo 1. Jornada 1. Organizador: TEST</h4>
          <tbody class="calendarEventsTable">
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>A</font></td>
              <td></td><td></td><td></td>
              <td><font>B</font></td><td></td>
            </tr>
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>B</font></td>
              <td></td><td></td><td></td>
              <td><font>C</font></td><td></td>
            </tr>
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>C</font></td>
              <td></td><td></td><td></td>
              <td><font>A</font></td><td></td>
            </tr>
          </tbody>
        </div>
        """

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "sample.html"
            path.write_text(html)

            report = build_report(
                [
                    {
                        "key": "35/65",
                        "name": "Test",
                        "category": "M16",
                        "file": path,
                    }
                ],
                club_names=["A"],
                referee_names=[],
            )

        self.assertEqual(
            1,
            report["counts"]["triangulars_detected"],
        )

        self.assertEqual(
            3,
            report["triangulars"][0]["matches"],
        )


    def test_three_normal_matches_are_not_triangular(self):
        html = """
        <div class="row workingDayRow">
          <a name="workingDay" id="workingDay_100"></a>
          <h4>Jornada 1</h4>
          <tbody class="calendarEventsTable">
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>A</font></td>
              <td></td><td></td><td></td>
              <td><font>B</font></td><td></td>
            </tr>
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>C</font></td>
              <td></td><td></td><td></td>
              <td><font>D</font></td><td></td>
            </tr>
            <tr class="eventRow eventPending">
              <td>01/12/2026</td><td><font>E</font></td>
              <td></td><td></td><td></td>
              <td><font>F</font></td><td></td>
            </tr>
          </tbody>
        </div>
        """

        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "sample.html"
            path.write_text(html)

            report = build_report(
                [{
                    "key": "test",
                    "name": "Test",
                    "category": "TEST",
                    "file": path,
                }],
                club_names=["A"],
                referee_names=[],
            )

        self.assertEqual(
            0,
            report["counts"]["triangulars_detected"],
        )


if __name__ == "__main__":
    unittest.main()
