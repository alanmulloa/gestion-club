#!/usr/bin/env python3

import argparse
import hashlib
import json
import sys
from pathlib import Path

from openpyxl import load_workbook


SECURITY_ROLE_MAP = {
    "ADMIN": {
        "tenant_role": "ADMIN",
        "organization_roles": ["ORG_ADMIN"],
    },
    "MEMBER": {
        "tenant_role": "VIEWER",
        "organization_roles": ["VIEWER"],
    },
}


SENSITIVE_FIELDS = {
    "password",
    "passwordHash",
    "passwordSalt",
    "sessionToken",
    "resetToken",
}


def sha256_file(path):
    h = hashlib.sha256()

    with open(path, "rb") as f:
        for chunk in iter(
            lambda: f.read(1024 * 1024),
            b"",
        ):
            h.update(chunk)

    return h.hexdigest()


def normalize_email(value):
    if value in (None, ""):
        return None

    return str(value).strip().lower()


def load_users(path):
    wb = load_workbook(
        path,
        read_only=True,
        data_only=True,
    )

    if "Users" not in wb.sheetnames:
        raise ValueError("MISSING_USERS_SHEET")

    ws = wb["Users"]
    iterator = ws.iter_rows(values_only=True)

    try:
        raw_header = next(iterator)
    except StopIteration:
        raise ValueError("EMPTY_USERS_SHEET")

    header = [
        str(v).strip() if v is not None else ""
        for v in raw_header
    ]

    index = {
        name: i
        for i, name in enumerate(header)
        if name
    }

    required = {
        "userId",
        "personId",
        "email",
        "status",
        "securityRole",
    }

    missing = sorted(required - set(index))

    if missing:
        raise ValueError(
            f"MISSING_USERS_COLUMNS:{','.join(missing)}"
        )

    users = []

    for raw in iterator:
        if not any(
            v not in (None, "")
            for v in raw
        ):
            continue

        row = {
            key: (
                raw[idx]
                if idx < len(raw)
                else None
            )
            for key, idx in index.items()
        }

        users.append(row)

    return users


def build_plan(path):
    users = load_users(path)

    errors = []
    warnings = []
    identities = []

    seen_user_ids = set()
    seen_person_ids = set()
    seen_emails = set()

    for row in users:
        legacy_user_id = str(
            row.get("userId") or ""
        ).strip()

        person_id = str(
            row.get("personId") or ""
        ).strip()

        email = normalize_email(
            row.get("email")
        )

        security_role = str(
            row.get("securityRole") or ""
        ).strip().upper()

        status = str(
            row.get("status") or ""
        ).strip().upper()

        if not legacy_user_id:
            errors.append({
                "code": "MISSING_USER_ID",
            })
            continue

        if legacy_user_id in seen_user_ids:
            errors.append({
                "code": "DUPLICATE_USER_ID",
                "value": legacy_user_id,
            })

        seen_user_ids.add(legacy_user_id)

        if not person_id:
            errors.append({
                "code": "MISSING_PERSON_ID",
                "user_id": legacy_user_id,
            })

        if person_id in seen_person_ids:
            errors.append({
                "code": "DUPLICATE_USER_PERSON",
                "value": person_id,
            })

        seen_person_ids.add(person_id)

        if not email:
            errors.append({
                "code": "MISSING_EMAIL",
                "user_id": legacy_user_id,
            })

        elif email in seen_emails:
            errors.append({
                "code": "DUPLICATE_EMAIL",
                "value": email,
            })

        if email:
            seen_emails.add(email)

        mapping = SECURITY_ROLE_MAP.get(
            security_role
        )

        if mapping is None:
            errors.append({
                "code": "UNSUPPORTED_SECURITY_ROLE",
                "user_id": legacy_user_id,
                "value": security_role,
            })
            continue

        if status != "ACTIVE":
            warnings.append({
                "code": "NON_ACTIVE_USER",
                "user_id": legacy_user_id,
                "status": status,
            })

        identities.append({
            "legacy_user_id": legacy_user_id,
            "legacy_person_id": person_id,
            "email": email,
            "legacy_security_role": security_role,
            "tenant_role": mapping["tenant_role"],
            "organization_roles": mapping[
                "organization_roles"
            ],
            "auth_action": "BOOTSTRAP_REQUIRED",
            "person_link_required": True,
        })

    return {
        "version": "0.1.0",
        "mode": "DRY_RUN",
        "source_file": path.name,
        "source_sha256": sha256_file(path),
        "valid": len(errors) == 0,
        "counts": {
            "users": len(users),
            "identities_planned": len(
                identities
            ),
        },
        "identities": identities,
        "security": {
            "legacy_passwords_used": False,
            "legacy_password_hashes_used": False,
            "legacy_password_salts_used": False,
            "sport_roles_grant_access": False,
        },
        "errors": errors,
        "warnings": warnings,
    }


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

    try:
        report = build_plan(source)

    except Exception as exc:
        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )
        return 1

    report_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    report_path.write_text(
        json.dumps(
            report,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    print(json.dumps(
        report,
        indent=2,
        ensure_ascii=False,
    ))

    if not report["valid"]:
        print("\nRESULT: AUTH_DRY_RUN_FAILED")
        return 1

    print("\nRESULT: AUTH_DRY_RUN_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
