begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'builder-one@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'builder-two@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'disabled@example.test');

insert into public.team_members (user_id, role, status)
values
  ('10000000-0000-4000-8000-000000000001', 'builder', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'builder', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'builder', 'disabled');

insert into public.lesson_progress (user_id, lesson_id)
values
  ('10000000-0000-4000-8000-000000000001', 'l0-1'),
  ('10000000-0000-4000-8000-000000000002', 'l0-2');

insert into public.member_tasks (owner_id, member_name, milestone, next_action, due_label)
values
  ('10000000-0000-4000-8000-000000000001', 'Member One', '72 цаг', 'First follow-up', 'Өнөөдөр'),
  ('10000000-0000-4000-8000-000000000002', 'Member Two', '72 цаг', 'Second follow-up', 'Маргааш');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$select user_id from public.team_members order by user_id$$,
  array['10000000-0000-4000-8000-000000000001'::uuid],
  'An active builder can read only their own membership'
);

select results_eq(
  $$select lesson_id from public.lesson_progress order by lesson_id$$,
  array['l0-1'::text],
  'An active builder can read only their own lesson progress'
);

select throws_ok(
  $$insert into public.lesson_progress (user_id, lesson_id) values ('10000000-0000-4000-8000-000000000002', 'l0-3')$$,
  '42501',
  'new row violates row-level security policy for table "lesson_progress"',
  'A builder cannot create progress for another user'
);

select lives_ok(
  $$insert into public.lesson_progress (user_id, lesson_id) values ('10000000-0000-4000-8000-000000000001', 'l0-4')$$,
  'An active builder can create their own progress'
);

select throws_ok(
  $$insert into public.lesson_progress (user_id, lesson_id) values ('10000000-0000-4000-8000-000000000001', 'fake-lesson')$$,
  '23503',
  'insert or update on table "lesson_progress" violates foreign key constraint "lesson_progress_lesson_id_catalog_fkey"',
  'A builder cannot inflate progress with a lesson outside the catalog'
);

select results_eq(
  $$select member_name from public.member_tasks order by member_name$$,
  array['Member One'::text],
  'A builder can read only their own Member Success tasks'
);

select results_eq(
  $$
    update public.member_tasks
    set status = 'complete', updated_at = now()
    where owner_id = '10000000-0000-4000-8000-000000000002'
    returning id
  $$,
  array[]::bigint[],
  'A builder cannot update another owner task'
);

select is(
  has_table_privilege('authenticated', 'public.team_members', 'UPDATE'),
  false,
  'Authenticated users do not have direct membership update privilege'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select is_empty(
  $$select lesson_id from public.lesson_progress$$,
  'A disabled member cannot read application progress'
);

select throws_ok(
  $$insert into public.lesson_progress (user_id, lesson_id) values ('10000000-0000-4000-8000-000000000003', 'l0-1')$$,
  '42501',
  'new row violates row-level security policy for table "lesson_progress"',
  'A disabled member cannot create application progress'
);

select is(
  has_table_privilege('anon', 'public.lesson_progress', 'SELECT'),
  false,
  'Anonymous clients have no lesson-progress table access'
);

select * from finish();
rollback;
