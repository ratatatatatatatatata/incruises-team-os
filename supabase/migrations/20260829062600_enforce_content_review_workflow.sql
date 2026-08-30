begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.official_sources (
  id text primary key,
  title text not null check (char_length(title) between 1 and 180),
  category text not null check (char_length(category) between 1 and 80),
  url text,
  allowed_for_review boolean not null default false,
  verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.official_sources (id, title, category, url, allowed_for_review, verified_at)
values
  ('membership-agreement', 'Membership Agreement 3.2', 'Member', 'https://files.incruises.com/files/en/106EN_3.2_MEMBER_AGREEMENT.pdf', true, date '2026-04-02'),
  ('membership-faq', 'Membership 3.X FAQ', 'Product', 'https://files.incruises.com/en/EN_Membership_3.X_FAQs.pdf', false, null),
  ('partner-agreement', 'Independent Partner Agreement', 'Partner', 'https://files.incruises.com/files/en/104EN_3.2_INDEPENDENT_PARTNER_AGREEMENT.pdf', false, null),
  ('policies', 'Policies & Procedures Manual', 'Compliance', 'https://files.incruises.com/files/en/203EN_POLICIES_AND_PROCEDURES_MANUAL.pdf', false, null),
  ('brand-policy', 'Marketing Materials & Branding Policy', 'Content', 'https://files.incruises.com/files/en/207EN_MARKETING_MATERIALS_AND_BRANDING_POLICY.pdf', false, null),
  ('income-guide', 'Income & Incentive Guide', 'Compensation', 'https://files.incruises.com/files/en/214EN_INCOME_AND_INCENTIVE_GUIDE.pdf', false, null),
  ('SRC-001', 'Legacy source SRC-001 — reconciliation required', 'Legacy', null, false, null),
  ('SRC-002', 'Legacy source SRC-002 — reconciliation required', 'Legacy', null, false, null),
  ('SRC-003', 'Legacy source SRC-003 — reconciliation required', 'Legacy', null, false, null),
  ('SRC-004', 'Legacy source SRC-004 — reconciliation required', 'Legacy', null, false, null)
on conflict (id) do nothing;

alter table public.content_drafts
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists corporate_approval_ref text,
  add column if not exists corporate_approval_recorded_by uuid references auth.users(id) on delete set null,
  add column if not exists corporate_approved_at timestamptz;

alter table public.content_drafts drop constraint if exists content_drafts_status_check;
alter table public.content_drafts
  add constraint content_drafts_status_check
  check (status in ('draft', 'review', 'approved', 'internal_approved', 'corporate_approved', 'archived'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_drafts_source_id_fkey'
      and conrelid = 'public.content_drafts'::regclass
  ) then
    alter table public.content_drafts
      add constraint content_drafts_source_id_fkey
      foreign key (source_id) references public.official_sources(id) on update cascade;
  end if;
end
$$;

create index if not exists idx_content_drafts_reviewed_by on public.content_drafts(reviewed_by);
create index if not exists idx_content_drafts_corporate_approval_recorded_by on public.content_drafts(corporate_approval_recorded_by);

create table if not exists public.content_review_events (
  id bigint generated always as identity primary key,
  draft_id bigint not null references public.content_drafts(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  evidence_ref text,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_review_events_draft_created
  on public.content_review_events(draft_id, created_at desc);
create index if not exists idx_content_review_events_actor
  on public.content_review_events(actor_id);

alter table public.official_sources enable row level security;
alter table public.content_review_events enable row level security;

drop policy if exists "content_drafts_own_rows" on public.content_drafts;
drop policy if exists "content_drafts_select_authorized" on public.content_drafts;
drop policy if exists "content_drafts_insert_active_own" on public.content_drafts;
drop policy if exists "content_drafts_transition_compatibility" on public.content_drafts;

create policy "content_drafts_select_authorized"
on public.content_drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and (
        content_drafts.owner_id = (select auth.uid())
        or member.role in ('coach', 'director', 'admin')
      )
  )
);

create policy "content_drafts_insert_active_own"
on public.content_drafts
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
  and exists (
    select 1
    from public.official_sources as source
    where source.id = content_drafts.source_id
      and source.allowed_for_review
  )
);

drop policy if exists "official_sources_select_active" on public.official_sources;
create policy "official_sources_select_active"
on public.official_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
  )
);

drop policy if exists "content_review_events_select_authorized" on public.content_review_events;
create policy "content_review_events_select_authorized"
on public.content_review_events
for select
to authenticated
using (
  exists (
    select 1
    from public.content_drafts as draft
    where draft.id = content_review_events.draft_id
  )
);

create or replace function private.submit_content_draft(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_source_id text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1 from public.team_members
    where user_id = v_actor and status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select owner_id, status, source_id
  into v_owner, v_status, v_source_id
  from public.content_drafts
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Draft not found';
  end if;
  if v_owner <> v_actor then
    raise exception using errcode = '42501', message = 'Only the owner may submit this draft';
  end if;
  if v_status <> 'draft' then
    raise exception using errcode = '22023', message = 'Draft is not in draft status';
  end if;
  if not exists (
    select 1 from public.official_sources
    where id = v_source_id and allowed_for_review
  ) then
    raise exception using errcode = '22023', message = 'Source reconciliation is required';
  end if;

  update public.content_drafts
  set status = 'review', submitted_at = now(), updated_at = now()
  where id = p_id;

  insert into public.content_review_events (draft_id, actor_id, from_status, to_status)
  values (p_id, v_actor, 'draft', 'review');
end;
$$;

create or replace function private.review_content_draft(
  p_id bigint,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_owner uuid;
  v_status text;
  v_source_id text;
  v_next_status text;
begin
  select role into v_actor_role
  from public.team_members
  where user_id = v_actor and status = 'active';

  if v_actor_role is null or v_actor_role not in ('coach', 'director', 'admin') then
    raise exception using errcode = '42501', message = 'Reviewer role required';
  end if;

  select owner_id, status, source_id
  into v_owner, v_status, v_source_id
  from public.content_drafts
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Draft not found';
  end if;
  if v_owner = v_actor then
    raise exception using errcode = '42501', message = 'A draft owner cannot review their own draft';
  end if;
  if v_status <> 'review' then
    raise exception using errcode = '22023', message = 'Draft is not awaiting review';
  end if;
  if p_decision not in ('internal_approved', 'return_to_draft') then
    raise exception using errcode = '22023', message = 'Invalid review decision';
  end if;
  if p_decision = 'internal_approved' and not exists (
    select 1 from public.official_sources
    where id = v_source_id and allowed_for_review
  ) then
    raise exception using errcode = '22023', message = 'Source reconciliation is required';
  end if;

  v_next_status := case when p_decision = 'return_to_draft' then 'draft' else 'internal_approved' end;

  update public.content_drafts
  set status = v_next_status,
      reviewed_by = case when v_next_status = 'internal_approved' then v_actor else null end,
      reviewed_at = case when v_next_status = 'internal_approved' then now() else null end,
      review_note = nullif(btrim(p_note), ''),
      updated_at = now()
  where id = p_id;

  insert into public.content_review_events (draft_id, actor_id, from_status, to_status, note)
  values (p_id, v_actor, 'review', v_next_status, nullif(btrim(p_note), ''));
end;
$$;

create or replace function private.record_corporate_approval_reference(
  p_id bigint,
  p_evidence_ref text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_owner uuid;
  v_status text;
  v_source_id text;
  v_reference text := nullif(btrim(p_evidence_ref), '');
begin
  select role into v_actor_role
  from public.team_members
  where user_id = v_actor and status = 'active';

  if v_actor_role is distinct from 'admin' then
    raise exception using errcode = '42501', message = 'Admin role required';
  end if;

  select owner_id, status, source_id
  into v_owner, v_status, v_source_id
  from public.content_drafts
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Draft not found';
  end if;
  if v_owner = v_actor then
    raise exception using errcode = '42501', message = 'A draft owner cannot record their own corporate approval';
  end if;
  if v_status <> 'internal_approved' then
    raise exception using errcode = '22023', message = 'Internal review must be completed first';
  end if;
  if not exists (
    select 1 from public.official_sources
    where id = v_source_id and allowed_for_review
  ) then
    raise exception using errcode = '22023', message = 'Source is no longer allowed for review';
  end if;
  if v_reference is null or char_length(v_reference) < 3 or char_length(v_reference) > 240 then
    raise exception using errcode = '22023', message = 'A valid approval reference is required';
  end if;

  update public.content_drafts
  set status = 'corporate_approved',
      corporate_approval_ref = v_reference,
      corporate_approval_recorded_by = v_actor,
      corporate_approved_at = now(),
      updated_at = now()
  where id = p_id;

  insert into public.content_review_events (draft_id, actor_id, from_status, to_status, evidence_ref)
  values (p_id, v_actor, 'internal_approved', 'corporate_approved', v_reference);
end;
$$;

create or replace function private.archive_content_draft(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_owner uuid;
  v_status text;
begin
  select role into v_actor_role
  from public.team_members
  where user_id = v_actor and status = 'active';

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'Active membership required';
  end if;

  select owner_id, status
  into v_owner, v_status
  from public.content_drafts
  where id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Draft not found';
  end if;
  if v_owner <> v_actor and v_actor_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only the owner or an admin may archive this draft';
  end if;
  if v_status = 'archived' then
    raise exception using errcode = '22023', message = 'Draft is already archived';
  end if;

  update public.content_drafts
  set status = 'archived', updated_at = now()
  where id = p_id;

  insert into public.content_review_events (draft_id, actor_id, from_status, to_status)
  values (p_id, v_actor, v_status, 'archived');
end;
$$;

create or replace function public.submit_content_draft(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as 'select private.submit_content_draft($1)';

create or replace function public.review_content_draft(
  p_id bigint,
  p_decision text,
  p_note text default null
)
returns void
language sql
security invoker
set search_path = ''
as 'select private.review_content_draft($1, $2, $3)';

create or replace function public.record_corporate_approval_reference(
  p_id bigint,
  p_evidence_ref text
)
returns void
language sql
security invoker
set search_path = ''
as 'select private.record_corporate_approval_reference($1, $2)';

create or replace function public.archive_content_draft(p_id bigint)
returns void
language sql
security invoker
set search_path = ''
as 'select private.archive_content_draft($1)';

revoke all on table public.official_sources from anon, authenticated;
revoke all on table public.content_drafts from anon, authenticated;
revoke all on table public.content_review_events from anon, authenticated;
revoke all on sequence public.content_review_events_id_seq from anon, authenticated;

grant select on table public.official_sources to authenticated;
grant select on table public.content_drafts to authenticated;
grant insert (owner_id, title, channel, source_id, excerpt) on table public.content_drafts to authenticated;
grant select on table public.content_review_events to authenticated;
grant usage, select on sequence public.content_drafts_id_seq to authenticated;

revoke all on function public.submit_content_draft(bigint) from public, anon, authenticated;
revoke all on function public.review_content_draft(bigint, text, text) from public, anon, authenticated;
revoke all on function public.record_corporate_approval_reference(bigint, text) from public, anon, authenticated;
revoke all on function public.archive_content_draft(bigint) from public, anon, authenticated;
revoke all on function private.submit_content_draft(bigint) from public, anon, authenticated;
revoke all on function private.review_content_draft(bigint, text, text) from public, anon, authenticated;
revoke all on function private.record_corporate_approval_reference(bigint, text) from public, anon, authenticated;
revoke all on function private.archive_content_draft(bigint) from public, anon, authenticated;

grant execute on function public.submit_content_draft(bigint) to authenticated;
grant execute on function public.review_content_draft(bigint, text, text) to authenticated;
grant execute on function public.record_corporate_approval_reference(bigint, text) to authenticated;
grant execute on function public.archive_content_draft(bigint) to authenticated;
grant execute on function private.submit_content_draft(bigint) to authenticated;
grant execute on function private.review_content_draft(bigint, text, text) to authenticated;
grant execute on function private.record_corporate_approval_reference(bigint, text) to authenticated;
grant execute on function private.archive_content_draft(bigint) to authenticated;

commit;
