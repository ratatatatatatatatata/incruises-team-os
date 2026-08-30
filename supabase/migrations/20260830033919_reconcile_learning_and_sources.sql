begin;

-- Constrain progress to the product's actual lesson catalog. Four legacy IDs
-- are retained because they are confirmed in the current production data;
-- the application maps them to their canonical equivalents when reading.
create table if not exists public.learning_lesson_keys (
  stored_id text primary key,
  canonical_id text not null,
  is_legacy boolean not null default false,
  check (char_length(stored_id) between 1 and 80),
  check (canonical_id ~ '^l[0-9]+-[1-9][0-9]*$')
);

alter table public.learning_lesson_keys enable row level security;

insert into public.learning_lesson_keys (stored_id, canonical_id, is_legacy)
values
  ('l0-1', 'l0-1', false),
  ('l0-2', 'l0-2', false),
  ('l0-3', 'l0-3', false),
  ('l0-4', 'l0-4', false),
  ('l1-1', 'l1-1', false),
  ('l1-2', 'l1-2', false),
  ('l1-3', 'l1-3', false),
  ('l1-4', 'l1-4', false),
  ('l2-1', 'l2-1', false),
  ('l2-2', 'l2-2', false),
  ('l2-3', 'l2-3', false),
  ('l2-4', 'l2-4', false),
  ('l3-1', 'l3-1', false),
  ('l3-2', 'l3-2', false),
  ('l3-3', 'l3-3', false),
  ('l3-4', 'l3-4', false),
  ('l5-1', 'l5-1', false),
  ('l5-2', 'l5-2', false),
  ('l5-3', 'l5-3', false),
  ('l5-4', 'l5-4', false),
  ('L0-01', 'l0-1', true),
  ('L0-02', 'l0-2', true),
  ('L1-01', 'l1-1', true),
  ('L1-02', 'l1-2', true)
on conflict (stored_id) do nothing;

revoke all on table public.learning_lesson_keys from public, anon, authenticated;

alter table public.lesson_progress
  drop constraint if exists lesson_progress_lesson_id_catalog_fkey;
alter table public.lesson_progress
  add constraint lesson_progress_lesson_id_catalog_fkey
  foreign key (lesson_id)
  references public.learning_lesson_keys(stored_id)
  not valid;
alter table public.lesson_progress
  validate constraint lesson_progress_lesson_id_catalog_fkey;

-- Keep source-backed draft lookups indexed. This also covers the existing
-- content_drafts_source_id_fkey relationship reported by the DB advisor.
create index if not exists idx_content_drafts_source_id
  on public.content_drafts(source_id);

-- Add evidence lifecycle fields without changing or deleting existing source
-- records. A NULL verified_at remains an explicit "not yet verified" state.
alter table public.official_sources
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists version_label text,
  add column if not exists effective_at date,
  add column if not exists review_due_at date,
  add column if not exists last_checked_at timestamptz;

alter table public.official_sources
  drop constraint if exists official_sources_version_label_length,
  add constraint official_sources_version_label_length
    check (version_label is null or char_length(version_label) between 1 and 80),
  drop constraint if exists official_sources_review_window,
  add constraint official_sources_review_window
    check (review_due_at is null or effective_at is null or review_due_at >= effective_at);

create index if not exists idx_official_sources_review_due
  on public.official_sources(review_due_at)
  where allowed_for_review;
create index if not exists idx_official_sources_verified_by
  on public.official_sources(verified_by);

comment on column public.official_sources.verified_at is
  'Date an authorized operator verified this exact source version. NULL means unverified.';
comment on column public.official_sources.verified_by is
  'Operator who recorded the verification; this does not itself prove company approval.';
comment on column public.official_sources.version_label is
  'Human-readable version or revision label from the source document.';
comment on column public.official_sources.review_due_at is
  'Date by which the source must be checked again before continued use.';
comment on column public.official_sources.last_checked_at is
  'Timestamp of the latest source availability or version check.';

-- The application filters unverified sources, but the database remains the
-- final authority so direct Data API calls cannot bypass that rule.
create or replace function private.enforce_verified_content_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_verified_at date;
  v_effective_at date;
  v_review_due_at date;
begin
  -- Archiving legacy records must remain possible without claiming that their
  -- original source was verified.
  if new.status = 'archived' then
    return new;
  end if;

  select
    source.allowed_for_review,
    source.verified_at,
    source.effective_at,
    source.review_due_at
  into v_allowed, v_verified_at, v_effective_at, v_review_due_at
  from public.official_sources as source
  where source.id = new.source_id;

  if not found or v_allowed is distinct from true or v_verified_at is null then
    raise exception using
      errcode = '22023',
      message = 'A verified and review-allowed official source is required';
  end if;

  if v_verified_at > current_date then
    raise exception using
      errcode = '22023',
      message = 'Official source verification date cannot be in the future';
  end if;

  if v_effective_at is not null and v_effective_at > current_date then
    raise exception using
      errcode = '22023',
      message = 'Official source is not yet effective';
  end if;

  if v_review_due_at is not null and v_review_due_at < current_date then
    raise exception using
      errcode = '22023',
      message = 'Official source review is overdue';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_verified_content_source()
from public, anon, authenticated;

drop trigger if exists content_drafts_verified_source_gate on public.content_drafts;
create trigger content_drafts_verified_source_gate
before insert or update of source_id, status
on public.content_drafts
for each row
execute function private.enforce_verified_content_source();

commit;
