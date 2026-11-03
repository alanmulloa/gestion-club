import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_parser import parse_calendar_html


ENDED_TRIANGULAR = """
<html>
<body>

<div class="row workingDayRow">
  <div>
    <a name="workingDay" id="workingDay_2286"></a>

    <div class="portlet">
      <div class="portlet-heading">
        <h4>Grupo 1. Jornada 1. Organizador: C.R. ATLÉTICO PORTUENSE</h4>
      </div>

      <tbody class="calendarEventsTable">

        <tr class="eventRow eventEnded">
          <td>31/10/2026<br>13:00</td>

          <td>
            <font>C.R. Atlético Portuense</font>
            <span>
              <b><small>Árbitro: </small></b>
              <small class="text-success">Ulloa Alba, Alan Martin</small>
            </span>
          </td>

          <td></td>

          <td>
            <a href="/es/public/competition/4914/match_statistics/">
              <font>52 - 0</font>
            </a>
          </td>

          <td></td>

          <td>
            <font>San Roque R.C.</font>
            <span>
              <b><small>Campo: </small></b>
              <small class="text-success">
                Ciudad Deportiva Rafael Sánchez
              </small>
            </span>
          </td>

          <td>
            <a href="/es/public/competition/match_pdf/4914/act/">
              Acta
            </a>
          </td>
        </tr>

        <tr class="eventRow eventEnded">
          <td>31/10/2026<br>14:30</td>

          <td>
            <font>San Roque R.C.</font>
            <span>
              <b><small>Árbitro: </small></b>
              <small class="text-success">Ulloa Alba, Alan Martin</small>
            </span>
          </td>

          <td></td>

          <td>
            <a href="/es/public/competition/4915/match_statistics/">
              <font>0 - 49</font>
            </a>
          </td>

          <td></td>

          <td>
            <font>Marbella R.C.</font>
          </td>

          <td>
            <a href="/es/public/competition/match_pdf/4915/act/">
              Acta
            </a>
          </td>
        </tr>

        <tr class="eventRow eventEnded">
          <td>31/10/2026<br>16:00</td>

          <td>
            <font>Marbella R.C.</font>
            <span>
              <b><small>Árbitro: </small></b>
              <small class="text-success">Ulloa Alba, Alan Martin</small>
            </span>
          </td>

          <td></td>

          <td>
            <a href="/es/public/competition/4916/match_statistics/">
              <font>24 - 5</font>
            </a>
          </td>

          <td></td>

          <td>
            <font>C.R. Atlético Portuense</font>
          </td>

          <td>
            <a href="/es/public/competition/match_pdf/4916/act/">
              Acta
            </a>
          </td>
        </tr>

      </tbody>
    </div>
  </div>
</div>

</body>
</html>
"""


PENDING_TRIANGULAR = """
<html>
<body>

<div class="row workingDayRow">
  <div>
    <a name="workingDay" id="workingDay_2288"></a>

    <div class="portlet">
      <div class="portlet-heading">
        <h4>Grupo 2. Jornada 3. Organizador: MARBELLA RC</h4>
      </div>

      <tbody class="calendarEventsTable">

        <tr class="eventRow eventPending">
          <td>19/12/2026<br></td>
          <td>
            <font>Marbella R.C.</font>
            <span><b><small>Árbitro: </small></b></span>
          </td>
          <td></td>
          <td></td>
          <td></td>
          <td>
            <font>San Roque R.C.</font>
            <span><b><small>Campo: </small></b></span>
          </td>
          <td></td>
        </tr>

        <tr class="eventRow eventPending">
          <td>19/12/2026<br></td>
          <td>
            <font>San Roque R.C.</font>
            <span><b><small>Árbitro: </small></b></span>
          </td>
          <td></td>
          <td></td>
          <td></td>
          <td>
            <font>C.R. Atlético Portuense</font>
          </td>
          <td></td>
        </tr>

        <tr class="eventRow eventPending">
          <td>19/12/2026<br></td>
          <td>
            <font>C.R. Atlético Portuense</font>
            <span><b><small>Árbitro: </small></b></span>
          </td>
          <td></td>
          <td></td>
          <td></td>
          <td>
            <font>Marbella R.C.</font>
          </td>
          <td></td>
        </tr>

      </tbody>
    </div>
  </div>
</div>

</body>
</html>
"""


class FarParserTest(unittest.TestCase):

    def test_finished_triangular_has_three_matches(self):
        matches = parse_calendar_html(
            ENDED_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(3, len(matches))

    def test_matchready_ids_are_used_when_available(self):
        matches = parse_calendar_html(
            ENDED_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(
            ["4914", "4915", "4916"],
            [m.matchready_match_id for m in matches],
        )

        self.assertEqual(
            [
                "matchready:4914",
                "matchready:4915",
                "matchready:4916",
            ],
            [m.external_id for m in matches],
        )

    def test_scores_are_parsed(self):
        matches = parse_calendar_html(
            ENDED_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(
            ["52 - 0", "0 - 49", "24 - 5"],
            [m.score for m in matches],
        )

    def test_referee_is_parsed(self):
        matches = parse_calendar_html(
            ENDED_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertTrue(
            all(
                m.referee == "Ulloa Alba, Alan Martin"
                for m in matches
            )
        )

    def test_match_without_marabella_is_not_lost(self):
        matches = parse_calendar_html(
            ENDED_TRIANGULAR,
            calendar_key="35/65",
        )

        first = matches[0]

        self.assertEqual(
            "C.R. Atlético Portuense",
            first.home_team,
        )

        self.assertEqual(
            "San Roque R.C.",
            first.away_team,
        )

        self.assertEqual(
            "Ulloa Alba, Alan Martin",
            first.referee,
        )

    def test_pending_triangular_has_three_independent_matches(self):
        matches = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(3, len(matches))

        self.assertEqual(
            [1, 2, 3],
            [m.sequence for m in matches],
        )

    def test_pending_matches_get_provisional_external_ids(self):
        matches = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(
            [
                "matchready:35/65:working-day:2288:slot:1",
                "matchready:35/65:working-day:2288:slot:2",
                "matchready:35/65:working-day:2288:slot:3",
            ],
            [m.external_id for m in matches],
        )

        self.assertTrue(
            all(m.matchready_match_id is None for m in matches)
        )

    def test_pending_match_reconciliation_key_is_stable(self):
        matches1 = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        matches2 = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertEqual(
            [m.reconciliation_key for m in matches1],
            [m.reconciliation_key for m in matches2],
        )

    def test_working_day_metadata_is_parsed(self):
        matches = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        first = matches[0]

        self.assertEqual("2288", first.working_day_id)
        self.assertEqual("Grupo 2", first.group_name)
        self.assertEqual("3", first.round_name)
        self.assertEqual("MARBELLA RC", first.organizer)

    def test_pending_status_and_missing_time_are_supported(self):
        matches = parse_calendar_html(
            PENDING_TRIANGULAR,
            calendar_key="35/65",
        )

        self.assertTrue(all(m.status == "PENDING" for m in matches))
        self.assertTrue(all(m.time is None for m in matches))


    def test_header_without_dot_before_organizer(self):
        html = """
        <div class="row workingDayRow">
          <a name="workingDay" id="workingDay_2290"></a>
          <h4>Grupo 3. Jornada 2 Organizador: RUGBY ESCORIONES ARMILLA</h4>
          <tbody class="calendarEventsTable">
            <tr class="eventRow eventPending">
              <td>21/11/2026</td>
              <td><font>Rugby Escoriones Armilla</font></td>
              <td></td><td></td><td></td>
              <td><font>CDR Marrajos-URA</font></td>
              <td></td>
            </tr>
          </tbody>
        </div>
        """

        matches = parse_calendar_html(
            html,
            calendar_key="35/65",
        )

        self.assertEqual("Grupo 3", matches[0].group_name)
        self.assertEqual("2", matches[0].round_name)
        self.assertEqual(
            "RUGBY ESCORIONES ARMILLA",
            matches[0].organizer,
        )


    def test_missing_round_number_is_empty_not_dot(self):
        html = """
        <div class="row workingDayRow">
          <a name="workingDay" id="workingDay_2291"></a>
          <h4>Grupo 3. Jornada . Organizador: CD RUGBY MARRAJOS-URA</h4>
          <tbody class="calendarEventsTable">
            <tr class="eventRow eventPending">
              <td>19/12/2026</td>
              <td><font>San Roque R.C.</font></td>
              <td></td><td></td><td></td>
              <td><font>Rugby Escoriones Armilla</font></td>
              <td></td>
            </tr>
          </tbody>
        </div>
        """

        matches = parse_calendar_html(
            html,
            calendar_key="35/65",
        )

        self.assertEqual("", matches[0].round_name)
        self.assertEqual(
            "CD RUGBY MARRAJOS-URA",
            matches[0].organizer,
        )


if __name__ == "__main__":
    unittest.main()
