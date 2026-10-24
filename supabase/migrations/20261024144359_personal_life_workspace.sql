begin;
set local lock_timeout = '3s';

-- Additive and owner-only. Existing maps, actions, coaching consent and roles are untouched.
create table public.personal_life_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and state->>'version' = '1' and octet_length(state::text) <= 200000),
  updated_at timestamptz not null default now()
);
create table public.personal_life_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  state jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.personal_life_workspaces enable row level security;
alter table public.personal_life_versions enable row level security;
revoke all on public.personal_life_workspaces, public.personal_life_versions from anon, authenticated;
grant select, insert, update on public.personal_life_workspaces to authenticated;
grant select, insert on public.personal_life_versions to authenticated;

create policy life_owner_read on public.personal_life_workspaces for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy life_owner_create on public.personal_life_workspaces for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy life_owner_update on public.personal_life_workspaces for update to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'))
with check (user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy life_version_read on public.personal_life_versions for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy life_version_trigger_insert on public.personal_life_versions for insert to authenticated
with check (pg_trigger_depth() > 0 and user_id = (select auth.uid()) and exists (select 1 from public.team_members m where m.user_id = (select auth.uid()) and m.status = 'active'));

create schema if not exists private;
create function private.guard_personal_life_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then raise exception 'First revision must be 1' using errcode = '22023'; end if;
  else
    if new.user_id is distinct from old.user_id or new.revision <> old.revision + 1 then
      raise exception 'Revision conflict' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create function private.snapshot_personal_life_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.personal_life_versions(user_id,revision,state) values (new.user_id,new.revision,new.state);
  return new;
end $$;
revoke all on function private.guard_personal_life_revision() from public, anon, authenticated;
revoke all on function private.snapshot_personal_life_revision() from public, anon, authenticated;
create trigger personal_life_revision_guard before insert or update on public.personal_life_workspaces for each row execute function private.guard_personal_life_revision();
create trigger personal_life_snapshot after insert or update on public.personal_life_workspaces for each row execute function private.snapshot_personal_life_revision();
comment on table public.personal_life_workspaces is 'Private personal planning, vision and style. Never included in sponsor or admin member-directory responses.';
comment on table public.personal_life_versions is 'Private append-only snapshots; each successful save is recoverable by revision.';
commit;
