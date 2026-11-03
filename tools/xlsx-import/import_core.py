#!/usr/bin/env python3

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook


SHEETS = {
    "ClubConfig": {
        "id": "organizationId",
        "required": {
            "organizationId", "officialName", "shortName",
            "activeSeasonId"
        },
    },
    "Seasons": {
        "id": "seasonId",
        "required": {
            "seasonId", "name", "startDate", "endDate", "status"
        },
    },
    "Divisions": {
        "id": "divisionId",
        "required": {
            "divisionId", "name", "code", "status"
        },
    },
    "Teams": {
        "id": "teamId",
        "required": {
            "teamId", "divisionId", "name",
            "code", "seasonId", "status"
        },
    },
    "Persons": {
        "id": "personId",
        "required": {
            "personId", "firstName", "lastName",
            "displayName", "status"
        },
    },
    "Users": {
        "id": "userId",
        "required": {
            "userId", "personId", "email",
            "status", "securityRole"
        },
    },
    "Roles": {
        "id": "roleId",
        "required": {
            "roleId", "name", "category",
            "scopeType", "status"
        },
    },
    "Assignments": {
        "id": "assignmentId",
        "required": {
            "assignmentId", "personId", "roleId",
            "divisionId", "seasonId", "status"
        },
    },
    "FederationLicenses": {
        "id": "licenseId",
        "required": {
            "licenseId", "personId", "federation",
            "licenseNumber", "status"
        },
    },
}


ROLE_CATEGORIES = {
    "PLAYER",
    "COACH",
    "MANAGER",
    "REFEREE",
    "COLLABORATOR",
    "COORDINATOR",
    "REFEREE_COORDINATOR",
    "STAFF",
    "MEDICAL",
    "OTHER",
}

ROLE_SCOPES = {
    "DIVISION",
    "TEAM",
    "TRANSVERSAL",
    "FLEXIBLE",
}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_header(values):
    return [str(v).strip() for v in values if v is not None and str(v).strip()]


def load_sheet(workbook, sheet_name):
    ws = workbook[sheet_name]
    ws.reset_dimensions()

    iterator = ws.iter_rows(values_only=True)

    try:
        raw_header = next(iterator)
    except StopIteration:
        return [], []

    header = clean_header(raw_header)
    index = {name: i for i, name in enumerate(raw_header) if name}

    rows = []

    for raw in iterator:
        if not any(v is not None and v != "" for v in raw):
            continue

        row = {}
        for key, idx in index.items():
            row[str(key).strip()] = raw[idx] if idx < len(raw) else None

        rows.append(row)

    return header, rows


def duplicate_values(rows, field):
    values = [
        str(r.get(field)).strip()
        for r in rows
        if r.get(field) not in (None, "")
    ]

    counter = Counter(values)

    return sorted([
        value
        for value, count in counter.items()
        if count > 1
    ])


def index_ids(rows, field):
    return {
        str(r[field]).strip()
        for r in rows
        if r.get(field) not in (None, "")
    }


def add_error(report, code, message, context=None):
    item = {
        "code": code,
        "message": message,
    }

    if context is not None:
        item["context"] = context

    report["errors"].append(item)


def add_warning(report, code, message, context=None):
    item = {
        "code": code,
        "message": message,
    }

    if context is not None:
        item["context"] = context

    report["warnings"].append(item)


def validate(path):
    report = {
        "importer_version": "0.1.0",
        "mode": "DRY_RUN",
        "source_file": path.name,
        "source_sha256": sha256_file(path),
        "valid": False,
        "counts": {},
        "target_preview": {},
        "checks": {},
        "errors": [],
        "warnings": [],
        "security": {
            "legacy_password_hashes_migrated": False,
            "legacy_password_salts_migrated": False,
            "legacy_sessions_migrated": False,
            "auth_users_created": False,
        },
    }

    workbook = load_workbook(
        path,
        read_only=True,
        data_only=True,
    )

    missing_sheets = [
        name for name in SHEETS
        if name not in workbook.sheetnames
    ]

    if missing_sheets:
        add_error(
            report,
            "MISSING_SHEETS",
            "Missing required sheets",
            missing_sheets,
        )
        return report

    data = {}

    for name, spec in SHEETS.items():
        header, rows = load_sheet(workbook, name)

        data[name] = rows
        report["counts"][name] = len(rows)

        missing_columns = sorted(
            spec["required"] - set(header)
        )

        if missing_columns:
            add_error(
                report,
                "MISSING_COLUMNS",
                f"{name}: missing required columns",
                missing_columns,
            )

        duplicates = duplicate_values(
            rows,
            spec["id"],
        )

        if duplicates:
            add_error(
                report,
                "DUPLICATE_IDS",
                f"{name}: duplicate IDs",
                duplicates,
            )

    seasons = index_ids(data["Seasons"], "seasonId")
    divisions = index_ids(data["Divisions"], "divisionId")
    teams = index_ids(data["Teams"], "teamId")
    persons = index_ids(data["Persons"], "personId")
    roles = index_ids(data["Roles"], "roleId")

    # ClubConfig
    for row in data["ClubConfig"]:
        active_season = row.get("activeSeasonId")

        if active_season and active_season not in seasons:
            add_error(
                report,
                "BROKEN_ACTIVE_SEASON",
                "ClubConfig references unknown active season",
                active_season,
            )

    # Teams
    for row in data["Teams"]:
        if row.get("divisionId") not in divisions:
            add_error(
                report,
                "BROKEN_TEAM_DIVISION",
                "Team references unknown division",
                row.get("teamId"),
            )

        if row.get("seasonId") not in seasons:
            add_error(
                report,
                "BROKEN_TEAM_SEASON",
                "Team references unknown season",
                row.get("teamId"),
            )

    # Users
    user_emails = []

    for row in data["Users"]:
        if row.get("personId") not in persons:
            add_error(
                report,
                "BROKEN_USER_PERSON",
                "User references unknown person",
                row.get("userId"),
            )

        email = row.get("email")

        if email:
            user_emails.append(
                str(email).strip().lower()
            )

    duplicated_emails = sorted([
        email
        for email, count in Counter(user_emails).items()
        if count > 1
    ])

    if duplicated_emails:
        add_error(
            report,
            "DUPLICATE_USER_EMAILS",
            "Duplicate normalized user emails",
            duplicated_emails,
        )

    # Roles
    role_by_id = {}

    for row in data["Roles"]:
        role_id = row.get("roleId")
        role_by_id[role_id] = row

        category = row.get("category")
        scope = row.get("scopeType")

        if category not in ROLE_CATEGORIES:
            add_error(
                report,
                "INVALID_ROLE_CATEGORY",
                f"Invalid role category: {category}",
                role_id,
            )

        if scope not in ROLE_SCOPES:
            add_error(
                report,
                "INVALID_ROLE_SCOPE",
                f"Invalid role scope: {scope}",
                role_id,
            )

    # Assignments
    transversal = 0

    for row in data["Assignments"]:
        assignment_id = row.get("assignmentId")

        if row.get("personId") not in persons:
            add_error(
                report,
                "BROKEN_ASSIGNMENT_PERSON",
                "Assignment references unknown person",
                assignment_id,
            )

        if row.get("roleId") not in roles:
            add_error(
                report,
                "BROKEN_ASSIGNMENT_ROLE",
                "Assignment references unknown role",
                assignment_id,
            )

        division_id = row.get("divisionId")

        if division_id in (None, ""):
            transversal += 1

            role = role_by_id.get(
                row.get("roleId"),
                {},
            )

            if role.get("scopeType") == "DIVISION":
                add_warning(
                    report,
                    "DIVISION_ROLE_WITHOUT_DIVISION",
                    "Division-scoped role has no division",
                    assignment_id,
                )

        elif division_id not in divisions:
            add_error(
                report,
                "BROKEN_ASSIGNMENT_DIVISION",
                "Assignment references unknown division",
                assignment_id,
            )

        if row.get("seasonId") not in seasons:
            add_error(
                report,
                "BROKEN_ASSIGNMENT_SEASON",
                "Assignment references unknown season",
                assignment_id,
            )

    # Licenses
    license_numbers = []

    for row in data["FederationLicenses"]:
        license_id = row.get("licenseId")

        if row.get("personId") not in persons:
            add_error(
                report,
                "BROKEN_LICENSE_PERSON",
                "License references unknown person",
                license_id,
            )

        federation = str(
            row.get("federation") or ""
        ).strip().upper()

        number = str(
            row.get("licenseNumber") or ""
        ).strip()

        if not federation or not number:
            add_error(
                report,
                "INVALID_LICENSE",
                "License federation/number missing",
                license_id,
            )

        license_numbers.append(
            f"{federation}|{number}"
        )

    duplicate_licenses = sorted([
        value
        for value, count in Counter(
            license_numbers
        ).items()
        if count > 1
    ])

    if duplicate_licenses:
        add_error(
            report,
            "DUPLICATE_LICENSE",
            "Duplicate federation license",
            duplicate_licenses,
        )

    # Planned seasons may have no dates, but dates must be paired.
    for row in data["Seasons"]:
        start = row.get("startDate")
        end = row.get("endDate")

        if bool(start) != bool(end):
            add_error(
                report,
                "SEASON_DATE_PAIR",
                "Season must have both dates or neither",
                row.get("seasonId"),
            )

    report["checks"] = {
        "duplicate_ids": 0 if not any(
            e["code"] == "DUPLICATE_IDS"
            for e in report["errors"]
        ) else None,
        "broken_references": sum(
            1
            for e in report["errors"]
            if e["code"].startswith("BROKEN_")
        ),
        "transversal_assignments": transversal,
        "role_categories": sorted(
            {
                row.get("category")
                for row in data["Roles"]
                if row.get("category")
            }
        ),
        "role_scopes": sorted(
            {
                row.get("scopeType")
                for row in data["Roles"]
                if row.get("scopeType")
            }
        ),
    }

    report["target_preview"] = {
        "tenants": 1,
        "organizations": len(data["ClubConfig"]),
        "organization_sports": 1,
        "seasons": len(data["Seasons"]),
        "categories": len(data["Divisions"]),
        "teams": len(data["Teams"]),
        "persons": len(data["Persons"]),
        "membership_roles": len(data["Roles"]),
        "person_memberships": len(data["Assignments"]),
        "federation_licenses": len(data["FederationLicenses"]),
        "auth_identities_to_bootstrap": len(data["Users"]),
    }

    # Authentication mapping deliberately remains separate.
    report["auth_preview"] = {
        "users": [
            {
                "legacy_user_id": row.get("userId"),
                "person_id": row.get("personId"),
                "email": row.get("email"),
                "legacy_security_role": row.get("securityRole"),
                "auth_created": False,
            }
            for row in data["Users"]
        ],
        "note": (
            "Legacy password hashes/salts are intentionally excluded. "
            "Supabase Auth bootstrap is a separate controlled step."
        ),
    }

    report["valid"] = len(report["errors"]) == 0

    return report


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--file",
        required=True,
    )

    parser.add_argument(
        "--report",
        required=True,
    )

    args = parser.parse_args()

    source = Path(args.file).expanduser().resolve()
    target = Path(args.report).expanduser().resolve()

    if not source.exists():
        print(
            f"ERROR: file not found: {source}",
            file=sys.stderr,
        )
        return 2

    report = validate(source)

    target.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    target.write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
            default=str,
        ) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
            default=str,
        )
    )

    if report["valid"]:
        print("\nRESULT: DRY_RUN_OK")
        return 0

    print("\nRESULT: DRY_RUN_FAILED")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
