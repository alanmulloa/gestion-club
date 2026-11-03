begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(18);

-- Tables

select has_table(
  'public',
  'competitions',
  'competitions exists'
);

select has_table(
  'public',
  'competition_stages',
  'competition_stages exists'
);

select has_table(
  'public',
  'events',
  'events exists'
);

select has_table(
  'public',
  'matches',
  'matches exists'
);

select has_table(
  'public',
  'match_teams',
  'match_teams exists'
);

select has_table(
  'public',
  'referee_assignments',
  'referee_assignments exists'
);

-- RLS

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.competitions'::regclass
  ),
  'competitions RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.events'::regclass
  ),
  'events RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.matches'::regclass
  ),
  'matches RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.match_teams'::regclass
  ),
  'match teams RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid =
      'public.referee_assignments'::regclass
  ),
  'referee assignments RLS enabled'
);

-- Anonymous access

select ok(
  not exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'competitions',
        'competition_stages',
        'events',
        'matches',
        'match_teams',
        'referee_assignments'
      )
  ),
  'anon has no competition/event grants'
);

-- FAR/import uniqueness

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname =
        'events_source_external_uidx'
  ),
  'event source/external unique index exists'
);

-- Match format supports triangular

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.matches'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid)
        like '%TRIANGULAR%'
  ),
  'matches support triangular format'
);

-- External opposition supported

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_teams'
      and column_name = 'team_id'
  ),
  'external opponent does not require local team'
);

select ok(
  (
    select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'match_teams'
      and column_name = 'organization_id'
  ),
  'external opponent does not require organization'
);

-- Referee source supports FAR

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.referee_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid)
        like '%FAR%'
  ),
  'referee assignment supports FAR source'
);

-- Event external ID can be preserved

select has_column(
  'public',
  'events',
  'external_id',
  'events preserve external source id'
);

select * from finish();

rollback;
