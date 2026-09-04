create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  mode text not null default 'simple',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_title_length check (char_length(title) between 1 and 120),
  constraint ai_conversations_mode_check check (mode in ('simple', 'step_by_step', 'fast')),
  unique (id, user_id)
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  status text not null default 'pending',
  source text,
  prompt text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  instructions_version text not null default 'mentor-v1',
  result text,
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_generations_model_length check (char_length(model) between 1 and 120),
  constraint ai_generations_status_check check (status in ('pending', 'complete', 'fallback', 'error')),
  constraint ai_generations_source_check check (source is null or source in ('ai_gateway', 'guided_fallback')),
  constraint ai_generations_prompt_length check (char_length(prompt) between 1 and 2000),
  constraint ai_generations_context_size check (octet_length(context_snapshot::text) <= 65536),
  constraint ai_generations_result_length check (result is null or char_length(result) between 1 and 12000),
  constraint ai_generations_usage_nonnegative check (
    (input_tokens is null or input_tokens >= 0)
    and (output_tokens is null or output_tokens >= 0)
    and (total_tokens is null or total_tokens >= 0)
  ),
  constraint ai_generations_state_consistency check (
    (status = 'pending' and source is null and result is null and error_code is null and completed_at is null)
    or (status = 'complete' and source = 'ai_gateway' and result is not null and completed_at is not null)
    or (status = 'fallback' and source = 'guided_fallback' and result is not null and completed_at is not null)
    or (status = 'error' and source is null and result is null and error_code is not null and completed_at is not null)
  ),
  constraint ai_generations_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.ai_conversations(id, user_id)
    on delete cascade,
  unique (id, conversation_id, user_id)
);

create table public.ai_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check check (role in ('user', 'assistant')),
  constraint ai_messages_content_length check (char_length(content) between 1 and 12000),
  constraint ai_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.ai_conversations(id, user_id)
    on delete cascade,
  constraint ai_messages_generation_owner_fkey
    foreign key (generation_id, conversation_id, user_id)
    references public.ai_generations(id, conversation_id, user_id)
    on delete set null (generation_id)
);

create index ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc, id);
create index ai_generations_user_created_idx
  on public.ai_generations (user_id, created_at desc, id);
create index ai_generations_conversation_created_idx
  on public.ai_generations (conversation_id, created_at, id);
create index ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at, id);
create index ai_messages_user_id_idx
  on public.ai_messages (user_id);
create unique index ai_messages_generation_role_unique
  on public.ai_messages (generation_id, role)
  where generation_id is not null;

alter table public.ai_conversations enable row level security;
alter table public.ai_generations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversations_select_own
  on public.ai_conversations
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.team_members as member
      where member.user_id = (select auth.uid())
        and member.status = 'active'
    )
  );

create policy ai_generations_select_own
  on public.ai_generations
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.team_members as member
      where member.user_id = (select auth.uid())
        and member.status = 'active'
    )
  );

create policy ai_messages_select_own
  on public.ai_messages
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.team_members as member
      where member.user_id = (select auth.uid())
        and member.status = 'active'
    )
  );

revoke all on table public.ai_conversations from public, anon, authenticated;
revoke all on table public.ai_generations from public, anon, authenticated;
revoke all on table public.ai_messages from public, anon, authenticated;
revoke all on sequence public.ai_messages_id_seq from public, anon, authenticated;

grant select on table public.ai_conversations to authenticated;
grant select on table public.ai_generations to authenticated;
grant select on table public.ai_messages to authenticated;

create or replace function private.create_assistant_turn(
  p_actor uuid,
  p_conversation_id uuid,
  p_title text,
  p_mode text,
  p_message text,
  p_model text,
  p_context_snapshot jsonb
)
returns table (conversation_id uuid, generation_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_generation_id uuid;
  v_now timestamptz := now();
  v_recent_count integer;
  v_daily_count integer;
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Verified member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_actor::text, 0)
  );

  if not exists (
    select 1
    from public.team_members as member
    join public.member_onboarding_state as onboarding on onboarding.user_id = member.user_id
    where member.user_id = p_actor
      and member.status = 'active'
      and onboarding.status = 'completed'
      and onboarding.baseline_answered = 15
      and onboarding.tailored_answered = 100
  ) then
    raise exception using errcode = '42501', message = 'Active member with a completed Success Map required';
  end if;

  -- The shared member-state lock serializes this check with consent withdrawal
  -- and membership disable without taking the privacy row in the opposite order.
  perform 1
  from public.member_privacy_preferences as preference
  where preference.user_id = p_actor
    and preference.assessment_consent = true;

  if not found then
    raise exception using errcode = '42501', message = 'Assistant consent withdrawn';
  end if;

  if p_mode is null or p_mode not in ('simple', 'step_by_step', 'fast') then
    raise exception using errcode = '22023', message = 'Invalid assistant mode';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'Assistant message must be between 1 and 2000 characters';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid assistant model';
  end if;
  if p_context_snapshot is null or octet_length(p_context_snapshot::text) > 65536 then
    raise exception using errcode = '22023', message = 'Assistant context is too large';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('insuccess-assistant-quota:' || p_actor::text, 0));

  update public.ai_generations
  set status = 'error',
      error_code = 'generation_timeout',
      completed_at = v_now
  where user_id = p_actor
    and status = 'pending'
    and created_at < v_now - interval '2 minutes';

  select count(*) into v_recent_count
  from public.ai_generations
  where user_id = p_actor
    and created_at >= v_now - interval '1 minute';

  select count(*) into v_daily_count
  from public.ai_generations
  where user_id = p_actor
    and created_at >= v_now - interval '24 hours';

  if v_recent_count >= 12 or v_daily_count >= 100 then
    raise exception using errcode = 'P0001', message = 'assistant_rate_limited';
  end if;

  if p_conversation_id is null then
    if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'Invalid conversation title';
    end if;

    insert into public.ai_conversations (user_id, title, mode)
    values (p_actor, btrim(p_title), p_mode)
    returning id into v_conversation_id;
  else
    select id into v_conversation_id
    from public.ai_conversations
    where id = p_conversation_id
      and user_id = p_actor
    for update;

    if v_conversation_id is null then
      raise exception using errcode = 'P0002', message = 'Conversation not found';
    end if;

    update public.ai_conversations
    set mode = p_mode, updated_at = v_now
    where id = v_conversation_id;
  end if;

  insert into public.ai_generations (
    conversation_id,
    user_id,
    model,
    prompt,
    context_snapshot
  ) values (
    v_conversation_id,
    p_actor,
    btrim(p_model),
    btrim(p_message),
    p_context_snapshot
  )
  returning id into v_generation_id;

  insert into public.ai_messages (
    conversation_id,
    user_id,
    generation_id,
    role,
    content
  ) values (
    v_conversation_id,
    p_actor,
    v_generation_id,
    'user',
    btrim(p_message)
  );

  return query select v_conversation_id, v_generation_id;
end;
$$;

create or replace function private.complete_assistant_turn(
  p_actor uuid,
  p_generation_id uuid,
  p_result text,
  p_model text,
  p_source text,
  p_error_code text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_status text;
  v_result text;
  v_model text;
  v_source text;
  v_error_code text;
  v_input_tokens integer;
  v_output_tokens integer;
  v_total_tokens integer;
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Verified member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_actor::text, 0)
  );

  if p_result is null or char_length(btrim(p_result)) not between 1 and 12000 then
    raise exception using errcode = '22023', message = 'Assistant result must be between 1 and 12000 characters';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid assistant model';
  end if;
  if p_source is null or p_source not in ('ai_gateway', 'guided_fallback') then
    raise exception using errcode = '22023', message = 'Invalid assistant source';
  end if;
  if p_error_code is not null and char_length(btrim(p_error_code)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid assistant error code';
  end if;
  if coalesce(p_input_tokens, 0) < 0 or coalesce(p_output_tokens, 0) < 0 or coalesce(p_total_tokens, 0) < 0 then
    raise exception using errcode = '22023', message = 'Invalid token usage';
  end if;

  select conversation_id, status, result, model, source, error_code, input_tokens, output_tokens, total_tokens
  into v_conversation_id, v_status, v_result, v_model, v_source, v_error_code,
       v_input_tokens, v_output_tokens, v_total_tokens
  from public.ai_generations
  where id = p_generation_id
    and user_id = p_actor
  for update;

  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'Generation not found';
  end if;
  if v_status = 'error' and v_error_code = 'consent_withdrawn' then
    raise exception using errcode = '42501', message = 'Assistant consent withdrawn';
  end if;
  if v_status in ('complete', 'fallback')
     and v_result = btrim(p_result)
     and v_model = btrim(p_model)
     and v_source = p_source
     and v_error_code is not distinct from nullif(btrim(coalesce(p_error_code, '')), '')
     and v_input_tokens is not distinct from p_input_tokens
     and v_output_tokens is not distinct from p_output_tokens
     and v_total_tokens is not distinct from p_total_tokens then
    return;
  end if;
  if v_status <> 'pending' then
    raise exception using errcode = '55000', message = 'Generation is already finalized';
  end if;

  if not exists (
    select 1
    from public.member_privacy_preferences as preference
    where preference.user_id = p_actor
      and preference.assessment_consent = true
  ) then
    raise exception using errcode = '42501', message = 'Assistant consent withdrawn';
  end if;

  if not exists (
    select 1
    from public.team_members as member
    join public.member_onboarding_state as onboarding on onboarding.user_id = member.user_id
    where member.user_id = p_actor
      and member.status = 'active'
      and onboarding.status = 'completed'
      and onboarding.baseline_answered = 15
      and onboarding.tailored_answered = 100
  ) then
    raise exception using errcode = '42501', message = 'Active member with a completed Success Map required';
  end if;

  update public.ai_generations
  set model = btrim(p_model),
      status = case when p_source = 'ai_gateway' then 'complete' else 'fallback' end,
      source = p_source,
      result = btrim(p_result),
      error_code = nullif(btrim(coalesce(p_error_code, '')), ''),
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      completed_at = now()
  where id = p_generation_id;

  insert into public.ai_messages (
    conversation_id,
    user_id,
    generation_id,
    role,
    content
  ) values (
    v_conversation_id,
    p_actor,
    p_generation_id,
    'assistant',
    btrim(p_result)
  );

  update public.ai_conversations
  set updated_at = now()
  where id = v_conversation_id
    and user_id = p_actor;
end;
$$;

create or replace function private.cancel_pending_assistant_turns_for_withdrawal(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Verified member required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_actor::text, 0)
  );

  with cancelled as (
    update public.ai_generations
    set status = 'error',
        source = null,
        result = null,
        error_code = 'consent_withdrawn',
        completed_at = v_now
    where user_id = p_actor
      and status = 'pending'
    returning conversation_id
  )
  update public.ai_conversations as conversation
  set updated_at = v_now
  where conversation.user_id = p_actor
    and conversation.id in (select cancelled.conversation_id from cancelled);
end;
$$;

create or replace function private.cancel_pending_assistant_turns_on_consent_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.assessment_consent = true and new.assessment_consent = false then
    perform private.cancel_pending_assistant_turns_for_withdrawal(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists member_privacy_cancel_pending_assistant_turns
  on public.member_privacy_preferences;
create trigger member_privacy_cancel_pending_assistant_turns
after update of assessment_consent on public.member_privacy_preferences
for each row
when (old.assessment_consent = true and new.assessment_consent = false)
execute function private.cancel_pending_assistant_turns_on_consent_withdrawal();

create or replace function private.withdraw_assessment_consent(p_actor uuid)
returns table (
  assessment_consent boolean,
  assessment_consent_version text,
  assessment_consented_at timestamptz,
  sharing_level text,
  assistant_memory boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment_consent boolean;
  v_assessment_consent_version text;
  v_assessment_consented_at timestamptz;
  v_sharing_level text;
  v_assistant_memory boolean;
begin
  if p_actor is null
     or p_actor is distinct from auth.uid()
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'Authenticated non-anonymous user required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_actor::text, 0)
  );

  update public.member_privacy_preferences as preference
  set assessment_consent = false,
      sharing_level = 'private',
      assistant_memory = false,
      updated_at = now()
  where preference.user_id = p_actor
  returning
    preference.assessment_consent,
    preference.assessment_consent_version,
    preference.assessment_consented_at,
    preference.sharing_level,
    preference.assistant_memory
  into
    v_assessment_consent,
    v_assessment_consent_version,
    v_assessment_consented_at,
    v_sharing_level,
    v_assistant_memory;

  if not found then
    raise exception using errcode = 'P0002', message = 'Privacy preferences not found';
  end if;

  -- Also closes legacy pending rows if consent was already false before this call.
  perform private.cancel_pending_assistant_turns_for_withdrawal(p_actor);

  return query select
    v_assessment_consent,
    v_assessment_consent_version,
    v_assessment_consented_at,
    v_sharing_level,
    v_assistant_memory;
end;
$$;

create or replace function private.fail_assistant_turn(
  p_actor uuid,
  p_generation_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_status text;
begin
  if p_actor is null then
    raise exception using errcode = '42501', message = 'Verified member required';
  end if;
  if p_error_code is null or char_length(btrim(p_error_code)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Invalid assistant error code';
  end if;

  select conversation_id, status
  into v_conversation_id, v_status
  from public.ai_generations
  where id = p_generation_id
    and user_id = p_actor
  for update;

  if v_conversation_id is null then
    raise exception using errcode = 'P0002', message = 'Generation not found';
  end if;
  if v_status = 'error' then
    return;
  end if;
  if v_status <> 'pending' then
    raise exception using errcode = '55000', message = 'Generation is already finalized';
  end if;

  update public.ai_generations
  set status = 'error',
      error_code = btrim(p_error_code),
      completed_at = now()
  where id = p_generation_id
    and user_id = p_actor;

  update public.ai_conversations
  set updated_at = now()
  where id = v_conversation_id
    and user_id = p_actor;
end;
$$;

create or replace function public.create_assistant_turn(
  p_actor uuid,
  p_conversation_id uuid,
  p_title text,
  p_mode text,
  p_message text,
  p_model text,
  p_context_snapshot jsonb
)
returns table (conversation_id uuid, generation_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_assistant_turn(
    p_actor,
    p_conversation_id,
    p_title,
    p_mode,
    p_message,
    p_model,
    p_context_snapshot
  );
$$;

create or replace function public.complete_assistant_turn(
  p_actor uuid,
  p_generation_id uuid,
  p_result text,
  p_model text,
  p_source text,
  p_error_code text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_assistant_turn(
    p_actor,
    p_generation_id,
    p_result,
    p_model,
    p_source,
    p_error_code,
    p_input_tokens,
    p_output_tokens,
    p_total_tokens
  );
$$;

create or replace function public.fail_assistant_turn(
  p_actor uuid,
  p_generation_id uuid,
  p_error_code text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.fail_assistant_turn(p_actor, p_generation_id, p_error_code);
$$;

create or replace function public.withdraw_assessment_consent()
returns table (
  assessment_consent boolean,
  assessment_consent_version text,
  assessment_consented_at timestamptz,
  sharing_level text,
  assistant_memory boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.withdraw_assessment_consent(auth.uid());
$$;

revoke execute on function private.create_assistant_turn(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.complete_assistant_turn(uuid, uuid, text, text, text, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function private.fail_assistant_turn(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.cancel_pending_assistant_turns_for_withdrawal(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.cancel_pending_assistant_turns_on_consent_withdrawal()
  from public, anon, authenticated, service_role;
revoke execute on function private.withdraw_assessment_consent(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.create_assistant_turn(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.complete_assistant_turn(uuid, uuid, text, text, text, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.fail_assistant_turn(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.withdraw_assessment_consent()
  from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant usage on schema private to authenticated;
grant execute on function private.withdraw_assessment_consent(uuid)
  to authenticated;
grant execute on function private.create_assistant_turn(uuid, uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function private.complete_assistant_turn(uuid, uuid, text, text, text, text, integer, integer, integer)
  to service_role;
grant execute on function private.fail_assistant_turn(uuid, uuid, text)
  to service_role;
grant execute on function public.create_assistant_turn(uuid, uuid, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.complete_assistant_turn(uuid, uuid, text, text, text, text, integer, integer, integer)
  to service_role;
grant execute on function public.fail_assistant_turn(uuid, uuid, text)
  to service_role;
grant execute on function public.withdraw_assessment_consent()
  to authenticated;
