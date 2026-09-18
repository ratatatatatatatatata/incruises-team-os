-- Version matches the production Supabase migration ledger.
begin;

alter table public.member_success_maps
  alter column support_summary_consent set default false;

create or replace function private.current_user_has_active_membership()
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
  );
$$;

revoke all on function private.current_user_has_active_membership() from public, anon, authenticated;
grant execute on function private.current_user_has_active_membership() to authenticated;

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
        or viewer.role = 'admin'
        or relationship.sponsor_user_id = viewer.user_id
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
    (select private.current_user_has_active_membership())
    and (
      (select auth.uid()) = p_member_user_id
      or (select private.current_user_is_team_admin())
      or (
        (select private.current_user_is_direct_supporter(p_member_user_id))
        and coalesce((
          select summary.sharing_enabled
          from public.member_success_summaries as summary
          where summary.user_id = p_member_user_id
        ), false)
      )
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
    (select private.current_user_has_active_membership())
    and (
      (select auth.uid()) = p_member_user_id
      or (select private.current_user_is_team_admin())
      or exists (
        select 1
        from public.support_requests as request
        where request.id = p_support_request_id
          and request.member_user_id = p_member_user_id
          and request.assigned_to = (select auth.uid())
      )
    );
$$;

drop policy if exists "member_success_map_versions_select_own" on public.member_success_map_versions;
drop policy if exists "member_success_map_versions_select_active_own" on public.member_success_map_versions;
create policy "member_success_map_versions_select_active_own"
on public.member_success_map_versions for select to authenticated
using (
  (select private.current_user_has_active_membership())
  and (select auth.uid()) = user_id
);

drop policy if exists "external_rank_claims_select_own_or_admin" on public.external_rank_claims;
drop policy if exists "external_rank_claims_select_active_own_or_admin" on public.external_rank_claims;
create policy "external_rank_claims_select_active_own_or_admin"
on public.external_rank_claims for select to authenticated
using (
  (select private.current_user_has_active_membership())
  and (
    (select auth.uid()) = member_user_id
    or (select private.current_user_is_team_admin())
  )
);

drop policy if exists "member_success_summaries_sharing_gate" on public.member_success_summaries;
create policy "member_success_summaries_sharing_gate"
on public.member_success_summaries
as restrictive
for select to authenticated
using ((select private.current_user_can_access_support_record(user_id)));

drop policy if exists "member_checkins_select_authorized" on public.member_checkins;
create policy "member_checkins_select_authorized"
on public.member_checkins for select to authenticated
using ((select private.current_user_can_access_support_record(user_id)));

drop policy if exists "coach_notes_select_authorized" on public.coach_notes;
create policy "coach_notes_select_authorized"
on public.coach_notes for select to authenticated
using (
  (select private.current_user_can_access_support_record(member_user_id))
  and (
    member_user_id <> (select auth.uid())
    or visible_to_member
  )
);

drop policy if exists "academy_lessons_select_active" on public.academy_lessons;
create policy "academy_lessons_select_active"
on public.academy_lessons for select to authenticated
using (
  (is_published and (select private.current_user_has_active_membership()))
  or (select private.current_user_is_team_admin())
);

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
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

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
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

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
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select * into v_request
  from public.support_requests
  where id = p_support_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Support request not found';
  end if;
  if not (
    coalesce(v_request.assigned_to = v_user_id, false)
    or (select private.current_user_is_team_admin())
  ) then
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
      next_check_at = case
        when p_next_status = 'resolved' then coalesce(p_next_check_at, v_request.next_check_at, now() + interval '1 day')
        else coalesce(p_next_check_at, v_request.next_check_at)
      end,
      acknowledged_at = case when p_next_status = 'acknowledged' then coalesce(acknowledged_at, now()) else acknowledged_at end,
      resolved_at = case when p_next_status = 'resolved' then now() else resolved_at end,
      updated_at = now()
  where id = v_request.id
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function private.confirm_my_support_request(p_support_request_id uuid, p_helpful boolean)
returns public.support_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.support_requests%rowtype;
  v_result public.support_requests%rowtype;
  v_assigned_to uuid;
begin
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select * into v_request
  from public.support_requests
  where id = p_support_request_id
    and member_user_id = v_user_id
    and status = 'resolved'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Resolved support request required';
  end if;

  if p_helpful then
    update public.support_requests
    set status = 'member_confirmed',
        outcome_helpful = true,
        next_check_at = null,
        confirmed_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_result;
  else
    select case
      when assigned.status = 'active' then v_request.assigned_to
      when sponsor.status = 'active' then relationship.sponsor_user_id
      when coach.status = 'active' then relationship.coach_user_id
      else null
    end
      into v_assigned_to
    from public.member_relationships as relationship
    left join public.team_members as assigned on assigned.user_id = v_request.assigned_to
    left join public.team_members as sponsor on sponsor.user_id = relationship.sponsor_user_id
    left join public.team_members as coach on coach.user_id = relationship.coach_user_id
    where relationship.member_user_id = v_user_id;

    update public.support_requests
    set status = case when v_assigned_to is null then 'unassigned' else 'assigned' end,
        assigned_to = v_assigned_to,
        outcome_helpful = false,
        next_check_at = now() + interval '1 day',
        resolved_at = null,
        confirmed_at = now(),
        updated_at = now()
    where id = v_request.id
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

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
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;
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
  if not (select private.current_user_has_active_membership()) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select * into v_practice from public.member_academy_practices where id = p_practice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Practice not found';
  end if;
  if v_practice.member_user_id = v_user_id then
    raise exception using errcode = '42501', message = 'A member cannot review their own practice';
  end if;
  if not (
    (select private.current_user_is_team_admin())
    or (
      (select private.current_user_is_direct_supporter(v_practice.member_user_id))
      and coalesce((
        select summary.sharing_enabled
        from public.member_success_summaries as summary
        where summary.user_id = v_practice.member_user_id
      ), false)
    )
  ) then
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

create or replace function private.sync_member_success_summary_current_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_title text;
  v_done_count integer;
begin
  select action.title
    into v_current_title
  from public.member_actions as action
  where action.member_user_id = new.member_user_id
    and action.status not in ('done', 'superseded')
  order by action.updated_at desc
  limit 1;

  if v_current_title is null then
    select count(*)::integer into v_done_count
    from public.member_actions as action
    where action.member_user_id = new.member_user_id
      and action.status = 'done';

    if v_done_count >= 3 then
      v_current_title := 'Эхний алхмууд дууссан · check-in хүлээж байна';
    end if;
  end if;

  if v_current_title is not null then
    update public.member_success_summaries
    set today_action = v_current_title,
        updated_at = now()
    where user_id = new.member_user_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_member_success_summary_current_action() from public, anon, authenticated;

drop trigger if exists member_actions_sync_current_summary on public.member_actions;
create trigger member_actions_sync_current_summary
after insert or update of status, title on public.member_actions
for each row execute function private.sync_member_success_summary_current_action();

commit;
