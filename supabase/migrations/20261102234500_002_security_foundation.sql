begin;

-- -----------------------------------------------------------------------------
-- Core relationship hardening
-- -----------------------------------------------------------------------------

alter table public.organizations
  drop constraint if exists organizations_parent_organization_id_fkey;

alter table public.organizations
  add constraint organizations_parent_same_tenant_fk
  foreign key (parent_organization_id, tenant_id)
  references public.organizations(id, tenant_id)
  on delete restrict;

alter table public.categories
  add constraint categories_id_tenant_sport_key
  unique (id, tenant_id, sport_id);

alter table public.teams
  drop constraint if exists teams_category_id_tenant_id_fkey;

alter table public.teams
  add constraint teams_category_same_sport_fk
  foreign key (category_id, tenant_id, sport_id)
  references public.categories(id, tenant_id, sport_id)
  on delete restrict;

alter table public.teams
  add constraint teams_organization_sport_enabled_fk
  foreign key (organization_id, sport_id)
  references public.organization_sports(organization_id, sport_id)
  on delete restrict;

alter table public.teams
  add constraint teams_id_tenant_organization_key
  unique (id, tenant_id, organization_id);

alter table public.person_memberships
  drop constraint if exists person_memberships_team_id_tenant_id_fkey;

alter table public.person_memberships
  add constraint person_memberships_team_same_organization_fk
  foreign key (team_id, tenant_id, organization_id)
  references public.teams(id, tenant_id, organization_id)
  on delete cascade;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create trigger persons_set_updated_at
before update on public.persons
for each row execute function public.set_updated_at();

create trigger person_memberships_set_updated_at
before update on public.person_memberships
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Immutable identity / tenant scope
-- Moving an existing row between tenants must be a controlled migration,
-- never a normal browser UPDATE.
-- -----------------------------------------------------------------------------

create or replace function public.protect_scoped_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
begin
  if old_row ? 'id' and new_row ? 'id'
     and (old_row ->> 'id') is distinct from (new_row ->> 'id') then
    raise exception 'ROW_ID_IMMUTABLE';
  end if;

  if old_row ? 'tenant_id' and new_row ? 'tenant_id'
     and (old_row ->> 'tenant_id') is distinct from (new_row ->> 'tenant_id') then
    raise exception 'TENANT_SCOPE_IMMUTABLE';
  end if;

  return new;
end;
$$;

create trigger tenants_protect_identity
before update on public.tenants
for each row execute function public.protect_scoped_identity();

create trigger tenant_users_protect_scope
before update on public.tenant_users
for each row execute function public.protect_scoped_identity();

create trigger organizations_protect_scope
before update on public.organizations
for each row execute function public.protect_scoped_identity();

create trigger seasons_protect_scope
before update on public.seasons
for each row execute function public.protect_scoped_identity();

create trigger categories_protect_scope
before update on public.categories
for each row execute function public.protect_scoped_identity();

create trigger teams_protect_scope
before update on public.teams
for each row execute function public.protect_scoped_identity();

create trigger persons_protect_scope
before update on public.persons
for each row execute function public.protect_scoped_identity();

create trigger person_memberships_protect_scope
before update on public.person_memberships
for each row execute function public.protect_scoped_identity();

-- -----------------------------------------------------------------------------
-- RLS helper functions. SECURITY DEFINER avoids recursive policy evaluation.
-- They expose only booleans and never return tenant data.
-- -----------------------------------------------------------------------------

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'ACTIVE'
  );
$$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'ACTIVE'
      and tu.role_code = any (p_roles)
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'ACTIVE'
      and ou.role_code = any (p_roles)
  );
$$;

create or replace function public.can_access_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and (
        public.has_tenant_role(o.tenant_id, array['OWNER','ADMIN','MANAGER'])
        or exists (
          select 1
          from public.organization_users ou
          where ou.organization_id = o.id
            and ou.user_id = auth.uid()
            and ou.status = 'ACTIVE'
        )
      )
  );
$$;

create or replace function public.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and (
        public.has_tenant_role(o.tenant_id, array['OWNER','ADMIN'])
        or public.has_org_role(o.id, array['ORG_ADMIN'])
      )
  );
$$;

create or replace function public.can_access_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.persons p
    where p.id = p_person_id
      and (
        p.auth_user_id = auth.uid()
        or public.has_tenant_role(p.tenant_id, array['OWNER','ADMIN','MANAGER'])
        or exists (
          select 1
          from public.person_memberships pm
          join public.organization_users ou
            on ou.organization_id = pm.organization_id
          where pm.person_id = p.id
            and pm.tenant_id = p.tenant_id
            and pm.status in ('ACTIVE','PENDING')
            and ou.user_id = auth.uid()
            and ou.status = 'ACTIVE'
        )
      )
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public, anon;
revoke all on function public.has_tenant_role(uuid, text[]) from public, anon;
revoke all on function public.has_org_role(uuid, text[]) from public, anon;
revoke all on function public.can_access_organization(uuid) from public, anon;
revoke all on function public.can_manage_organization(uuid) from public, anon;
revoke all on function public.can_access_person(uuid) from public, anon;

grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.can_access_organization(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.can_access_person(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on every exposed core table.
-- -----------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_users enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.sports enable row level security;
alter table public.organization_sports enable row level security;
alter table public.seasons enable row level security;
alter table public.categories enable row level security;
alter table public.teams enable row level security;
alter table public.persons enable row level security;
alter table public.person_memberships enable row level security;

-- Anonymous callers get no direct table privileges in the foundation schema.
revoke all on table public.tenants from anon;
revoke all on table public.tenant_users from anon;
revoke all on table public.organizations from anon;
revoke all on table public.organization_users from anon;
revoke all on table public.sports from anon;
revoke all on table public.organization_sports from anon;
revoke all on table public.seasons from anon;
revoke all on table public.categories from anon;
revoke all on table public.teams from anon;
revoke all on table public.persons from anon;
revoke all on table public.person_memberships from anon;

-- Authenticated privileges are deliberately narrow; RLS is the second gate.
grant select, update on table public.tenants to authenticated;
grant select, insert, update, delete on table public.tenant_users to authenticated;
grant select, insert, update, delete on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_users to authenticated;
grant select on table public.sports to authenticated;
grant select, insert, update, delete on table public.organization_sports to authenticated;
grant select, insert, update, delete on table public.seasons to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.teams to authenticated;
grant select on table public.persons to authenticated;
grant select, insert, update, delete on table public.person_memberships to authenticated;

-- -----------------------------------------------------------------------------
-- Policies: tenants
-- -----------------------------------------------------------------------------

create policy tenants_select_member
on public.tenants for select
to authenticated
using (public.is_tenant_member(id));

create policy tenants_update_admin
on public.tenants for update
to authenticated
using (public.has_tenant_role(id, array['OWNER','ADMIN']))
with check (public.has_tenant_role(id, array['OWNER','ADMIN']));

-- -----------------------------------------------------------------------------
-- Policies: tenant users
-- -----------------------------------------------------------------------------

create policy tenant_users_select
on public.tenant_users for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
);

create policy tenant_users_insert_admin
on public.tenant_users for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

create policy tenant_users_update_admin
on public.tenant_users for update
to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']))
with check (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

create policy tenant_users_delete_admin
on public.tenant_users for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

-- -----------------------------------------------------------------------------
-- Policies: organizations and organization users
-- -----------------------------------------------------------------------------

create policy organizations_select_access
on public.organizations for select
to authenticated
using (public.can_access_organization(id));

create policy organizations_insert_tenant_admin
on public.organizations for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

create policy organizations_update_admin
on public.organizations for update
to authenticated
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

create policy organizations_delete_tenant_admin
on public.organizations for delete
to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

create policy organization_users_select
on public.organization_users for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_access_organization(organization_id)
);

create policy organization_users_insert_admin
on public.organization_users for insert
to authenticated
with check (public.can_manage_organization(organization_id));

create policy organization_users_update_admin
on public.organization_users for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy organization_users_delete_admin
on public.organization_users for delete
to authenticated
using (public.can_manage_organization(organization_id));

-- -----------------------------------------------------------------------------
-- Policies: sports and organization sports
-- -----------------------------------------------------------------------------

create policy sports_select_authenticated
on public.sports for select
to authenticated
using (true);

create policy organization_sports_select
on public.organization_sports for select
to authenticated
using (public.can_access_organization(organization_id));

create policy organization_sports_insert_admin
on public.organization_sports for insert
to authenticated
with check (public.can_manage_organization(organization_id));

create policy organization_sports_update_admin
on public.organization_sports for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy organization_sports_delete_admin
on public.organization_sports for delete
to authenticated
using (public.can_manage_organization(organization_id));

-- -----------------------------------------------------------------------------
-- Policies: seasons and categories
-- Shared catalog data inside a tenant may be read by active tenant users.
-- -----------------------------------------------------------------------------

create policy seasons_select_tenant_member
on public.seasons for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy seasons_write_tenant_admin
on public.seasons for all
to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']))
with check (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

create policy categories_select_tenant_member
on public.categories for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy categories_write_tenant_admin
on public.categories for all
to authenticated
using (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']))
with check (public.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

-- -----------------------------------------------------------------------------
-- Policies: teams
-- -----------------------------------------------------------------------------

create policy teams_select_org_access
on public.teams for select
to authenticated
using (public.can_access_organization(organization_id));

create policy teams_insert_manager
on public.teams for insert
to authenticated
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

create policy teams_update_manager
on public.teams for update
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
)
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

create policy teams_delete_manager
on public.teams for delete
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

-- -----------------------------------------------------------------------------
-- Policies: persons and memberships
-- Person creation/editing is server-mediated in the foundation phase.
-- -----------------------------------------------------------------------------

create policy persons_select_access
on public.persons for select
to authenticated
using (public.can_access_person(id));

create policy person_memberships_select
on public.person_memberships for select
to authenticated
using (
  public.can_access_person(person_id)
  or public.can_access_organization(organization_id)
);

create policy person_memberships_insert_admin
on public.person_memberships for insert
to authenticated
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

create policy person_memberships_update_admin
on public.person_memberships for update
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
)
with check (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

create policy person_memberships_delete_admin
on public.person_memberships for delete
to authenticated
using (
  public.has_tenant_role(tenant_id, array['OWNER','ADMIN'])
  or public.has_org_role(organization_id, array['ORG_ADMIN','SPORTS_DIRECTOR'])
);

commit;
