begin;

-- Existing members are intentionally left unchanged. Only users provisioned
-- through the new invitation workflow are required to complete onboarding.
alter table public.team_members
  add column if not exists onboarding_required boolean not null default false;

create table if not exists public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null default '',
  role text not null default 'user'
    check (role in ('user', 'builder', 'coach', 'director', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'provisioned', 'accepted', 'failed')),
  invited_by uuid references auth.users(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  provisioned_at timestamptz,
  accepted_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint member_invitations_email_format_check
    check (email = lower(trim(email)) and length(email) between 3 and 320),
  constraint member_invitations_display_name_length_check
    check (length(display_name) <= 80)
);

create unique index if not exists member_invitations_email_unique
  on public.member_invitations (lower(email));

create index if not exists member_invitations_status_invited_at_idx
  on public.member_invitations (status, invited_at desc);

comment on table public.member_invitations is
  'Admin-created access invitations. Auth identity alone never grants application membership.';

create table if not exists public.member_success_maps (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_context text not null,
  goal_30_day text not null,
  weekly_capacity text not null,
  primary_blocker text not null,
  growth_preferences text not null,
  plan jsonb not null,
  plan_source text not null default 'deterministic'
    check (plan_source in ('deterministic', 'ai_gateway')),
  plan_version integer not null default 1 check (plan_version > 0),
  ai_consent boolean not null default false,
  ai_model text,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_success_maps_answer_lengths_check check (
    length(current_context) between 10 and 1600
    and length(goal_30_day) between 10 and 1600
    and length(weekly_capacity) between 3 and 800
    and length(primary_blocker) between 10 and 1600
    and length(growth_preferences) between 10 and 1600
  ),
  constraint member_success_maps_plan_shape_check check (
    jsonb_typeof(plan) = 'object'
    and octet_length(plan::text) <= 32768
  ),
  constraint member_success_maps_ai_metadata_check check (
    (plan_source = 'deterministic' and ai_model is null)
    or (plan_source = 'ai_gateway' and ai_consent and ai_model is not null)
  )
);

comment on table public.member_success_maps is
  'Private five-answer starter profile and its generated working plan. Raw answers are owner-only.';

alter table public.member_invitations enable row level security;
alter table public.member_success_maps enable row level security;

create policy "member_invitations_select_admin"
on public.member_invitations
for select
to authenticated
using ((select private.current_user_is_team_admin()));

create policy "member_success_maps_select_active_own"
on public.member_success_maps
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

revoke all on table public.member_invitations from anon, authenticated;
revoke all on table public.member_success_maps from anon, authenticated;
grant select on table public.member_invitations to authenticated;
grant select on table public.member_success_maps to authenticated;

-- Replace the previous public-registration trigger. A new auth user is now
-- provisioned only when a matching, unexpired invitation exists.
create or replace function private.handle_new_team_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.member_invitations%rowtype;
  v_display_name text;
begin
  if new.email is null then
    return new;
  end if;

  select invitation.*
    into v_invitation
  from public.member_invitations as invitation
  where lower(invitation.email) = lower(trim(new.email))
    and invitation.status in ('pending', 'sent')
    and invitation.expires_at > now()
  order by invitation.invited_at desc
  limit 1
  for update;

  if not found then
    return new;
  end if;

  v_display_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(v_invitation.display_name), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.user_profiles (id, email, display_name, role)
  values (new.id, lower(trim(new.email)), v_display_name, v_invitation.role)
  on conflict (id) do update
  set email = excluded.email,
      display_name = case
        when public.user_profiles.display_name = '' then excluded.display_name
        else public.user_profiles.display_name
      end,
      updated_at = now();

  insert into public.team_members (user_id, role, status, onboarding_required)
  values (new.id, v_invitation.role, 'active', true)
  on conflict (user_id) do update
  set role = excluded.role,
      status = 'active',
      onboarding_required = true,
      updated_at = now();

  update public.member_invitations
  set status = 'provisioned',
      auth_user_id = new.id,
      provisioned_at = now(),
      last_error = null,
      updated_at = now()
  where id = v_invitation.id;

  return new;
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

revoke all on function public.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) from public, anon, authenticated;
grant execute on function public.complete_starter_success_map(
  text, text, text, text, text, jsonb, text, boolean, text
) to authenticated;

commit;
