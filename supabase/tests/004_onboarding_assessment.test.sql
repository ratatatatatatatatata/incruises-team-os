begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(82);

select ok(
  (
    select
      routine.provolatile = 'v'
      and position(
        'pg_catalog.hashtextextended(''insuccess-member-state:'' || v_actor::text, 0)'
        in pg_get_functiondef(routine.oid)
      ) > 0
      and position('insuccess-member-state:' in pg_get_functiondef(routine.oid))
        < position('from public.team_members as member' in pg_get_functiondef(routine.oid))
      and position('insuccess-member-state:' in pg_get_functiondef(routine.oid))
        < position('from public.member_privacy_preferences as preference' in pg_get_functiondef(routine.oid))
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname = 'current_assessment_actor'
      and pg_get_function_identity_arguments(routine.oid) = ''
  ),
  'Assessment eligibility takes the shared member-state lock before membership and consent checks'
);

insert into auth.users (id, email)
values
  ('40000000-0000-4000-8000-000000000001', 'assessment-owner@example.test'),
  ('40000000-0000-4000-8000-000000000002', 'assessment-other@example.test'),
  ('40000000-0000-4000-8000-000000000003', 'assessment-partial@example.test'),
  ('40000000-0000-4000-8000-000000000004', 'assessment-bare@example.test'),
  ('40000000-0000-4000-8000-000000000005', 'assessment-disabled@example.test');

insert into public.team_members (user_id, role, status)
values
  ('40000000-0000-4000-8000-000000000001', 'builder', 'pending'),
  ('40000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('40000000-0000-4000-8000-000000000003', 'builder', 'pending'),
  ('40000000-0000-4000-8000-000000000005', 'builder', 'disabled');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.begin_onboarding_assessment()$$,
  '42501',
  'Assessment consent required',
  'A direct RPC cannot begin assessment before explicit consent'
);

reset role;
insert into public.member_privacy_preferences (
  user_id, assessment_consent, assessment_consent_version, assessment_consented_at
)
values
  ('40000000-0000-4000-8000-000000000001', true, 'success-map-test-v1', now()),
  ('40000000-0000-4000-8000-000000000002', true, 'success-map-test-v1', now()),
  ('40000000-0000-4000-8000-000000000003', true, 'success-map-test-v1', now()),
  ('40000000-0000-4000-8000-000000000004', true, 'success-map-test-v1', now()),
  ('40000000-0000-4000-8000-000000000005', true, 'success-map-test-v1', now());

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.begin_onboarding_assessment()$$,
  '42501',
  'Pending or active membership required',
  'A signed-in auth identity without membership cannot begin assessment'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.begin_onboarding_assessment()$$,
  '42501',
  'Pending or active membership required',
  'A disabled member cannot begin assessment even with recorded consent'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.begin_onboarding_assessment()$$,
  'A signed-in owner can begin onboarding while membership is pending'
);

select set_config(
  'app.assessment_session',
  (select active_session_id::text from public.member_onboarding_state),
  true
);

select is(
  (select status from public.member_onboarding_state),
  'baseline',
  'A new assessment starts in baseline stage'
);

select is(
  (select count(*) from public.assessment_questions where phase = 'baseline'),
  15::bigint,
  'The baseline snapshot contains exactly 15 questions'
);

select is(
  (select status from public.team_members where user_id = '40000000-0000-4000-8000-000000000001'),
  'pending',
  'Assessment access does not activate application membership'
);

select is(
  (select count(*) from public.assessment_sessions),
  1::bigint,
  'The owner can select their own assessment session'
);

select is(
  has_table_privilege('authenticated', 'public.assessment_sessions', 'INSERT'),
  false,
  'Authenticated clients cannot directly insert assessment sessions'
);

select is(
  has_table_privilege('anon', 'public.assessment_sessions', 'SELECT'),
  false,
  'Anonymous clients cannot select assessment sessions'
);

select is(
  has_function_privilege('anon', 'public.begin_onboarding_assessment()', 'EXECUTE'),
  false,
  'Anonymous clients cannot begin an assessment'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is_empty(
  $$select id from public.assessment_sessions$$,
  'Another user cannot read the owner assessment session'
);

select throws_ok(
  $$select public.snapshot_onboarding_tailored_questions(current_setting('app.assessment_session')::uuid)$$,
  'P0002',
  'Assessment session not found',
  'An admin role cannot snapshot another owner tailored questions'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      (select id from public.assessment_questions where phase = 'baseline' and position = 1),
      '40000000-0000-4000-8000-00000000a001',
      'answer',
      to_jsonb(5),
      null
    )
  $$,
  'The owner can autosave the current baseline answer'
);

select is(
  (select count(*) from public.assessment_answers),
  1::bigint,
  'Autosave creates one answer row'
);

select lives_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      (select id from public.assessment_questions where phase = 'baseline' and position = 1),
      '40000000-0000-4000-8000-00000000a001',
      'answer',
      to_jsonb(5),
      null
    )
  $$,
  'Retrying the same clientAnswerId and payload is idempotent'
);

select is(
  (select count(*) from public.assessment_answers),
  1::bigint,
  'An idempotent retry does not duplicate an answer'
);

select throws_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      (select id from public.assessment_questions where phase = 'baseline' and position = 1),
      '40000000-0000-4000-8000-00000000a001',
      'answer',
      to_jsonb(4),
      null
    )
  $$,
  '22023',
  'clientAnswerId was already used for a different answer',
  'A clientAnswerId cannot be reused with a different payload'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = false, updated_at = now()
where user_id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      (select id from public.assessment_questions where phase = 'baseline' and position = 2),
      gen_random_uuid(),
      'answer',
      to_jsonb('board_director'::text),
      null
    )
  $$,
  '42501',
  'Assessment consent required',
  'Withdrawing consent immediately blocks assessment answer transitions'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = true, updated_at = now()
where user_id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  v_question record;
  v_answer jsonb;
begin
  for v_question in
    select id, position, question_key
    from public.assessment_questions
    where phase = 'baseline' and position between 2 and 15
    order by position
  loop
    v_answer := case v_question.question_key
      when 'baseline-primary-goal' then to_jsonb('board_director'::text)
      when 'baseline-current-stage' then to_jsonb('experienced_leader'::text)
      when 'baseline-weekly-time' then to_jsonb('over_10h'::text)
      when 'baseline-primary-channel' then to_jsonb('facebook'::text)
      when 'baseline-biggest-obstacle' then to_jsonb('consistency'::text)
      else to_jsonb(5)
    end;
    perform public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      v_question.id,
      gen_random_uuid(),
      'answer',
      v_answer,
      null
    );
  end loop;
end;
$$;

select is(
  (select baseline_answered from public.member_onboarding_state),
  15::smallint,
  'All 15 baseline responses are counted server-side'
);

select is(
  (select status from public.member_onboarding_state),
  'analysis',
  'The fifteenth baseline response advances to analysis'
);

select throws_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.assessment_session')::uuid)$$,
  '22023',
  'Exactly 15 baseline and 100 tailored responses are required',
  'Completion is rejected before the tailored snapshot and answers exist'
);

select lives_ok(
  $$select public.snapshot_onboarding_tailored_questions(current_setting('app.assessment_session')::uuid)$$,
  'The owner can create the deterministic adaptive question snapshot'
);

select is(
  (select count(*) from public.assessment_questions where phase = 'tailored'),
  100::bigint,
  'The adaptive snapshot contains exactly 100 tailored questions'
);

select is(
  (select min(position) from public.assessment_questions where phase = 'tailored'),
  1::smallint,
  'Tailored positions start at one'
);

select is(
  (select max(position) from public.assessment_questions where phase = 'tailored'),
  100::smallint,
  'Tailored positions end at one hundred'
);

select is(
  (select count(distinct prompt) from public.assessment_questions where phase = 'tailored'),
  100::bigint,
  'Every tailored prompt snapshot is distinct'
);

select is(
  (select count(*) from public.assessment_questions where phase = 'tailored' and response_type = 'single_choice'),
  20::bigint,
  'The tailored flow mixes twenty easy labelled choices into the one hundred questions'
);

select is(
  (select count(*) from public.assessment_questions where phase = 'tailored' and response_type = 'scale'),
  80::bigint,
  'The tailored flow retains eighty fast tap-based scale questions'
);

select is(
  (select adaptation_context ->> 'algorithmVersion' from public.assessment_sessions),
  'adaptive-branch-v2',
  'The deterministic adaptive algorithm version is recorded'
);

select is(
  (select status from public.member_onboarding_state),
  'tailored',
  'The adaptive snapshot advances the session to tailored stage'
);

do $$
declare
  v_question record;
begin
  for v_question in
    select id, position, response_type
    from public.assessment_questions
    where phase = 'tailored' and position between 1 and 99
    order by position
  loop
    perform public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      v_question.id,
      gen_random_uuid(),
      'answer',
      case
        when v_question.response_type = 'single_choice' then to_jsonb('clearly_true'::text)
        else to_jsonb(5)
      end,
      null
    );
  end loop;
end;
$$;

select is(
  (select tailored_answered from public.member_onboarding_state),
  99::smallint,
  'Tailored autosave progress is resumable at 99 of 100'
);

select throws_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.assessment_session')::uuid)$$,
  '22023',
  'Exactly 15 baseline and 100 tailored responses are required',
  'Completion remains rejected while one tailored response is missing'
);

select set_config(
  'app.last_question',
  (select id::text from public.assessment_questions where phase = 'tailored' and position = 100),
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is_empty(
  $$select id from public.assessment_questions$$,
  'Another user cannot read the owner question snapshots'
);

select throws_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      current_setting('app.last_question')::bigint,
      gen_random_uuid(),
      'answer',
      (
        select case
          when response_type = 'single_choice' then to_jsonb('clearly_true'::text)
          else to_jsonb(5)
        end
        from public.assessment_questions
        where id = current_setting('app.last_question')::bigint
      ),
      null
    )
  $$,
  'P0002',
  'Assessment session not found',
  'Another user cannot answer the owner current question'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      current_setting('app.last_question')::bigint,
      '40000000-0000-4000-8000-00000000a100',
      'answer',
      (
        select case
          when response_type = 'single_choice' then to_jsonb('clearly_true'::text)
          else to_jsonb(5)
        end
        from public.assessment_questions
        where id = current_setting('app.last_question')::bigint
      ),
      null
    )
  $$,
  'The owner can save the hundredth tailored response'
);

select lives_ok(
  $$
    select public.save_onboarding_answer(
      current_setting('app.assessment_session')::uuid,
      current_setting('app.last_question')::bigint,
      '40000000-0000-4000-8000-00000000a100',
      'answer',
      (
        select case
          when response_type = 'single_choice' then to_jsonb('clearly_true'::text)
          else to_jsonb(5)
        end
        from public.assessment_questions
        where id = current_setting('app.last_question')::bigint
      ),
      null
    )
  $$,
  'The final answer retry remains idempotent after stage advancement'
);

select is(
  (select count(*) from public.assessment_answers),
  115::bigint,
  'The completed response set contains exactly 115 rows'
);

select is(
  (select status from public.member_onboarding_state),
  'ready_to_complete',
  'The 115th response advances to ready-to-complete'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = false, updated_at = now()
where user_id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.assessment_session')::uuid)$$,
  '42501',
  'Assessment consent required',
  'Withdrawing consent immediately blocks profile and guide generation'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = true, updated_at = now()
where user_id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.assessment_session')::uuid)$$,
  'The owner can complete after the database verifies 15 plus 100 responses'
);

select is(
  (select status from public.member_onboarding_state),
  'completed',
  'Completion is stored in the authoritative onboarding state'
);

select is(
  (select count(*) from public.success_profiles),
  1::bigint,
  'Completion creates one deterministic success profile'
);

select is(
  (select count(*) from public.success_guides),
  1::bigint,
  'Completion creates one deterministic success guide'
);

select is(
  (select count(*) from jsonb_object_keys((select dimension_scores from public.success_profiles))),
  10::bigint,
  'The profile contains all ten dimension scores'
);

select is(
  (select count(*) from jsonb_object_keys((select dimension_evidence_counts from public.success_profiles))),
  10::bigint,
  'The profile retains evidence counts for all ten dimensions'
);

select is(
  (select (board_director_route ->> 'promise')::boolean from public.success_guides),
  false,
  'The Board Director development route is explicitly not a promise'
);

select is(
  (select (board_director_route ->> 'appropriate')::boolean from public.success_guides),
  true,
  'Board development opens only for an explicitly selected goal with sufficient readiness evidence'
);

select is(
  (select content_strategy -> 'primaryPillars' ->> 0 from public.success_guides),
  'Leadership сургамж',
  'The guide stores goal-specific content pillars for the selected development route'
);

select is(
  (select jsonb_array_length(board_director_route -> 'gaps') from public.success_guides),
  0,
  'An all-high evidence profile does not receive arbitrary tie-broken gaps'
);

select ok(
  position('амлахгүй' in (select rank_disclaimer from public.success_guides)) > 0,
  'The stored guide explicitly avoids promising rank or income'
);

select is(
  has_table_privilege('authenticated', 'public.success_profiles', 'INSERT'),
  false,
  'Authenticated clients cannot directly forge success profiles'
);

select is(
  has_table_privilege('authenticated', 'public.assessment_sessions', 'UPDATE'),
  false,
  'Authenticated clients cannot directly mark an assessment complete'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is_empty(
  $$select user_id from public.success_profiles$$,
  'Another user, including an admin, cannot read the owner success profile'
);

select is_empty(
  $$select user_id from public.success_guides$$,
  'Another user, including an admin, cannot read the owner success guide'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.assessment_session')::uuid)$$,
  'Completion is idempotent for the same completed session'
);

select is(
  (select count(*) from public.assessment_questions),
  115::bigint,
  'The immutable question snapshot remains exactly 15 plus 100'
);

select is(
  has_table_privilege('authenticated', 'public.assessment_answers', 'DELETE'),
  false,
  'Authenticated clients cannot delete persisted responses'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.begin_onboarding_assessment()$$,
  'A second consenting owner can start an independent assessment'
);

do $$
declare
  v_session_id uuid;
  v_question_id bigint;
begin
  select active_session_id into v_session_id
  from public.member_onboarding_state
  where user_id = '40000000-0000-4000-8000-000000000002';

  for counter in 1..15 loop
    select question.id into v_question_id
    from public.assessment_questions as question
    where question.session_id = v_session_id
      and not exists (
        select 1 from public.assessment_answers as answer where answer.question_id = question.id
      )
    order by question.position
    limit 1;
    perform public.save_onboarding_answer(
      v_session_id, v_question_id, gen_random_uuid(), 'skip', null, 'not_sure'
    );
  end loop;

  perform public.snapshot_onboarding_tailored_questions(v_session_id);

  for counter in 1..100 loop
    select question.id into v_question_id
    from public.assessment_questions as question
    where question.session_id = v_session_id
      and question.phase = 'tailored'
      and not exists (
        select 1 from public.assessment_answers as answer where answer.question_id = question.id
      )
    order by question.position
    limit 1;
    perform public.save_onboarding_answer(
      v_session_id, v_question_id, gen_random_uuid(), 'skip', null, 'not_sure'
    );
  end loop;
end;
$$;

select lives_ok(
  $$select public.complete_onboarding_assessment(
    (select active_session_id from public.member_onboarding_state where user_id = '40000000-0000-4000-8000-000000000002')
  )$$,
  'A user may finish with unknown answers without receiving unsupported conclusions'
);

select is(
  (select (board_director_route ->> 'appropriate')::boolean from public.success_guides),
  false,
  'All-skipped evidence can never open the Board Director route'
);

select is(
  (select primary_style from public.success_profiles),
  'Нэмэлт мэдээлэл шаардлагатай',
  'Low evidence is labelled insufficient instead of inventing a style'
);

select is(
  (select (dimension_evidence_counts ->> 'leadership')::integer from public.success_profiles),
  0,
  'A skipped dimension is retained as unknown with zero scored evidence'
);

reset role;
select is(
  (
    select count(*)
    from public.assessment_questions as first_profile
    join public.assessment_questions as second_profile
      on second_profile.prompt = first_profile.prompt
      and second_profile.phase = 'tailored'
    where first_profile.user_id = '40000000-0000-4000-8000-000000000001'
      and first_profile.phase = 'tailored'
      and second_profile.user_id = '40000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'Opposite baseline evidence produces a genuinely different tailored prompt set'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.begin_onboarding_assessment()$$,
  'A third owner can start the partial-evidence regression assessment'
);

select set_config(
  'app.partial_session',
  (select active_session_id::text from public.member_onboarding_state where user_id = '40000000-0000-4000-8000-000000000003'),
  true
);

do $$
declare
  v_question record;
  v_dimension_answered integer;
begin
  for v_question in
    select id, response_type, options
    from public.assessment_questions
    where session_id = current_setting('app.partial_session')::uuid
      and phase = 'baseline'
    order by position
  loop
    perform public.save_onboarding_answer(
      current_setting('app.partial_session')::uuid,
      v_question.id,
      gen_random_uuid(),
      'answer',
      case
        when v_question.response_type = 'single_choice' then to_jsonb(v_question.options -> 0 ->> 'value')
        else to_jsonb(5)
      end,
      null
    );
  end loop;

  perform public.snapshot_onboarding_tailored_questions(current_setting('app.partial_session')::uuid);

  for v_question in
    select id, dimension, response_type
    from public.assessment_questions
    where session_id = current_setting('app.partial_session')::uuid
      and phase = 'tailored'
    order by position
  loop
    select count(*)::integer
    into v_dimension_answered
    from public.assessment_answers as answer
    join public.assessment_questions as question on question.id = answer.question_id
    where answer.session_id = current_setting('app.partial_session')::uuid
      and answer.answer_kind = 'answer'
      and question.dimension = v_question.dimension;

    if v_dimension_answered < 3 then
      perform public.save_onboarding_answer(
        current_setting('app.partial_session')::uuid,
        v_question.id,
        gen_random_uuid(),
        'answer',
        case
          when v_question.response_type = 'single_choice' then to_jsonb('clearly_true'::text)
          else to_jsonb(5)
        end,
        null
      );
    else
      perform public.save_onboarding_answer(
        current_setting('app.partial_session')::uuid,
        v_question.id,
        gen_random_uuid(),
        'skip',
        null,
        'not_sure'
      );
    end if;
  end loop;
end;
$$;

select lives_ok(
  $$select public.complete_onboarding_assessment(current_setting('app.partial_session')::uuid)$$,
  'A thirty-answer profile can complete without forcing unsupported classifications'
);

select is(
  (select count(*) from public.assessment_answers where user_id = '40000000-0000-4000-8000-000000000003' and answer_kind = 'answer'),
  30::bigint,
  'The partial-evidence regression has exactly thirty non-skip answers'
);

select is(
  (
    select max(value::integer)
    from jsonb_each_text((select dimension_evidence_counts from public.success_profiles where user_id = '40000000-0000-4000-8000-000000000003'))
  ),
  3,
  'No dimension in the partial-evidence regression reaches the six-answer classification threshold'
);

select is(
  (select primary_style from public.success_profiles where user_id = '40000000-0000-4000-8000-000000000003'),
  'Нэмэлт мэдээлэл шаардлагатай',
  'Sparse dimensions do not produce a definitive primary style'
);

select is(
  (select jsonb_array_length(strengths) from public.success_profiles where user_id = '40000000-0000-4000-8000-000000000003'),
  0,
  'Sparse dimensions do not produce unsupported strengths'
);

select is(
  (select jsonb_array_length(growth_edges) from public.success_profiles where user_id = '40000000-0000-4000-8000-000000000003'),
  0,
  'Sparse dimensions do not turn unknown evidence into growth edges'
);

select ok(
  position('6 үнэлэгдэх' in (select communication_style from public.success_profiles where user_id = '40000000-0000-4000-8000-000000000003')) > 0,
  'Sparse communication evidence is explicitly labelled insufficient'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

select is_empty(
  $$select id from public.assessment_sessions$$,
  'An anonymous JWT cannot read an otherwise eligible owner assessment'
);

select throws_ok(
  $$select public.begin_onboarding_assessment()$$,
  '42501',
  'Authenticated non-anonymous user required',
  'An anonymous JWT cannot call an assessment transition'
);

reset role;
update public.team_members
set status = 'disabled', updated_at = now()
where user_id = '40000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is_empty(
  $$select id from public.assessment_sessions$$,
  'Disabling membership immediately revokes assessment session reads'
);

select is_empty(
  $$select user_id from public.member_onboarding_state$$,
  'Disabling membership immediately revokes onboarding state reads'
);

select is_empty(
  $$select id from public.assessment_questions$$,
  'Disabling membership immediately revokes question reads'
);

select is_empty(
  $$select id from public.assessment_answers$$,
  'Disabling membership immediately revokes answer reads'
);

select is_empty(
  $$select user_id from public.success_profiles$$,
  'Disabling membership immediately revokes success profile reads'
);

select is_empty(
  $$select user_id from public.success_guides$$,
  'Disabling membership immediately revokes success guide reads'
);

select throws_ok(
  $$select public.begin_onboarding_assessment()$$,
  '42501',
  'Pending or active membership required',
  'Disabling membership immediately revokes assessment transitions'
);

select * from finish();
rollback;
