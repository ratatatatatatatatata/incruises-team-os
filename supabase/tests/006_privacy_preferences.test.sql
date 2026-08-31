begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into auth.users (id, email)
values
  ('60000000-0000-4000-8000-000000000001', 'privacy-one@example.test'),
  ('60000000-0000-4000-8000-000000000002', 'privacy-two@example.test');

select is(has_table_privilege('authenticated', 'public.member_privacy_preferences', 'SELECT'), true,
  'Authenticated owners may read their privacy preferences');
select is(has_table_privilege('authenticated', 'public.member_privacy_preferences', 'INSERT'), true,
  'Authenticated owners may record their explicit consent');
select is(has_table_privilege('authenticated', 'public.member_privacy_preferences', 'DELETE'), false,
  'Browser clients cannot delete privacy evidence');
select is(has_table_privilege('anon', 'public.member_privacy_preferences', 'SELECT'), false,
  'Anonymous clients cannot read privacy preferences');
select is(
  (select relrowsecurity from pg_class where oid = 'public.member_privacy_preferences'::regclass),
  true,
  'Privacy preferences have RLS enabled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.member_privacy_preferences (
    user_id, assessment_consent, assessment_consent_version, assessment_consented_at
  ) values (
    '60000000-0000-4000-8000-000000000001', true, 'success-map-test-v1', now()
  )$$,
  'An owner can record consent for their own account'
);
select is(
  (select assessment_consent from public.member_privacy_preferences),
  true,
  'The owner reads their own consent state'
);
select lives_ok(
  $$update public.member_privacy_preferences
    set sharing_level = 'summary', assistant_memory = false, updated_at = now()
    where user_id = '60000000-0000-4000-8000-000000000001'$$,
  'The owner controls sharing and assistant memory'
);
select is(
  (select assistant_memory from public.member_privacy_preferences),
  false,
  'Assistant memory opt-out is persisted'
);
select lives_ok(
  $$update public.member_privacy_preferences
    set assessment_consent = false, sharing_level = 'private', updated_at = now()
    where user_id = '60000000-0000-4000-8000-000000000001'$$,
  'The owner can withdraw assessment consent without deleting the audit row'
);
select is(
  (select assessment_consent from public.member_privacy_preferences),
  false,
  'Assessment consent withdrawal is persisted immediately'
);

reset role;
insert into public.member_privacy_preferences (
  user_id, assessment_consent, assessment_consent_version, assessment_consented_at
) values (
  '60000000-0000-4000-8000-000000000002', true, 'success-map-test-v1', now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.member_privacy_preferences),
  1::bigint,
  'One owner cannot see another owner privacy preferences'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select user_id from public.member_privacy_preferences),
  '60000000-0000-4000-8000-000000000002'::uuid,
  'Each owner sees only their own privacy row'
);

select * from finish();
rollback;
