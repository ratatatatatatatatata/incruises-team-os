begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(requirement.object_name order by requirement.object_name)
  into v_missing
  from (
    values
      ('table:public.user_profiles', pg_catalog.to_regclass('public.user_profiles') is not null),
      ('table:public.team_members', pg_catalog.to_regclass('public.team_members') is not null),
      ('table:public.team_membership_audit_events', pg_catalog.to_regclass('public.team_membership_audit_events') is not null),
      ('table:public.lesson_progress', pg_catalog.to_regclass('public.lesson_progress') is not null),
      ('table:public.content_drafts', pg_catalog.to_regclass('public.content_drafts') is not null),
      ('table:public.official_sources', pg_catalog.to_regclass('public.official_sources') is not null),
      ('table:public.content_review_events', pg_catalog.to_regclass('public.content_review_events') is not null),
      ('table:public.member_tasks', pg_catalog.to_regclass('public.member_tasks') is not null),
      ('table:public.member_privacy_preferences', pg_catalog.to_regclass('public.member_privacy_preferences') is not null),
      ('table:public.assessment_sessions', pg_catalog.to_regclass('public.assessment_sessions') is not null),
      ('table:public.member_onboarding_state', pg_catalog.to_regclass('public.member_onboarding_state') is not null),
      ('table:public.assessment_questions', pg_catalog.to_regclass('public.assessment_questions') is not null),
      ('table:public.assessment_answers', pg_catalog.to_regclass('public.assessment_answers') is not null),
      ('table:public.success_profiles', pg_catalog.to_regclass('public.success_profiles') is not null),
      ('table:public.success_guides', pg_catalog.to_regclass('public.success_guides') is not null),
      ('table:public.ai_conversations', pg_catalog.to_regclass('public.ai_conversations') is not null),
      ('table:public.ai_generations', pg_catalog.to_regclass('public.ai_generations') is not null),
      ('table:public.ai_messages', pg_catalog.to_regclass('public.ai_messages') is not null),
      ('table:private.assessment_generation_runs', pg_catalog.to_regclass('private.assessment_generation_runs') is not null),
      ('table:public.account_deletion_requests', pg_catalog.to_regclass('public.account_deletion_requests') is not null),
      ('table:public.academy_courses', pg_catalog.to_regclass('public.academy_courses') is not null),
      ('table:public.academy_modules', pg_catalog.to_regclass('public.academy_modules') is not null),
      ('table:public.academy_lessons', pg_catalog.to_regclass('public.academy_lessons') is not null),
      ('table:public.academy_video_assets', pg_catalog.to_regclass('public.academy_video_assets') is not null),
      ('table:public.academy_watch_progress', pg_catalog.to_regclass('public.academy_watch_progress') is not null),
      ('rpc:public.admin_register_invited_member(uuid)', pg_catalog.to_regprocedure('public.admin_register_invited_member(uuid)') is not null),
      ('rpc:public.admin_update_team_member(uuid,text,text)', pg_catalog.to_regprocedure('public.admin_update_team_member(uuid,text,text)') is not null),
      ('rpc:public.submit_content_draft(bigint)', pg_catalog.to_regprocedure('public.submit_content_draft(bigint)') is not null),
      ('rpc:public.review_content_draft(bigint,text,text)', pg_catalog.to_regprocedure('public.review_content_draft(bigint,text,text)') is not null),
      ('rpc:public.record_corporate_approval_reference(bigint,text)', pg_catalog.to_regprocedure('public.record_corporate_approval_reference(bigint,text)') is not null),
      ('rpc:public.archive_content_draft(bigint)', pg_catalog.to_regprocedure('public.archive_content_draft(bigint)') is not null),
      ('rpc:public.begin_onboarding_assessment()', pg_catalog.to_regprocedure('public.begin_onboarding_assessment()') is not null),
      ('rpc:public.save_onboarding_answer(uuid,bigint,uuid,text,jsonb,text)', pg_catalog.to_regprocedure('public.save_onboarding_answer(uuid,bigint,uuid,text,jsonb,text)') is not null),
      ('rpc:public.snapshot_onboarding_tailored_questions(uuid)', pg_catalog.to_regprocedure('public.snapshot_onboarding_tailored_questions(uuid)') is not null),
      ('rpc:public.complete_onboarding_assessment(uuid)', pg_catalog.to_regprocedure('public.complete_onboarding_assessment(uuid)') is not null),
      ('rpc:public.create_assistant_turn(uuid,uuid,text,text,text,text,jsonb)', pg_catalog.to_regprocedure('public.create_assistant_turn(uuid,uuid,text,text,text,text,jsonb)') is not null),
      ('rpc:public.complete_assistant_turn(uuid,uuid,text,text,text,text,integer,integer,integer)', pg_catalog.to_regprocedure('public.complete_assistant_turn(uuid,uuid,text,text,text,text,integer,integer,integer)') is not null),
      ('rpc:public.fail_assistant_turn(uuid,uuid,text)', pg_catalog.to_regprocedure('public.fail_assistant_turn(uuid,uuid,text)') is not null),
      ('rpc:public.withdraw_assessment_consent()', pg_catalog.to_regprocedure('public.withdraw_assessment_consent()') is not null),
      ('rpc:public.claim_ai_tailored_generation(uuid,uuid,uuid)', pg_catalog.to_regprocedure('public.claim_ai_tailored_generation(uuid,uuid,uuid)') is not null),
      ('rpc:public.record_ai_tailored_generation_failure(uuid,text)', pg_catalog.to_regprocedure('public.record_ai_tailored_generation_failure(uuid,text)') is not null),
      ('rpc:public.finalize_ai_tailored_question_snapshot(uuid,uuid,uuid,text,text,jsonb,integer,integer)', pg_catalog.to_regprocedure('public.finalize_ai_tailored_question_snapshot(uuid,uuid,uuid,text,text,jsonb,integer,integer)') is not null),
      ('rpc:public.request_account_deletion()', pg_catalog.to_regprocedure('public.request_account_deletion()') is not null),
      ('rpc:public.cancel_account_deletion_request()', pg_catalog.to_regprocedure('public.cancel_account_deletion_request()') is not null),
      ('rpc:public.health_check()', pg_catalog.to_regprocedure('public.health_check()') is not null),
      ('rpc:public.save_academy_watch_progress(uuid,double precision,double precision,boolean)', pg_catalog.to_regprocedure('public.save_academy_watch_progress(uuid,double precision,double precision,boolean)') is not null)
  ) as requirement(object_name, is_present)
  where not requirement.is_present;

  if v_missing is not null then
    raise exception using
      errcode = '55000',
      message = 'inSuccess launch schema prerequisites are missing: ' || array_to_string(v_missing, ', ');
  end if;
end;
$$;

create or replace function public.insuccess_schema_contract()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'insuccess-personal-ai-v1-20260906'::text;
$$;

comment on function public.insuccess_schema_contract() is
  'Data-free release contract. Production deploy automation may call this only with the service role.';

revoke execute on function public.insuccess_schema_contract()
  from public, anon, authenticated, service_role;
grant execute on function public.insuccess_schema_contract()
  to service_role;

notify pgrst, 'reload schema';

commit;
