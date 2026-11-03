#!/usr/bin/env python3

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from supabase import create_client

from bootstrap_auth import build_plan


def assert_local(url):
    host = (urlparse(url).hostname or "").lower()

    if host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("REMOTE_AUTH_APPLY_BLOCKED")


def request_json(method, url, key, payload=None):
    body = None

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urlopen(req) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}

    except HTTPError as exc:
        raw = exc.read().decode("utf-8")
        raise RuntimeError(
            f"AUTH_HTTP_{exc.code}: {raw}"
        ) from exc


def list_auth_users(base_url, service_key):
    result = request_json(
        "GET",
        f"{base_url}/auth/v1/admin/users?page=1&per_page=1000",
        service_key,
    )

    if isinstance(result, dict):
        return result.get("users", [])

    return []


def create_auth_user(
    base_url,
    service_key,
    email,
    password,
    metadata,
):
    return request_json(
        "POST",
        f"{base_url}/auth/v1/admin/users",
        service_key,
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": metadata,
        },
    )


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument("--file", required=True)
    parser.add_argument("--supabase-url", required=True)
    parser.add_argument("--service-key", required=True)
    parser.add_argument("--test-password", required=True)
    parser.add_argument("--report", required=True)

    args = parser.parse_args()

    source = Path(args.file).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()

    assert_local(args.supabase_url)

    plan = build_plan(source)

    if not plan["valid"]:
        print("ERROR: AUTH_PLAN_INVALID", file=sys.stderr)
        return 1

    client = create_client(
        args.supabase_url,
        args.service_key,
    )

    tenants = (
        client.table("tenants")
        .select("id")
        .execute()
        .data
    )

    organizations = (
        client.table("organizations")
        .select("id")
        .execute()
        .data
    )

    if len(tenants) != 1:
        raise RuntimeError(
            f"EXPECTED_ONE_TENANT_FOUND_{len(tenants)}"
        )

    if len(organizations) != 1:
        raise RuntimeError(
            f"EXPECTED_ONE_ORGANIZATION_FOUND_{len(organizations)}"
        )

    tenant_id = tenants[0]["id"]
    organization_id = organizations[0]["id"]

    existing_auth = list_auth_users(
        args.supabase_url,
        args.service_key,
    )

    auth_by_email = {
        str(u.get("email") or "").lower(): u
        for u in existing_auth
        if u.get("email")
    }

    result_users = []

    for identity in plan["identities"]:
        email = identity["email"]

        persons = (
            client.table("persons")
            .select("id,legacy_id,auth_user_id")
            .eq(
                "legacy_id",
                identity["legacy_person_id"],
            )
            .execute()
            .data
        )

        if len(persons) != 1:
            raise RuntimeError(
                "PERSON_NOT_FOUND:"
                + identity["legacy_person_id"]
            )

        person = persons[0]

        auth_user = auth_by_email.get(email)

        created = False

        if auth_user is None:
            auth_user = create_auth_user(
                args.supabase_url,
                args.service_key,
                email,
                args.test_password,
                {
                    "legacy_user_id":
                        identity["legacy_user_id"],
                    "legacy_person_id":
                        identity["legacy_person_id"],
                    "local_bootstrap": True,
                },
            )

            auth_by_email[email] = auth_user
            created = True

        auth_user_id = auth_user["id"]

        client.table("persons").update({
            "auth_user_id": auth_user_id,
        }).eq(
            "id",
            person["id"],
        ).execute()

        client.table("tenant_users").upsert(
            {
                "tenant_id": tenant_id,
                "user_id": auth_user_id,
                "role_code":
                    identity["tenant_role"],
                "status": "ACTIVE",
            },
            on_conflict="tenant_id,user_id",
        ).execute()

        for role in identity["organization_roles"]:
            client.table(
                "organization_users"
            ).upsert(
                {
                    "organization_id":
                        organization_id,
                    "user_id":
                        auth_user_id,
                    "role_code":
                        role,
                    "status":
                        "ACTIVE",
                },
                on_conflict=(
                    "organization_id,user_id,role_code"
                ),
            ).execute()

        result_users.append({
            "email": email,
            "auth_user_id": auth_user_id,
            "created": created,
            "tenant_role":
                identity["tenant_role"],
            "organization_roles":
                identity["organization_roles"],
            "person_id":
                person["id"],
        })

    counts = {}

    for table in (
        "tenant_users",
        "organization_users",
    ):
        response = (
            client.table(table)
            .select("*", count="exact")
            .limit(1)
            .execute()
        )

        counts[table] = int(
            response.count or 0
        )

    linked_persons = (
        client.table("persons")
        .select("*", count="exact")
        .not_.is_(
            "auth_user_id",
            "null",
        )
        .limit(1)
        .execute()
    )

    counts["persons_with_auth"] = int(
        linked_persons.count or 0
    )

    report = {
        **plan,
        "mode": "LOCAL_APPLY",
        "result": "AUTH_APPLY_OK",
        "tenant_id": tenant_id,
        "organization_id": organization_id,
        "users": result_users,
        "counts": {
            **plan["counts"],
            **counts,
        },
    }

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

    print("\nRESULT: AUTH_APPLY_OK")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
