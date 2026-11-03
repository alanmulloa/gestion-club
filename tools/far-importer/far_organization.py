#!/usr/bin/env python3

from __future__ import annotations


def clean(value) -> str:
    return str(value or "").strip()


def unique(values):
    result = []
    seen = set()

    for value in values:
        value = clean(value)

        if not value:
            continue

        key = value.casefold()

        if key in seen:
            continue

        seen.add(key)
        result.append(value)

    return result


def load_matchready_configuration(
    client,
    *,
    organization_id: str,
):
    if not clean(organization_id):
        raise ValueError("organization_id is required")

    result = (
        client.table("organizations")
        .select(
            "id,"
            "display_name,"
            "metadata"
        )
        .eq("id", organization_id)
        .limit(1)
        .execute()
    )

    rows = result.data or []

    if not rows:
        raise ValueError(
            f"organization not found: {organization_id}"
        )

    organization = rows[0]
    metadata = organization.get("metadata") or {}

    integrations = metadata.get("integrations") or {}
    matchready = integrations.get("matchready_far") or {}

    aliases = matchready.get("club_aliases") or []
    home_venues = matchready.get("home_venues") or []

    club_names = unique([
        *aliases,
        organization.get("display_name"),
    ])

    return {
        "club_names": club_names,
        "home_venues": unique(home_venues),
    }
