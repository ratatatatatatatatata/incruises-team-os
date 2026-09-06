begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(36);

select is(
  (select relrowsecurity from pg_class where oid = 'private.assessment_generation_runs'::regclass),
  true,
  'AI assessment generation leases have RLS enabled'
);

select is(
  has_table_privilege('authenticated', 'private.assessment_generation_runs', 'SELECT'),
  false,
  'Authenticated browser clients cannot read private generation telemetry'
);

select is(
  has_table_privilege('service_role', 'private.assessment_generation_runs', 'SELECT'),
  false,
  'The service role cannot bypass the vetted RPCs with direct table reads'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.claim_ai_tailored_generation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'Authenticated browser clients cannot claim an AI generation lease'
);

select is(
  has_function_privilege(
    'service_role',
    'public.claim_ai_tailored_generation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'The service role can execute the public claim wrapper'
);

select is(
  has_function_privilege(
    'authenticated',
    'private.claim_ai_tailored_generation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'Authenticated browser clients cannot execute the private claim implementation'
);

select is(
  has_function_privilege(
    'service_role',
    'private.claim_ai_tailored_generation(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  true,
  'The service role can execute the private claim implementation through the wrapper'
);

select is(
  (
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'claim_ai_tailored_generation'
      and pg_get_function_identity_arguments(routine.oid) = 'p_user_id uuid, p_session_id uuid, p_generation_id uuid'
  ),
  true,
  'The private claim implementation is security definer'
);

select is(
  (
    select routine.prosecdef
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname = 'claim_ai_tailored_generation'
      and pg_get_function_identity_arguments(routine.oid) = 'p_user_id uuid, p_session_id uuid, p_generation_id uuid'
  ),
  false,
  'The public claim wrapper is security invoker'
);

select ok(
  (
    select
      position('insuccess-member-state:' in pg_get_functiondef(routine.oid)) > 0
      and position('insuccess-member-state:' in pg_get_functiondef(routine.oid))
        < position('from public.team_members as member' in pg_get_functiondef(routine.oid))
      and position('from public.team_members as member' in pg_get_functiondef(routine.oid))
        < position('from public.member_privacy_preferences as preference' in pg_get_functiondef(routine.oid))
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'claim_ai_tailored_generation'
      and pg_get_function_identity_arguments(routine.oid) = 'p_user_id uuid, p_session_id uuid, p_generation_id uuid'
  ),
  'Claim serializes the eligibility checks on the shared member-state lock'
);

select ok(
  (
    select
      position('insuccess-member-state:' in pg_get_functiondef(routine.oid)) > 0
      and position('from public.member_privacy_preferences as preference' in pg_get_functiondef(routine.oid)) > 0
      and position('jsonb_array_length(p_questions) <> 100' in pg_get_functiondef(routine.oid)) > 0
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'finalize_ai_tailored_question_snapshot'
  ),
  'Finalize rechecks consent under the shared lock and requires exactly 100 questions'
);

select ok(
  (
    select
      routine.prosecdef
      and position('insuccess-member-state:' in pg_get_functiondef(routine.oid)) > 0
      and position('consent_withdrawn' in pg_get_functiondef(routine.oid)) > 0
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'cancel_running_assessment_generations_on_consent_withdrawal'
  ),
  'Consent withdrawal atomically cancels running assessment generations'
);

select is(
  has_function_privilege(
    'service_role',
    'private.cancel_running_assessment_generations_on_consent_withdrawal()',
    'EXECUTE'
  ),
  false,
  'The trigger helper cannot be called directly by the service role'
);

insert into auth.users (id, email)
values
  ('80000000-0000-4000-8000-000000000001', 'ai-assessment-one@example.test'),
  ('80000000-0000-4000-8000-000000000002', 'ai-assessment-no-consent@example.test'),
  ('80000000-0000-4000-8000-000000000003', 'ai-assessment-withdrawal@example.test');

insert into public.team_members (user_id, role, status)
values
  ('80000000-0000-4000-8000-000000000001', 'builder', 'pending'),
  ('80000000-0000-4000-8000-000000000002', 'builder', 'active'),
  ('80000000-0000-4000-8000-000000000003', 'builder', 'active');

insert into public.member_privacy_preferences (
  user_id, assessment_consent, assessment_consent_version, assessment_consented_at
)
values
  ('80000000-0000-4000-8000-000000000001', true, 'success-map-test-v1', now()),
  ('80000000-0000-4000-8000-000000000002', false, null, null),
  ('80000000-0000-4000-8000-000000000003', true, 'success-map-test-v1', now());

insert into public.assessment_sessions (
  id, user_id, status, baseline_answered, tailored_answered
)
values
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'analysis', 15, 0),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'analysis', 15, 0),
  ('81000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003', 'analysis', 15, 0);

insert into public.member_onboarding_state (
  user_id, active_session_id, status, baseline_answered, tailored_answered, started_at
)
values
  ('80000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'analysis', 15, 0, now()),
  ('80000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'analysis', 15, 0, now()),
  ('80000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', 'analysis', 15, 0, now());

select set_config(
  'app.ai_tailored_payload',
  (
    select jsonb_agg(
      jsonb_build_object(
        'position', ((rounds.round_number - 1) * 10) + dimension.dimension_number,
        'dimension', dimension.name,
        'prompt', format(
          '%s чиглэлийн %s-р бодит нөхцөлд хийх ажлаа хэр тогтвортой үргэлжлүүлдэг вэ?',
          dimension.name,
          rounds.round_number
        ),
        'helpText', format(
          '%s чиглэлийн %s-р асуултад сүүлийн бодит жишээгээ бодож хариулна уу.',
          dimension.name,
          rounds.round_number
        ),
        'responseType', case
          when rounds.round_number in (5, 10) then 'short_text'
          else 'scale'
        end
      )
      order by rounds.round_number, dimension.dimension_number
    )::text
    from unnest(array[
      'direction', 'consistency', 'communication', 'relationships', 'content',
      'leadership', 'learning', 'resilience', 'planning', 'compliance'
    ]) with ordinality as dimension(name, dimension_number)
    cross join generate_series(1, 10) as rounds(round_number)
  ),
  true
);

set local role service_role;

select throws_ok(
  $$select public.claim_ai_tailored_generation(
    '80000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000002'
  )$$,
  '42501',
  'Assessment consent required',
  'The service cannot claim a generation without current consent evidence'
);

select is(
  public.claim_ai_tailored_generation(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001'
  ),
  'acquired',
  'A consented eligible assessment acquires one generation lease'
);

select is(
  public.claim_ai_tailored_generation(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000011'
  ),
  'wait',
  'A concurrent claim for the same session waits on the active lease'
);

select throws_ok(
  $$select public.finalize_ai_tailored_question_snapshot(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'openai/test-model',
    'insuccess-tailored-v2',
    '{}'::jsonb,
    100,
    200
  )$$,
  '22023',
  'Exactly 100 tailored questions are required',
  'Finalize rejects a non-array payload with the stable validation error'
);

select throws_ok(
  $$select public.finalize_ai_tailored_question_snapshot(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'openai/test-model',
    'insuccess-tailored-v2',
    current_setting('app.ai_tailored_payload')::jsonb - 99,
    100,
    200
  )$$,
  '22023',
  'Exactly 100 tailored questions are required',
  'Finalize rejects a 99-question payload atomically'
);

reset role;
select is(
  (select count(*) from public.assessment_questions where session_id = '81000000-0000-4000-8000-000000000001'),
  0::bigint,
  'A rejected 99-question payload persists no partial snapshot'
);

set local role service_role;
select throws_ok(
  $$select public.finalize_ai_tailored_question_snapshot(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'openai/test-model',
    'insuccess-tailored-v2',
    jsonb_set(
      current_setting('app.ai_tailored_payload')::jsonb,
      '{0,helpText}',
      to_jsonb('Нууц үгээ жишээ болгон бичнэ үү.'::text)
    ),
    100,
    200
  )$$,
  '22023',
  'A tailored question violates the safety contract',
  'Finalize applies the sensitive-topic filter to help text'
);

reset role;
select is(
  (select count(*) from public.assessment_questions where session_id = '81000000-0000-4000-8000-000000000001'),
  0::bigint,
  'A rejected unsafe payload persists no partial snapshot'
);

set local role service_role;
select is(
  public.finalize_ai_tailored_question_snapshot(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'openai/test-model',
    'insuccess-tailored-v2',
    current_setting('app.ai_tailored_payload')::jsonb,
    100,
    200
  ),
  true,
  'A valid balanced 100-question payload is finalized atomically'
);

reset role;
select is(
  (select count(*) from public.assessment_questions where session_id = '81000000-0000-4000-8000-000000000001'),
  100::bigint,
  'Finalize persists exactly 100 tailored questions'
);

select is(
  (select count(distinct position) from public.assessment_questions where session_id = '81000000-0000-4000-8000-000000000001'),
  100::bigint,
  'All persisted tailored positions are unique'
);

select is_empty(
  $$
    select dimension
    from public.assessment_questions
    where session_id = '81000000-0000-4000-8000-000000000001'
    group by dimension
    having count(*) <> 10
  $$,
  'Every dimension contains exactly ten persisted questions'
);

select is(
  (select count(*) from public.assessment_questions
    where session_id = '81000000-0000-4000-8000-000000000001' and response_type = 'scale'),
  80::bigint,
  'The persisted payload contains exactly 80 scale questions'
);

select is(
  (select count(*) from public.assessment_questions
    where session_id = '81000000-0000-4000-8000-000000000001' and response_type = 'short_text'),
  20::bigint,
  'The persisted payload contains exactly 20 reflection questions'
);

select is(
  (select status from public.assessment_sessions where id = '81000000-0000-4000-8000-000000000001'),
  'tailored',
  'Finalize advances the assessment session to tailored'
);

select is(
  (select status from public.member_onboarding_state where user_id = '80000000-0000-4000-8000-000000000001'),
  'tailored',
  'Finalize advances the member onboarding state to tailored'
);

select is(
  (select status from private.assessment_generation_runs where generation_id = '82000000-0000-4000-8000-000000000001'),
  'completed',
  'Finalize marks the generation lease completed'
);

set local role service_role;
select is(
  public.claim_ai_tailored_generation(
    '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000012'
  ),
  'ready',
  'A retry observes the completed 100-question snapshot as ready'
);

select is(
  public.claim_ai_tailored_generation(
    '80000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000003'
  ),
  'acquired',
  'A second consented assessment acquires a generation lease'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select lives_ok(
  $$update public.member_privacy_preferences
    set assessment_consent = false, updated_at = now()
    where user_id = '80000000-0000-4000-8000-000000000003'$$,
  'The member can withdraw consent while AI generation is in flight'
);

reset role;
select is(
  (select status from private.assessment_generation_runs where generation_id = '82000000-0000-4000-8000-000000000003'),
  'failed',
  'Consent withdrawal cancels the running generation lease'
);

select is(
  (select error_code from private.assessment_generation_runs where generation_id = '82000000-0000-4000-8000-000000000003'),
  'consent_withdrawn',
  'The cancelled lease records a safe consent-withdrawal reason'
);

set local role service_role;
select throws_ok(
  $$select public.finalize_ai_tailored_question_snapshot(
    '80000000-0000-4000-8000-000000000003',
    '81000000-0000-4000-8000-000000000003',
    '82000000-0000-4000-8000-000000000003',
    'openai/test-model',
    'insuccess-tailored-v2',
    current_setting('app.ai_tailored_payload')::jsonb,
    100,
    200
  )$$,
  '42501',
  'Assessment consent required',
  'A result cannot persist after the member withdraws consent'
);

select * from finish();
rollback;
