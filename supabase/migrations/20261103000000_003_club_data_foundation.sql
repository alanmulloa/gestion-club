begin;

-- =============================================================================
-- 003 Club Data Foundation
-- Bridges the platform core with the current Gestion Club data model.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Legacy identifiers
-- Preserve stable IDs from the current Sheet during migration.
-- -----------------------------------------------------------------------------

alter table public.organizations
  add column if not exists legacy_id text;

alter table public.seasons
  add column if not exists legacy_id text;

alter table public.categories
  add column if not exists legacy_id text;

alter table public.teams
  add column if not exists legacy_id text;

alter table public.person_memberships
  add column if not exists legacy_id text;

create unique index if not exists organizations_tenant_legacy_uidx
  on public.organizations (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index if not exists seasons_tenant_legacy_uidx
  on public.seasons (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index if not exists categories_tenant_legacy_uidx
  on public.categories (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index if not exists teams_tenant_legacy_uidx
  on public.teams (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index if not exists person_memberships_tenant_legacy_uidx
  on public.person_memberships (tenant_id, legacy_id)
  where legacy_id is not null;

-- -----------------------------------------------------------------------------
-- Seasons
--
-- The current Sheet already contains planned future seasons without dates
-- (for example 2027/2028). Foundation 001 required both dates.
-- -----------------------------------------------------------------------------

alter table public.seasons
  alter column starts_on drop not null,
  alter column ends_on drop not null;

alter table public.seasons
  add constraint seasons_dates_pair_ck
  check (
    (starts_on is null and ends_on is null)
    or
    (starts_on is not null and ends_on is not null)
  );

-- The original ends_on >= starts_on constraint remains valid:
-- PostgreSQL CHECK treats NULL as non-failing, while the pair constraint above
-- prevents only one date from being populated.

-- -----------------------------------------------------------------------------
-- Membership role catalog
--
-- Source: Roles
-- Examples:
-- PLAYER / Jugador / DIVISION
-- COACH / Entrenador / DIVISION
-- MANAGER / Manager / DIVISION
-- REFEREE / Arbitro / TRANSVERSAL
-- COLLABORATOR / Colaborador / FLEXIBLE
-- -----------------------------------------------------------------------------

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  sport_id uuid
    references public.sports(id) on delete restrict,

  legacy_id text,

  code text not null,
  name text not null,

  category text not null
    check (category in (
      'PLAYER',
      'COACH',
      'MANAGER',
      'REFEREE',
      'COLLABORATOR',
      'STAFF',
      'MEDICAL',
      'OTHER'
    )),

  scope_type text not null
    check (scope_type in (
      'DIVISION',
      'TEAM',
      'TRANSVERSAL',
      'FLEXIBLE'
    )),

  description text,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (tenant_id, code),
  unique (tenant_id, legacy_id),
  unique (id, tenant_id)
);

create index membership_roles_tenant_category_idx
  on public.membership_roles (tenant_id, category, status);

-- -----------------------------------------------------------------------------
-- Assignment / membership scope
--
-- Existing Assignments belong primarily to a division, not to a specific A/B
-- team. category_id preserves that scope while team_id remains optional.
-- -----------------------------------------------------------------------------

alter table public.person_memberships
  add column if not exists category_id uuid,
  add column if not exists role_id uuid;

alter table public.person_memberships
  add constraint person_memberships_category_same_tenant_fk
  foreign key (category_id, tenant_id)
  references public.categories(id, tenant_id)
  on delete restrict;

alter table public.person_memberships
  add constraint person_memberships_role_same_tenant_fk
  foreign key (role_id, tenant_id)
  references public.membership_roles(id, tenant_id)
  on delete restrict;

create index person_memberships_category_idx
  on public.person_memberships
    (tenant_id, category_id, season_id, role_code, status);

create index person_memberships_role_idx
  on public.person_memberships
    (tenant_id, role_id, status);

-- -----------------------------------------------------------------------------
-- Federation licenses
--
-- Source: FederationLicenses.
-- License numbers are stored as TEXT so leading zeroes are preserved.
-- -----------------------------------------------------------------------------

create table public.federation_licenses (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  person_id uuid not null,

  legacy_id text,

  federation_code text not null,
  license_number text not null,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED')),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade,

  unique (tenant_id, legacy_id),
  unique (tenant_id, federation_code, license_number),
  unique (id, tenant_id)
);

create index federation_licenses_person_idx
  on public.federation_licenses
    (tenant_id, person_id, status);

-- -----------------------------------------------------------------------------
-- updated_at and immutable tenant scope
-- -----------------------------------------------------------------------------

create trigger membership_roles_set_updated_at
before update on public.membership_roles
for each row execute function public.set_updated_at();

create trigger federation_licenses_set_updated_at
before update on public.federation_licenses
for each row execute function public.set_updated_at();

create trigger membership_roles_protect_scope
before update on public.membership_roles
for each row execute function public.protect_scoped_identity();

create trigger federation_licenses_protect_scope
before update on public.federation_licenses
for each row execute function public.protect_scoped_identity();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.membership_roles enable row level security;
alter table public.federation_licenses enable row level security;

revoke all on table public.membership_roles from anon;
revoke all on table public.federation_licenses from anon;

grant select, insert, update, delete
  on table public.membership_roles
  to authenticated;

grant select, insert, update, delete
  on table public.federation_licenses
  to authenticated;

-- Role catalog: tenant members may read, tenant admins maintain.
create policy membership_roles_select_tenant_member
on public.membership_roles
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy membership_roles_insert_admin
on public.membership_roles
for insert
to authenticated
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

create policy membership_roles_update_admin
on public.membership_roles
for update
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
)
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

create policy membership_roles_delete_admin
on public.membership_roles
for delete
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

-- Federation licenses follow person visibility.
create policy federation_licenses_select_access
on public.federation_licenses
for select
to authenticated
using (
  public.can_access_person(person_id)
);

create policy federation_licenses_insert_admin
on public.federation_licenses
for insert
to authenticated
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

create policy federation_licenses_update_admin
on public.federation_licenses
for update
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
)
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

create policy federation_licenses_delete_admin
on public.federation_licenses
for delete
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);


-- -----------------------------------------------------------------------------
-- Membership consistency
--
-- role_id is the canonical role when present; role_code remains for backwards
-- compatibility and is automatically synchronized.
--
-- A membership linked to a team inherits that team's category when omitted,
-- and cannot explicitly reference a different category.
-- -----------------------------------------------------------------------------

create or replace function public.validate_person_membership_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role_code text;
  v_team_category_id uuid;
begin
  if new.role_id is not null then
    select mr.code
      into v_role_code
    from public.membership_roles mr
    where mr.id = new.role_id
      and mr.tenant_id = new.tenant_id;

    if not found then
      raise exception 'MEMBERSHIP_ROLE_NOT_FOUND';
    end if;

    new.role_code := v_role_code;
  end if;

  if new.team_id is not null then
    select t.category_id
      into v_team_category_id
    from public.teams t
    where t.id = new.team_id
      and t.tenant_id = new.tenant_id
      and t.organization_id = new.organization_id;

    if found and v_team_category_id is not null then
      if new.category_id is null then
        new.category_id := v_team_category_id;
      elsif new.category_id is distinct from v_team_category_id then
        raise exception 'MEMBERSHIP_TEAM_CATEGORY_MISMATCH';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger person_memberships_validate_scope
before insert or update
on public.person_memberships
for each row
execute function public.validate_person_membership_scope();

commit;
