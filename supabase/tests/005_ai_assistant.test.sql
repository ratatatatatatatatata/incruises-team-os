begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

select is(
  (
    select count(*)
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'private'
      and routine.proname in (
        'create_assistant_turn',
        'complete_assistant_turn',
        'cancel_pending_assistant_turns_for_withdrawal',
        'withdraw_assessment_consent'
      )
      and position('insuccess-member-state:' in pg_get_functiondef(routine.oid)) > 0
  ),
  4::bigint,
  'AI creation, finalization, and consent withdrawal share the member-state transaction lock'
);

insert into auth.users (id, email)
values
  ('50000000-0000-4000-8000-000000000001', 'mentor-one@example.test'),
  ('50000000-0000-4000-8000-000000000002', 'mentor-bare@example.test'),
  ('50000000-0000-4000-8000-000000000003', 'mentor-disabled@example.test'),
  ('50000000-0000-4000-8000-000000000004', 'mentor-quota@example.test');

insert into public.team_members (user_id, role, status)
values
  ('50000000-0000-4000-8000-000000000001', 'builder', 'active'),
  ('50000000-0000-4000-8000-000000000003', 'builder', 'disabled'),
  ('50000000-0000-4000-8000-000000000004', 'builder', 'active');

insert into public.member_onboarding_state (
  user_id, status, assessment_version, baseline_answered, tailored_answered,
  started_at, completed_at
)
values
  ('50000000-0000-4000-8000-000000000001', 'completed', 'insuccess-v1', 15, 100, now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'completed', 'insuccess-v1', 15, 100, now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'completed', 'insuccess-v1', 15, 100, now(), now());

insert into public.member_privacy_preferences (
  user_id, assessment_consent, assessment_consent_version, assessment_consented_at
)
values
  ('50000000-0000-4000-8000-000000000001', true, 'success-map-test-v1', now()),
  ('50000000-0000-4000-8000-000000000003', true, 'success-map-test-v1', now()),
  ('50000000-0000-4000-8000-000000000004', true, 'success-map-test-v1', now());

select is(has_table_privilege('authenticated', 'public.ai_conversations', 'INSERT'), false,
  'Authenticated clients cannot directly insert conversations');
select is(has_table_privilege('authenticated', 'public.ai_generations', 'UPDATE'), false,
  'Authenticated clients cannot directly edit generation records');
select is(has_table_privilege('authenticated', 'public.ai_messages', 'DELETE'), false,
  'Authenticated clients cannot delete assistant history');
select is(has_table_privilege('anon', 'public.ai_messages', 'SELECT'), false,
  'Anonymous clients cannot read assistant history');

select is(
  has_function_privilege('authenticated', 'public.create_assistant_turn(uuid,uuid,text,text,text,text,jsonb)', 'EXECUTE'),
  false,
  'Browser-authorized users cannot call the privileged turn writer'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_assistant_turn(uuid,uuid,text,text,text,text,integer,integer,integer)',
    'EXECUTE'
  ),
  false,
  'Browser-authorized users cannot forge assistant completions'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_assistant_turn(uuid,uuid,text,text,text,text,integer,integer,integer)',
    'EXECUTE'
  ),
  true,
  'The server-only service role can finalize assistant generations'
);
select is(
  has_function_privilege('authenticated', 'public.withdraw_assessment_consent()', 'EXECUTE'),
  true,
  'An authenticated owner can call the atomic consent-withdrawal wrapper'
);
select is(
  has_function_privilege('anon', 'public.withdraw_assessment_consent()', 'EXECUTE'),
  false,
  'The anonymous role cannot call the consent-withdrawal wrapper'
);
select is(
  has_function_privilege('service_role', 'public.withdraw_assessment_consent()', 'EXECUTE'),
  false,
  'The service role cannot impersonate an owner through the withdrawal wrapper'
);
select is(
  has_function_privilege('authenticated', 'private.withdraw_assessment_consent(uuid)', 'EXECUTE'),
  true,
  'The invoker wrapper can reach the owner-bound private withdrawal function'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select throws_ok(
  $$select * from private.withdraw_assessment_consent('50000000-0000-4000-8000-000000000003')$$,
  '42501', 'Authenticated non-anonymous user required',
  'The private function rejects an actor other than auth.uid even when called directly'
);

reset role;
set local role service_role;

select throws_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000002', null, 'Bare account', 'simple',
    'Өнөөдөр юунаас эхлэх вэ?', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  '42501', 'Active member with a completed Success Map required',
  'A bare authenticated identity cannot create a generation'
);

select throws_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000003', null, 'Disabled account', 'simple',
    'Өнөөдөр юунаас эхлэх вэ?', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  '42501', 'Active member with a completed Success Map required',
  'A disabled member cannot create a generation'
);

select lives_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000001', null, 'Эхний ярилцлага', 'simple',
    'Өнөөдөр юунаас эхлэх вэ?', 'openai/gpt-5.6-luna',
    '{"profile_version":"success-map-v1"}'::jsonb
  )$$,
  'The server atomically creates an authorized conversation, generation and user message'
);

select is(
  (select count(*) from public.ai_conversations where user_id = '50000000-0000-4000-8000-000000000001'),
  1::bigint,
  'The authorized conversation is stored once'
);
select is(
  (select status from public.ai_generations where user_id = '50000000-0000-4000-8000-000000000001'),
  'pending',
  'A generation is persisted before model work begins'
);
select is(
  (select role from public.ai_messages where user_id = '50000000-0000-4000-8000-000000000001'),
  'user',
  'The initiating user message is persisted'
);

select set_config(
  'test.ai_generation_id',
  (select id::text from public.ai_generations where user_id = '50000000-0000-4000-8000-000000000001'),
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select is_empty($$select id from public.ai_conversations$$,
  'Another user cannot read the first user conversation');

reset role;
set local role service_role;

select throws_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000002',
    current_setting('test.ai_generation_id')::uuid,
    'Forged reply', 'openai/gpt-5.6-luna', 'ai_gateway', null, 1, 1, 2
  )$$,
  'P0002', 'Generation not found',
  'Even the service path must provide the correct generation owner'
);

select lives_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.ai_generation_id')::uuid,
    'Өнөөдөр 20 минутын нэг ажлыг сонгоод эхэл.',
    'openai/gpt-5.6-luna', 'ai_gateway', null, 120, 40, 160
  )$$,
  'The server finalizes a pending generation'
);

select is(
  (select status from public.ai_generations where id = current_setting('test.ai_generation_id')::uuid),
  'complete',
  'A Gateway reply records a complete status'
);
select is(
  (select total_tokens from public.ai_generations where id = current_setting('test.ai_generation_id')::uuid),
  160,
  'Token usage is retained for cost and abuse monitoring'
);
select is(
  (select content from public.ai_messages
    where generation_id = current_setting('test.ai_generation_id')::uuid and role = 'assistant'),
  'Өнөөдөр 20 минутын нэг ажлыг сонгоод эхэл.',
  'The assistant reply is addressable and persisted'
);

select lives_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.ai_generation_id')::uuid,
    'Өнөөдөр 20 минутын нэг ажлыг сонгоод эхэл.',
    'openai/gpt-5.6-luna', 'ai_gateway', null, 120, 40, 160
  )$$,
  'An identical completion retry is idempotent'
);

select throws_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.ai_generation_id')::uuid,
    'Conflicting duplicate', 'openai/gpt-5.6-luna', 'ai_gateway', null, 1, 1, 2
  )$$,
  '55000', 'Generation is already finalized',
  'A conflicting duplicate completion is rejected'
);
select is(
  (select count(*) from public.ai_messages
    where generation_id = current_setting('test.ai_generation_id')::uuid and role = 'assistant'),
  1::bigint,
  'Idempotent completion still stores exactly one assistant message'
);

select lives_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000001', null, 'Consent withdrawal', 'simple',
    'Цуцлалтын зэрэгцээ хүсэлт', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  'A pending generation exists before atomic consent withdrawal'
);
select set_config(
  'test.withdraw_generation_id',
  (select id::text from public.ai_generations
    where user_id = '50000000-0000-4000-8000-000000000001' and status = 'pending'
    order by created_at desc, id desc limit 1),
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);

select lives_ok(
  $$select * from public.withdraw_assessment_consent()$$,
  'The owner can atomically withdraw consent while a generation is pending'
);
select is(
  (select assessment_consent from public.member_privacy_preferences
    where user_id = '50000000-0000-4000-8000-000000000001'),
  false,
  'Atomic withdrawal persists the current consent state'
);
select is(
  (select status || ':' || error_code from public.ai_generations
    where id = current_setting('test.withdraw_generation_id')::uuid),
  'error:consent_withdrawn',
  'Atomic withdrawal closes the pending generation with an explicit reason'
);

reset role;
set local role service_role;
select throws_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000001', null, 'Post-withdrawal turn', 'simple',
    'Цуцлалтаас хойших хүсэлт', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  '42501', 'Assistant consent withdrawn',
  'Turn creation cannot commit after consent withdrawal'
);
select throws_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.withdraw_generation_id')::uuid,
    'This reply must not persist', 'openai/gpt-5.6-luna', 'ai_gateway', null, 1, 1, 2
  )$$,
  '42501', 'Assistant consent withdrawn',
  'A provider result cannot finalize after atomic withdrawal commits'
);
select is(
  (select count(*) from public.ai_messages
    where generation_id = current_setting('test.withdraw_generation_id')::uuid and role = 'assistant'),
  0::bigint,
  'No assistant message is stored after consent withdrawal'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = true, updated_at = now()
where user_id = '50000000-0000-4000-8000-000000000001';
set local role service_role;

select lives_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000001', null, 'Direct withdrawal', 'simple',
    'Data API цуцлалтыг шалгах хүсэлт', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  'A second pending generation exists before direct preference withdrawal'
);
select set_config(
  'test.direct_withdraw_generation_id',
  (select id::text from public.ai_generations
    where user_id = '50000000-0000-4000-8000-000000000001' and status = 'pending'
    order by created_at desc, id desc limit 1),
  true
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
select lives_ok(
  $$update public.member_privacy_preferences
    set assessment_consent = false, updated_at = now()
    where user_id = '50000000-0000-4000-8000-000000000001'$$,
  'A direct owner withdrawal remains supported through the Data API'
);
select is(
  (select status || ':' || error_code from public.ai_generations
    where id = current_setting('test.direct_withdraw_generation_id')::uuid),
  'error:consent_withdrawn',
  'The withdrawal trigger also closes pending work when the RPC is bypassed'
);

reset role;
set local role service_role;
select throws_ok(
  $$select public.complete_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.direct_withdraw_generation_id')::uuid,
    'This direct-withdrawal reply must not persist', 'openai/gpt-5.6-luna', 'ai_gateway', null, 1, 1, 2
  )$$,
  '42501', 'Assistant consent withdrawn',
  'Direct consent withdrawal also blocks late finalization'
);

reset role;
update public.member_privacy_preferences
set assessment_consent = true, updated_at = now()
where user_id = '50000000-0000-4000-8000-000000000001';

reset role;
update public.team_members
set status = 'disabled', updated_at = now()
where user_id = '50000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);

select is_empty($$select id from public.ai_conversations$$,
  'A disabled owner cannot read their previous conversations through the Data API');
select is_empty($$select id from public.ai_generations$$,
  'A disabled owner cannot read their previous prompts or result snapshots through the Data API');
select is_empty($$select id from public.ai_messages$$,
  'A disabled owner cannot read their previous assistant history through the Data API');

reset role;
update public.team_members
set status = 'active', updated_at = now()
where user_id = '50000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);

select is_empty(
  $$
    select id::text from public.ai_conversations
    union all select id::text from public.ai_generations
    union all select id::text from public.ai_messages
  $$,
  'An anonymous-auth JWT cannot read persisted assistant data'
);

reset role;
set local role service_role;

select lives_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000001', null, 'Алдааны бүртгэл', 'simple',
    'Түр алдааг шалгах хүсэлт', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  'A second pending generation can be created for failure-path verification'
);

select set_config(
  'test.failed_generation_id',
  (select id::text from public.ai_generations
    where user_id = '50000000-0000-4000-8000-000000000001' and status = 'pending'
    order by created_at desc, id desc limit 1),
  true
);

select lives_ok(
  $$select public.fail_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.failed_generation_id')::uuid,
    'assistant_turn_failed'
  )$$,
  'The server marks an interrupted generation as error'
);

select is(
  (select status from public.ai_generations where id = current_setting('test.failed_generation_id')::uuid),
  'error',
  'Interrupted work does not remain permanently pending'
);

select lives_ok(
  $$select public.fail_assistant_turn(
    '50000000-0000-4000-8000-000000000001',
    current_setting('test.failed_generation_id')::uuid,
    'assistant_turn_failed'
  )$$,
  'Failure finalization is idempotent'
);

select lives_ok(
  $$do $rate_limit$
  begin
    for counter in 1..12 loop
      perform public.create_assistant_turn(
        '50000000-0000-4000-8000-000000000004', null, 'Quota test', 'fast',
        'Нэг жижиг алхам өгнө үү.', 'openai/gpt-5.6-luna', '{}'::jsonb
      );
    end loop;
  end
  $rate_limit$$$,
  'The first twelve turns in a minute are accepted'
);

select throws_ok(
  $$select * from public.create_assistant_turn(
    '50000000-0000-4000-8000-000000000004', null, 'Quota test 13', 'fast',
    'Дахин нэг алхам өгнө үү.', 'openai/gpt-5.6-luna', '{}'::jsonb
  )$$,
  'P0001', 'assistant_rate_limited',
  'The thirteenth turn in a minute is rejected'
);
select is(
  (select count(*) from public.ai_generations where user_id = '50000000-0000-4000-8000-000000000004'),
  12::bigint,
  'The rate-limit failure creates no extra generation'
);

select * from finish();
rollback;
