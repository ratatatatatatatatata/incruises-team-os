begin;

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'builder' check (role in ('builder', 'coach', 'director', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.team_members is
  'Server-authoritative application membership. Auth identity alone does not grant Team OS access.';

do $$
declare
  v_existing_profiles integer;
begin
  select count(*) into v_existing_profiles from public.user_profiles;
  if v_existing_profiles > 1 then
    raise exception using
      errcode = 'P0001',
      message = 'Membership reconciliation required before migration: more than one existing profile found';
  end if;
end
$$;

-- Production preflight confirmed one existing profile. This preserves that
-- already-authorized operator without granting future auth users app access.
insert into public.team_members (user_id, role, status)
select profile.id, 'builder', 'active'
from public.user_profiles as profile
on conflict (user_id) do nothing;

alter table public.team_members enable row level security;

drop policy if exists "team_members_select_own" on public.team_members;
create policy "team_members_select_own"
on public.team_members
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "profiles_select_own" on public.user_profiles;
drop policy if exists "profiles_insert_own" on public.user_profiles;
drop policy if exists "profiles_update_own" on public.user_profiles;
drop policy if exists "profiles_select_active_own" on public.user_profiles;
drop policy if exists "profiles_insert_active_own" on public.user_profiles;
drop policy if exists "profiles_update_active_own" on public.user_profiles;

create policy "profiles_select_active_own"
on public.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "profiles_insert_active_own"
on public.user_profiles
for insert
to authenticated
with check (
  (select auth.uid()) = id
  and role = 'builder'
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "profiles_update_active_own"
on public.user_profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
)
with check (
  (select auth.uid()) = id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

drop policy if exists "lesson_progress_own_rows" on public.lesson_progress;
drop policy if exists "lesson_progress_select_active_own" on public.lesson_progress;
drop policy if exists "lesson_progress_insert_active_own" on public.lesson_progress;
drop policy if exists "lesson_progress_delete_active_own" on public.lesson_progress;

create policy "lesson_progress_select_active_own"
on public.lesson_progress
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "lesson_progress_insert_active_own"
on public.lesson_progress
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "lesson_progress_delete_active_own"
on public.lesson_progress
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

drop policy if exists "member_tasks_own_rows" on public.member_tasks;
drop policy if exists "member_tasks_select_active_own" on public.member_tasks;
drop policy if exists "member_tasks_insert_active_own" on public.member_tasks;
drop policy if exists "member_tasks_update_active_own" on public.member_tasks;

create policy "member_tasks_select_active_own"
on public.member_tasks
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "member_tasks_insert_active_own"
on public.member_tasks
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "member_tasks_update_active_own"
on public.member_tasks
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

revoke all on table public.user_profiles from anon, authenticated;
revoke all on table public.team_members from anon, authenticated;
revoke all on table public.lesson_progress from anon, authenticated;
revoke all on table public.content_drafts from anon, authenticated;
revoke all on table public.member_tasks from anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant insert (id, email, display_name, updated_at) on table public.user_profiles to authenticated;
grant update (email, display_name, updated_at) on table public.user_profiles to authenticated;
grant select on table public.team_members to authenticated;
grant select, delete on table public.lesson_progress to authenticated;
grant insert (user_id, lesson_id, status, score) on table public.lesson_progress to authenticated;
grant select on table public.content_drafts to authenticated;
grant insert (owner_id, title, channel, source_id, excerpt) on table public.content_drafts to authenticated;
grant select on table public.member_tasks to authenticated;
grant insert (owner_id, member_name, milestone, next_action, due_label, risk) on table public.member_tasks to authenticated;
grant update (status, updated_at) on table public.member_tasks to authenticated;

revoke all on sequence public.content_drafts_id_seq from anon, authenticated;
revoke all on sequence public.member_tasks_id_seq from anon, authenticated;
grant usage, select on sequence public.content_drafts_id_seq to authenticated;
grant usage, select on sequence public.member_tasks_id_seq to authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;
