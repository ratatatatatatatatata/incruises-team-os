begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

insert into auth.users (id, email)
values
  ('70000000-0000-4000-8000-000000000001', 'academy-one@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'academy-two@example.test'),
  ('70000000-0000-4000-8000-000000000003', 'academy-disabled@example.test'),
  ('70000000-0000-4000-8000-000000000004', 'academy-admin@example.test');

insert into public.team_members (user_id, role, status)
values
  ('70000000-0000-4000-8000-000000000001', 'builder', 'active'),
  ('70000000-0000-4000-8000-000000000002', 'builder', 'active'),
  ('70000000-0000-4000-8000-000000000003', 'builder', 'disabled'),
  ('70000000-0000-4000-8000-000000000004', 'admin', 'active');

insert into public.academy_courses (id, slug, title, status, sort_order)
values
  ('71000000-0000-4000-8000-000000000001', 'published-course', 'Published course', 'published', 1),
  ('71000000-0000-4000-8000-000000000002', 'draft-course', 'Draft course', 'draft', 2);

insert into public.academy_modules (id, course_id, title, status, sort_order)
values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Published module', 'published', 1),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Draft module', 'draft', 2);

insert into public.academy_lessons (id, module_id, slug, title, duration_seconds, status, sort_order)
values
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'published-lesson', 'Published lesson', 100, 'published', 1),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'draft-lesson', 'Draft lesson', 100, 'draft', 2);

insert into public.academy_video_assets (
  lesson_id, mux_asset_id, mux_playback_id, playback_policy, status, duration_seconds
)
values
  ('73000000-0000-4000-8000-000000000001', 'asset-ready-one', 'playback-ready-one', 'signed', 'ready', 100),
  ('73000000-0000-4000-8000-000000000002', 'asset-draft-two', 'playback-draft-two', 'public', 'ready', 100);

insert into public.academy_watch_progress (
  user_id, lesson_id, position_seconds, duration_seconds, percent_complete
)
values (
  '70000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001',
  20,
  100,
  20
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$select title from public.academy_courses order by title$$,
  array['Published course'::text],
  'An active member sees only published courses'
);

select results_eq(
  $$select title from public.academy_modules order by title$$,
  array['Published module'::text],
  'An active member sees only published modules in a published course'
);

select results_eq(
  $$select title from public.academy_lessons order by title$$,
  array['Published lesson'::text],
  'An active member sees only lessons in a fully published hierarchy'
);

select results_eq(
  $$select mux_playback_id from public.academy_video_assets order by mux_playback_id$$,
  array['playback-ready-one'::text],
  'An active member sees only ready video for a fully published lesson'
);

select is(
  has_column_privilege('authenticated', 'public.academy_video_assets', 'mux_asset_id', 'SELECT'),
  false,
  'Browser members cannot read the provider asset identifier'
);

select is(
  has_table_privilege('authenticated', 'public.academy_courses', 'INSERT'),
  false,
  'Browser members cannot insert Academy catalog records'
);

select is(
  has_table_privilege('authenticated', 'public.academy_watch_progress', 'INSERT'),
  false,
  'Browser members cannot bypass the guarded progress RPC with a direct insert'
);

select lives_ok(
  $$select public.save_academy_watch_progress(
    '73000000-0000-4000-8000-000000000001', 50, 100, false
  )$$,
  'An active member can save progress for a published ready lesson'
);

select is(
  (select percent_complete from public.academy_watch_progress),
  50.00::numeric,
  'The progress RPC calculates percent complete on the server'
);

select is(
  (select count(*) from public.academy_watch_progress),
  1::bigint,
  'A member reads only their own progress row'
);

select lives_ok(
  $$select public.save_academy_watch_progress(
    '73000000-0000-4000-8000-000000000001', 90, 100, false
  )$$,
  'Ninety percent watch progress completes a lesson'
);

select isnt(
  (select completed_at from public.academy_watch_progress),
  null::timestamptz,
  'Completion time is persisted at the ninety percent threshold'
);

select throws_ok(
  $$select public.save_academy_watch_progress(
    '73000000-0000-4000-8000-000000000002', 50, 100, false
  )$$,
  'P0002',
  'Published Academy lesson not found',
  'Progress cannot be recorded for a draft lesson'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.save_academy_watch_progress(uuid,double precision,double precision,boolean)',
    'EXECUTE'
  ),
  true,
  'Authenticated members may execute the guarded public progress RPC'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select results_eq(
  $$select position_seconds from public.academy_watch_progress$$,
  array[20.000::numeric],
  'A second member sees only their own resume position'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select is_empty(
  $$select id from public.academy_courses$$,
  'A disabled member cannot read the Academy catalog'
);

select throws_ok(
  $$select public.save_academy_watch_progress(
    '73000000-0000-4000-8000-000000000001', 50, 100, false
  )$$,
  '42501',
  'Active member required',
  'A disabled member cannot record progress'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"70000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.academy_courses),
  2::bigint,
  'An active admin can inspect draft and published catalog records through RLS'
);

select is(
  has_table_privilege('authenticated', 'public.academy_courses', 'UPDATE'),
  false,
  'Even an admin browser session has no direct catalog update privilege'
);

select is(
  has_table_privilege('anon', 'public.academy_courses', 'SELECT'),
  false,
  'Anonymous clients have no Academy catalog access'
);

select * from finish();
rollback;
