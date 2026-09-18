begin;

select plan(31);

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

select ok(
  to_regprocedure('private.current_user_has_active_membership()') is not null,
  'active membership has one reusable database authorization helper'
);

select ok(
  pg_get_functiondef('private.review_assigned_academy_practice(uuid,text,text)'::regprocedure)
    like '%A member cannot review their own practice%',
  'practice owner cannot review their own submitted practice'
);

select ok(
  pg_get_functiondef('private.advance_assigned_support_request(uuid,text,text,timestamp with time zone)'::regprocedure)
    like '%coalesce(v_request.assigned_to = v_user_id, false)%',
  'NULL assignee authorization is fail-closed'
);

select ok(
  pg_get_functiondef('private.confirm_my_support_request(uuid,boolean)'::regprocedure)
    like '%outcome_helpful = false%',
  'negative help confirmation reopens the same support request'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_checkins'
      and policyname = 'member_checkins_select_authorized'
      and qual like '%current_user_can_access_support_record%'
  ),
  'check-in reads use the same consent-aware support scope'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'academy_lessons'
      and policyname = 'academy_lessons_select_active'
      and qual like '%current_user_has_active_membership%'
  ),
  'published Academy lessons require active membership'
);

select ok(
  pg_get_functiondef('private.current_user_can_support_member(uuid)'::regprocedure)
    not like '%director%',
  'director role alone does not grant global member scope'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.member_actions'::regclass
      and tgname = 'member_actions_sync_current_summary'
      and not tgisinternal
  ),
  'current action title is synchronized to the purpose-limited summary'
);

select * from finish();
rollback;
