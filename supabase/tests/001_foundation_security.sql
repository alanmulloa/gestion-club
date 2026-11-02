begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(23);

select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'tenant_users', 'tenant_users exists');
select has_table('public', 'organizations', 'organizations exists');
select has_table('public', 'organization_users', 'organization_users exists');
select has_table('public', 'sports', 'sports exists');
select has_table('public', 'organization_sports', 'organization_sports exists');
select has_table('public', 'seasons', 'seasons exists');
select has_table('public', 'categories', 'categories exists');
select has_table('public', 'teams', 'teams exists');
select has_table('public', 'persons', 'persons exists');
select has_table('public', 'person_memberships', 'person_memberships exists');

select ok((select relrowsecurity from pg_class where oid = 'public.tenants'::regclass), 'tenants RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.tenant_users'::regclass), 'tenant_users RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.organization_users'::regclass), 'organization_users RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.sports'::regclass), 'sports RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.organization_sports'::regclass), 'organization_sports RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.seasons'::regclass), 'seasons RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass), 'categories RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.teams'::regclass), 'teams RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.persons'::regclass), 'persons RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.person_memberships'::regclass), 'person_memberships RLS enabled');

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'tenants','tenant_users','organizations','organization_users','sports',
        'organization_sports','seasons','categories','teams','persons','person_memberships'
      )
      and privilege_type = 'SELECT'
  ),
  'anon has no SELECT grants on core tables'
);

select * from finish();
rollback;
