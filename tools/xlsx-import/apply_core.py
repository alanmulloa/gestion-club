#!/usr/bin/env python3

import argparse
import json
import re
import sys
import uuid
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

from supabase import create_client

from import_core import (
    SHEETS,
    load_sheet,
    sha256_file,
    validate,
)


NAMESPACE = uuid.UUID("7fc774ec-1bfa-47d8-aeb3-d883795faf70")

SENSITIVE_FIELDS = {
    "password",
    "passwordHash",
    "passwordSalt",
    "sessionToken",
    "resetToken",
}


def deterministic_uuid(kind, legacy_id):
    return str(
        uuid.uuid5(
            NAMESPACE,
            f"gestion-club:{kind}:{legacy_id}",
        )
    )


def slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "gestion-club"


def iso_value(value):
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return value.isoformat()

    if isinstance(value, date):
        return value.isoformat()

    return str(value).strip()


def db_date(value):
    if value in (None, ""):
        return None

    if isinstance(value, datetime):
        return value.date().isoformat()

    if isinstance(value, date):
        return value.isoformat()

    text = str(value).strip()

    # Already ISO-ish.
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text

    return text


def metadata_from_row(row, mapped_fields):
    result = {}

    for key, value in row.items():
        if key in mapped_fields:
            continue

        if key in SENSITIVE_FIELDS:
            continue

        if value in (None, ""):
            continue

        result[key] = iso_value(value)

    return result


def assert_local_target(url, allow_remote):
    host = (urlparse(url).hostname or "").lower()

    if host not in {"127.0.0.1", "localhost"} and not allow_remote:
        raise RuntimeError(
            "REMOTE_APPLY_BLOCKED: "
            "use --allow-remote only after local validation"
        )


def load_source(path):
    from openpyxl import load_workbook

    wb = load_workbook(
        path,
        read_only=True,
        data_only=True,
    )

    data = {}

    for name in SHEETS:
        _, rows = load_sheet(wb, name)
        data[name] = rows

    return data


def upsert(client, table, rows, on_conflict="id"):
    if not rows:
        return 0

    # Small batches make failures easier to diagnose.
    batch_size = 100

    for start in range(0, len(rows), batch_size):
        batch = rows[start:start + batch_size]

        (
            client.table(table)
            .upsert(
                batch,
                on_conflict=on_conflict,
            )
            .execute()
        )

    return len(rows)


def count_table(client, table):
    result = (
        client.table(table)
        .select("*", count="exact")
        .limit(1)
        .execute()
    )

    return int(result.count or 0)


def apply(source, supabase_url, supabase_key):
    data = load_source(source)

    client = create_client(
        supabase_url,
        supabase_key,
    )

    sports = (
        client.table("sports")
        .select("id,code")
        .eq("code", "RUGBY_UNION")
        .execute()
    )

    if len(sports.data) != 1:
        raise RuntimeError(
            "RUGBY_UNION sport seed missing or duplicated"
        )

    sport_id = sports.data[0]["id"]

    config = data["ClubConfig"][0]

    organization_legacy = str(
        config["organizationId"]
    ).strip()

    tenant_id = deterministic_uuid(
        "tenant",
        organization_legacy,
    )

    organization_id = deterministic_uuid(
        "organization",
        organization_legacy,
    )

    official_name = (
        config.get("officialName")
        or config.get("shortName")
        or "Gestion Club"
    )

    short_name = (
        config.get("shortName")
        or official_name
    )

    tenant_row = {
        "id": tenant_id,
        "slug": slugify(short_name),
        "name": official_name,
        "status": "ACTIVE",
        "default_timezone": "Europe/Madrid",
        "metadata": metadata_from_row(
            config,
            {
                "organizationId",
                "officialName",
                "shortName",
                "activeSeasonId",
            },
        ),
    }

    organization_row = {
        "id": organization_id,
        "tenant_id": tenant_id,
        "legacy_id": organization_legacy,
        "organization_type": "CLUB",
        "slug": slugify(short_name),
        "display_name": short_name,
        "legal_name": official_name,
        "country_code": "ES",
        "timezone": "Europe/Madrid",
        "status": "ACTIVE",
        "metadata": metadata_from_row(
            config,
            {
                "organizationId",
                "officialName",
                "shortName",
                "activeSeasonId",
            },
        ),
    }

    upsert(client, "tenants", [tenant_row])
    upsert(client, "organizations", [organization_row])

    upsert(
        client,
        "organization_sports",
        [{
            "organization_id": organization_id,
            "sport_id": sport_id,
            "configuration": {},
        }],
        "organization_id,sport_id",
    )

    season_ids = {}
    season_rows = []

    for row in data["Seasons"]:
        legacy = str(row["seasonId"]).strip()

        uid = deterministic_uuid(
            "season",
            legacy,
        )

        season_ids[legacy] = uid

        season_rows.append({
            "id": uid,
            "tenant_id": tenant_id,
            "legacy_id": legacy,
            "name": str(row["name"]).strip(),
            "starts_on": db_date(row.get("startDate")),
            "ends_on": db_date(row.get("endDate")),
            "status": str(
                row.get("status") or "PLANNED"
            ).strip().upper(),
            "metadata": metadata_from_row(
                row,
                {
                    "seasonId",
                    "name",
                    "startDate",
                    "endDate",
                    "status",
                },
            ),
        })

    upsert(client, "seasons", season_rows)

    category_ids = {}
    category_rows = []

    for row in data["Divisions"]:
        legacy = str(row["divisionId"]).strip()

        uid = deterministic_uuid(
            "category",
            legacy,
        )

        category_ids[legacy] = uid

        category_rows.append({
            "id": uid,
            "tenant_id": tenant_id,
            "sport_id": sport_id,
            "legacy_id": legacy,
            "code": str(
                row.get("code") or legacy
            ).strip(),
            "name": str(row["name"]).strip(),
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "configuration": metadata_from_row(
                row,
                {
                    "divisionId",
                    "name",
                    "code",
                    "status",
                },
            ),
        })

    upsert(client, "categories", category_rows)

    team_ids = {}
    team_rows = []

    for row in data["Teams"]:
        legacy = str(row["teamId"]).strip()

        uid = deterministic_uuid(
            "team",
            legacy,
        )

        team_ids[legacy] = uid

        division_legacy = str(
            row["divisionId"]
        ).strip()

        season_legacy = str(
            row["seasonId"]
        ).strip()

        team_rows.append({
            "id": uid,
            "tenant_id": tenant_id,
            "organization_id": organization_id,
            "sport_id": sport_id,
            "season_id": season_ids[season_legacy],
            "category_id": category_ids[division_legacy],
            "legacy_id": legacy,
            "code": str(
                row.get("code") or legacy
            ).strip(),
            "name": str(row["name"]).strip(),
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "metadata": metadata_from_row(
                row,
                {
                    "teamId",
                    "divisionId",
                    "seasonId",
                    "code",
                    "name",
                    "status",
                },
            ),
        })

    upsert(client, "teams", team_rows)

    person_ids = {}
    person_rows = []

    for row in data["Persons"]:
        legacy = str(row["personId"]).strip()

        uid = deterministic_uuid(
            "person",
            legacy,
        )

        person_ids[legacy] = uid

        first_name = str(
            row.get("firstName") or ""
        ).strip()

        last_name = str(
            row.get("lastName") or ""
        ).strip()

        display_name = (
            row.get("displayName")
            or None
        )

        person_rows.append({
            "id": uid,
            "tenant_id": tenant_id,
            "legacy_id": legacy,
            "first_name": first_name,
            "last_name": last_name,
            "preferred_name": (
                str(display_name).strip()
                if display_name
                else None
            ),
            "birth_date": db_date(
                row.get("birthDate")
            ),
            "email": (
                str(row["email"]).strip().lower()
                if row.get("email")
                else None
            ),
            "phone_e164": (
                str(row["phone"]).strip()
                if row.get("phone")
                else None
            ),
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "metadata": metadata_from_row(
                row,
                {
                    "personId",
                    "firstName",
                    "lastName",
                    "displayName",
                    "birthDate",
                    "email",
                    "phone",
                    "status",
                },
            ),
        })

    upsert(client, "persons", person_rows)

    role_ids = {}
    role_codes = {}
    role_rows = []

    for row in data["Roles"]:
        legacy = str(row["roleId"]).strip()

        uid = deterministic_uuid(
            "membership-role",
            legacy,
        )

        role_ids[legacy] = uid

        code = str(
            row.get("code")
            or row.get("category")
            or slugify(row.get("name"))
        ).strip().upper().replace("-", "_")

        # There may be more than one role in the same category.
        # Ensure the catalog code remains unique.
        if code in role_codes.values():
            code = (
                f"{code}_"
                f"{slugify(row.get('name')).upper().replace('-', '_')}"
            )

        role_codes[legacy] = code

        role_rows.append({
            "id": uid,
            "tenant_id": tenant_id,
            "sport_id": sport_id,
            "legacy_id": legacy,
            "code": code,
            "name": str(row["name"]).strip(),
            "category": str(
                row["category"]
            ).strip().upper(),
            "scope_type": str(
                row["scopeType"]
            ).strip().upper(),
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "description": (
                str(row["description"]).strip()
                if row.get("description")
                else None
            ),
            "metadata": metadata_from_row(
                row,
                {
                    "roleId",
                    "code",
                    "name",
                    "category",
                    "scopeType",
                    "status",
                    "description",
                },
            ),
        })

    upsert(client, "membership_roles", role_rows)

    membership_rows = []

    for row in data["Assignments"]:
        legacy = str(
            row["assignmentId"]
        ).strip()

        person_legacy = str(
            row["personId"]
        ).strip()

        role_legacy = str(
            row["roleId"]
        ).strip()

        season_legacy = str(
            row["seasonId"]
        ).strip()

        division = row.get("divisionId")

        category_id = None

        if division not in (None, ""):
            category_id = category_ids[
                str(division).strip()
            ]

        membership_rows.append({
            "id": deterministic_uuid(
                "membership",
                legacy,
            ),
            "tenant_id": tenant_id,
            "person_id": person_ids[person_legacy],
            "organization_id": organization_id,
            "season_id": season_ids[season_legacy],
            "team_id": None,
            "category_id": category_id,
            "role_id": role_ids[role_legacy],
            "role_code": role_codes[role_legacy],
            "legacy_id": legacy,
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "starts_on": db_date(
                row.get("startDate")
            ),
            "ends_on": db_date(
                row.get("endDate")
            ),
            "metadata": metadata_from_row(
                row,
                {
                    "assignmentId",
                    "personId",
                    "roleId",
                    "divisionId",
                    "seasonId",
                    "status",
                    "startDate",
                    "endDate",
                },
            ),
        })

    upsert(
        client,
        "person_memberships",
        membership_rows,
    )

    license_rows = []

    for row in data["FederationLicenses"]:
        legacy = str(
            row["licenseId"]
        ).strip()

        person_legacy = str(
            row["personId"]
        ).strip()

        license_rows.append({
            "id": deterministic_uuid(
                "federation-license",
                legacy,
            ),
            "tenant_id": tenant_id,
            "person_id": person_ids[person_legacy],
            "legacy_id": legacy,
            "federation_code": str(
                row["federation"]
            ).strip().upper(),
            "license_number": str(
                row["licenseNumber"]
            ).strip(),
            "status": str(
                row.get("status") or "ACTIVE"
            ).strip().upper(),
            "metadata": metadata_from_row(
                row,
                {
                    "licenseId",
                    "personId",
                    "federation",
                    "licenseNumber",
                    "status",
                },
            ),
        })

    upsert(
        client,
        "federation_licenses",
        license_rows,
    )

    tables = [
        "tenants",
        "organizations",
        "organization_sports",
        "seasons",
        "categories",
        "teams",
        "persons",
        "membership_roles",
        "person_memberships",
        "federation_licenses",
    ]

    counts = {
        table: count_table(client, table)
        for table in tables
    }

    return {
        "tenant_id": tenant_id,
        "organization_id": organization_id,
        "counts": counts,
        "auth_users_created": 0,
    }


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--file", required=True)
    parser.add_argument("--report", required=True)

    parser.add_argument(
        "--apply",
        action="store_true",
    )

    parser.add_argument(
        "--supabase-url",
    )

    parser.add_argument(
        "--supabase-key",
    )

    parser.add_argument(
        "--confirm-checksum",
    )

    parser.add_argument(
        "--allow-remote",
        action="store_true",
    )

    args = parser.parse_args()

    source = Path(
        args.file
    ).expanduser().resolve()

    report_path = Path(
        args.report
    ).expanduser().resolve()

    if not source.exists():
        print(
            f"ERROR: file not found: {source}",
            file=sys.stderr,
        )
        return 2

    validation = validate(source)

    if not validation["valid"]:
        validation["result"] = "VALIDATION_FAILED"

        report_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        report_path.write_text(
            json.dumps(
                validation,
                indent=2,
                ensure_ascii=False,
                default=str,
            ) + "\n"
        )

        print(json.dumps(
            validation,
            indent=2,
            ensure_ascii=False,
            default=str,
        ))

        return 1

    if not args.apply:
        validation["result"] = "DRY_RUN_OK"

        report_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        report_path.write_text(
            json.dumps(
                validation,
                indent=2,
                ensure_ascii=False,
                default=str,
            ) + "\n"
        )

        print(json.dumps(
            validation,
            indent=2,
            ensure_ascii=False,
            default=str,
        ))

        return 0

    actual_checksum = sha256_file(source)

    if not args.confirm_checksum:
        print(
            "ERROR: --confirm-checksum is required for APPLY",
            file=sys.stderr,
        )
        return 2

    if actual_checksum != args.confirm_checksum:
        print(
            "ERROR: CHECKSUM_MISMATCH",
            file=sys.stderr,
        )
        return 2

    if not args.supabase_url or not args.supabase_key:
        print(
            "ERROR: --supabase-url and --supabase-key "
            "are required for APPLY",
            file=sys.stderr,
        )
        return 2

    try:
        assert_local_target(
            args.supabase_url,
            args.allow_remote,
        )

        result = apply(
            source,
            args.supabase_url,
            args.supabase_key,
        )

    except Exception as exc:
        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )
        return 1

    final_report = {
        **validation,
        "mode": "APPLY",
        "apply": result,
        "result": "APPLY_OK",
    }

    report_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    report_path.write_text(
        json.dumps(
            final_report,
            indent=2,
            ensure_ascii=False,
            default=str,
        ) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(
        final_report,
        indent=2,
        ensure_ascii=False,
        default=str,
    ))

    print("\nRESULT: APPLY_OK")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
