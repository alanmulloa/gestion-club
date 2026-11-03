#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import tempfile
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from supabase import create_client

from far_fetch import fetch_calendar_html
from far_parser import parse_calendar_file, normalized
from far_referees import load_active_referee_names


VERSION = "0.3.0"


def load_club_referee_names(
    *,
    supabase_url,
    supabase_key,
):
    if not supabase_url or not supabase_key:
        raise ValueError(
            "Supabase URL and service key are required "
            "to load active club referees"
        )

    client = create_client(
        supabase_url,
        supabase_key,
    )

    return load_active_referee_names(client)


def build_report(
    calendars,
    *,
    club_names,
    referee_names,
):
    all_matches = []

    for calendar in calendars:
        parsed = parse_calendar_file(
            calendar["file"],
            calendar_key=calendar["key"],
        )

        for match in parsed:
            row = asdict(match)
            row["competition"] = calendar["name"]
            row["category"] = calendar["category"]
            all_matches.append(row)

    selected = []
    ignored = []

    seen_external_ids = set()
    seen_reconciliation_keys = set()

    duplicates = []

    for match in all_matches:
        home_norm = normalized(match["home_team"])
        away_norm = normalized(match["away_team"])
        referee_norm = normalized(match["referee"])

        club_names_norm = {
            normalized(x)
            for x in club_names
        }

        referee_names_norm = {
            normalized(x)
            for x in referee_names
        }

        club_match = (
            home_norm in club_names_norm
            or away_norm in club_names_norm
        )

        club_referee = (
            bool(referee_norm)
            and referee_norm in referee_names_norm
        )

        reasons = []

        if club_match:
            reasons.append("CLUB_MATCH")

        if club_referee:
            reasons.append("CLUB_REFEREE")

        external_id = match["external_id"]
        reconciliation_key = match["reconciliation_key"]

        duplicate_reason = None

        if external_id in seen_external_ids:
            duplicate_reason = "DUPLICATE_EXTERNAL_ID"

        elif reconciliation_key in seen_reconciliation_keys:
            duplicate_reason = "DUPLICATE_RECONCILIATION_KEY"

        if duplicate_reason:
            duplicates.append({
                "external_id": external_id,
                "reconciliation_key": reconciliation_key,
                "reason": duplicate_reason,
            })
            continue

        seen_external_ids.add(external_id)
        seen_reconciliation_keys.add(reconciliation_key)

        enriched = dict(match)
        enriched["selection_reasons"] = reasons

        if reasons:
            selected.append(enriched)
        else:
            ignored.append(enriched)

    working_days = {}

    for match in all_matches:
        key = (
            match["calendar_key"],
            match["working_day_id"],
        )
        working_days.setdefault(key, []).append(match)

    triangulars = []

    for key, day_matches in working_days.items():
        if len(day_matches) != 3:
            continue

        appearances = Counter()

        for match in day_matches:
            appearances[normalized(match["home_team"])] += 1
            appearances[normalized(match["away_team"])] += 1

        if (
            len(appearances) == 3
            and all(count == 2 for count in appearances.values())
        ):
            triangulars.append({
                "calendar_key": key[0],
                "working_day_id": key[1],
                "matches": 3,
                "teams": len(appearances),
            })

    return {
        "version": VERSION,
        "mode": "DRY_RUN",
        "counts": {
            "matches_detected": len(all_matches),
            "selected_matches": len(selected),
            "club_matches": sum(
                "CLUB_MATCH" in x["selection_reasons"]
                for x in selected
            ),
            "club_referee_matches": sum(
                "CLUB_REFEREE" in x["selection_reasons"]
                for x in selected
            ),
            "selected_only_by_referee": sum(
                x["selection_reasons"] == ["CLUB_REFEREE"]
                for x in selected
            ),
            "triangulars_detected": len(triangulars),
            "with_matchready_id": sum(
                bool(x["matchready_match_id"])
                for x in all_matches
            ),
            "provisional_matches": sum(
                not bool(x["matchready_match_id"])
                for x in all_matches
            ),
            "duplicates_detected": len(duplicates),
            "ignored_matches": len(ignored),
        },
        "triangulars": triangulars,
        "selected_matches": selected,
        "duplicates": duplicates,
        "ignored_matches": ignored,
        "errors": [],
        "warnings": [],
    }


def build_calendar_definitions(m16_file, m18_file):
    return [
        {
            "key": "35/65",
            "name": "Copa FAR M16 XV",
            "category": "M16",
            "file": m16_file,
        },
        {
            "key": "35/66",
            "name": "Copa FAR M18 XV",
            "category": "M18",
            "file": m18_file,
        },
    ]


def write_live_snapshot(
    directory: Path,
    *,
    key: str,
    filename: str,
) -> Path:
    html = fetch_calendar_html(key)

    path = directory / filename
    path.write_text(
        html,
        encoding="utf-8",
    )

    return path


def main():
    parser = argparse.ArgumentParser()

    source = parser.add_mutually_exclusive_group(
        required=True,
    )

    source.add_argument(
        "--live",
        action="store_true",
        help="Fetch current public MatchReady calendars",
    )

    source.add_argument(
        "--files",
        action="store_true",
        help="Use local HTML files supplied with --m16 and --m18",
    )

    parser.add_argument("--m16")
    parser.add_argument("--m18")

    parser.add_argument(
        "--report",
        required=True,
    )

    parser.add_argument(
        "--supabase-url",
        default=(
            os.environ.get("API_URL")
            or os.environ.get("SUPABASE_URL")
        ),
    )

    parser.add_argument(
        "--supabase-key",
        default=(
            os.environ.get("SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        ),
    )

    args = parser.parse_args()

    if args.files and (not args.m16 or not args.m18):
        parser.error(
            "--files requires both --m16 and --m18"
        )

    if args.live and (args.m16 or args.m18):
        parser.error(
            "--live cannot be combined with --m16/--m18"
        )

    try:
        referee_names = load_club_referee_names(
            supabase_url=args.supabase_url,
            supabase_key=args.supabase_key,
        )
    except ValueError as exc:
        parser.error(str(exc))

    if args.live:
        with tempfile.TemporaryDirectory(
            prefix="far-live-dry-run-"
        ) as td:
            temp_dir = Path(td)

            m16_file = write_live_snapshot(
                temp_dir,
                key="35/65",
                filename="m16.html",
            )

            m18_file = write_live_snapshot(
                temp_dir,
                key="35/66",
                filename="m18.html",
            )

            calendars = build_calendar_definitions(
                m16_file,
                m18_file,
            )

            report = build_report(
                calendars,
                club_names=[
                    "Marbella R.C.",
                    "MARBELLA RC",
                ],
                referee_names=referee_names,
            )

            report["source_mode"] = "LIVE"

    else:
        calendars = build_calendar_definitions(
            args.m16,
            args.m18,
        )

        report = build_report(
            calendars,
            club_names=[
                "Marbella R.C.",
                "MARBELLA RC",
            ],
            referee_names=referee_names,
        )

        report["source_mode"] = "FILES"

    report["referee_source"] = "SUPABASE"
    report["club_referees_detected"] = len(referee_names)
    report["club_referees"] = referee_names

    output = Path(args.report)
    output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output.write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
        )
    )

    print()

    if report["errors"]:
        print("RESULT: DRY_RUN_ERROR")
        raise SystemExit(1)

    print("RESULT: DRY_RUN_OK")


if __name__ == "__main__":
    main()
