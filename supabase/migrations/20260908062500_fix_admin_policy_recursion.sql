begin;

-- RLS policies on team_members must not query team_members directly, because
-- that recursively evaluates the same policy. This helper reads membership as
-- its owner and exposes only the current caller's admin boolean.
grant usage on schema private to authenticated;

create or replace function private.current_user_is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role = 'admin'
  );
$$;

revoke all on function private.current_user_is_team_admin() from public, anon, authenticated;
grant execute on function private.current_user_is_team_admin() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
create policy "profiles_select_own_or_admin"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id or (select private.current_user_is_team_admin()));

drop policy if exists "team_members_select_own_or_admin" on public.team_members;
create policy "team_members_select_own_or_admin"
on public.team_members
for select
to authenticated
using ((select auth.uid()) = user_id or (select private.current_user_is_team_admin()));

drop policy if exists "team_members_update_admin" on public.team_members;
create policy "team_members_update_admin"
on public.team_members
for update
to authenticated
using ((select private.current_user_is_team_admin()))
with check ((select private.current_user_is_team_admin()));

commit;
