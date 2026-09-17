begin;

select plan(22);

select has_table('public', 'member_actions', 'member_actions exists');
select has_table('public', 'member_action_events', 'member_action_events exists');
select has_table('public', 'support_requests', 'support_requests exists');
select has_table('public', 'support_request_events', 'support_request_events exists');
select has_table('public', 'member_academy_practices', 'member_academy_practices exists');
select has_table('public', 'member_development_evidence', 'member_development_evidence exists');
select has_table('public', 'external_rank_claims', 'external_rank_claims exists');

select ok((select relrowsecurity from pg_class where oid = 'public.member_actions'::regclass), 'member_actions has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.member_action_events'::regclass), 'member_action_events has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.support_requests'::regclass), 'support_requests has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.support_request_events'::regclass), 'support_request_events has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.member_academy_practices'::regclass), 'member_academy_practices has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.member_development_evidence'::regclass), 'member_development_evidence has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.external_rank_claims'::regclass), 'external_rank_claims has RLS');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_actions'
      and cmd = 'SELECT'
      and qual like '%current_user_can_access_support_record%'
  ),
  'member action reads use relationship-scoped helper'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'support_requests'
      and cmd = 'SELECT'
      and qual like '%current_user_can_access_support_request%'
  ),
  'support request reads use relationship-scoped helper'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_success_summaries'
      and policyname = 'member_success_summaries_sharing_gate'
      and permissive = 'RESTRICTIVE'
  ),
  'summary consent is enforced by a restrictive policy'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('member_actions', 'member_action_events', 'support_requests', 'support_request_events', 'member_academy_practices', 'member_development_evidence')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ),
  'workflow tables have no direct authenticated write grants'
);

select ok(
  exists (
    select 1 from information_schema.role_column_grants
    where table_schema = 'public'
      and table_name = 'external_rank_claims'
      and grantee = 'authenticated'
      and privilege_type = 'INSERT'
  ),
  'rank evidence has a narrow column-level insert grant'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'external_rank_claims'
      and cmd = 'INSERT'
      and with_check like '%current_user_is_team_admin%'
  ),
  'rank evidence insert is admin-only'
);

select ok(
  not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.external_rank_claims'::regclass
      and not tgisinternal
  ),
  'rank evidence has no automatic access-grant trigger'
);

select function_privs_are(
  'public',
  'transition_my_member_action',
  array['uuid', 'text', 'text', 'text', 'text'],
  'authenticated',
  array['EXECUTE'],
  'member action transition is available only through its RPC'
);

select function_privs_are(
  'public',
  'advance_assigned_support_request',
  array['uuid', 'text', 'text', 'timestamp with time zone'],
  'authenticated',
  array['EXECUTE'],
  'support workflow transition is available only through its RPC'
);

select * from finish();
rollback;
