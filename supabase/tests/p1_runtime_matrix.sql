begin;

set local search_path = extensions, public, pg_catalog;

select plan(21);

insert into auth.users (id, email, created_at, updated_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'p1-member@invalid.example', now(), now()),
  ('a1000000-0000-0000-0000-000000000002', 'p1-sponsor@invalid.example', now(), now()),
  ('a1000000-0000-0000-0000-000000000003', 'p1-outsider@invalid.example', now(), now()),
  ('a1000000-0000-0000-0000-000000000004', 'p1-admin@invalid.example', now(), now()),
  ('a1000000-0000-0000-0000-000000000005', 'p1-disabled@invalid.example', now(), now());

insert into public.team_members (user_id, role, status, onboarding_required)
values
  ('a1000000-0000-0000-0000-000000000001', 'user', 'active', false),
  ('a1000000-0000-0000-0000-000000000002', 'user', 'active', false),
  ('a1000000-0000-0000-0000-000000000003', 'director', 'active', false),
  ('a1000000-0000-0000-0000-000000000004', 'admin', 'active', false),
  ('a1000000-0000-0000-0000-000000000005', 'user', 'disabled', false);

insert into public.member_relationships (
  member_user_id, sponsor_user_id, team_name, created_by
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'P1 test team',
  'a1000000-0000-0000-0000-000000000004'
);

insert into public.member_success_maps (
  user_id, current_context, goal_30_day, weekly_capacity,
  primary_blocker, growth_preferences, plan, plan_source,
  plan_version, ai_consent, support_summary_consent
) values (
  'a1000000-0000-0000-0000-000000000001',
  'Runtime test current context',
  'Runtime test thirty day goal',
  '15 минут',
  'Runtime test primary blocker',
  'Runtime test preferred support',
  '{"weeklyActions":[{"title":"Алхам нэг","detail":"Нэгийг хий","doneWhen":"Нэг дууссан"},{"title":"Алхам хоёр","detail":"Хоёрыг хий","doneWhen":"Хоёр дууссан"},{"title":"Алхам гурав","detail":"Гуравыг хий","doneWhen":"Гурав дууссан"}]}'::jsonb,
  'deterministic',
  1,
  false,
  false
);

-- The Success Map trigger creates the first action and purpose-limited summary.
-- Replace only the synthetic action rows so this test can exercise the exact
-- third-Done boundary, and keep sharing explicitly disabled for the consent test.
delete from public.member_actions
where member_user_id = 'a1000000-0000-0000-0000-000000000001';

update public.member_success_summaries
set sharing_enabled = false,
    today_action = 'Алхам гурав'
where user_id = 'a1000000-0000-0000-0000-000000000001';

insert into public.member_actions (
  id, member_user_id, plan_version, sequence_no, title, detail,
  done_when, minutes, capacity_minutes, source, status, completed_at
) values
  (
    'a2000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    1, 1, 'Алхам нэг', 'Нэгийг хий', 'Нэг дууссан',
    15, 15, 'starter_plan', 'done', now()
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    1, 2, 'Алхам хоёр', 'Хоёрыг хий', 'Хоёр дууссан',
    15, 15, 'starter_plan', 'done', now()
  ),
  (
    'a2000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    1, 3, 'Алхам гурав', 'Гуравыг хий', 'Гурав дууссан',
    15, 15, 'starter_plan', 'started', null
  );

insert into public.support_requests (
  id, member_user_id, action_id, assigned_to, request_type,
  request_text, status, next_check_at
) values (
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000003',
  null,
  'needs_person',
  'Runtime test support request',
  'unassigned',
  '2040-01-02 00:00:00+00'
);

insert into public.member_academy_practices (
  id, member_user_id, action_id, lesson_id, prompt,
  submission, status, submitted_at
)
select
  'a4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000003',
  lesson.id,
  'Runtime test practice prompt',
  'Runtime test practice submission',
  'submitted',
  now()
from public.academy_lessons as lesson
order by lesson.sort_order, lesson.id
limit 1;

set local role authenticated;
create temporary table p1_runtime_results(line text) on commit drop;

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into pg_temp.p1_runtime_results
select ok(private.current_user_has_active_membership(), 'active member passes the shared membership guard');
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.review_assigned_academy_practice('a4000000-0000-0000-0000-000000000001', 'self review', 'self evidence')$$,
  '42501',
  'A member cannot review their own practice',
  'practice owner cannot self-review through the public RPC'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
insert into pg_temp.p1_runtime_results
select is(
  (select count(*) from public.member_success_summaries where user_id = 'a1000000-0000-0000-0000-000000000001'),
  0::bigint,
  'consent=false hides the purpose-limited summary from the direct sponsor'
);
insert into pg_temp.p1_runtime_results
select is(
  (select count(*) from public.member_academy_practices where id = 'a4000000-0000-0000-0000-000000000001'),
  0::bigint,
  'consent=false hides member practice from the direct sponsor'
);
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.review_assigned_academy_practice('a4000000-0000-0000-0000-000000000001', 'blocked by consent', 'blocked evidence')$$,
  '42501',
  'Assigned supporter required',
  'direct sponsor cannot review while sharing consent is disabled'
);

reset role;
update public.member_success_summaries
set sharing_enabled = true
where user_id = 'a1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
insert into pg_temp.p1_runtime_results
select lives_ok(
  $$select public.review_assigned_academy_practice('a4000000-0000-0000-0000-000000000001', 'Useful sponsor feedback', 'Communication practice')$$,
  'active direct sponsor can review after explicit sharing consent'
);
insert into pg_temp.p1_runtime_results
select is(
  (select status from public.member_academy_practices where id = 'a4000000-0000-0000-0000-000000000001'),
  'reviewed'::text,
  'authorized review marks the practice reviewed'
);
insert into pg_temp.p1_runtime_results
select is(
  (select count(*) from public.member_development_evidence where source_practice_id = 'a4000000-0000-0000-0000-000000000001'),
  1::bigint,
  'authorized review creates one development evidence row'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
insert into pg_temp.p1_runtime_results
select ok(
  not private.current_user_can_support_member('a1000000-0000-0000-0000-000000000001'),
  'director role alone does not grant another team member scope'
);
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.review_assigned_academy_practice('a4000000-0000-0000-0000-000000000001', 'other team review', 'other evidence')$$,
  '42501',
  'Assigned supporter required',
  'another-team director cannot review the member practice'
);
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.advance_assigned_support_request('a3000000-0000-0000-0000-000000000001', 'acknowledged', '', null)$$,
  '42501',
  'Assigned supporter required',
  'NULL assignee is fail-closed for a non-admin caller'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000004', true);
insert into pg_temp.p1_runtime_results
select lives_ok(
  $$select public.advance_assigned_support_request('a3000000-0000-0000-0000-000000000001', 'acknowledged', '', null)$$,
  'active admin can triage an unassigned support request'
);

reset role;
update public.support_requests
set assigned_to = 'a1000000-0000-0000-0000-000000000002',
    status = 'acknowledged',
    next_check_at = '2040-01-02 00:00:00+00'
where id = 'a3000000-0000-0000-0000-000000000001';
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000003', true);
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.advance_assigned_support_request('a3000000-0000-0000-0000-000000000001', 'in_progress', '', null)$$,
  '42501',
  'Assigned supporter required',
  'a different active member cannot advance an assigned request'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
insert into pg_temp.p1_runtime_results
select lives_ok(
  $$select public.advance_assigned_support_request('a3000000-0000-0000-0000-000000000001', 'resolved', 'Resolved with a follow-up', null)$$,
  'assigned sponsor can resolve the request'
);
insert into pg_temp.p1_runtime_results
select is(
  (select next_check_at from public.support_requests where id = 'a3000000-0000-0000-0000-000000000001'),
  '2040-01-02 00:00:00+00'::timestamptz,
  'resolving without a replacement preserves the support deadline'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into pg_temp.p1_runtime_results
select lives_ok(
  $$select public.confirm_my_support_request('a3000000-0000-0000-0000-000000000001', false)$$,
  'member can report that resolved help was not useful'
);
insert into pg_temp.p1_runtime_results
select ok(
  exists (
    select 1
    from public.support_requests
    where id = 'a3000000-0000-0000-0000-000000000001'
      and status = 'assigned'
      and assigned_to = 'a1000000-0000-0000-0000-000000000002'
      and outcome_helpful = false
      and next_check_at > now()
      and resolved_at is null
  ),
  'negative feedback reopens the same request with owner and next-check time'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000005', true);
insert into pg_temp.p1_runtime_results
select throws_ok(
  $$select public.transition_my_member_action('a2000000-0000-0000-0000-000000000003', 'done', '', null, '')$$,
  '42501',
  'Active membership required',
  'disabled membership cannot mutate an action through direct RPC'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into pg_temp.p1_runtime_results
select lives_ok(
  $$select public.transition_my_member_action('a2000000-0000-0000-0000-000000000003', 'done', '', null, '')$$,
  'member can complete the third action'
);
insert into pg_temp.p1_runtime_results
select is(
  (select count(*) from public.member_actions where member_user_id = 'a1000000-0000-0000-0000-000000000001' and status not in ('done', 'superseded')),
  0::bigint,
  'third Done does not resurrect the original action'
);
insert into pg_temp.p1_runtime_results
select is(
  (select today_action from public.member_success_summaries where user_id = 'a1000000-0000-0000-0000-000000000001'),
  'Эхний алхмууд дууссан · check-in хүлээж байна'::text,
  'third Done synchronizes the terminal check-in state'
);

insert into pg_temp.p1_runtime_results select * from finish();
select jsonb_agg(line order by ctid) as tap_output from pg_temp.p1_runtime_results;

rollback;
