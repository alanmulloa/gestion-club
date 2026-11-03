begin;

alter table public.membership_roles
  drop constraint if exists membership_roles_category_check;

alter table public.membership_roles
  add constraint membership_roles_category_check
  check (
    category in (
      'PLAYER',
      'COACH',
      'MANAGER',
      'REFEREE',
      'COLLABORATOR',
      'COORDINATOR',
      'REFEREE_COORDINATOR',
      'STAFF',
      'MEDICAL',
      'OTHER'
    )
  );

commit;
