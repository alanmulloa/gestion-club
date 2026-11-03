#!/usr/bin/env python3

from __future__ import annotations

from collections import defaultdict


def clean(value) -> str:
    return str(value or "").strip()


def is_provisional_external_id(external_id: str) -> bool:
    value = clean(external_id)

    return (
        value.startswith("matchready:")
        and ":working-day:" in value
        and ":slot:" in value
    )


def classify_matches(
    *,
    incoming_matches,
    existing_matches,
):
    result = {
        "new_matches": [],
        "unchanged_matches": [],
        "reconciliations": [],
        "conflicts": [],
    }

    existing_by_external_id = {}

    existing_by_reconciliation_key = defaultdict(list)

    for match in existing_matches:
        external_id = clean(match.get("external_id"))
        reconciliation_key = clean(
            match.get("reconciliation_key")
        )

        if external_id:
            existing_by_external_id[external_id] = match

        if reconciliation_key:
            existing_by_reconciliation_key[
                reconciliation_key
            ].append(match)

    for incoming in incoming_matches:
        external_id = clean(
            incoming.get("external_id")
        )

        reconciliation_key = clean(
            incoming.get("reconciliation_key")
        )

        if not reconciliation_key:
            result["conflicts"].append({
                "reason": "MISSING_RECONCILIATION_KEY",
                "incoming": incoming,
            })
            continue

        if external_id in existing_by_external_id:
            result["unchanged_matches"].append({
                "incoming": incoming,
                "existing": existing_by_external_id[
                    external_id
                ],
            })
            continue

        existing_for_key = (
            existing_by_reconciliation_key.get(
                reconciliation_key,
                [],
            )
        )

        if len(existing_for_key) > 1:
            result["conflicts"].append({
                "reason": (
                    "MULTIPLE_EXISTING_RECONCILIATION_KEY"
                ),
                "reconciliation_key": reconciliation_key,
                "existing": existing_for_key,
                "incoming": incoming,
            })
            continue

        if not existing_for_key:
            result["new_matches"].append(incoming)
            continue

        existing = existing_for_key[0]

        existing_external_id = clean(
            existing.get("external_id")
        )

        if (
            is_provisional_external_id(
                existing_external_id
            )
            and not is_provisional_external_id(
                external_id
            )
        ):
            result["reconciliations"].append({
                "from_external_id": (
                    existing_external_id
                ),
                "to_external_id": external_id,
                "reconciliation_key": (
                    reconciliation_key
                ),
                "incoming": incoming,
                "existing": existing,
            })
            continue

        result["conflicts"].append({
            "reason": "STABLE_ID_MISMATCH",
            "reconciliation_key": reconciliation_key,
            "incoming_external_id": external_id,
            "existing_external_id": (
                existing_external_id
            ),
            "incoming": incoming,
            "existing": existing,
        })

    return result
