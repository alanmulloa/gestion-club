begin;

create extension if not exists pgcrypto with schema extensions;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  default_timezone text not null default 'Europe/Madrid',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_users (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null
    check (role_code in ('OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INVITED', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parent_organization_id uuid references public.organizations(id) on delete restrict,
  organization_type text not null
    check (organization_type in (
      'FEDERATION',
      'TERRITORIAL_FEDERATION',
      'LEAGUE',
      'ASSOCIATION',
      'CLUB',
      'ACADEMY',
      'OTHER'
    )),
  slug text not null,
  legal_name text,
  display_name text not null,
  tax_id text,
  country_code char(2),
  timezone text not null default 'Europe/Madrid',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (id, tenant_id)
);

create index organizations_tenant_parent_idx
  on public.organizations (tenant_id, parent_organization_id);

create table public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null
    check (role_code in (
      'ORG_ADMIN',
      'SPORTS_DIRECTOR',
      'COACH',
      'TEAM_MANAGER',
      'MEDICAL',
      'REFEREE_COORDINATOR',
      'FINANCE',
      'DOCUMENTS',
      'VIEWER'
    )),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INVITED', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, role_code)
);

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  team_based boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now()
);

create table public.organization_sports (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete restrict,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, sport_id)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (tenant_id, name),
  unique (id, tenant_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete restrict,
  code text not null,
  name text not null,
  gender_code text not null default 'OPEN'
    check (gender_code in ('OPEN', 'MALE', 'FEMALE', 'MIXED', 'OTHER')),
  min_age smallint,
  max_age smallint,
  configuration jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  check (min_age is null or min_age >= 0),
  check (max_age is null or max_age >= 0),
  check (min_age is null or max_age is null or max_age >= min_age),
  unique (tenant_id, sport_id, code),
  unique (id, tenant_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  organization_id uuid not null,
  sport_id uuid not null references public.sports(id) on delete restrict,
  season_id uuid not null,
  category_id uuid,
  code text,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, tenant_id)
    references public.organizations(id, tenant_id) on delete cascade,
  foreign key (season_id, tenant_id)
    references public.seasons(id, tenant_id) on delete restrict,
  foreign key (category_id, tenant_id)
    references public.categories(id, tenant_id) on delete restrict,
  unique (tenant_id, season_id, organization_id, name),
  unique (id, tenant_id)
);

create index teams_org_season_idx
  on public.teams (organization_id, season_id);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  legacy_id text,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  birth_date date,
  email text,
  phone_e164 text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legacy_id),
  unique (tenant_id, auth_user_id),
  unique (id, tenant_id)
);

create index persons_tenant_name_idx
  on public.persons (tenant_id, last_name, first_name);

create table public.person_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null,
  organization_id uuid not null,
  season_id uuid,
  team_id uuid,
  role_code text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'PENDING', 'SUSPENDED', 'ENDED')),
  starts_on date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, tenant_id)
    references public.persons(id, tenant_id) on delete cascade,
  foreign key (organization_id, tenant_id)
    references public.organizations(id, tenant_id) on delete cascade,
  foreign key (season_id, tenant_id)
    references public.seasons(id, tenant_id) on delete restrict,
  foreign key (team_id, tenant_id)
    references public.teams(id, tenant_id) on delete cascade,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index person_memberships_person_idx
  on public.person_memberships (tenant_id, person_id, status);

create index person_memberships_org_idx
  on public.person_memberships (tenant_id, organization_id, role_code, status);

insert into public.sports (code, name, team_based, configuration)
values
  ('RUGBY_UNION', 'Rugby Union', true, '{"sport_pack":"rugby-union"}'::jsonb)
on conflict (code) do nothing;

commit;
