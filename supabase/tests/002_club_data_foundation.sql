begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(21);

-- New tables
select has_table(
  'public',
  'membership_roles',
  'membership_roles exists'
);

select has_table(
  'public',
  'federation_licenses',
  'federation_licenses exists'
);

-- Legacy identifiers
select has_column(
  'public',
  'organizations',
  'legacy_id',
  'organizations preserves legacy id'
);

select has_column(
  'public',
  'seasons',
  'legacy_id',
  'seasons preserves legacy id'
);

select has_column(
  'public',
  'categories',
  'legacy_id',
  'categories preserves legacy id'
);

select has_column(
  'public',
  'teams',
  'legacy_id',
  'teams preserves legacy id'
);

select has_column(
  'public',
  'person_memberships',
  'legacy_id',
  'memberships preserve assignment id'
);

-- Assignment division/category + catalog role
select has_column(
  'public',
  'person_memberships',
  'category_id',
  'memberships support division/category scope'
);

select has_column(
  'public',
  'person_memberships',
  'role_id',
  'memberships reference role catalog'
);

-- Planned seasons may not have dates yet
select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seasons'
      and column_name = 'starts_on'
  ),
  'planned season may have null start date'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seasons'
      and column_name = 'ends_on'
  ),
  'planned season may have null end date'
);

-- RLS
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.membership_roles'::regclass
  ),
  'membership_roles RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.federation_licenses'::regclass
  ),
  'federation_licenses RLS enabled'
);

-- No anonymous access
select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'membership_roles',
        'federation_licenses'
      )
  ),
  'anon has no grants on club data tables'
);

-- Important FKs exist
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'person_memberships_category_same_tenant_fk'
  ),
  'membership category tenant FK exists'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'person_memberships_role_same_tenant_fk'
  ),
  'membership role tenant FK exists'
);


-- ---------------------------------------------------------------------------
-- Membership consistency behavior
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'validate_person_membership_scope'
  ),
  'membership consistency function exists'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'person_memberships_validate_scope'
      and not tgisinternal
  ),
  'membership consistency trigger exists'
);

-- Minimal fixture for behavioral validation.
insert into public.tenants (
  id, slug, name
) values (
  '10000000-0000-0000-0000-000000000001',
  'test-club-data',
  'Test Club Data'
);

insert into public.organizations (
  id,
  tenant_id,
  organization_type,
  slug,
  display_name
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'CLUB',
  'test-club',
  'Test Club'
);

insert into public.organization_sports (
  organization_id,
  sport_id
)
select
  '20000000-0000-0000-0000-000000000001',
  id
from public.sports
where code = 'RUGBY_UNION';

insert into public.seasons (
  id,
  tenant_id,
  name,
  status
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '2099/2100',
  'PLANNED'
);

insert into public.categories (
  id,
  tenant_id,
  sport_id,
  code,
  name
)
select
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  id,
  'M18',
  'M18'
from public.sports
where code = 'RUGBY_UNION';

insert into public.categories (
  id,
  tenant_id,
  sport_id,
  code,
  name
)
select
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  id,
  'M16',
  'M16'
from public.sports
where code = 'RUGBY_UNION';

insert into public.teams (
  id,
  tenant_id,
  organization_id,
  sport_id,
  season_id,
  category_id,
  code,
  name
)
select
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  id,
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'M18-A',
  'M18 A'
from public.sports
where code = 'RUGBY_UNION';

insert into public.persons (
  id,
  tenant_id,
  legacy_id,
  first_name,
  last_name
) values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'TEST_PERSON',
  'Test',
  'Player'
);

insert into public.membership_roles (
  id,
  tenant_id,
  sport_id,
  legacy_id,
  code,
  name,
  category,
  scope_type
)
select
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  id,
  'TEST_ROLE_PLAYER',
  'PLAYER',
  'Jugador',
  'PLAYER',
  'DIVISION'
from public.sports
where code = 'RUGBY_UNION';

insert into public.person_memberships (
  id,
  tenant_id,
  person_id,
  organization_id,
  season_id,
  team_id,
  role_code,
  role_id,
  status
) values (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'SHOULD_BE_NORMALIZED',
  '70000000-0000-0000-0000-000000000001',
  'ACTIVE'
);

select is(
  (
    select role_code
    from public.person_memberships
    where id = '80000000-0000-0000-0000-000000000001'
  ),
  'PLAYER',
  'role_code is synchronized from canonical role_id'
);

select is(
  (
    select category_id::text
    from public.person_memberships
    where id = '80000000-0000-0000-0000-000000000001'
  ),
  '40000000-0000-0000-0000-000000000001',
  'team membership inherits team category'
);

select throws_ok(
  $$
    insert into public.person_memberships (
      tenant_id,
      person_id,
      organization_id,
      season_id,
      team_id,
      category_id,
      role_code,
      role_id,
      status
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'PLAYER',
      '70000000-0000-0000-0000-000000000001',
      'ACTIVE'
    )
  $$,
  'P0001',
  'MEMBERSHIP_TEAM_CATEGORY_MISMATCH',
  'membership cannot reference a category different from its team'
);

select * from finish();

rollback;
