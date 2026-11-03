#!/usr/bin/env python3

from __future__ import annotations

import urllib.error
import urllib.request


BASE_URL = "https://farugby.matchready.es"


class FarFetchError(RuntimeError):
    pass


def calendar_url(calendar_key: str) -> str:
    parts = calendar_key.strip("/").split("/")

    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        raise ValueError(
            f"Invalid MatchReady calendar key: {calendar_key!r}"
        )

    federation_id, calendar_id = parts

    return (
        f"{BASE_URL}/es/public/calendar/"
        f"{federation_id}/{calendar_id}/combined/"
    )


def fetch_calendar_html(
    calendar_key: str,
    *,
    timeout: int = 20,
) -> str:
    url = calendar_url(calendar_key)

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Marbella-Rugby-Club-Calendar-Sync/0.1 "
                "(public calendar importer)"
            ),
            "Accept": "text/html,application/xhtml+xml",
        },
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
        ) as response:
            status = getattr(response, "status", 200)

            if status != 200:
                raise FarFetchError(
                    f"MatchReady returned HTTP {status}: {url}"
                )

            payload = response.read()

            charset = (
                response.headers.get_content_charset()
                or "utf-8"
            )

            html = payload.decode(
                charset,
                errors="replace",
            )

    except urllib.error.URLError as exc:
        raise FarFetchError(
            f"Unable to fetch MatchReady calendar {calendar_key}: {exc}"
        ) from exc

    if "workingDayRow" not in html:
        raise FarFetchError(
            f"Unexpected MatchReady response for {calendar_key}: "
            "workingDayRow not found"
        )

    return html
