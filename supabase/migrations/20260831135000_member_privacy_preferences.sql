create table public.member_privacy_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assessment_consent boolean not null default false,
  assessment_consent_version text,
  assessment_consented_at timestamptz,
  sharing_level text not null default 'private',
  assistant_memory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_privacy_sharing_level_check check (sharing_level in ('private', 'summary', 'detailed')),
  constraint member_privacy_consent_evidence_check check (
    assessment_consent = false
    or (assessment_consent_version is not null and assessment_consented_at is not null)
  )
);

alter table public.member_privacy_preferences enable row level security;

create policy member_privacy_select_own
  on public.member_privacy_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy member_privacy_insert_own
  on public.member_privacy_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy member_privacy_update_own
  on public.member_privacy_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.member_privacy_preferences from public, anon, authenticated;
grant select, insert, update on table public.member_privacy_preferences to authenticated;
