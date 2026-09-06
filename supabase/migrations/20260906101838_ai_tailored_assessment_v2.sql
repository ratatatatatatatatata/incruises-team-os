begin;

create table if not exists private.assessment_generation_runs (
  generation_id uuid primary key,
  session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null default 'pending' check (char_length(model) between 1 and 120),
  prompt_version text not null default 'insuccess-tailored-v2' check (char_length(prompt_version) between 1 and 80),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens between 0 and 10000000),
  output_tokens integer check (output_tokens is null or output_tokens between 0 and 10000000),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,80}$'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (generation_id, session_id, user_id)
);

create unique index if not exists idx_assessment_generation_one_running_per_session
  on private.assessment_generation_runs(session_id)
  where status = 'running';

create index if not exists idx_assessment_generation_user_started
  on private.assessment_generation_runs(user_id, started_at desc);

alter table private.assessment_generation_runs enable row level security;
revoke all on table private.assessment_generation_runs from public, anon, authenticated, service_role;

create or replace function private.cancel_running_assessment_generations_on_consent_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || new.user_id::text, 0)
  );

  update private.assessment_generation_runs
  set status = 'failed',
      error_code = 'consent_withdrawn',
      finished_at = now()
  where user_id = new.user_id
    and status = 'running';

  return new;
end;
$$;

drop trigger if exists member_privacy_cancel_running_assessment_generations
  on public.member_privacy_preferences;
create trigger member_privacy_cancel_running_assessment_generations
after update of assessment_consent on public.member_privacy_preferences
for each row
when (old.assessment_consent = true and new.assessment_consent = false)
execute function private.cancel_running_assessment_generations_on_consent_withdrawal();

create or replace function private.claim_ai_tailored_generation(
  p_user_id uuid,
  p_session_id uuid,
  p_generation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_baseline_answered integer;
  v_tailored_answered integer;
  v_tailored_questions integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_user_id::text, 0)
  );

  select session.status, session.baseline_answered, session.tailored_answered
  into v_status, v_baseline_answered, v_tailored_answered
  from public.assessment_sessions as session
  where session.id = p_session_id
    and session.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Assessment session not found';
  end if;

  if not exists (
    select 1
    from public.team_members as member
    where member.user_id = p_user_id
      and member.status in ('pending', 'active')
  ) then
    raise exception using errcode = '42501', message = 'Eligible membership required';
  end if;

  if not exists (
    select 1
    from public.member_privacy_preferences as preference
    where preference.user_id = p_user_id
      and preference.assessment_consent = true
      and preference.assessment_consent_version is not null
      and preference.assessment_consented_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Assessment consent required';
  end if;

  select count(*) into v_tailored_questions
  from public.assessment_questions
  where session_id = p_session_id
    and user_id = p_user_id
    and phase = 'tailored';

  if v_tailored_questions = 100 then
    return 'ready';
  end if;
  if v_tailored_questions <> 0 then
    raise exception using errcode = '22023', message = 'Tailored question snapshot is incomplete';
  end if;
  if v_status <> 'analysis' or v_baseline_answered <> 15 or v_tailored_answered <> 0 then
    raise exception using errcode = '22023', message = 'Baseline assessment is not ready for generation';
  end if;

  update private.assessment_generation_runs
  set status = 'failed',
      error_code = 'generation_lease_expired',
      finished_at = now()
  where session_id = p_session_id
    and status = 'running'
    and started_at < now() - interval '90 seconds';

  if exists (
    select 1
    from private.assessment_generation_runs
    where session_id = p_session_id
      and status = 'running'
  ) then
    return 'wait';
  end if;

  insert into private.assessment_generation_runs (
    generation_id, session_id, user_id, model, prompt_version, status
  ) values (
    p_generation_id, p_session_id, p_user_id, 'pending', 'insuccess-tailored-v2', 'running'
  );
  return 'acquired';
end;
$$;

create or replace function private.record_ai_tailored_generation_failure(
  p_generation_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception using errcode = '22023', message = 'Safe error code required';
  end if;

  update private.assessment_generation_runs
  set status = 'failed',
      error_code = p_error_code,
      finished_at = now()
  where generation_id = p_generation_id
    and status = 'running';
end;
$$;

create or replace function private.finalize_ai_tailored_question_snapshot(
  p_user_id uuid,
  p_session_id uuid,
  p_generation_id uuid,
  p_model text,
  p_prompt_version text,
  p_questions jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_baseline_answered integer;
  v_tailored_answered integer;
  v_tailored_questions integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || p_user_id::text, 0)
  );

  if p_model is null or char_length(p_model) not between 1 and 120
     or p_prompt_version is null or char_length(p_prompt_version) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Generation metadata is invalid';
  end if;
  if p_input_tokens is not null and p_input_tokens not between 0 and 10000000
     or p_output_tokens is not null and p_output_tokens not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'Token usage is invalid';
  end if;

  select session.status, session.baseline_answered, session.tailored_answered
  into v_status, v_baseline_answered, v_tailored_answered
  from public.assessment_sessions as session
  where session.id = p_session_id
    and session.user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Assessment session not found';
  end if;

  if not exists (
    select 1
    from public.team_members as member
    where member.user_id = p_user_id
      and member.status in ('pending', 'active')
  ) then
    raise exception using errcode = '42501', message = 'Eligible membership required';
  end if;

  if not exists (
    select 1
    from public.member_privacy_preferences as preference
    where preference.user_id = p_user_id
      and preference.assessment_consent = true
      and preference.assessment_consent_version is not null
      and preference.assessment_consented_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Assessment consent required';
  end if;

  if not exists (
    select 1
    from private.assessment_generation_runs as run
    where run.generation_id = p_generation_id
      and run.session_id = p_session_id
      and run.user_id = p_user_id
      and run.status = 'running'
  ) then
    raise exception using errcode = '22023', message = 'Active generation lease not found';
  end if;

  select count(*) into v_tailored_questions
  from public.assessment_questions
  where session_id = p_session_id
    and user_id = p_user_id
    and phase = 'tailored';

  if v_tailored_questions = 100 then
    update private.assessment_generation_runs
    set status = 'failed', error_code = 'snapshot_already_exists', finished_at = now()
    where generation_id = p_generation_id and status = 'running';
    return false;
  end if;
  if v_tailored_questions <> 0 then
    raise exception using errcode = '22023', message = 'Tailored question snapshot is incomplete';
  end if;
  if v_status <> 'analysis' or v_baseline_answered <> 15 or v_tailored_answered <> 0 then
    raise exception using errcode = '22023', message = 'Assessment is not ready for tailored questions';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception using errcode = '22023', message = 'Exactly 100 tailored questions are required';
  end if;
  if jsonb_array_length(p_questions) <> 100 then
    raise exception using errcode = '22023', message = 'Exactly 100 tailored questions are required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_questions) as question(
      position integer,
      dimension text,
      prompt text,
      "helpText" text,
      "responseType" text
    )
    where question.position is null
      or question.dimension is null
      or question.prompt is null
      or question."helpText" is null
      or question."responseType" is null
      or question.position not between 1 and 100
      or question.dimension not in (
        'direction', 'consistency', 'communication', 'relationships', 'content',
        'leadership', 'learning', 'resilience', 'planning', 'compliance'
      )
      or question."responseType" not in ('scale', 'short_text')
      or char_length(btrim(question.prompt)) not between 20 and 360
      or char_length(btrim(question."helpText")) not between 8 and 220
      or question.prompt !~ '[А-ЯӨҮа-яөү]'
      or question."helpText" !~ '[А-ЯӨҮа-яөү]'
      or question.prompt ~* '(password|passcode|otp|one[-[:space:]]*time[[:space:]]*password|pin[[:space:]]*code|passport|social[[:space:]]+security|bank[[:space:]]+account|card[[:space:]]+number|cvv|нууц үг|нэг[[:space:]]+удаагийн[[:space:]]+код|баталгаажуулах код|пин[[:space:]]*код|паспорт|регистрийн дугаар|банк(ны)?[[:space:]]+данс|дансны дугаар|картын дугаар|diagnos(e|is)|medical[[:space:]]+history|health|онош|өвчний түүх|эрүүл[[:space:]]+мэнд|шашин|улс төрийн үзэл|угсаа гарал|бэлгийн чиг баримжаа|in[[:space:]_-]*cruises|ин[[:space:]_-]*круиз(ес)?|board[[:space:]_-]+director|(боард|борд)[[:space:]_-]+директор)'
      or question."helpText" ~* '(password|passcode|otp|one[-[:space:]]*time[[:space:]]*password|pin[[:space:]]*code|passport|social[[:space:]]+security|bank[[:space:]]+account|card[[:space:]]+number|cvv|нууц үг|нэг[[:space:]]+удаагийн[[:space:]]+код|баталгаажуулах код|пин[[:space:]]*код|паспорт|регистрийн дугаар|банк(ны)?[[:space:]]+данс|дансны дугаар|картын дугаар|diagnos(e|is)|medical[[:space:]]+history|health|онош|өвчний түүх|эрүүл[[:space:]]+мэнд|шашин|улс төрийн үзэл|угсаа гарал|бэлгийн чиг баримжаа|in[[:space:]_-]*cruises|ин[[:space:]_-]*круиз(ес)?|board[[:space:]_-]+director|(боард|борд)[[:space:]_-]+директор)'
  ) then
    raise exception using errcode = '22023', message = 'A tailored question violates the safety contract';
  end if;

  if (
    select count(distinct question.position)
    from jsonb_to_recordset(p_questions) as question(position integer)
  ) <> 100 then
    raise exception using errcode = '22023', message = 'Question positions must be unique';
  end if;

  if (
    select count(distinct lower(regexp_replace(btrim(question.prompt), '[^[:alnum:]А-ЯӨҮа-яөү]+', ' ', 'g')))
    from jsonb_to_recordset(p_questions) as question(prompt text)
  ) <> 100 then
    raise exception using errcode = '22023', message = 'Question prompts must be unique';
  end if;

  if exists (
    select 1
    from (
      values
        ('direction'), ('consistency'), ('communication'), ('relationships'), ('content'),
        ('leadership'), ('learning'), ('resilience'), ('planning'), ('compliance')
    ) as dimension(name)
    left join jsonb_to_recordset(p_questions) as question(dimension text, "responseType" text)
      on question.dimension = dimension.name
    group by dimension.name
    having count(*) <> 10
      or count(*) filter (where question."responseType" = 'scale') <> 8
      or count(*) filter (where question."responseType" = 'short_text') <> 2
  ) then
    raise exception using errcode = '22023', message = 'Every dimension requires eight scales and two reflections';
  end if;

  insert into public.assessment_questions (
    session_id, user_id, phase, position, question_key, prompt, help_text,
    response_type, required, options, response_config, personalization_context, dimension
  )
  select
    p_session_id,
    p_user_id,
    'tailored',
    question.position::smallint,
    'ai-tailored-v2-' || lpad(question.position::text, 3, '0'),
    btrim(question.prompt),
    btrim(question."helpText"),
    question."responseType",
    true,
    '[]'::jsonb,
    case
      when question."responseType" = 'scale' then jsonb_build_object(
        'min', 1,
        'max', 5,
        'minLabel', 'Огт тохирохгүй',
        'maxLabel', 'Бүрэн тохирно'
      )
      else jsonb_build_object(
        'maxLength', 600,
        'placeholder', 'Нэг бодит жишээгээр өөрийн үгээр бичээрэй'
      )
    end,
    jsonb_build_object(
      'algorithmVersion', 'ai-tailored-v2',
      'promptVersion', p_prompt_version,
      'generationId', p_generation_id,
      'model', p_model
    ),
    question.dimension
  from jsonb_to_recordset(p_questions) as question(
    position integer,
    dimension text,
    prompt text,
    "helpText" text,
    "responseType" text
  )
  order by question.position;

  update public.assessment_sessions
  set status = 'tailored',
      adaptation_context = jsonb_build_object(
        'algorithmVersion', 'ai-tailored-v2',
        'source', 'ai_gateway',
        'promptVersion', p_prompt_version,
        'generationId', p_generation_id,
        'model', p_model
      ),
      last_activity_at = now()
  where id = p_session_id
    and user_id = p_user_id;

  update public.member_onboarding_state
  set status = 'tailored',
      updated_at = now()
  where user_id = p_user_id
    and active_session_id = p_session_id;

  update private.assessment_generation_runs
  set model = p_model,
      prompt_version = p_prompt_version,
      status = 'completed',
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      error_code = null,
      finished_at = now()
  where generation_id = p_generation_id
    and status = 'running';

  return true;
end;
$$;

create or replace function public.claim_ai_tailored_generation(
  p_user_id uuid,
  p_session_id uuid,
  p_generation_id uuid
)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.claim_ai_tailored_generation(p_user_id, p_session_id, p_generation_id);
$$;

create or replace function public.record_ai_tailored_generation_failure(
  p_generation_id uuid,
  p_error_code text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_ai_tailored_generation_failure(p_generation_id, p_error_code);
$$;

create or replace function public.finalize_ai_tailored_question_snapshot(
  p_user_id uuid,
  p_session_id uuid,
  p_generation_id uuid,
  p_model text,
  p_prompt_version text,
  p_questions jsonb,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.finalize_ai_tailored_question_snapshot(
    p_user_id,
    p_session_id,
    p_generation_id,
    p_model,
    p_prompt_version,
    p_questions,
    p_input_tokens,
    p_output_tokens
  );
$$;

revoke execute on function private.cancel_running_assessment_generations_on_consent_withdrawal()
  from public, anon, authenticated, service_role;
revoke execute on function private.claim_ai_tailored_generation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.record_ai_tailored_generation_failure(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.finalize_ai_tailored_question_snapshot(
  uuid, uuid, uuid, text, text, jsonb, integer, integer
) from public, anon, authenticated, service_role;
revoke execute on function public.claim_ai_tailored_generation(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.record_ai_tailored_generation_failure(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.finalize_ai_tailored_question_snapshot(
  uuid, uuid, uuid, text, text, jsonb, integer, integer
) from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.claim_ai_tailored_generation(uuid, uuid, uuid)
  to service_role;
grant execute on function private.record_ai_tailored_generation_failure(uuid, text)
  to service_role;
grant execute on function private.finalize_ai_tailored_question_snapshot(
  uuid, uuid, uuid, text, text, jsonb, integer, integer
) to service_role;
grant execute on function public.claim_ai_tailored_generation(uuid, uuid, uuid)
  to service_role;
grant execute on function public.record_ai_tailored_generation_failure(uuid, text)
  to service_role;
grant execute on function public.finalize_ai_tailored_question_snapshot(
  uuid, uuid, uuid, text, text, jsonb, integer, integer
) to service_role;

notify pgrst, 'reload schema';

commit;
