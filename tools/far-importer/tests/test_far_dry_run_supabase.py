import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from far_dry_run import load_club_referee_names


class FarDryRunSupabaseTest(unittest.TestCase):

    @patch("far_dry_run.load_active_referee_names")
    @patch("far_dry_run.create_client")
    def test_loads_referees_from_supabase(
        self,
        mocked_create_client,
        mocked_load_referees,
    ):
        client = object()
        mocked_create_client.return_value = client
        mocked_load_referees.return_value = [
            "Fernandez Calancha, Domingo",
            "Ramos Calle, Sergio",
            "Ulloa Alba, Alan Martín",
        ]

        names = load_club_referee_names(
            supabase_url="http://127.0.0.1:54321",
            supabase_key="test-key",
            organization_id="marbella",
        )

        mocked_create_client.assert_called_once_with(
            "http://127.0.0.1:54321",
            "test-key",
        )

        mocked_load_referees.assert_called_once_with(
            client,
            organization_id="marbella",
        )

        self.assertEqual(
            [
                "Fernandez Calancha, Domingo",
                "Ramos Calle, Sergio",
                "Ulloa Alba, Alan Martín",
            ],
            names,
        )

    def test_missing_supabase_credentials_are_rejected(self):
        with self.assertRaises(ValueError):
            load_club_referee_names(
                supabase_url="",
                supabase_key="",
                organization_id="",
            )


if __name__ == "__main__":
    unittest.main()
