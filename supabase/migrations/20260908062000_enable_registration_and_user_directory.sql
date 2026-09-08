begin;

-- Create an application profile and an active builder membership for every
-- confirmed or newly-created Supabase Auth identity. Authorization continues
-- to use team_members; user-editable auth metadata is display data only.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.handle_new_team_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  insert into public.user_profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(v_display_name, split_part(coalesce(new.email, 'Хэрэглэгч'), '@', 1)),
    'builder'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = case
        when public.user_profiles.display_name = '' then excluded.display_name
        else public.user_profiles.display_name
      end,
      updated_at = now();

  insert into public.team_members (user_id, role, status)
  values (new.id, 'builder', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_team_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_create_team_profile on auth.users;
create trigger on_auth_user_created_create_team_profile
after insert on auth.users
for each row execute function private.handle_new_team_user();

-- Backfill any Auth identities that were created before the trigger existed.
insert into public.user_profiles (id, email, display_name, role)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
    split_part(coalesce(u.email, 'Хэрэглэгч'), '@', 1)
  ),
  'builder'
from auth.users as u
on conflict (id) do nothing;

insert into public.team_members (user_id, role, status)
select u.id, 'builder', 'active'
from auth.users as u
on conflict (user_id) do nothing;

-- Admins can see the user directory and manage membership roles/status.
drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
drop policy if exists "profiles_select_active_own" on public.user_profiles;
create policy "profiles_select_own_or_admin"
on public.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1 from public.team_members as viewer
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and viewer.role = 'admin'
  )
);

drop policy if exists "team_members_select_own" on public.team_members;
create policy "team_members_select_own_or_admin"
on public.team_members
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1 from public.team_members as viewer
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and viewer.role = 'admin'
  )
);

drop policy if exists "team_members_update_admin" on public.team_members;
create policy "team_members_update_admin"
on public.team_members
for update
to authenticated
using (
  exists (
    select 1 from public.team_members as viewer
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and viewer.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.team_members as viewer
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and viewer.role = 'admin'
  )
);

grant select on table public.user_profiles to authenticated;
grant select on table public.team_members to authenticated;
grant update (role, status, updated_at) on table public.team_members to authenticated;

commit;
