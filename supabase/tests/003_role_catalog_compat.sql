begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(4);

insert into public.tenants (
  id, slug, name
) values (
  '91000000-0000-0000-0000-000000000001',
  'role-compat-test',
  'Role Compat Test'
);

insert into public.membership_roles (
  tenant_id,
  code,
  name,
  category,
  scope_type
) values (
  '91000000-0000-0000-0000-000000000001',
  'COORDINATOR',
  'Coordinador',
  'COORDINATOR',
  'TRANSVERSAL'
);

select is(
  (
    select category
    from public.membership_roles
    where tenant_id = '91000000-0000-0000-0000-000000000001'
      and code = 'COORDINATOR'
  ),
  'COORDINATOR',
  'COORDINATOR role category is accepted'
);

insert into public.membership_roles (
  tenant_id,
  code,
  name,
  category,
  scope_type
) values (
  '91000000-0000-0000-0000-000000000001',
  'REFEREE_COORDINATOR',
  'Coordinador de Arbitros',
  'REFEREE_COORDINATOR',
  'TRANSVERSAL'
);

select is(
  (
    select category
    from public.membership_roles
    where tenant_id = '91000000-0000-0000-0000-000000000001'
      and code = 'REFEREE_COORDINATOR'
  ),
  'REFEREE_COORDINATOR',
  'REFEREE_COORDINATOR role category is accepted'
);

select throws_ok(
  $$
    insert into public.membership_roles (
      tenant_id,
      code,
      name,
      category,
      scope_type
    ) values (
      '91000000-0000-0000-0000-000000000001',
      'INVALID_ROLE',
      'Invalid',
      'INVALID_CATEGORY',
      'TRANSVERSAL'
    )
  $$,
  '23514',
  null,
  'invalid role category remains rejected'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'membership_roles_category_check'
  ),
  'membership role category constraint exists'
);

select * from finish();

rollback;
