begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixture base
-- ---------------------------------------------------------------------------

insert into public.tenants (
  id, slug, name
) values (
  'a1000000-0000-0000-0000-000000000001',
  'events-test',
  'Events Test'
);

insert into public.organizations (
  id,
  tenant_id,
  organization_type,
  slug,
  display_name
) values (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'CLUB',
  'events-club',
  'Events Club'
);

insert into public.organization_sports (
  organization_id,
  sport_id
)
select
  'a2000000-0000-0000-0000-000000000001',
  id
from public.sports
where code = 'RUGBY_UNION';

insert into public.seasons (
  id,
  tenant_id,
  name,
  status
) values (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
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
  'a4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  id,
  'M16',
  'M16'
from public.sports
where code = 'RUGBY_UNION';

insert into public.competitions (
  id,
  tenant_id,
  organization_id,
  sport_id,
  season_id,
  category_id,
  source_code,
  external_id,
  name,
  competition_type
)
select
  'a5000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  id,
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'FAR',
  'COMP-M16-1',
  'Copa FAR M16',
  'CUP'
from public.sports
where code = 'RUGBY_UNION';

insert into public.competition_stages (
  id,
  tenant_id,
  competition_id,
  name,
  stage_type,
  sequence_no
) values (
  'a6000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'Triangular Jornada 1',
  'TRIANGULAR',
  1
);

-- ---------------------------------------------------------------------------
-- 1-3: triangular = 3 matches independientes
-- ---------------------------------------------------------------------------

insert into public.events (
  id,
  tenant_id,
  organization_id,
  sport_id,
  season_id,
  category_id,
  source_code,
  external_id,
  event_type,
  title,
  starts_at
)
select
  'b1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  id,
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'FAR',
  'MATCH-1',
  'MATCH',
  'Marbella vs Club B',
  '2099-10-10 10:00:00+00'
from public.sports
where code = 'RUGBY_UNION';

insert into public.events (
  id,
  tenant_id,
  organization_id,
  sport_id,
  season_id,
  category_id,
  source_code,
  external_id,
  event_type,
  title,
  starts_at
)
select
  'b1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  id,
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'FAR',
  'MATCH-2',
  'MATCH',
  'Club B vs Club C',
  '2099-10-10 11:00:00+00'
from public.sports
where code = 'RUGBY_UNION';

insert into public.events (
  id,
  tenant_id,
  organization_id,
  sport_id,
  season_id,
  category_id,
  source_code,
  external_id,
  event_type,
  title,
  starts_at
)
select
  'b1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  id,
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'FAR',
  'MATCH-3',
  'MATCH',
  'Club C vs Marbella',
  '2099-10-10 12:00:00+00'
from public.sports
where code = 'RUGBY_UNION';

insert into public.matches (
  id,
  tenant_id,
  event_id,
  competition_id,
  stage_id,
  match_format,
  sequence_no,
  scheduled_duration_minutes
) values
(
  'b2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'TRIANGULAR',
  1,
  40
),
(
  'b2000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'a5000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'TRIANGULAR',
  2,
  40
),
(
  'b2000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000003',
  'a5000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'TRIANGULAR',
  3,
  40
);

select is(
  (
    select count(*)::int
    from public.matches
    where stage_id =
      'a6000000-0000-0000-0000-000000000001'
  ),
  3,
  'triangular contains three independent matches'
);

select is(
  (
    select count(distinct event_id)::int
    from public.matches
    where stage_id =
      'a6000000-0000-0000-0000-000000000001'
  ),
  3,
  'triangular matches use three independent events'
);

select is(
  (
    select sum(scheduled_duration_minutes)::int
    from public.matches
    where stage_id =
      'a6000000-0000-0000-0000-000000000001'
  ),
  120,
  'triangular stores duration per match'
);

-- ---------------------------------------------------------------------------
-- 4-6: HOME/AWAY and external opposition
-- ---------------------------------------------------------------------------

insert into public.match_teams (
  tenant_id,
  event_id,
  side,
  display_name
) values
(
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'HOME',
  'Marbella Rugby Club'
),
(
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'AWAY',
  'Club B'
);

select is(
  (
    select count(*)::int
    from public.match_teams
    where event_id =
      'b1000000-0000-0000-0000-000000000001'
  ),
  2,
  'match stores exactly two sides'
);

select ok(
  exists (
    select 1
    from public.match_teams
    where event_id =
      'b1000000-0000-0000-0000-000000000001'
      and side = 'AWAY'
      and team_id is null
      and organization_id is null
      and display_name = 'Club B'
  ),
  'external opponent requires no local team or organization'
);

select throws_ok(
  $$
    insert into public.match_teams (
      tenant_id,
      event_id,
      side,
      display_name
    ) values (
      'a1000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000001',
      'HOME',
      'Duplicate Home'
    )
  $$,
  '23505',
  null,
  'duplicate HOME side is rejected'
);

-- ---------------------------------------------------------------------------
-- 7: source/external id is idempotency key
-- ---------------------------------------------------------------------------

select throws_ok(
  $$
    insert into public.events (
      tenant_id,
      organization_id,
      sport_id,
      season_id,
      category_id,
      source_code,
      external_id,
      event_type,
      title,
      starts_at
    )
    select
      'a1000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      id,
      'a3000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'FAR',
      'MATCH-1',
      'MATCH',
      'Duplicate source match',
      '2099-10-10 15:00:00+00'
    from public.sports
    where code = 'RUGBY_UNION'
  $$,
  '23505',
  null,
  'duplicate FAR external event id is rejected'
);

-- ---------------------------------------------------------------------------
-- 8-10: referee can be assigned even when Marbella is not playing
-- ---------------------------------------------------------------------------

insert into public.persons (
  id,
  tenant_id,
  legacy_id,
  first_name,
  last_name
) values (
  'c1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'REF_TEST',
  'Ref',
  'Test'
);

insert into public.referee_assignments (
  tenant_id,
  event_id,
  person_id,
  role_code,
  assignment_source,
  external_id
) values (
  'a1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000001',
  'REFEREE',
  'FAR',
  'FAR-DESIGNATION-1'
);

select ok(
  exists (
    select 1
    from public.referee_assignments
    where event_id =
      'b1000000-0000-0000-0000-000000000002'
      and person_id =
        'c1000000-0000-0000-0000-000000000001'
      and assignment_source = 'FAR'
  ),
  'club referee may be assigned to match without Marbella'
);

select is(
  (
    select count(*)::int
    from public.referee_assignments
    where event_id =
      'b1000000-0000-0000-0000-000000000002'
  ),
  1,
  'referee assignment is stored independently of participating teams'
);

select throws_ok(
  $$
    insert into public.referee_assignments (
      tenant_id,
      event_id,
      person_id,
      role_code,
      assignment_source
    ) values (
      'a1000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000002',
      'c1000000-0000-0000-0000-000000000001',
      'REFEREE',
      'FAR'
    )
  $$,
  '23505',
  null,
  'same referee role cannot be duplicated for same match'
);

select * from finish();

rollback;
