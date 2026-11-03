import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_venue import resolve_club_venue_role


class FarVenueTest(unittest.TestCase):

    def test_marabella_home_at_home_venue_is_local(self):
        self.assertEqual(
            "LOCAL",
            resolve_club_venue_role(
                home_team="Marbella R.C.",
                away_team="San Roque R.C.",
                venue_name="Instalaciones Deportivas Roberto Osborne",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_marabella_away_at_home_venue_is_still_local(self):
        self.assertEqual(
            "LOCAL",
            resolve_club_venue_role(
                home_team="San Roque R.C.",
                away_team="Marbella R.C.",
                venue_name="Instalaciones Deportivas Roberto Osborne",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_marabella_home_outside_home_venue_is_visitor(self):
        self.assertEqual(
            "VISITANTE",
            resolve_club_venue_role(
                home_team="Marbella R.C.",
                away_team="C.R. Atlético Portuense",
                venue_name="Ciudad Deportiva Rafael Sánchez",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_marabella_away_outside_home_venue_is_visitor(self):
        self.assertEqual(
            "VISITANTE",
            resolve_club_venue_role(
                home_team="San Roque R.C.",
                away_team="Marbella R.C.",
                venue_name="Ciudad Deportiva Rafael Sánchez",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_non_club_match_has_no_venue_role(self):
        self.assertIsNone(
            resolve_club_venue_role(
                home_team="San Roque R.C.",
                away_team="C.R. Atlético Portuense",
                venue_name="Instalaciones Deportivas Roberto Osborne",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            )
        )

    def test_matching_is_accent_and_case_insensitive(self):
        self.assertEqual(
            "LOCAL",
            resolve_club_venue_role(
                home_team="MARBELLA RC",
                away_team="Club X",
                venue_name="instalaciones deportivas roberto osborne",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )


    def test_missing_field_with_club_organizer_is_local(self):
        self.assertEqual(
            "LOCAL",
            resolve_club_venue_role(
                home_team="C.R. Atlético Portuense",
                away_team="Marbella R.C.",
                venue_name=None,
                organizer_name="MARBELLA RC",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_missing_field_with_other_organizer_is_visitor(self):
        self.assertEqual(
            "VISITANTE",
            resolve_club_venue_role(
                home_team="Marbella R.C.",
                away_team="San Roque R.C.",
                venue_name=None,
                organizer_name="SAN ROQUE RC",
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )

    def test_missing_field_and_organizer_is_unknown(self):
        self.assertEqual(
            "DESCONOCIDO",
            resolve_club_venue_role(
                home_team="Marbella R.C.",
                away_team="San Roque R.C.",
                venue_name=None,
                organizer_name=None,
                club_names=["Marbella R.C.", "MARBELLA RC"],
                home_venues=[
                    "Instalaciones Deportivas Roberto Osborne"
                ],
            ),
        )


if __name__ == "__main__":
    unittest.main()
