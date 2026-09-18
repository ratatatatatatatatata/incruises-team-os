begin;

alter table public.member_success_summaries
  alter column sharing_enabled set default false;

alter table public.member_success_map_versions
  alter column support_summary_consent set default false;

create trigger member_success_maps_sync_summary_consent
after update of support_summary_consent on public.member_success_maps
for each row
when (old.support_summary_consent is distinct from new.support_summary_consent)
execute function private.sync_member_success_summary();

-- Consent added on 2026-09-17 previously defaulted to true. Rows that were last
-- updated before that release cannot prove an explicit opt-in, so fail closed.
update public.member_success_map_versions as version
set support_summary_consent = false
from public.member_success_maps as success_map
where version.user_id = success_map.user_id
  and success_map.updated_at < timestamptz '2026-09-17 17:15:58+00'
  and version.support_summary_consent;

update public.member_success_maps
set support_summary_consent = false
where updated_at < timestamptz '2026-09-17 17:15:58+00'
  and support_summary_consent;

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
  if p_helpful is null then
    raise exception using errcode = '22023', message = 'Helpful outcome required';
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
      when assigned.status = 'active'
        and (
          assigned.role = 'admin'
          or v_request.assigned_to = relationship.sponsor_user_id
          or v_request.assigned_to = relationship.coach_user_id
        ) then v_request.assigned_to
      when sponsor.status = 'active' then relationship.sponsor_user_id
      when coach.status = 'active' then relationship.coach_user_id
      else null
    end
      into v_assigned_to
    from (select 1) as seed
    left join public.member_relationships as relationship
      on relationship.member_user_id = v_user_id
    left join public.team_members as assigned on assigned.user_id = v_request.assigned_to
    left join public.team_members as sponsor on sponsor.user_id = relationship.sponsor_user_id
    left join public.team_members as coach on coach.user_id = relationship.coach_user_id
    limit 1;

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
      jsonb_strip_nulls(jsonb_build_object(
        'assignedTo', new.assigned_to,
        'outcomeHelpful', new.outcome_helpful,
        'resolutionNote', nullif(new.resolution_note, ''),
        'nextCheckAt', new.next_check_at
      ))
    );
  end if;
  return new;
end;
$$;

commit;
