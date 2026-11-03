#!/usr/bin/env python3

from __future__ import annotations


SOURCE_CODE = "MATCHREADY_FAR"


def clean(value) -> str:
    return str(value or "").strip()


def load_existing_matches(
    client,
    *,
    organization_id: str,
    season_id: str,
):
    if not clean(organization_id):
        raise ValueError("organization_id is required")

    if not clean(season_id):
        raise ValueError("season_id is required")

    result = (
        client.table("events")
        .select(
            "id,"
            "external_id,"
            "metadata,"
            "source_code,"
            "organization_id,"
            "season_id,"
            "event_type"
        )
        .eq("organization_id", organization_id)
        .eq("season_id", season_id)
        .eq("source_code", SOURCE_CODE)
        .eq("event_type", "MATCH")
        .execute()
    )

    matches = []

    for event in result.data or []:
        metadata = event.get("metadata") or {}

        matches.append({
            "event_id": event.get("id"),
            "external_id": event.get("external_id"),
            "reconciliation_key": metadata.get(
                "reconciliation_key"
            ),
        })

    return matches
