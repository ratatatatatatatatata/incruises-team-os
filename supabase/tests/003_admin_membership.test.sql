begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('30000000-0000-4000-8000-000000000001', 'admin-one@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'admin-two@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'builder@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'invited@example.test');

insert into public.team_members (user_id, role, status)
values
  ('30000000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('30000000-0000-4000-8000-000000000002', 'admin', 'active'),
  ('30000000-0000-4000-8000-000000000003', 'builder', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.admin_register_invited_member('30000000-0000-4000-8000-000000000004')$$,
  '42501',
  'Active admin role required',
  'A builder cannot register an invited membership'
);

select throws_ok(
  $$select public.admin_update_team_member('30000000-0000-4000-8000-000000000002', 'coach', 'active')$$,
  '42501',
  'Active admin role required',
  'A builder cannot change another membership'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.admin_register_invited_member('30000000-0000-4000-8000-000000000004')$$,
  'An active admin can register an invited membership'
);

reset role;

select is(
  (select role from public.team_members where user_id = '30000000-0000-4000-8000-000000000004'),
  'builder',
  'A newly registered membership starts as builder'
);

select is(
  (select status from public.team_members where user_id = '30000000-0000-4000-8000-000000000004'),
  'disabled',
  'A newly registered membership fails closed as disabled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.admin_update_team_member('30000000-0000-4000-8000-000000000004', 'coach', 'active')$$,
  'An active admin can explicitly activate an invited member'
);

reset role;

select is(
  (select role from public.team_members where user_id = '30000000-0000-4000-8000-000000000004'),
  'coach',
  'The selected role is stored'
);

select is(
  (select status from public.team_members where user_id = '30000000-0000-4000-8000-000000000004'),
  'active',
  'The selected access status is stored'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.admin_update_team_member('30000000-0000-4000-8000-000000000001', 'builder', 'active')$$,
  '42501',
  'An admin cannot demote or disable their own membership',
  'An admin cannot remove their own admin role'
);

select lives_ok(
  $$select public.admin_update_team_member('30000000-0000-4000-8000-000000000002', 'director', 'active')$$,
  'One admin can change another admin when an active admin remains'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.admin_update_team_member('30000000-0000-4000-8000-000000000004', 'builder', 'active')$$,
  '42501',
  'Active admin role required',
  'A former admin immediately loses membership administration access'
);

reset role;

select is(
  (select count(*) from public.team_membership_audit_events),
  3::bigint,
  'Every successful membership change writes exactly one audit event'
);

select is(
  has_table_privilege('authenticated', 'public.team_membership_audit_events', 'DELETE'),
  false,
  'Authenticated users cannot delete membership audit events'
);

select is(
  has_table_privilege('authenticated', 'public.team_membership_audit_events', 'UPDATE'),
  false,
  'Authenticated users cannot edit membership audit events'
);

select * from finish();
rollback;
