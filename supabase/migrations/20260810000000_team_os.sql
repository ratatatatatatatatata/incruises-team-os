begin;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'builder' check (role in ('builder', 'coach', 'director', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 80),
  status text not null default 'completed' check (status in ('completed')),
  score integer check (score is null or score between 0 and 100),
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.content_drafts (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  channel text not null check (channel in ('Facebook', 'Instagram', 'Short video', 'FAQ', 'Message')),
  source_id text not null check (char_length(source_id) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'archived')),
  excerpt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_tasks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null check (char_length(member_name) between 1 and 80),
  milestone text not null check (char_length(milestone) between 1 and 40),
  next_action text not null check (char_length(next_action) between 1 and 180),
  due_label text not null default 'Өнөөдөр' check (char_length(due_label) between 1 and 40),
  risk text not null default 'normal' check (risk in ('normal', 'attention', 'urgent')),
  status text not null default 'open' check (status in ('open', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lesson_progress_user on public.lesson_progress(user_id);
create index if not exists idx_content_drafts_owner_status on public.content_drafts(owner_id, status);
create index if not exists idx_member_tasks_owner_status on public.member_tasks(owner_id, status);

alter table public.user_profiles enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.content_drafts enable row level security;
alter table public.member_tasks enable row level security;

drop policy if exists "profiles_select_own" on public.user_profiles;
drop policy if exists "profiles_insert_own" on public.user_profiles;
drop policy if exists "profiles_update_own" on public.user_profiles;
create policy "profiles_select_own" on public.user_profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.user_profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.user_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "lesson_progress_own_rows" on public.lesson_progress;
create policy "lesson_progress_own_rows" on public.lesson_progress for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "content_drafts_own_rows" on public.content_drafts;
create policy "content_drafts_own_rows" on public.content_drafts for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "member_tasks_own_rows" on public.member_tasks;
create policy "member_tasks_own_rows" on public.member_tasks for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.user_profiles, public.lesson_progress, public.content_drafts, public.member_tasks from anon;
grant select, insert, update, delete on public.user_profiles, public.lesson_progress, public.content_drafts, public.member_tasks to authenticated;
grant usage, select on sequence public.content_drafts_id_seq, public.member_tasks_id_seq to authenticated;

commit;

