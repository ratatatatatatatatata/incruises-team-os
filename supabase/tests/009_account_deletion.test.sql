begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

select is(has_table_privilege('authenticated', 'public.account_deletion_requests', 'SELECT'), true,
  'Authenticated users may read deletion requests allowed by RLS');
select is(has_table_privilege('authenticated', 'public.account_deletion_requests', 'INSERT'), false,
  'Browser clients cannot insert deletion requests directly');
select is(has_table_privilege('authenticated', 'public.account_deletion_requests', 'UPDATE'), false,
  'Browser clients cannot update deletion request status directly');
select is(has_table_privilege('authenticated', 'public.account_deletion_requests', 'DELETE'), false,
  'Browser clients cannot delete request evidence');
select is(has_table_privilege('anon', 'public.account_deletion_requests', 'SELECT'), false,
  'Anonymous clients cannot read deletion requests');
select is(
  (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass),
  true,
  'Account deletion requests have RLS enabled'
);

select is(has_function_privilege('authenticated', 'public.request_account_deletion()', 'EXECUTE'), true,
  'Authenticated users may request their own account deletion');
select is(has_function_privilege('authenticated', 'public.cancel_account_deletion_request()', 'EXECUTE'), true,
  'Authenticated users may cancel their own queued request');
select is(has_function_privilege('anon', 'public.request_account_deletion()', 'EXECUTE'), false,
  'Anonymous users cannot request account deletion');
select is(has_function_privilege('anon', 'public.cancel_account_deletion_request()', 'EXECUTE'), false,
  'Anonymous users cannot cancel account deletion');
select is(has_function_privilege('anon', 'public.health_check()', 'EXECUTE'), true,
  'Anonymous readiness probes may execute only the data-free health RPC');

select is(
  (select prosecdef from pg_proc where oid = 'public.request_account_deletion()'::regprocedure),
  false,
  'Public request wrapper runs as security invoker'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.cancel_account_deletion_request()'::regprocedure),
  false,
  'Public cancel wrapper runs as security invoker'
);
select is(
  (select prosecdef from pg_proc where oid = 'private.request_account_deletion()'::regprocedure),
  true,
  'Private request implementation is the narrowly scoped security definer'
);
select is(
  (select prosecdef from pg_proc where oid = 'private.cancel_account_deletion_request()'::regprocedure),
  true,
  'Private cancel implementation is the narrowly scoped security definer'
);

select ok(
  (
    select position('pg_catalog.pg_advisory_xact_lock' in definition) > 0
      and position('pg_catalog.pg_advisory_xact_lock' in definition) < position('select status into v_existing_status' in definition)
    from (select pg_get_functiondef('private.request_account_deletion()'::regprocedure) as definition) as source
  ),
  'Request takes the per-user lock before reading state'
);
select ok(
  (
    select position('pg_catalog.pg_advisory_xact_lock' in definition) > 0
      and position('pg_catalog.pg_advisory_xact_lock' in definition) < position('select status into v_existing_status' in definition)
    from (select pg_get_functiondef('private.cancel_account_deletion_request()'::regprocedure) as definition) as source
  ),
  'Cancel takes the same per-user lock before reading state'
);

set local role anon;
select is(public.health_check(), true, 'Health RPC confirms a real data-free database round trip');
reset role;

insert into auth.users (id, email)
values
  ('90000000-0000-4000-8000-000000000001', 'deletion-one@example.test'),
  ('90000000-0000-4000-8000-000000000002', 'deletion-two@example.test'),
  ('90000000-0000-4000-8000-000000000003', 'deletion-admin@example.test');

insert into public.team_members (user_id, role, status)
values ('90000000-0000-4000-8000-000000000003', 'admin', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select is(public.request_account_deletion(), 'requested', 'A signed-in owner can create a deletion request');
select is((select count(*) from public.account_deletion_requests), 1::bigint,
  'An owner reads only their request');
select set_config(
  'insuccess_test.first_requested_at',
  (select requested_at::text from public.account_deletion_requests),
  true
);
select is(public.request_account_deletion(), 'requested', 'Repeating a queued request is idempotent');
select is(
  (select requested_at::text from public.account_deletion_requests),
  current_setting('insuccess_test.first_requested_at'),
  'Idempotent request does not reset its original timestamp'
);
select is(public.cancel_account_deletion_request(), 'cancelled', 'An owner can cancel a queued request');
select is(public.cancel_account_deletion_request(), 'cancelled', 'Repeating cancellation is idempotent');
select is(public.request_account_deletion(), 'requested', 'A cancelled request can be submitted again');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(public.request_account_deletion(), 'requested', 'A second owner can create an independent request');
select is((select count(*) from public.account_deletion_requests), 1::bigint,
  'RLS hides another owner deletion request');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select is((select count(*) from public.account_deletion_requests), 1::bigint,
  'The first owner still sees only their request');

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is((select count(*) from public.account_deletion_requests), 2::bigint,
  'An active admin may read the operator queue');

select * from finish();
rollback;
