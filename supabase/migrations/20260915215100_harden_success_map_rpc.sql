begin;

create index if not exists member_invitations_invited_by_idx
  on public.member_invitations (invited_by)
  where invited_by is not null;

create index if not exists member_invitations_auth_user_id_idx
  on public.member_invitations (auth_user_id)
  where auth_user_id is not null;

create or replace function private.complete_starter_success_map(
  p_current_context text,
  p_goal_30_day text,
  p_weekly_capacity text,
  p_primary_blocker text,
  p_growth_preferences text,
  p_plan jsonb,
  p_plan_source text,
  p_ai_consent boolean,
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
    user_id,
    current_context,
    goal_30_day,
    weekly_capacity,
    primary_blocker,
    growth_preferences,
    plan,
    plan_source,
    ai_consent,
    ai_model,
    completed_at,
    updated_at
  ) values (
    v_user_id,
    trim(p_current_context),
    trim(p_goal_30_day),
    trim(p_weekly_capacity),
    trim(p_primary_blocker),
    trim(p_growth_preferences),
    p_plan,
    p_plan_source,
    p_ai_consent,
    p_ai_model,
    now(),
    now()
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

create or replace function public.complete_starter_success_map(
  p_current_context text,
  p_goal_30_day text,
  p_weekly_capacity text,
  p_primary_blocker text,
  p_growth_preferences text,
  p_plan jsonb,
  p_plan_source text,
  p_ai_consent boolean,
  p_ai_model text default null
)
returns public.member_success_maps
language sql
security invoker
set search_path = ''
as $$
  select private.complete_starter_success_map(
    p_current_context,
    p_goal_30_day,
    p_weekly_capacity,
    p_primary_blocker,
    p_growth_preferences,
    p_plan,
    p_plan_source,
    p_ai_consent,
    p_ai_model
  );
$$;

revoke all on function private.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) from public, anon, authenticated;
revoke all on function public.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) to authenticated;
grant execute on function public.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) to authenticated;

commit;
