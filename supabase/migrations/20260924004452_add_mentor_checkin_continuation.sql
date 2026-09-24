begin;

-- Additive only: existing actions, policies, grants and first-three transitions stay intact.
alter table public.member_actions
  add column if not exists source_checkin_id bigint references public.member_checkins(id),
  add column if not exists planned_for timestamptz;

create unique index if not exists member_actions_source_checkin_unique
  on public.member_actions (source_checkin_id)
  where source_checkin_id is not null;

comment on column public.member_actions.planned_for is
  'Member-chosen time displayed inside the app. This does not send a notification.';
comment on column public.member_actions.source_checkin_id is
  'One canonical continuation per member-owned check-in; no private AI transcript.';

create function private.continue_my_member_path(
  p_checkin_id bigint,
  p_expected_plan_version integer,
  p_title text,
  p_detail text,
  p_done_when text,
  p_minutes integer,
  p_capacity_minutes integer
)
returns public.member_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_map public.member_success_maps%rowtype;
  v_checkin public.member_checkins%rowtype;
  v_result public.member_actions%rowtype;
  v_sequence_no integer;
  v_capacity_text text;
  v_capacity_match text[];
  v_capacity integer;
begin
  if v_user_id is null or not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select * into v_checkin from public.member_checkins
  where id = p_checkin_id and user_id = v_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Own check-in required';
  end if;

  -- Serialize continuations with each other and with edits to this member's map.
  select * into v_map from public.member_success_maps
  where user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Own success map required';
  end if;

  -- A retried request returns its original action, even when that action is now done.
  select * into v_result from public.member_actions
  where source_checkin_id = p_checkin_id and member_user_id = v_user_id;
  if found then return v_result; end if;

  -- Never replace, supersede or edit an already active action.
  select * into v_result from public.member_actions
  where member_user_id = v_user_id and status not in ('done', 'superseded');
  if found then return v_result; end if;

  if p_expected_plan_version is null or p_expected_plan_version <> v_map.plan_version then
    raise exception using errcode = '22023', message = 'Success map changed; refresh before continuing';
  end if;
  if exists (
    select 1 from public.member_checkins as later
    where later.user_id = v_user_id
      and (later.created_at, later.id) > (v_checkin.created_at, v_checkin.id)
  ) then
    raise exception using errcode = '22023', message = 'Latest check-in required';
  end if;

  -- Check the stored capacity again at the direct RPC boundary. Do not trust the API.
  v_capacity_text := lower(replace(trim(v_map.weekly_capacity), ',', '.'));
  v_capacity_match := regexp_match(v_capacity_text, '^([0-9]{1,3})$');
  if v_capacity_match is not null then
    v_capacity := v_capacity_match[1]::integer;
  else
    v_capacity_match := regexp_match(v_capacity_text, '(^|[[:space:]])([0-9]{1,3})[[:space:]]*(минут|мин|minut|mins?|minutes?)([[:space:];.]|$)');
    if v_capacity_match is not null then
      v_capacity := v_capacity_match[2]::integer;
    else
      v_capacity_match := regexp_match(v_capacity_text, '(^|[[:space:]])([0-9]{1,2}([.][0-9]{1,2})?)[[:space:]]*(цаг|tsag)([[:space:];.]|$)');
      if v_capacity_match is not null then
        v_capacity := round(v_capacity_match[2]::numeric * 60)::integer;
      end if;
    end if;
  end if;
  if v_capacity is null or v_capacity < 5
     or p_capacity_minutes is null or p_capacity_minutes not between 5 and least(45, v_capacity)
     or p_minutes is null or p_minutes not between 5 and p_capacity_minutes
     or length(trim(coalesce(p_title, ''))) not between 3 and 160
     or length(trim(coalesce(p_detail, ''))) not between 3 and 1600
     or length(trim(coalesce(p_done_when, ''))) not between 3 and 600 then
    raise exception using errcode = '22023', message = 'Invalid continuation action';
  end if;

  -- Start after the fixed starter sequence so its unchanged Done RPC cannot replay it.
  select greatest(3, coalesce(max(sequence_no), 0)) + 1 into v_sequence_no
  from public.member_actions where member_user_id = v_user_id;

  insert into public.member_actions (
    member_user_id, plan_version, sequence_no, title, detail, done_when,
    minutes, capacity_minutes, source, source_checkin_id
  ) values (
    v_user_id, v_map.plan_version, v_sequence_no, trim(p_title), trim(p_detail), trim(p_done_when),
    p_minutes, p_capacity_minutes, 'member', p_checkin_id
  ) on conflict do nothing
  returning * into v_result;

  -- The existing one-active index also protects races with legacy action transitions.
  if not found then
    select * into v_result from public.member_actions
    where member_user_id = v_user_id
      and (source_checkin_id = p_checkin_id or status not in ('done', 'superseded'))
    order by (source_checkin_id = p_checkin_id) desc nulls last
    limit 1;
  end if;
  return v_result;
end;
$$;

create function public.continue_my_member_path(
  p_checkin_id bigint,
  p_expected_plan_version integer,
  p_title text,
  p_detail text,
  p_done_when text,
  p_minutes integer,
  p_capacity_minutes integer
)
returns public.member_actions
language sql
security invoker
set search_path = ''
as $$
  select private.continue_my_member_path(
    p_checkin_id, p_expected_plan_version, p_title, p_detail, p_done_when,
    p_minutes, p_capacity_minutes
  );
$$;

create function private.schedule_my_member_action(p_action_id uuid, p_planned_for timestamptz)
returns public.member_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action public.member_actions%rowtype;
  v_result public.member_actions%rowtype;
begin
  if v_user_id is null or not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;
  if p_planned_for is not null and not isfinite(p_planned_for) then
    raise exception using errcode = '22023', message = 'Finite planned time required';
  end if;
  select * into v_action from public.member_actions
  where id = p_action_id and member_user_id = v_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Own action required';
  end if;
  if v_action.status in ('done', 'superseded') then
    raise exception using errcode = '22023', message = 'Only active actions can be scheduled';
  end if;
  if v_action.planned_for is not distinct from p_planned_for then return v_action; end if;

  update public.member_actions
  set planned_for = p_planned_for, updated_at = now()
  where id = v_action.id and member_user_id = v_user_id
  returning * into v_result;

  insert into public.member_action_events (
    action_id, member_user_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_action.id, v_user_id, v_user_id, 'time_changed', v_action.status, v_action.status,
    jsonb_build_object('field', 'planned_for', 'previousPlannedFor', v_action.planned_for, 'plannedFor', p_planned_for)
  );
  return v_result;
end;
$$;

create function public.schedule_my_member_action(p_action_id uuid, p_planned_for timestamptz)
returns public.member_actions
language sql
security invoker
set search_path = ''
as $$
  select private.schedule_my_member_action(p_action_id, p_planned_for);
$$;

revoke all on function private.continue_my_member_path(bigint, integer, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.continue_my_member_path(bigint, integer, text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function private.schedule_my_member_action(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.schedule_my_member_action(uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.continue_my_member_path(bigint, integer, text, text, text, integer, integer) to authenticated;
grant execute on function public.continue_my_member_path(bigint, integer, text, text, text, integer, integer) to authenticated;
grant execute on function private.schedule_my_member_action(uuid, timestamptz) to authenticated;
grant execute on function public.schedule_my_member_action(uuid, timestamptz) to authenticated;

commit;
