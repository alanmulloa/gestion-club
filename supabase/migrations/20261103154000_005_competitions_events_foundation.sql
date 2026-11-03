begin;

-- =============================================================================
-- 005 Competitions / Events Foundation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Competitions
-- -----------------------------------------------------------------------------

create table public.competitions (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  organization_id uuid not null,
  sport_id uuid not null
    references public.sports(id) on delete restrict,

  season_id uuid not null,
  category_id uuid,

  legacy_id text,
  source_code text,
  external_id text,

  code text,
  name text not null,

  competition_type text not null default 'LEAGUE'
    check (
      competition_type in (
        'LEAGUE',
        'CUP',
        'FRIENDLY',
        'TOURNAMENT',
        'OTHER'
      )
    ),

  status text not null default 'ACTIVE'
    check (
      status in (
        'PLANNED',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED',
        'ARCHIVED'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (organization_id, tenant_id)
    references public.organizations(id, tenant_id)
    on delete cascade,

  foreign key (season_id, tenant_id)
    references public.seasons(id, tenant_id)
    on delete restrict,

  foreign key (category_id, tenant_id)
    references public.categories(id, tenant_id)
    on delete restrict,

  foreign key (organization_id, sport_id)
    references public.organization_sports(
      organization_id,
      sport_id
    )
    on delete restrict,

  unique (id, tenant_id)
);

create unique index competitions_tenant_legacy_uidx
  on public.competitions (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index competitions_source_external_uidx
  on public.competitions (
    tenant_id,
    source_code,
    external_id
  )
  where source_code is not null
    and external_id is not null;


-- -----------------------------------------------------------------------------
-- Competition stages
-- Supports regular league stages, pools, knockouts and triangulars.
-- -----------------------------------------------------------------------------

create table public.competition_stages (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  competition_id uuid not null,

  legacy_id text,

  code text,
  name text not null,

  stage_type text not null default 'REGULAR'
    check (
      stage_type in (
        'REGULAR',
        'POOL',
        'KNOCKOUT',
        'SEMIFINAL',
        'FINAL',
        'TRIANGULAR',
        'OTHER'
      )
    ),

  sequence_no integer not null default 1
    check (sequence_no > 0),

  starts_on date,
  ends_on date,

  status text not null default 'ACTIVE'
    check (
      status in (
        'PLANNED',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (competition_id, tenant_id)
    references public.competitions(id, tenant_id)
    on delete cascade,

  check (
    ends_on is null
    or starts_on is null
    or ends_on >= starts_on
  ),

  unique (id, tenant_id),
  unique (id, tenant_id, competition_id),
  unique (competition_id, sequence_no)
);

create unique index competition_stages_tenant_legacy_uidx
  on public.competition_stages (tenant_id, legacy_id)
  where legacy_id is not null;


-- -----------------------------------------------------------------------------
-- Events
--
-- Generic calendar entity. A MATCH has a corresponding row in public.matches.
-- Training / meeting events can be added later without schema changes.
-- -----------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  organization_id uuid not null,

  sport_id uuid not null
    references public.sports(id) on delete restrict,

  season_id uuid not null,
  category_id uuid,
  team_id uuid,

  legacy_id text,
  source_code text,
  external_id text,

  event_type text not null
    check (
      event_type in (
        'MATCH',
        'TRAINING',
        'MEETING',
        'OTHER'
      )
    ),

  title text not null,

  starts_at timestamptz not null,
  ends_at timestamptz,

  venue_name text,
  venue_address text,

  status text not null default 'SCHEDULED'
    check (
      status in (
        'SCHEDULED',
        'CONFIRMED',
        'IN_PROGRESS',
        'COMPLETED',
        'POSTPONED',
        'CANCELLED'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (organization_id, tenant_id)
    references public.organizations(id, tenant_id)
    on delete cascade,

  foreign key (season_id, tenant_id)
    references public.seasons(id, tenant_id)
    on delete restrict,

  foreign key (category_id, tenant_id)
    references public.categories(id, tenant_id)
    on delete restrict,

  foreign key (team_id, tenant_id, organization_id)
    references public.teams(
      id,
      tenant_id,
      organization_id
    )
    on delete restrict,

  foreign key (organization_id, sport_id)
    references public.organization_sports(
      organization_id,
      sport_id
    )
    on delete restrict,

  check (
    ends_at is null
    or ends_at >= starts_at
  ),

  unique (id, tenant_id)
);

create unique index events_tenant_legacy_uidx
  on public.events (tenant_id, legacy_id)
  where legacy_id is not null;

create unique index events_source_external_uidx
  on public.events (
    tenant_id,
    source_code,
    external_id
  )
  where source_code is not null
    and external_id is not null;

create index events_calendar_idx
  on public.events (
    tenant_id,
    starts_at,
    event_type,
    status
  );


-- -----------------------------------------------------------------------------
-- Match details
-- -----------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  event_id uuid not null,
  competition_id uuid,
  stage_id uuid,

  match_format text not null default 'STANDARD'
    check (
      match_format in (
        'STANDARD',
        'TRIANGULAR',
        'TOURNAMENT',
        'OTHER'
      )
    ),

  sequence_no integer,
  scheduled_duration_minutes integer
    check (
      scheduled_duration_minutes is null
      or scheduled_duration_minutes > 0
    ),

  status text not null default 'SCHEDULED'
    check (
      status in (
        'SCHEDULED',
        'IN_PROGRESS',
        'COMPLETED',
        'POSTPONED',
        'CANCELLED'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (event_id, tenant_id)
    references public.events(id, tenant_id)
    on delete cascade,

  foreign key (competition_id, tenant_id)
    references public.competitions(id, tenant_id)
    on delete restrict,

  foreign key (
    stage_id,
    tenant_id,
    competition_id
  )
    references public.competition_stages(
      id,
      tenant_id,
      competition_id
    )
    on delete restrict,

  unique (event_id),
  unique (id, tenant_id)
);

create index matches_competition_idx
  on public.matches (
    tenant_id,
    competition_id,
    stage_id
  );


-- -----------------------------------------------------------------------------
-- Match teams
--
-- team_id / organization_id are optional so FAR opponents do not need to be
-- created as fake organizations in the tenant.
-- -----------------------------------------------------------------------------

create table public.match_teams (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  event_id uuid not null,

  side text not null
    check (side in ('HOME', 'AWAY')),

  team_id uuid,
  organization_id uuid,

  external_id text,
  display_name text not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (event_id, tenant_id)
    references public.events(id, tenant_id)
    on delete cascade,

  foreign key (team_id, tenant_id)
    references public.teams(id, tenant_id)
    on delete restrict,

  foreign key (organization_id, tenant_id)
    references public.organizations(id, tenant_id)
    on delete restrict,

  unique (event_id, side),
  unique (id, tenant_id)
);


-- -----------------------------------------------------------------------------
-- Referee assignments
-- -----------------------------------------------------------------------------

create table public.referee_assignments (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id) on delete cascade,

  event_id uuid not null,
  person_id uuid not null,

  role_code text not null default 'REFEREE'
    check (
      role_code in (
        'REFEREE',
        'ASSISTANT_REFEREE',
        'TMO',
        'REFEREE_COACH'
      )
    ),

  assignment_source text not null default 'MANUAL'
    check (
      assignment_source in (
        'FAR',
        'CLUB',
        'MANUAL',
        'OTHER'
      )
    ),

  external_id text,

  status text not null default 'ASSIGNED'
    check (
      status in (
        'ASSIGNED',
        'CONFIRMED',
        'DECLINED',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (event_id, tenant_id)
    references public.events(id, tenant_id)
    on delete cascade,

  foreign key (person_id, tenant_id)
    references public.persons(id, tenant_id)
    on delete cascade,

  unique (
    event_id,
    person_id,
    role_code
  ),

  unique (id, tenant_id)
);

create index referee_assignments_person_idx
  on public.referee_assignments (
    tenant_id,
    person_id,
    status
  );


-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

create trigger competition_stages_set_updated_at
before update on public.competition_stages
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger match_teams_set_updated_at
before update on public.match_teams
for each row execute function public.set_updated_at();

create trigger referee_assignments_set_updated_at
before update on public.referee_assignments
for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Immutable tenant scope
-- -----------------------------------------------------------------------------

create trigger competitions_protect_scope
before update on public.competitions
for each row execute function public.protect_scoped_identity();

create trigger competition_stages_protect_scope
before update on public.competition_stages
for each row execute function public.protect_scoped_identity();

create trigger events_protect_scope
before update on public.events
for each row execute function public.protect_scoped_identity();

create trigger matches_protect_scope
before update on public.matches
for each row execute function public.protect_scoped_identity();

create trigger match_teams_protect_scope
before update on public.match_teams
for each row execute function public.protect_scoped_identity();

create trigger referee_assignments_protect_scope
before update on public.referee_assignments
for each row execute function public.protect_scoped_identity();


-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.competitions enable row level security;
alter table public.competition_stages enable row level security;
alter table public.events enable row level security;
alter table public.matches enable row level security;
alter table public.match_teams enable row level security;
alter table public.referee_assignments enable row level security;

revoke all on table public.competitions from anon;
revoke all on table public.competition_stages from anon;
revoke all on table public.events from anon;
revoke all on table public.matches from anon;
revoke all on table public.match_teams from anon;
revoke all on table public.referee_assignments from anon;

grant select, insert, update, delete
  on table public.competitions,
           public.competition_stages,
           public.events,
           public.matches,
           public.match_teams,
           public.referee_assignments
  to authenticated;


-- Tenant members can read calendar/competition data.

create policy competitions_select_member
on public.competitions
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy competition_stages_select_member
on public.competition_stages
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy events_select_member
on public.events
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy matches_select_member
on public.matches
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy match_teams_select_member
on public.match_teams
for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy referee_assignments_select_member
on public.referee_assignments
for select
to authenticated
using (public.is_tenant_member(tenant_id));


-- Competition maintenance: tenant admins or organization admins.

create policy competitions_write_manager
on public.competitions
for all
to authenticated
using (
  public.has_tenant_role(
    tenant_id,
    array['OWNER','ADMIN']
  )
  or public.can_manage_organization(
    organization_id
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['OWNER','ADMIN']
  )
  or public.can_manage_organization(
    organization_id
  )
);


-- Stage maintenance follows its competition.

create policy competition_stages_write_manager
on public.competition_stages
for all
to authenticated
using (
  exists (
    select 1
    from public.competitions c
    where c.id = competition_id
      and c.tenant_id =
        competition_stages.tenant_id
      and (
        public.has_tenant_role(
          c.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          c.organization_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.competitions c
    where c.id = competition_id
      and c.tenant_id =
        competition_stages.tenant_id
      and (
        public.has_tenant_role(
          c.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          c.organization_id
        )
      )
  )
);


-- Event maintenance.

create policy events_write_manager
on public.events
for all
to authenticated
using (
  public.has_tenant_role(
    tenant_id,
    array['OWNER','ADMIN']
  )
  or public.can_manage_organization(
    organization_id
  )
)
with check (
  public.has_tenant_role(
    tenant_id,
    array['OWNER','ADMIN']
  )
  or public.can_manage_organization(
    organization_id
  )
);


-- Match children inherit access from event.

create policy matches_write_manager
on public.matches
for all
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id = matches.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id = matches.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
      )
  )
);

create policy match_teams_write_manager
on public.match_teams
for all
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id = match_teams.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id = match_teams.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
      )
  )
);


-- Referee coordinator may maintain referee assignments.

create policy referee_assignments_write_manager
on public.referee_assignments
for all
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id =
        referee_assignments.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
        or public.has_org_role(
          e.organization_id,
          array['REFEREE_COORDINATOR']
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.events e
    where e.id = event_id
      and e.tenant_id =
        referee_assignments.tenant_id
      and (
        public.has_tenant_role(
          e.tenant_id,
          array['OWNER','ADMIN']
        )
        or public.can_manage_organization(
          e.organization_id
        )
        or public.has_org_role(
          e.organization_id,
          array['REFEREE_COORDINATOR']
        )
      )
  )
);

commit;
