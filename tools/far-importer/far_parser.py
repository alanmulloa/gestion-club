#!/usr/bin/env python3

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup


MATCH_ID_RE = re.compile(r"/competition/(\d+)/match_statistics/")
WORKING_DAY_RE = re.compile(r"workingDay_(\d+)")
HEADER_RE = re.compile(
    r"(?P<group>.+?)\.\s*Jornada\s+"
    r"(?P<round>.+?)"
    r"(?:\.?\s+Organizador:\s*(?P<organizer>.+))?$",
    re.IGNORECASE,
)


def clean(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.replace("\xa0", " ").split())


def normalized(value: str | None) -> str:
    value = clean(value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    return value.casefold()


@dataclass
class FarMatch:
    calendar_key: str
    working_day_id: str
    group_name: str
    round_name: str
    organizer: str

    sequence: int
    status: str

    date: str
    time: Optional[str]

    home_team: str
    away_team: str

    referee: Optional[str]
    field: Optional[str]

    score: Optional[str]

    matchready_match_id: Optional[str]
    statistics_url: Optional[str]
    act_url: Optional[str]

    external_id: str
    reconciliation_key: str

    def to_dict(self) -> dict:
        return asdict(self)


def _extract_labeled_value(cell, label: str) -> Optional[str]:
    label_norm = normalized(label)

    for span in cell.find_all("span"):
        text = clean(span.get_text(" ", strip=True))
        if normalized(text).startswith(label_norm):
            small = span.find("small", class_="text-success")
            if small:
                value = clean(small.get_text(" ", strip=True))
                return value or None

    return None


def _extract_team(cell) -> str:
    font = cell.find("font")
    if font:
        return clean(font.get_text(" ", strip=True))

    return clean(cell.get_text(" ", strip=True))


def _extract_date_time(cell) -> tuple[str, Optional[str]]:
    text = clean(cell.get_text(" ", strip=True))

    date_match = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", text)
    time_match = re.search(r"\b(\d{1,2}:\d{2})\b", text)

    date = date_match.group(1) if date_match else ""
    time = time_match.group(1) if time_match else None

    return date, time


def _extract_score(cell) -> Optional[str]:
    text = clean(cell.get_text(" ", strip=True))
    match = re.search(r"\b(\d+)\s*-\s*(\d+)\b", text)
    if not match:
        return None
    return f"{match.group(1)} - {match.group(2)}"


def _make_reconciliation_key(
    calendar_key: str,
    working_day_id: str,
    date: str,
    home: str,
    away: str,
) -> str:
    return "|".join(
        [
            normalized(calendar_key),
            normalized(working_day_id),
            normalized(date),
            normalized(home),
            normalized(away),
        ]
    )


def parse_calendar_html(
    html: str,
    *,
    calendar_key: str,
) -> list[FarMatch]:
    soup = BeautifulSoup(html, "html.parser")

    matches: list[FarMatch] = []

    for wd_row in soup.select("div.workingDayRow"):
        anchor = wd_row.find("a", attrs={"name": "workingDay"})
        if not anchor:
            continue

        anchor_id = anchor.get("id", "")
        wd_match = WORKING_DAY_RE.search(anchor_id)
        if not wd_match:
            continue

        working_day_id = wd_match.group(1)

        heading = wd_row.find("h4")
        heading_text = clean(heading.get_text(" ", strip=True)) if heading else ""

        group_name = ""
        round_name = ""
        organizer = ""

        hm = HEADER_RE.match(heading_text)
        if hm:
            group_name = clean(hm.group("group"))
            round_name = clean(hm.group("round")).strip(" .")
            organizer = clean(hm.group("organizer"))

        rows = wd_row.select("tbody.calendarEventsTable > tr.eventRow")

        for sequence, row in enumerate(rows, start=1):
            cells = row.find_all("td", recursive=False)

            if len(cells) < 6:
                continue

            classes = set(row.get("class", []))

            if "eventEnded" in classes:
                status = "ENDED"
            elif "eventPending" in classes:
                status = "PENDING"
            else:
                status = "UNKNOWN"

            date, time = _extract_date_time(cells[0])

            home_team = _extract_team(cells[1])
            away_team = _extract_team(cells[5])

            referee = _extract_labeled_value(cells[1], "Árbitro:")
            field = _extract_labeled_value(cells[5], "Campo:")

            score = _extract_score(cells[3])

            statistics_url = None
            matchready_match_id = None

            statistics_link = row.find(
                "a",
                href=re.compile(r"/competition/\d+/match_statistics/"),
            )

            if statistics_link:
                statistics_url = statistics_link.get("href")

                mid = MATCH_ID_RE.search(statistics_url or "")
                if mid:
                    matchready_match_id = mid.group(1)

            act_url = None
            act_link = row.find(
                "a",
                href=re.compile(r"/competition/match_pdf/\d+/act/"),
            )

            if act_link:
                act_url = act_link.get("href")

            reconciliation_key = _make_reconciliation_key(
                calendar_key,
                working_day_id,
                date,
                home_team,
                away_team,
            )

            if matchready_match_id:
                external_id = f"matchready:{matchready_match_id}"
            else:
                external_id = (
                    f"matchready:{calendar_key}:"
                    f"working-day:{working_day_id}:slot:{sequence}"
                )

            matches.append(
                FarMatch(
                    calendar_key=calendar_key,
                    working_day_id=working_day_id,
                    group_name=group_name,
                    round_name=round_name,
                    organizer=organizer,
                    sequence=sequence,
                    status=status,
                    date=date,
                    time=time,
                    home_team=home_team,
                    away_team=away_team,
                    referee=referee,
                    field=field,
                    score=score,
                    matchready_match_id=matchready_match_id,
                    statistics_url=statistics_url,
                    act_url=act_url,
                    external_id=external_id,
                    reconciliation_key=reconciliation_key,
                )
            )

    return matches


def parse_calendar_file(
    path: str | Path,
    *,
    calendar_key: str,
) -> list[FarMatch]:
    return parse_calendar_html(
        Path(path).read_text(encoding="utf-8"),
        calendar_key=calendar_key,
    )
