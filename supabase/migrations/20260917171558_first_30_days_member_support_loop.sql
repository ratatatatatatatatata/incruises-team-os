begin;

alter table public.member_success_maps
  add column if not exists support_summary_consent boolean not null default true;

alter table public.member_success_summaries
  add column if not exists sharing_enabled boolean not null default true,
  add column if not exists summary_version integer not null default 1,
  add column if not exists provenance jsonb not null default '{"goal30Day":"member_report","weeklyCapacity":"member_report","primaryBlocker":"member_report","supportNeeds":"member_report","todayAction":"plan_output"}'::jsonb;

alter table public.coach_notes
  add column if not exists support_request_id uuid;

create table if not exists public.member_success_map_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  current_context text not null,
  goal_30_day text not null,
  weekly_capacity text not null,
  primary_blocker text not null,
  growth_preferences text not null,
  plan jsonb not null,
  plan_source text not null check (plan_source in ('deterministic', 'ai_gateway')),
  ai_consent boolean not null default false,
  support_summary_consent boolean not null default true,
  created_at timestamptz not null default now(),
  constraint member_success_map_versions_unique unique (user_id, plan_version),
  constraint member_success_map_versions_plan_shape_check check (
    jsonb_typeof(plan) = 'object' and octet_length(plan::text) <= 32768
  )
);

create index if not exists member_success_map_versions_user_created_idx
  on public.member_success_map_versions (user_id, created_at desc);

create table if not exists public.member_actions (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  plan_version integer not null check (plan_version > 0),
  sequence_no integer not null default 1 check (sequence_no > 0),
  title text not null,
  detail text not null,
  done_when text not null,
  minutes integer not null check (minutes between 5 and 480),
  capacity_minutes integer not null check (capacity_minutes between 5 and 480),
  resource_lesson_id text references public.academy_lessons(id) on delete set null,
  source text not null default 'starter_plan'
    check (source in ('starter_plan', 'ai', 'member', 'leader', 'academy')),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'started', 'done', 'blocked', 'paused', 'superseded')),
  blocked_reason text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_actions_title_length_check check (length(trim(title)) between 3 and 160),
  constraint member_actions_detail_length_check check (length(trim(detail)) between 3 and 1600),
  constraint member_actions_done_when_length_check check (length(trim(done_when)) between 3 and 600),
  constraint member_actions_blocked_reason_length_check check (length(blocked_reason) <= 1200),
  constraint member_actions_time_within_capacity_check check (minutes <= capacity_minutes)
);

create unique index if not exists member_actions_one_active_idx
  on public.member_actions (member_user_id)
  where status not in ('done', 'superseded');
create index if not exists member_actions_member_updated_idx
  on public.member_actions (member_user_id, updated_at desc);
create index if not exists member_actions_resource_lesson_idx
  on public.member_actions (resource_lesson_id)
  where resource_lesson_id is not null;

create table if not exists public.member_action_events (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.member_actions(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('proposed', 'status_changed', 'time_changed')),
  from_status text,
  to_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists member_action_events_action_created_idx
  on public.member_action_events (action_id, created_at);
create index if not exists member_action_events_member_created_idx
  on public.member_action_events (member_user_id, created_at desc);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.member_actions(id) on delete cascade,
  checkin_id bigint references public.member_checkins(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  request_type text not null
    check (request_type in ('not_understood', 'cannot_start', 'insufficient_time', 'needs_practice', 'needs_person', 'other')),
  request_text text not null,
  status text not null default 'assigned'
    check (status in ('unassigned', 'assigned', 'acknowledged', 'in_progress', 'resolved', 'member_confirmed', 'closed')),
  resolution_note text not null default '',
  outcome_helpful boolean,
  next_check_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_request_text_length_check check (length(trim(request_text)) between 3 and 1200),
  constraint support_requests_resolution_note_length_check check (length(resolution_note) <= 1600),
  constraint support_requests_assignee_not_member_check check (assigned_to is null or assigned_to <> member_user_id),
  constraint support_requests_id_member_unique unique (id, member_user_id)
);

create unique index if not exists support_requests_one_open_per_action_idx
  on public.support_requests (action_id)
  where status not in ('member_confirmed', 'closed');
create index if not exists support_requests_member_created_idx
  on public.support_requests (member_user_id, created_at desc);
create index if not exists support_requests_assigned_queue_idx
  on public.support_requests (assigned_to, status, next_check_at, created_at)
  where status not in ('member_confirmed', 'closed');

alter table public.coach_notes
  add constraint coach_notes_support_request_id_fkey
  foreign key (support_request_id, member_user_id)
  references public.support_requests(id, member_user_id) on delete set null (support_request_id);

create index if not exists coach_notes_support_request_idx
  on public.coach_notes (support_request_id)
  where support_request_id is not null;

create table if not exists public.support_request_events (
  id bigint generated always as identity primary key,
  support_request_id uuid not null references public.support_requests(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  from_status text,
  to_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_request_events_request_created_idx
  on public.support_request_events (support_request_id, created_at);
create index if not exists support_request_events_member_created_idx
  on public.support_request_events (member_user_id, created_at desc);

create table if not exists public.member_academy_practices (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null unique references public.member_actions(id) on delete cascade,
  lesson_id text not null references public.academy_lessons(id) on delete restrict,
  prompt text not null,
  submission text not null default '',
  status text not null default 'assigned'
    check (status in ('assigned', 'submitted', 'reviewed')),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  feedback text not null default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_academy_practices_prompt_length_check check (length(trim(prompt)) between 3 and 800),
  constraint member_academy_practices_submission_length_check check (length(submission) <= 2400),
  constraint member_academy_practices_feedback_length_check check (length(feedback) <= 1600)
);

create index if not exists member_academy_practices_member_status_idx
  on public.member_academy_practices (member_user_id, status, updated_at desc);
create index if not exists member_academy_practices_lesson_idx
  on public.member_academy_practices (lesson_id);
create index if not exists member_academy_practices_reviewer_idx
  on public.member_academy_practices (reviewer_user_id)
  where reviewer_user_id is not null;

create table if not exists public.member_development_evidence (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  source_practice_id uuid not null unique references public.member_academy_practices(id) on delete restrict,
  competency_label text not null,
  evidence_status text not null default 'verified' check (evidence_status in ('verified', 'superseded')),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint member_development_evidence_label_length_check check (length(trim(competency_label)) between 3 and 160)
);

create index if not exists member_development_evidence_member_idx
  on public.member_development_evidence (member_user_id, reviewed_at desc);
create index if not exists member_development_evidence_reviewer_idx
  on public.member_development_evidence (reviewed_by, reviewed_at desc);

create table if not exists public.external_rank_claims (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references auth.users(id) on delete cascade,
  claimed_label text not null,
  source_kind text not null
    check (source_kind in ('official_back_office', 'official_document', 'other_official')),
  evidence_reference text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'conflict', 'expired')),
  effective_from date,
  effective_to date,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_rank_claims_label_length_check check (length(trim(claimed_label)) between 2 and 120),
  constraint external_rank_claims_reference_length_check check (length(trim(evidence_reference)) between 3 and 500),
  constraint external_rank_claims_review_note_length_check check (length(review_note) <= 1200),
  constraint external_rank_claims_effective_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists external_rank_claims_member_created_idx
  on public.external_rank_claims (member_user_id, created_at desc);
create index if not exists external_rank_claims_status_created_idx
  on public.external_rank_claims (status, created_at desc);
create index if not exists external_rank_claims_submitted_by_idx
  on public.external_rank_claims (submitted_by);
create index if not exists external_rank_claims_reviewed_by_idx
  on public.external_rank_claims (reviewed_by)
  where reviewed_by is not null;

comment on table public.member_success_map_versions is
  'Append-only private snapshots of every five-answer plan version.';
comment on table public.member_actions is
  'One-at-a-time member actions with explicit time budget and completion criteria.';
comment on table public.member_action_events is
  'Append-only audit history for member action state and time changes.';
comment on table public.support_requests is
  'Purpose-limited help cases routed to the direct sponsor or assigned coach.';
comment on table public.member_academy_practices is
  'One practical exercise linking an Academy lesson to a member action.';
comment on table public.member_development_evidence is
  'Reviewed practice evidence; it never grants application access by itself.';
comment on table public.external_rank_claims is
  'Non-authorizing external rank evidence. Rank claims never grant access directly.';

alter table public.member_success_map_versions enable row level security;
alter table public.member_actions enable row level security;
alter table public.member_action_events enable row level security;
alter table public.support_requests enable row level security;
alter table public.support_request_events enable row level security;
alter table public.member_academy_practices enable row level security;
alter table public.member_development_evidence enable row level security;
alter table public.external_rank_claims enable row level security;

create or replace function private.current_user_is_direct_supporter(p_member_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members as viewer
    join public.member_relationships as relationship
      on relationship.member_user_id = p_member_user_id
    where viewer.user_id = (select auth.uid())
      and viewer.status = 'active'
      and (
        relationship.sponsor_user_id = viewer.user_id
        or relationship.coach_user_id = viewer.user_id
      )
  );
$$;

create or replace function private.current_user_can_access_support_record(p_member_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = p_member_user_id
    or (select private.current_user_is_team_admin())
    or (
      (select private.current_user_is_direct_supporter(p_member_user_id))
      and coalesce((
        select summary.sharing_enabled
        from public.member_success_summaries as summary
        where summary.user_id = p_member_user_id
      ), false)
    );
$$;

create or replace function private.current_user_can_access_support_request(
  p_support_request_id uuid,
  p_member_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = p_member_user_id
    or (select private.current_user_is_team_admin())
    or exists (
      select 1
      from public.support_requests as request
      where request.id = p_support_request_id
        and request.member_user_id = p_member_user_id
        and request.assigned_to = (select auth.uid())
    );
$$;

revoke all on function private.current_user_is_direct_supporter(uuid) from public, anon, authenticated;
revoke all on function private.current_user_can_access_support_record(uuid) from public, anon, authenticated;
revoke all on function private.current_user_can_access_support_request(uuid, uuid) from public, anon, authenticated;
grant execute on function private.current_user_is_direct_supporter(uuid) to authenticated;
grant execute on function private.current_user_can_access_support_record(uuid) to authenticated;
grant execute on function private.current_user_can_access_support_request(uuid, uuid) to authenticated;

create policy "member_success_map_versions_select_own"
on public.member_success_map_versions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "member_actions_select_authorized"
on public.member_actions for select to authenticated
using ((select private.current_user_can_access_support_record(member_user_id)));

create policy "member_action_events_select_authorized"
on public.member_action_events for select to authenticated
using ((select private.current_user_can_access_support_record(member_user_id)));

create policy "support_requests_select_authorized"
on public.support_requests for select to authenticated
using ((select private.current_user_can_access_support_request(id, member_user_id)));

create policy "support_request_events_select_authorized"
on public.support_request_events for select to authenticated
using ((select private.current_user_can_access_support_request(support_request_id, member_user_id)));

create policy "member_academy_practices_select_authorized"
on public.member_academy_practices for select to authenticated
using ((select private.current_user_can_access_support_record(member_user_id)));

create policy "member_development_evidence_select_authorized"
on public.member_development_evidence for select to authenticated
using ((select private.current_user_can_access_support_record(member_user_id)));

create policy "external_rank_claims_select_own_or_admin"
on public.external_rank_claims for select to authenticated
using (
  (select auth.uid()) = member_user_id
  or (select private.current_user_is_team_admin())
);

create policy "external_rank_claims_insert_admin"
on public.external_rank_claims for insert to authenticated
with check (
  (select private.current_user_is_team_admin())
  and submitted_by = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

create policy "member_success_summaries_sharing_gate"
on public.member_success_summaries
as restrictive
for select to authenticated
using ((select auth.uid()) = user_id or sharing_enabled);

revoke all on table public.member_success_map_versions from anon, authenticated;
revoke all on table public.member_actions from anon, authenticated;
revoke all on table public.member_action_events from anon, authenticated;
revoke all on table public.support_requests from anon, authenticated;
revoke all on table public.support_request_events from anon, authenticated;
revoke all on table public.member_academy_practices from anon, authenticated;
revoke all on table public.member_development_evidence from anon, authenticated;
revoke all on table public.external_rank_claims from anon, authenticated;

grant select on table public.member_success_map_versions to authenticated;
grant select on table public.member_actions to authenticated;
grant select on table public.member_action_events to authenticated;
grant select on table public.support_requests to authenticated;
grant select on table public.support_request_events to authenticated;
grant select on table public.member_academy_practices to authenticated;
grant select on table public.member_development_evidence to authenticated;
grant select on table public.external_rank_claims to authenticated;
grant insert (member_user_id, claimed_label, source_kind, evidence_reference, status, effective_from, effective_to, submitted_by)
  on table public.external_rank_claims to authenticated;
grant insert (member_user_id, author_user_id, note, next_action, visible_to_member, support_request_id)
  on table public.coach_notes to authenticated;

revoke all on sequence public.member_success_map_versions_id_seq from anon, authenticated;
revoke all on sequence public.member_action_events_id_seq from anon, authenticated;
revoke all on sequence public.support_request_events_id_seq from anon, authenticated;
grant usage, select on sequence public.member_success_map_versions_id_seq to authenticated;

create or replace function private.log_member_action_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.member_action_events (
      action_id, member_user_id, actor_user_id, event_type, from_status, to_status, metadata
    ) values (
      new.id, new.member_user_id, auth.uid(), 'proposed', null, new.status,
      jsonb_build_object('sequenceNo', new.sequence_no, 'planVersion', new.plan_version)
    );
  elsif old.status is distinct from new.status then
    insert into public.member_action_events (
      action_id, member_user_id, actor_user_id, event_type, from_status, to_status, metadata
    ) values (
      new.id, new.member_user_id, auth.uid(), 'status_changed', old.status, new.status,
      jsonb_build_object('blockedReason', new.blocked_reason)
    );
  elsif old.minutes is distinct from new.minutes then
    insert into public.member_action_events (
      action_id, member_user_id, actor_user_id, event_type, from_status, to_status, metadata
    ) values (
      new.id, new.member_user_id, auth.uid(), 'time_changed', old.status, new.status,
      jsonb_build_object('fromMinutes', old.minutes, 'toMinutes', new.minutes)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.log_member_action_event() from public, anon, authenticated;

create trigger member_actions_log_event
after insert or update of status, minutes on public.member_actions
for each row execute function private.log_member_action_event();

create or replace function private.log_support_request_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.support_request_events (
      support_request_id, member_user_id, actor_user_id, from_status, to_status, metadata
    ) values (
      new.id,
      new.member_user_id,
      auth.uid(),
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      jsonb_build_object('assignedTo', new.assigned_to, 'outcomeHelpful', new.outcome_helpful)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.log_support_request_event() from public, anon, authenticated;

create trigger support_requests_log_event
after insert or update of status on public.support_requests
for each row execute function private.log_support_request_event();

create or replace function private.capture_success_map_version_and_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_id uuid;
  v_lesson_id text := nullif(new.plan #>> '{academyRecommendation,lessonId}', '');
  v_minutes integer := greatest(5, least(480, coalesce((new.plan #>> '{todayAction,minutes}')::integer, 15)));
begin
  insert into public.member_success_map_versions (
    user_id, plan_version, current_context, goal_30_day, weekly_capacity,
    primary_blocker, growth_preferences, plan, plan_source, ai_consent,
    support_summary_consent, created_at
  ) values (
    new.user_id, new.plan_version, new.current_context, new.goal_30_day, new.weekly_capacity,
    new.primary_blocker, new.growth_preferences, new.plan, new.plan_source, new.ai_consent,
    new.support_summary_consent, now()
  ) on conflict (user_id, plan_version) do nothing;

  update public.member_actions
  set status = 'superseded', updated_at = now()
  where member_user_id = new.user_id
    and status not in ('done', 'superseded');

  insert into public.member_actions (
    member_user_id, plan_version, sequence_no, title, detail, done_when,
    minutes, capacity_minutes, resource_lesson_id, source
  ) values (
    new.user_id,
    new.plan_version,
    1,
    coalesce(nullif(new.plan #>> '{todayAction,title}', ''), 'Эхний жижиг ажлаа хийх'),
    coalesce(nullif(new.plan #>> '{todayAction,detail}', ''), 'Өөрийн зорилготой холбоотой нэг жижиг алхмыг хийгээд үр дүнгээ тэмдэглэ.'),
    coalesce(nullif(new.plan #>> '{todayAction,doneWhen}', ''), 'Ажлыг хийж, гарсан үр дүнгээ тэмдэглэсэн байна.'),
    v_minutes,
    v_minutes,
    v_lesson_id,
    case when new.plan_source = 'ai_gateway' then 'ai' else 'starter_plan' end
  ) returning id into v_action_id;

  if v_lesson_id is not null then
    insert into public.member_academy_practices (
      member_user_id, action_id, lesson_id, prompt
    ) values (
      new.user_id,
      v_action_id,
      v_lesson_id,
      'Хичээлээс авсан нэг санаагаа энэ ажил дээр туршаад юу хийсэн, ямар үр дүн гарсныг 2–3 өгүүлбэрээр бич.'
    ) on conflict (action_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_success_map_version_and_action() from public, anon, authenticated;

create trigger member_success_maps_capture_version_and_action
after insert or update of plan, plan_version on public.member_success_maps
for each row execute function private.capture_success_map_version_and_action();

create or replace function private.sync_member_success_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.member_success_summaries (
    user_id, goal_30_day, weekly_capacity, primary_blocker, support_needs,
    today_action, plan_source, sharing_enabled, summary_version, provenance, updated_at
  ) values (
    new.user_id,
    new.goal_30_day,
    new.weekly_capacity,
    new.primary_blocker,
    new.growth_preferences,
    coalesce(nullif(new.plan #>> '{todayAction,title}', ''), 'Дараагийн алхмаа тодорхойлох'),
    new.plan_source,
    new.support_summary_consent,
    new.plan_version,
    jsonb_build_object(
      'goal30Day', 'member_report',
      'weeklyCapacity', 'member_report',
      'primaryBlocker', 'member_report',
      'supportNeeds', 'member_report',
      'todayAction', case when new.plan_source = 'ai_gateway' then 'ai_inference' else 'plan_output' end
    ),
    now()
  )
  on conflict (user_id) do update
  set goal_30_day = excluded.goal_30_day,
      weekly_capacity = excluded.weekly_capacity,
      primary_blocker = excluded.primary_blocker,
      support_needs = excluded.support_needs,
      today_action = excluded.today_action,
      plan_source = excluded.plan_source,
      sharing_enabled = excluded.sharing_enabled,
      summary_version = excluded.summary_version,
      provenance = excluded.provenance,
      updated_at = now();

  return new;
end;
$$;

create or replace function private.complete_starter_success_map_v2(
  p_current_context text,
  p_goal_30_day text,
  p_weekly_capacity text,
  p_primary_blocker text,
  p_growth_preferences text,
  p_plan jsonb,
  p_plan_source text,
  p_ai_consent boolean,
  p_support_summary_consent boolean,
  p_ai_model text default null
)
returns public.member_success_maps
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.member_success_maps%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not exists (
    select 1 from public.team_members as member
    where member.user_id = v_user_id and member.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;
  if length(trim(coalesce(p_current_context, ''))) not between 10 and 1600
     or length(trim(coalesce(p_goal_30_day, ''))) not between 10 and 1600
     or length(trim(coalesce(p_weekly_capacity, ''))) not between 3 and 800
     or length(trim(coalesce(p_primary_blocker, ''))) not between 10 and 1600
     or length(trim(coalesce(p_growth_preferences, ''))) not between 10 and 1600 then
    raise exception using errcode = '22023', message = 'Five onboarding answers are required';
  end if;
  if p_plan_source not in ('deterministic', 'ai_gateway')
     or jsonb_typeof(p_plan) <> 'object'
     or octet_length(p_plan::text) > 32768
     or (p_plan_source = 'ai_gateway' and (not p_ai_consent or nullif(trim(coalesce(p_ai_model, '')), '') is null))
     or (p_plan_source = 'deterministic' and p_ai_model is not null) then
    raise exception using errcode = '22023', message = 'Invalid plan payload';
  end if;

  insert into public.member_success_maps (
    user_id, current_context, goal_30_day, weekly_capacity, primary_blocker,
    growth_preferences, plan, plan_source, ai_consent, support_summary_consent,
    ai_model, completed_at, updated_at
  ) values (
    v_user_id, trim(p_current_context), trim(p_goal_30_day), trim(p_weekly_capacity),
    trim(p_primary_blocker), trim(p_growth_preferences), p_plan, p_plan_source,
    p_ai_consent, p_support_summary_consent, p_ai_model, now(), now()
  )
  on conflict (user_id) do update
  set current_context = excluded.current_context,
      goal_30_day = excluded.goal_30_day,
      weekly_capacity = excluded.weekly_capacity,
      primary_blocker = excluded.primary_blocker,
      growth_preferences = excluded.growth_preferences,
      plan = excluded.plan,
      plan_source = excluded.plan_source,
      plan_version = public.member_success_maps.plan_version + 1,
      ai_consent = excluded.ai_consent,
      support_summary_consent = excluded.support_summary_consent,
      ai_model = excluded.ai_model,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  returning * into v_result;

  update public.team_members
  set onboarding_required = false, updated_at = now()
  where user_id = v_user_id;

  update public.member_invitations
  set status = 'accepted', accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where auth_user_id = v_user_id
    and status in ('pending', 'sent', 'provisioned');

  return v_result;
end;
$$;

create or replace function public.complete_starter_success_map_v2(
  p_current_context text,
  p_goal_30_day text,
  p_weekly_capacity text,
  p_primary_blocker text,
  p_growth_preferences text,
  p_plan jsonb,
  p_plan_source text,
  p_ai_consent boolean,
  p_support_summary_consent boolean,
  p_ai_model text default null
)
returns public.member_success_maps
language sql
security invoker
set search_path = ''
as $$
  select private.complete_starter_success_map_v2(
    p_current_context, p_goal_30_day, p_weekly_capacity, p_primary_blocker,
    p_growth_preferences, p_plan, p_plan_source, p_ai_consent,
    p_support_summary_consent, p_ai_model
  );
$$;

revoke all on function private.complete_starter_success_map_v2(text, text, text, text, text, jsonb, text, boolean, boolean, text)
  from public, anon, authenticated;
revoke all on function public.complete_starter_success_map_v2(text, text, text, text, text, jsonb, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function private.complete_starter_success_map_v2(text, text, text, text, text, jsonb, text, boolean, boolean, text)
  to authenticated;
grant execute on function public.complete_starter_success_map_v2(text, text, text, text, text, jsonb, text, boolean, boolean, text)
  to authenticated;

create or replace function private.transition_my_member_action(
  p_action_id uuid,
  p_next_status text,
  p_blocked_reason text default '',
  p_request_type text default null,
  p_request_text text default ''
)
returns public.member_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.member_actions%rowtype;
  v_result public.member_actions%rowtype;
  v_assigned_to uuid;
  v_next jsonb;
begin
  select * into v_action
  from public.member_actions
  where id = p_action_id and member_user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Action not found';
  end if;
  if not (
    (v_action.status = 'proposed' and p_next_status in ('accepted', 'started', 'done', 'blocked', 'paused', 'superseded'))
    or (v_action.status = 'accepted' and p_next_status in ('started', 'done', 'blocked', 'paused', 'superseded'))
    or (v_action.status = 'started' and p_next_status in ('done', 'blocked', 'paused', 'superseded'))
    or (v_action.status = 'blocked' and p_next_status in ('started', 'paused', 'superseded'))
    or (v_action.status = 'paused' and p_next_status in ('accepted', 'started', 'superseded'))
  ) then
    raise exception using errcode = '22023', message = 'Invalid action transition';
  end if;
  if p_next_status = 'blocked' and length(trim(coalesce(p_blocked_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Blocked reason required';
  end if;

  update public.member_actions
  set status = p_next_status,
      blocked_reason = case when p_next_status = 'blocked' then left(trim(p_blocked_reason), 1200) else '' end,
      completed_at = case when p_next_status = 'done' then now() else null end,
      updated_at = now()
  where id = v_action.id
  returning * into v_result;

  if p_next_status = 'blocked'
     and p_request_type in ('not_understood', 'cannot_start', 'insufficient_time', 'needs_practice', 'needs_person', 'other')
     and length(trim(coalesce(p_request_text, ''))) >= 3 then
    select case
      when sponsor.status = 'active' then relationship.sponsor_user_id
      when coach.status = 'active' then relationship.coach_user_id
      else null
    end
      into v_assigned_to
    from public.member_relationships as relationship
    left join public.team_members as sponsor
      on sponsor.user_id = relationship.sponsor_user_id
    left join public.team_members as coach
      on coach.user_id = relationship.coach_user_id
    where relationship.member_user_id = v_user_id;

    if not exists (
      select 1 from public.support_requests as request
      where request.action_id = v_action.id
        and request.status not in ('member_confirmed', 'closed')
    ) then
      insert into public.support_requests (
        member_user_id, action_id, assigned_to, request_type, request_text,
        status, next_check_at
      ) values (
        v_user_id,
        v_action.id,
        v_assigned_to,
        p_request_type,
        left(trim(p_request_text), 1200),
        case when v_assigned_to is null then 'unassigned' else 'assigned' end,
        now() + interval '1 day'
      );
    end if;
  end if;

  if p_next_status = 'done' then
    select success_map.plan #> array['weeklyActions', v_action.sequence_no::text]
      into v_next
    from public.member_success_maps as success_map
    where success_map.user_id = v_user_id;

    if v_next is not null and jsonb_typeof(v_next) = 'object' then
      insert into public.member_actions (
        member_user_id, plan_version, sequence_no, title, detail, done_when,
        minutes, capacity_minutes, source
      ) values (
        v_user_id,
        v_action.plan_version,
        v_action.sequence_no + 1,
        coalesce(nullif(v_next ->> 'title', ''), 'Дараагийн жижиг алхам'),
        coalesce(nullif(v_next ->> 'detail', ''), 'Дараагийн ажлаа хийж үр дүнгээ тэмдэглэ.'),
        coalesce(nullif(v_next ->> 'doneWhen', ''), 'Ажлыг хийж, үр дүнгээ тэмдэглэсэн байна.'),
        v_action.minutes,
        v_action.capacity_minutes,
        'starter_plan'
      );
    end if;
  end if;

  return v_result;
end;
$$;

create or replace function public.transition_my_member_action(
  p_action_id uuid,
  p_next_status text,
  p_blocked_reason text default '',
  p_request_type text default null,
  p_request_text text default ''
)
returns public.member_actions
language sql
security invoker
set search_path = ''
as $$
  select private.transition_my_member_action(
    p_action_id, p_next_status, p_blocked_reason, p_request_type, p_request_text
  );
$$;

create or replace function private.change_my_member_action_time(p_action_id uuid, p_minutes integer)
returns public.member_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.member_actions%rowtype;
begin
  update public.member_actions
  set minutes = p_minutes, updated_at = now()
  where id = p_action_id
    and member_user_id = v_user_id
    and status not in ('done', 'superseded')
    and p_minutes between 5 and capacity_minutes
  returning * into v_result;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid action time';
  end if;
  return v_result;
end;
$$;

create or replace function public.change_my_member_action_time(p_action_id uuid, p_minutes integer)
returns public.member_actions
language sql
security invoker
set search_path = ''
as $$ select private.change_my_member_action_time(p_action_id, p_minutes); $$;

create or replace function private.advance_assigned_support_request(
  p_support_request_id uuid,
  p_next_status text,
  p_resolution_note text default '',
  p_next_check_at timestamptz default null
)
returns public.support_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.support_requests%rowtype;
  v_result public.support_requests%rowtype;
begin
  select * into v_request
  from public.support_requests
  where id = p_support_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support request not found';
  end if;
  if not (v_request.assigned_to = v_user_id or (select private.current_user_is_team_admin())) then
    raise exception using errcode = '42501', message = 'Assigned supporter required';
  end if;
  if not (
    (v_request.status in ('unassigned', 'assigned') and p_next_status in ('acknowledged', 'in_progress'))
    or (v_request.status = 'acknowledged' and p_next_status in ('in_progress', 'resolved'))
    or (v_request.status = 'in_progress' and p_next_status = 'resolved')
  ) then
    raise exception using errcode = '22023', message = 'Invalid support transition';
  end if;
  if p_next_status = 'resolved' and length(trim(coalesce(p_resolution_note, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Resolution note required';
  end if;

  update public.support_requests
  set status = p_next_status,
      resolution_note = case when p_next_status = 'resolved' then left(trim(p_resolution_note), 1600) else resolution_note end,
      next_check_at = p_next_check_at,
      acknowledged_at = case when p_next_status = 'acknowledged' then coalesce(acknowledged_at, now()) else acknowledged_at end,
      resolved_at = case when p_next_status = 'resolved' then now() else resolved_at end,
      updated_at = now()
  where id = v_request.id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.advance_assigned_support_request(
  p_support_request_id uuid,
  p_next_status text,
  p_resolution_note text default '',
  p_next_check_at timestamptz default null
)
returns public.support_requests
language sql
security invoker
set search_path = ''
as $$
  select private.advance_assigned_support_request(
    p_support_request_id, p_next_status, p_resolution_note, p_next_check_at
  );
$$;

create or replace function private.confirm_my_support_request(p_support_request_id uuid, p_helpful boolean)
returns public.support_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.support_requests%rowtype;
begin
  update public.support_requests
  set status = 'member_confirmed', outcome_helpful = p_helpful,
      confirmed_at = now(), updated_at = now()
  where id = p_support_request_id
    and member_user_id = v_user_id
    and status = 'resolved'
  returning * into v_result;
  if not found then
    raise exception using errcode = '22023', message = 'Resolved support request required';
  end if;
  return v_result;
end;
$$;

create or replace function public.confirm_my_support_request(p_support_request_id uuid, p_helpful boolean)
returns public.support_requests
language sql
security invoker
set search_path = ''
as $$ select private.confirm_my_support_request(p_support_request_id, p_helpful); $$;

create or replace function private.submit_my_academy_practice(p_practice_id uuid, p_submission text)
returns public.member_academy_practices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.member_academy_practices%rowtype;
begin
  if length(trim(coalesce(p_submission, ''))) not between 10 and 2400 then
    raise exception using errcode = '22023', message = 'Practice result required';
  end if;
  update public.member_academy_practices
  set submission = trim(p_submission), status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_practice_id and member_user_id = v_user_id and status in ('assigned', 'submitted')
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'Practice not found';
  end if;
  return v_result;
end;
$$;

create or replace function public.submit_my_academy_practice(p_practice_id uuid, p_submission text)
returns public.member_academy_practices
language sql
security invoker
set search_path = ''
as $$ select private.submit_my_academy_practice(p_practice_id, p_submission); $$;

create or replace function private.review_assigned_academy_practice(
  p_practice_id uuid,
  p_feedback text,
  p_competency_label text default null
)
returns public.member_academy_practices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_practice public.member_academy_practices%rowtype;
  v_result public.member_academy_practices%rowtype;
begin
  select * into v_practice from public.member_academy_practices where id = p_practice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Practice not found';
  end if;
  if not (select private.current_user_can_access_support_record(v_practice.member_user_id)) then
    raise exception using errcode = '42501', message = 'Assigned supporter required';
  end if;
  if v_practice.status <> 'submitted' or length(trim(coalesce(p_feedback, ''))) < 3 then
    raise exception using errcode = '22023', message = 'Submitted practice and feedback required';
  end if;

  update public.member_academy_practices
  set feedback = left(trim(p_feedback), 1600), reviewer_user_id = v_user_id,
      status = 'reviewed', reviewed_at = now(), updated_at = now()
  where id = v_practice.id
  returning * into v_result;

  if length(trim(coalesce(p_competency_label, ''))) >= 3 then
    insert into public.member_development_evidence (
      member_user_id, source_practice_id, competency_label, reviewed_by
    ) values (
      v_practice.member_user_id, v_practice.id,
      left(trim(p_competency_label), 160), v_user_id
    ) on conflict (source_practice_id) do nothing;
  end if;
  return v_result;
end;
$$;

create or replace function public.review_assigned_academy_practice(
  p_practice_id uuid,
  p_feedback text,
  p_competency_label text default null
)
returns public.member_academy_practices
language sql
security invoker
set search_path = ''
as $$ select private.review_assigned_academy_practice(p_practice_id, p_feedback, p_competency_label); $$;

revoke all on function private.transition_my_member_action(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.transition_my_member_action(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.change_my_member_action_time(uuid, integer) from public, anon, authenticated;
revoke all on function public.change_my_member_action_time(uuid, integer) from public, anon, authenticated;
revoke all on function private.advance_assigned_support_request(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.advance_assigned_support_request(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.confirm_my_support_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.confirm_my_support_request(uuid, boolean) from public, anon, authenticated;
revoke all on function private.submit_my_academy_practice(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_my_academy_practice(uuid, text) from public, anon, authenticated;
revoke all on function private.review_assigned_academy_practice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_assigned_academy_practice(uuid, text, text) from public, anon, authenticated;

grant execute on function private.transition_my_member_action(uuid, text, text, text, text) to authenticated;
grant execute on function public.transition_my_member_action(uuid, text, text, text, text) to authenticated;
grant execute on function private.change_my_member_action_time(uuid, integer) to authenticated;
grant execute on function public.change_my_member_action_time(uuid, integer) to authenticated;
grant execute on function private.advance_assigned_support_request(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.advance_assigned_support_request(uuid, text, text, timestamptz) to authenticated;
grant execute on function private.confirm_my_support_request(uuid, boolean) to authenticated;
grant execute on function public.confirm_my_support_request(uuid, boolean) to authenticated;
grant execute on function private.submit_my_academy_practice(uuid, text) to authenticated;
grant execute on function public.submit_my_academy_practice(uuid, text) to authenticated;
grant execute on function private.review_assigned_academy_practice(uuid, text, text) to authenticated;
grant execute on function public.review_assigned_academy_practice(uuid, text, text) to authenticated;

insert into public.member_success_map_versions (
  user_id, plan_version, current_context, goal_30_day, weekly_capacity,
  primary_blocker, growth_preferences, plan, plan_source, ai_consent,
  support_summary_consent, created_at
)
select
  success_map.user_id, success_map.plan_version, success_map.current_context,
  success_map.goal_30_day, success_map.weekly_capacity, success_map.primary_blocker,
  success_map.growth_preferences, success_map.plan, success_map.plan_source,
  success_map.ai_consent, success_map.support_summary_consent, success_map.updated_at
from public.member_success_maps as success_map
on conflict (user_id, plan_version) do nothing;

insert into public.member_actions (
  member_user_id, plan_version, sequence_no, title, detail, done_when,
  minutes, capacity_minutes, resource_lesson_id, source, created_at, updated_at
)
select
  success_map.user_id,
  success_map.plan_version,
  1,
  coalesce(nullif(success_map.plan #>> '{todayAction,title}', ''), 'Эхний жижиг ажлаа хийх'),
  coalesce(nullif(success_map.plan #>> '{todayAction,detail}', ''), 'Өөрийн зорилготой холбоотой нэг жижиг алхмыг хийгээд үр дүнгээ тэмдэглэ.'),
  coalesce(nullif(success_map.plan #>> '{todayAction,doneWhen}', ''), 'Ажлыг хийж, гарсан үр дүнгээ тэмдэглэсэн байна.'),
  greatest(5, least(480, coalesce((success_map.plan #>> '{todayAction,minutes}')::integer, 15))),
  greatest(5, least(480, coalesce((success_map.plan #>> '{todayAction,minutes}')::integer, 15))),
  nullif(success_map.plan #>> '{academyRecommendation,lessonId}', ''),
  case when success_map.plan_source = 'ai_gateway' then 'ai' else 'starter_plan' end,
  success_map.updated_at,
  success_map.updated_at
from public.member_success_maps as success_map
where not exists (
  select 1 from public.member_actions as action
  where action.member_user_id = success_map.user_id
    and action.status not in ('done', 'superseded')
);

insert into public.member_academy_practices (
  member_user_id, action_id, lesson_id, prompt, created_at, updated_at
)
select
  action.member_user_id,
  action.id,
  action.resource_lesson_id,
  'Хичээлээс авсан нэг санаагаа энэ ажил дээр туршаад юу хийсэн, ямар үр дүн гарсныг 2–3 өгүүлбэрээр бич.',
  action.created_at,
  action.updated_at
from public.member_actions as action
where action.resource_lesson_id is not null
on conflict (action_id) do nothing;

update public.member_success_summaries as summary
set sharing_enabled = success_map.support_summary_consent,
    summary_version = success_map.plan_version,
    provenance = jsonb_build_object(
      'goal30Day', 'member_report',
      'weeklyCapacity', 'member_report',
      'primaryBlocker', 'member_report',
      'supportNeeds', 'member_report',
      'todayAction', case when success_map.plan_source = 'ai_gateway' then 'ai_inference' else 'plan_output' end
    )
from public.member_success_maps as success_map
where summary.user_id = success_map.user_id;

commit;
