begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into auth.users (id, email)
values
  ('20000000-0000-4000-8000-000000000001', 'draft-owner@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'reviewer@example.test'),
  ('20000000-0000-4000-8000-000000000003', 'admin@example.test');

insert into public.team_members (user_id, role, status)
values
  ('20000000-0000-4000-8000-000000000001', 'builder', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'coach', 'active'),
  ('20000000-0000-4000-8000-000000000003', 'admin', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Workflow primary draft',
      'Facebook',
      'membership-agreement',
      'Evidence-backed draft'
    )
  $$,
  'An active owner can create a draft with an allowed source'
);

select throws_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Blocked legacy draft',
      'Facebook',
      'SRC-001',
      'Must stay quarantined'
    )
  $$,
  '22023',
  'A verified and review-allowed official source is required',
  'A legacy unverified source cannot create a reviewable draft'
);

reset role;
update public.official_sources
set allowed_for_review = true,
    verified_at = null,
    effective_at = null,
    review_due_at = null,
    updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Unverified source draft',
      'FAQ',
      'brand-policy',
      'A review-allowed source still needs verification evidence'
    )
  $$,
  '22023',
  'A verified and review-allowed official source is required',
  'Review permission alone does not make an unverified source usable'
);

reset role;
update public.official_sources
set verified_at = current_date + 1,
    updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Future verification draft',
      'FAQ',
      'brand-policy',
      'A future verification date is not valid evidence'
    )
  $$,
  '22023',
  'Official source verification date cannot be in the future',
  'A source cannot use a future verification date'
);

select lives_ok(
  $$select public.submit_content_draft((select id from public.content_drafts where title = 'Workflow primary draft'))$$,
  'The owner can submit their own draft'
);

select is(
  (select status from public.content_drafts where title = 'Workflow primary draft'),
  'review',
  'Submitting a draft moves it to review'
);

select is(
  (select count(*) from public.content_review_events as event join public.content_drafts as draft on draft.id = event.draft_id where draft.title = 'Workflow primary draft'),
  1::bigint,
  'Submitting a draft writes an audit event'
);

select throws_ok(
  $$select public.review_content_draft((select id from public.content_drafts where title = 'Workflow primary draft'), 'internal_approved', 'self review')$$,
  '42501',
  'A draft owner cannot review their own draft',
  'The owner cannot self-review'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.review_content_draft((select id from public.content_drafts where title = 'Workflow primary draft'), 'internal_approved', 'Reviewed against the official source')$$,
  'A separate coach can complete internal review'
);

select is(
  (select status from public.content_drafts where title = 'Workflow primary draft'),
  'internal_approved',
  'Internal review advances to internal_approved'
);

select is(
  (select count(*) from public.content_review_events as event join public.content_drafts as draft on draft.id = event.draft_id where draft.title = 'Workflow primary draft'),
  2::bigint,
  'Internal review writes a second audit event'
);

select throws_ok(
  $$update public.content_drafts set status = 'corporate_approved' where title = 'Workflow primary draft'$$,
  '42501',
  'permission denied for table content_drafts',
  'Reviewers cannot bypass the workflow with a direct update'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.record_corporate_approval_reference((select id from public.content_drafts where title = 'Workflow primary draft'), 'COMPANY-APPROVAL-2026-001')$$,
  'A separate admin can record a corporate approval reference'
);

select is(
  (select status from public.content_drafts where title = 'Workflow primary draft'),
  'corporate_approved',
  'Corporate evidence advances the draft to corporate_approved'
);

select is(
  (select corporate_approval_ref from public.content_drafts where title = 'Workflow primary draft'),
  'COMPANY-APPROVAL-2026-001',
  'The external approval reference is retained'
);

select is(
  (select count(*) from public.content_review_events as event join public.content_drafts as draft on draft.id = event.draft_id where draft.title = 'Workflow primary draft'),
  3::bigint,
  'Corporate approval writes a third audit event'
);

select throws_ok(
  $$delete from public.content_review_events where draft_id = (select id from public.content_drafts where title = 'Workflow primary draft')$$,
  '42501',
  'permission denied for table content_review_events',
  'Authenticated users cannot delete workflow audit events'
);

reset role;
update public.official_sources
set allowed_for_review = true,
    verified_at = current_date,
    effective_at = current_date - 30,
    review_due_at = current_date - 1,
    updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Expired source draft',
      'FAQ',
      'brand-policy',
      'An overdue source must be re-verified first'
    )
  $$,
  '22023',
  'Official source review is overdue',
  'An expired source cannot create a new reviewable draft'
);

reset role;
update public.official_sources
set effective_at = current_date + 1,
    review_due_at = current_date + 30,
    last_checked_at = now(),
    updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Future source draft',
      'FAQ',
      'brand-policy',
      'A future-effective source cannot be used early'
    )
  $$,
  '22023',
  'Official source is not yet effective',
  'A future-effective source cannot create a new reviewable draft'
);

reset role;
update public.official_sources
set effective_at = current_date - 30,
    updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.content_drafts (owner_id, title, channel, source_id, excerpt)
    values (
      '20000000-0000-4000-8000-000000000001',
      'Source recheck draft',
      'FAQ',
      'brand-policy',
      'Source must remain allowed through final approval'
    )
  $$,
  'A second draft can use a currently allowed source'
);

select lives_ok(
  $$select public.submit_content_draft((select id from public.content_drafts where title = 'Source recheck draft'))$$,
  'The second draft can be submitted while its source is allowed'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.review_content_draft((select id from public.content_drafts where title = 'Source recheck draft'), 'internal_approved', 'Source was current during review')$$,
  'A separate reviewer can approve the second draft internally'
);

reset role;
update public.official_sources
set allowed_for_review = false, updated_at = now()
where id = 'brand-policy';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

select throws_ok(
  $$select public.record_corporate_approval_reference((select id from public.content_drafts where title = 'Source recheck draft'), 'COMPANY-APPROVAL-2026-002')$$,
  '22023',
  'Source is no longer allowed for review',
  'Corporate approval re-checks the source at the final gate'
);

select is(
  (select status from public.content_drafts where title = 'Source recheck draft'),
  'internal_approved',
  'A failed final source check leaves the draft internally approved only'
);

select * from finish();
rollback;
