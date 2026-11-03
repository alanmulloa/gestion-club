#!/usr/bin/env python3

from __future__ import annotations

import unicodedata


def normalized(value) -> str:
    text = str(value or "").strip().casefold()

    text = "".join(
        ch
        for ch in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(ch)
    )

    return " ".join(text.split())


def resolve_club_venue_role(
    *,
    home_team,
    away_team,
    venue_name,
    club_names,
    home_venues,
    organizer_name=None,
):
    club_names_norm = {
        normalized(name)
        for name in club_names
        if normalized(name)
    }

    home_team_norm = normalized(home_team)
    away_team_norm = normalized(away_team)

    club_participates = (
        home_team_norm in club_names_norm
        or away_team_norm in club_names_norm
    )

    if not club_participates:
        return None

    venue_norm = normalized(venue_name)

    home_venues_norm = {
        normalized(name)
        for name in home_venues
        if normalized(name)
    }

    # Campo explícito tiene prioridad sobre el organizador.
    if venue_norm:
        if venue_norm in home_venues_norm:
            return "LOCAL"

        return "VISITANTE"

    # FAR puede no publicar Campo todavía para jornadas futuras.
    organizer_norm = normalized(organizer_name)

    if organizer_norm:
        if organizer_norm in club_names_norm:
            return "LOCAL"

        return "VISITANTE"

    return "DESCONOCIDO"
