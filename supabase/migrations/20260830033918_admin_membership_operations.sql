begin;

create table if not exists public.team_membership_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_user_id uuid,
  event_type text not null check (
    event_type in ('membership_created', 'role_changed', 'status_changed', 'membership_updated')
  ),
  old_role text check (old_role is null or old_role in ('builder', 'coach', 'director', 'admin')),
  new_role text not null check (new_role in ('builder', 'coach', 'director', 'admin')),
  old_status text check (old_status is null or old_status in ('active', 'disabled')),
  new_status text not null check (new_status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

comment on table public.team_membership_audit_events is
  'Immutable audit trail for membership creation, role changes, activation, and suspension.';

create index if not exists idx_team_membership_audit_target_created
  on public.team_membership_audit_events(target_user_id, created_at desc);
create index if not exists idx_team_membership_audit_actor_created
  on public.team_membership_audit_events(actor_id, created_at desc);

alter table public.team_membership_audit_events enable row level security;

create or replace function private.admin_register_invited_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  -- Serialize membership administration so the safety checks below cannot race.
  perform pg_catalog.pg_advisory_xact_lock(92131457);

  select role
  into v_actor_role
  from public.team_members
  where user_id = v_actor
    and status = 'active'
  for update;

  if v_actor_role is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Active admin role required';
  end if;
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'Auth user not found';
  end if;
  if exists (
    select 1 from public.team_members where user_id = p_user_id
  ) then
    raise exception using errcode = '23505', message = 'Membership already exists';
  end if;

  -- New identities never receive workspace access automatically.
  insert into public.team_members (user_id, role, status)
  values (p_user_id, 'builder', 'disabled');

  insert into public.team_membership_audit_events (
    actor_id,
    target_user_id,
    event_type,
    new_role,
    new_status
  )
  values (v_actor, p_user_id, 'membership_created', 'builder', 'disabled');
end;
$$;

create or replace function private.admin_update_team_member(
  p_user_id uuid,
  p_role text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_old_role text;
  v_old_status text;
  v_event_type text;
  v_active_admin_count integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_role is null or p_role not in ('builder', 'coach', 'director', 'admin') then
    raise exception using errcode = '22023', message = 'Invalid team role';
  end if;
  if p_status is null or p_status not in ('active', 'disabled') then
    raise exception using errcode = '22023', message = 'Invalid membership status';
  end if;

  -- All calls to the audited membership RPCs use the same transaction lock.
  perform pg_catalog.pg_advisory_xact_lock(92131457);

  select role
  into v_actor_role
  from public.team_members
  where user_id = v_actor
    and status = 'active'
  for update;

  if v_actor_role is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Active admin role required';
  end if;

  select role, status
  into v_old_role, v_old_status
  from public.team_members
  where user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Membership not found';
  end if;

  -- An admin cannot remove their own current access, even when another admin exists.
  if p_user_id = v_actor and (p_role <> 'admin' or p_status <> 'active') then
    raise exception using errcode = '42501', message = 'An admin cannot demote or disable their own membership';
  end if;

  if v_old_role = 'admin'
     and v_old_status = 'active'
     and (p_role <> 'admin' or p_status <> 'active') then
    select count(*)
    into v_active_admin_count
    from public.team_members
    where role = 'admin'
      and status = 'active';

    if v_active_admin_count <= 1 then
      raise exception using errcode = '42501', message = 'At least one active admin must remain';
    end if;
  end if;

  if v_old_role = p_role and v_old_status = p_status then
    return;
  end if;

  v_event_type := case
    when v_old_role <> p_role and v_old_status <> p_status then 'membership_updated'
    when v_old_role <> p_role then 'role_changed'
    else 'status_changed'
  end;

  update public.team_members
  set role = p_role,
      status = p_status,
      updated_at = now()
  where user_id = p_user_id;

  -- user_profiles.role is display metadata only; keep an existing row in sync.
  update public.user_profiles
  set role = p_role,
      updated_at = now()
  where id = p_user_id;

  insert into public.team_membership_audit_events (
    actor_id,
    target_user_id,
    event_type,
    old_role,
    new_role,
    old_status,
    new_status
  )
  values (
    v_actor,
    p_user_id,
    v_event_type,
    v_old_role,
    p_role,
    v_old_status,
    p_status
  );
end;
$$;

create or replace function public.admin_register_invited_member(p_user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as 'select private.admin_register_invited_member($1)';

create or replace function public.admin_update_team_member(
  p_user_id uuid,
  p_role text,
  p_status text
)
returns void
language sql
security invoker
set search_path = ''
as 'select private.admin_update_team_member($1, $2, $3)';

revoke all on table public.team_membership_audit_events from public, anon, authenticated;
revoke all on sequence public.team_membership_audit_events_id_seq from public, anon, authenticated;

revoke all on function public.admin_register_invited_member(uuid) from public, anon, authenticated;
revoke all on function public.admin_update_team_member(uuid, text, text) from public, anon, authenticated;
revoke all on function private.admin_register_invited_member(uuid) from public, anon, authenticated;
revoke all on function private.admin_update_team_member(uuid, text, text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function public.admin_register_invited_member(uuid) to authenticated;
grant execute on function public.admin_update_team_member(uuid, text, text) to authenticated;
grant execute on function private.admin_register_invited_member(uuid) to authenticated;
grant execute on function private.admin_update_team_member(uuid, text, text) to authenticated;

commit;
