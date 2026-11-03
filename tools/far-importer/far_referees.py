#!/usr/bin/env python3

from __future__ import annotations


def clean(value) -> str:
    return str(value or "").strip()


def format_matchready_name(
    *,
    first_name: str,
    last_name: str,
) -> str:
    first = clean(first_name)
    last = clean(last_name)

    if not first or not last:
        return ""

    return f"{last}, {first}"


def select_active_referee_names(rows) -> list[str]:
    referees = {}

    for row in rows:
        status = clean(
            row.get("membership_status")
        ).upper()

        if status != "ACTIVE":
            continue

        membership_role_code = clean(
            row.get("membership_role_code")
        ).upper()

        role_code = clean(
            row.get("role_code")
        ).upper()

        role_category = clean(
            row.get("role_category")
        ).upper()

        is_referee = (
            membership_role_code == "REFEREE"
            or role_code == "REFEREE"
            or role_category == "REFEREE"
        )

        if not is_referee:
            continue

        name = format_matchready_name(
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
        )

        if not name:
            continue

        person_id = clean(row.get("person_id"))

        key = person_id or name.casefold()
        referees[key] = name

    return sorted(
        referees.values(),
        key=str.casefold,
    )


def load_active_referee_names(client) -> list[str]:
    result = (
        client.table("person_memberships")
        .select(
            "person_id,"
            "status,"
            "role_code,"
            "persons!inner(first_name,last_name),"
            "membership_roles(code,category)"
        )
        .eq("status", "ACTIVE")
        .execute()
    )

    rows = []

    for membership in result.data or []:
        person = membership.get("persons") or {}
        role = membership.get("membership_roles") or {}

        rows.append({
            "person_id": membership.get("person_id"),
            "first_name": person.get("first_name"),
            "last_name": person.get("last_name"),
            "membership_status": membership.get("status"),
            "membership_role_code": membership.get("role_code"),
            "role_code": role.get("code"),
            "role_category": role.get("category"),
        })

    return select_active_referee_names(rows)
