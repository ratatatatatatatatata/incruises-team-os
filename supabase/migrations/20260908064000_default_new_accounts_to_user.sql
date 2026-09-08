begin;

alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles alter column role set default 'user';
alter table public.user_profiles add constraint user_profiles_role_check
  check (role in ('user', 'builder', 'coach', 'director', 'admin'));

alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members alter column role set default 'user';
alter table public.team_members add constraint team_members_role_check
  check (role in ('user', 'builder', 'coach', 'director', 'admin'));

-- Accounts created through the recently-enabled public registration flow were
-- assigned builder by the previous default. Existing admin/leadership roles
-- remain unchanged.
update public.user_profiles
set role = 'user', updated_at = now()
where role = 'builder'
  and id in (
    select id from auth.users
    where created_at >= timestamptz '2026-09-08 06:30:00+00'
  );

update public.team_members
set role = 'user', updated_at = now()
where role = 'builder'
  and user_id in (
    select id from auth.users
    where created_at >= timestamptz '2026-09-08 06:30:00+00'
  );

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
    'user'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = case when public.user_profiles.display_name = '' then excluded.display_name else public.user_profiles.display_name end,
      updated_at = now();

  insert into public.team_members (user_id, role, status)
  values (new.id, 'user', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop policy if exists "profiles_insert_active_own" on public.user_profiles;
create policy "profiles_insert_active_own"
on public.user_profiles
for insert
to authenticated
with check (
  (select auth.uid()) = id
  and role = 'user'
  and exists (
    select 1 from public.team_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  )
);

commit;
