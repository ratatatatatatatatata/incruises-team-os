begin;

alter table public.member_invitations
  add column if not exists sponsor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists coach_user_id uuid references auth.users(id) on delete set null,
  add column if not exists team_name text not null default 'inSuccess Team';

alter table public.member_invitations
  add constraint member_invitations_team_name_length_check
  check (length(trim(team_name)) between 1 and 80);

create index if not exists member_invitations_sponsor_user_id_idx
  on public.member_invitations (sponsor_user_id)
  where sponsor_user_id is not null;
create index if not exists member_invitations_coach_user_id_idx
  on public.member_invitations (coach_user_id)
  where coach_user_id is not null;

create table if not exists public.member_relationships (
  member_user_id uuid primary key references auth.users(id) on delete cascade,
  sponsor_user_id uuid references auth.users(id) on delete set null,
  coach_user_id uuid references auth.users(id) on delete set null,
  team_name text not null default 'inSuccess Team',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_relationships_team_name_length_check
    check (length(trim(team_name)) between 1 and 80),
  constraint member_relationships_sponsor_not_self_check
    check (sponsor_user_id is null or sponsor_user_id <> member_user_id),
  constraint member_relationships_coach_not_self_check
    check (coach_user_id is null or coach_user_id <> member_user_id)
);

create index if not exists member_relationships_sponsor_idx
  on public.member_relationships (sponsor_user_id)
  where sponsor_user_id is not null;
create index if not exists member_relationships_coach_idx
  on public.member_relationships (coach_user_id)
  where coach_user_id is not null;
create index if not exists member_relationships_team_name_idx
  on public.member_relationships (team_name);

create table if not exists public.member_success_summaries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal_30_day text not null,
  weekly_capacity text not null,
  primary_blocker text not null,
  support_needs text not null,
  today_action text not null,
  plan_source text not null check (plan_source in ('deterministic', 'ai_gateway')),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_summary text not null,
  blocker text not null default '',
  help_request text not null default '',
  next_focus text not null,
  progress_percent integer not null check (progress_percent between 0 and 100),
  needs_help boolean not null default false,
  created_at timestamptz not null default now(),
  constraint member_checkins_progress_summary_length_check
    check (length(trim(progress_summary)) between 3 and 1200),
  constraint member_checkins_blocker_length_check
    check (length(blocker) <= 1200),
  constraint member_checkins_help_request_length_check
    check (length(help_request) <= 1200),
  constraint member_checkins_next_focus_length_check
    check (length(trim(next_focus)) between 3 and 1200)
);

create index if not exists member_checkins_user_created_idx
  on public.member_checkins (user_id, created_at desc);
create index if not exists member_checkins_help_queue_idx
  on public.member_checkins (needs_help, created_at desc)
  where needs_help;

create table if not exists public.coach_notes (
  id bigint generated always as identity primary key,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  next_action text not null default '',
  visible_to_member boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coach_notes_note_length_check
    check (length(trim(note)) between 3 and 1600),
  constraint coach_notes_next_action_length_check
    check (length(next_action) <= 800),
  constraint coach_notes_author_not_member_check
    check (author_user_id <> member_user_id)
);

create index if not exists coach_notes_member_created_idx
  on public.coach_notes (member_user_id, created_at desc);
create index if not exists coach_notes_author_created_idx
  on public.coach_notes (author_user_id, created_at desc);

comment on table public.member_relationships is
  'Persistent sponsor, coach, and team assignment for each invited member.';
comment on table public.member_success_summaries is
  'Purpose-limited coaching summary derived from the private five-answer Success Map.';
comment on table public.member_checkins is
  'Append-only weekly member progress and support requests.';
comment on table public.coach_notes is
  'Append-only sponsor or coach advice with optional member visibility.';

alter table public.member_relationships enable row level security;
alter table public.member_success_summaries enable row level security;
alter table public.member_checkins enable row level security;
alter table public.coach_notes enable row level security;

create or replace function private.current_user_can_support_member(p_member_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as viewer
    left join public.member_relationships as relationship
      on relationship.member_user_id = p_member_user_id
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and (
        viewer.user_id = p_member_user_id
        or viewer.role in ('admin', 'director')
        or relationship.sponsor_user_id = viewer.user_id
        or relationship.coach_user_id = viewer.user_id
      )
  );
$$;

revoke all on function private.current_user_can_support_member(uuid)
  from public, anon, authenticated;
grant execute on function private.current_user_can_support_member(uuid)
  to authenticated;

create policy "profiles_select_supporter"
on public.user_profiles
for select
to authenticated
using ((select private.current_user_can_support_member(id)));

create policy "team_members_select_supporter"
on public.team_members
for select
to authenticated
using ((select private.current_user_can_support_member(user_id)));

create policy "member_relationships_select_authorized"
on public.member_relationships
for select
to authenticated
using ((select private.current_user_can_support_member(member_user_id)));

create policy "member_relationships_insert_admin"
on public.member_relationships
for insert
to authenticated
with check ((select private.current_user_is_team_admin()));

create policy "member_relationships_update_admin"
on public.member_relationships
for update
to authenticated
using ((select private.current_user_is_team_admin()))
with check ((select private.current_user_is_team_admin()));

create policy "member_success_summaries_select_authorized"
on public.member_success_summaries
for select
to authenticated
using ((select private.current_user_can_support_member(user_id)));

create policy "member_checkins_select_authorized"
on public.member_checkins
for select
to authenticated
using ((select private.current_user_can_support_member(user_id)));

create policy "member_checkins_insert_own"
on public.member_checkins
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

create policy "coach_notes_select_authorized"
on public.coach_notes
for select
to authenticated
using (
  (select private.current_user_can_support_member(member_user_id))
  and (
    member_user_id <> (select auth.uid())
    or visible_to_member
  )
);

create policy "coach_notes_insert_supporter"
on public.coach_notes
for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and member_user_id <> (select auth.uid())
  and (select private.current_user_can_support_member(member_user_id))
);

revoke all on table public.member_relationships from anon, authenticated;
revoke all on table public.member_success_summaries from anon, authenticated;
revoke all on table public.member_checkins from anon, authenticated;
revoke all on table public.coach_notes from anon, authenticated;

grant select on table public.member_relationships to authenticated;
grant insert (member_user_id, sponsor_user_id, coach_user_id, team_name, created_by)
  on table public.member_relationships to authenticated;
grant update (sponsor_user_id, coach_user_id, team_name, updated_at)
  on table public.member_relationships to authenticated;
grant select on table public.member_success_summaries to authenticated;
grant select on table public.member_checkins to authenticated;
grant insert (user_id, progress_summary, blocker, help_request, next_focus, progress_percent, needs_help)
  on table public.member_checkins to authenticated;
grant select on table public.coach_notes to authenticated;
grant insert (member_user_id, author_user_id, note, next_action, visible_to_member)
  on table public.coach_notes to authenticated;

revoke all on sequence public.member_checkins_id_seq from anon, authenticated;
revoke all on sequence public.coach_notes_id_seq from anon, authenticated;
grant usage, select on sequence public.member_checkins_id_seq to authenticated;
grant usage, select on sequence public.coach_notes_id_seq to authenticated;

create or replace function private.sync_invitation_relationship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.auth_user_id is null then
    return new;
  end if;

  insert into public.member_relationships (
    member_user_id,
    sponsor_user_id,
    coach_user_id,
    team_name,
    created_by,
    updated_at
  ) values (
    new.auth_user_id,
    coalesce(new.sponsor_user_id, new.invited_by),
    new.coach_user_id,
    trim(new.team_name),
    new.invited_by,
    now()
  )
  on conflict (member_user_id) do update
  set sponsor_user_id = excluded.sponsor_user_id,
      coach_user_id = excluded.coach_user_id,
      team_name = excluded.team_name,
      updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_invitation_relationship()
  from public, anon, authenticated;

create trigger member_invitations_sync_relationship
after insert or update of auth_user_id, sponsor_user_id, coach_user_id, team_name
on public.member_invitations
for each row execute function private.sync_invitation_relationship();

insert into public.member_relationships (
  member_user_id,
  sponsor_user_id,
  coach_user_id,
  team_name,
  created_by
)
select
  invitation.auth_user_id,
  coalesce(invitation.sponsor_user_id, invitation.invited_by),
  invitation.coach_user_id,
  invitation.team_name,
  invitation.invited_by
from public.member_invitations as invitation
where invitation.auth_user_id is not null
on conflict (member_user_id) do nothing;

create or replace function private.sync_member_success_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_success_summaries (
    user_id,
    goal_30_day,
    weekly_capacity,
    primary_blocker,
    support_needs,
    today_action,
    plan_source,
    updated_at
  ) values (
    new.user_id,
    new.goal_30_day,
    new.weekly_capacity,
    new.primary_blocker,
    new.growth_preferences,
    coalesce(nullif(new.plan #>> '{todayAction,title}', ''), 'Дараагийн алхмаа тодорхойлох'),
    new.plan_source,
    now()
  )
  on conflict (user_id) do update
  set goal_30_day = excluded.goal_30_day,
      weekly_capacity = excluded.weekly_capacity,
      primary_blocker = excluded.primary_blocker,
      support_needs = excluded.support_needs,
      today_action = excluded.today_action,
      plan_source = excluded.plan_source,
      updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_member_success_summary()
  from public, anon, authenticated;

create trigger member_success_maps_sync_summary
after insert or update of goal_30_day, weekly_capacity, primary_blocker, growth_preferences, plan, plan_source
on public.member_success_maps
for each row execute function private.sync_member_success_summary();

insert into public.member_success_summaries (
  user_id,
  goal_30_day,
  weekly_capacity,
  primary_blocker,
  support_needs,
  today_action,
  plan_source,
  updated_at
)
select
  success_map.user_id,
  success_map.goal_30_day,
  success_map.weekly_capacity,
  success_map.primary_blocker,
  success_map.growth_preferences,
  coalesce(nullif(success_map.plan #>> '{todayAction,title}', ''), 'Дараагийн алхмаа тодорхойлох'),
  success_map.plan_source,
  success_map.updated_at
from public.member_success_maps as success_map
on conflict (user_id) do update
set goal_30_day = excluded.goal_30_day,
    weekly_capacity = excluded.weekly_capacity,
    primary_blocker = excluded.primary_blocker,
    support_needs = excluded.support_needs,
    today_action = excluded.today_action,
    plan_source = excluded.plan_source,
    updated_at = excluded.updated_at;

commit;
