begin;

create table public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_courses_slug_format check (
    char_length(slug) between 2 and 80
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint academy_courses_title_length check (char_length(title) between 1 and 140),
  constraint academy_courses_description_length check (char_length(description) <= 5000),
  constraint academy_courses_status_check check (status in ('draft', 'published', 'archived')),
  constraint academy_courses_sort_order_check check (sort_order between 0 and 100000)
);

create table public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete restrict,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_modules_title_length check (char_length(title) between 1 and 140),
  constraint academy_modules_description_length check (char_length(description) <= 5000),
  constraint academy_modules_status_check check (status in ('draft', 'published', 'archived')),
  constraint academy_modules_sort_order_check check (sort_order between 0 and 100000)
);

create table public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_modules(id) on delete restrict,
  slug text not null,
  title text not null,
  summary text not null default '',
  duration_seconds integer,
  status text not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_lessons_slug_format check (
    char_length(slug) between 2 and 80
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint academy_lessons_title_length check (char_length(title) between 1 and 160),
  constraint academy_lessons_summary_length check (char_length(summary) <= 8000),
  constraint academy_lessons_duration_check check (
    duration_seconds is null or duration_seconds between 1 and 43200
  ),
  constraint academy_lessons_status_check check (status in ('draft', 'published', 'archived')),
  constraint academy_lessons_sort_order_check check (sort_order between 0 and 100000),
  constraint academy_lessons_module_slug_unique unique (module_id, slug)
);

create table public.academy_video_assets (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.academy_lessons(id) on delete restrict,
  provider text not null default 'mux',
  mux_asset_id text,
  mux_playback_id text not null unique,
  playback_policy text not null default 'signed',
  status text not null default 'preparing',
  duration_seconds integer,
  aspect_ratio text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academy_video_assets_provider_check check (provider = 'mux'),
  constraint academy_video_assets_mux_asset_id_length check (
    mux_asset_id is null or char_length(mux_asset_id) between 6 and 255
  ),
  constraint academy_video_assets_playback_id_format check (
    char_length(mux_playback_id) between 6 and 255
    and mux_playback_id ~ '^[A-Za-z0-9_-]+$'
  ),
  constraint academy_video_assets_policy_check check (playback_policy in ('public', 'signed')),
  constraint academy_video_assets_status_check check (status in ('preparing', 'ready', 'errored', 'disabled')),
  constraint academy_video_assets_duration_check check (
    duration_seconds is null or duration_seconds between 1 and 43200
  ),
  constraint academy_video_assets_ready_duration_check check (
    status <> 'ready' or duration_seconds is not null
  ),
  constraint academy_video_assets_aspect_ratio_length check (
    aspect_ratio is null or char_length(aspect_ratio) between 3 and 20
  )
);

create unique index academy_video_assets_mux_asset_unique
  on public.academy_video_assets (mux_asset_id)
  where mux_asset_id is not null;

create table public.academy_watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  position_seconds numeric(12, 3) not null default 0,
  duration_seconds numeric(12, 3) not null,
  percent_complete numeric(5, 2) not null default 0,
  completed_at timestamptz,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  constraint academy_watch_progress_position_check check (
    position_seconds >= 0 and position_seconds <= 43260
  ),
  constraint academy_watch_progress_duration_check check (
    duration_seconds between 1 and 43200
  ),
  constraint academy_watch_progress_percent_check check (
    percent_complete between 0 and 100
  )
);

comment on table public.academy_courses is
  'Video Academy course catalog. Draft and archived records are hidden from ordinary members.';
comment on table public.academy_modules is
  'Ordered sections within an Academy course, with an independent publication state.';
comment on table public.academy_lessons is
  'Ordered member lessons. A lesson is visible only through a fully published hierarchy.';
comment on table public.academy_video_assets is
  'Mux playback identifiers and processing state. This table never stores a Mux private signing key.';
comment on table public.academy_watch_progress is
  'Per-member resume position and completion state. Browser writes are accepted only through a guarded RPC.';

create index academy_courses_status_order_idx
  on public.academy_courses (status, sort_order, created_at);
create index academy_modules_course_status_order_idx
  on public.academy_modules (course_id, status, sort_order, created_at);
create index academy_lessons_module_status_order_idx
  on public.academy_lessons (module_id, status, sort_order, created_at);
create index academy_video_assets_lesson_status_idx
  on public.academy_video_assets (lesson_id, status);
create index academy_watch_progress_user_recent_idx
  on public.academy_watch_progress (user_id, last_watched_at desc);
create index academy_watch_progress_lesson_idx
  on public.academy_watch_progress (lesson_id);

create or replace function private.touch_academy_catalog_record()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.status is distinct from 'published' then
      new.published_at := coalesce(new.published_at, now());
    end if;
  elsif new.status = 'draft' then
    new.published_at := null;
  end if;

  return new;
end;
$$;

create trigger academy_courses_touch_before_write
before insert or update on public.academy_courses
for each row execute function private.touch_academy_catalog_record();

create trigger academy_modules_touch_before_write
before insert or update on public.academy_modules
for each row execute function private.touch_academy_catalog_record();

create trigger academy_lessons_touch_before_write
before insert or update on public.academy_lessons
for each row execute function private.touch_academy_catalog_record();

create or replace function private.touch_academy_video_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger academy_video_assets_touch_before_write
before insert or update on public.academy_video_assets
for each row execute function private.touch_academy_video_asset();

create or replace function private.is_active_academy_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and exists (
      select 1
      from public.team_members as member
      where member.user_id = auth.uid()
        and member.status = 'active'
    )
$$;

create or replace function private.is_active_academy_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_active_academy_member()
    and exists (
      select 1
      from public.team_members as member
      where member.user_id = auth.uid()
        and member.status = 'active'
        and member.role = 'admin'
    )
$$;

alter table public.academy_courses enable row level security;
alter table public.academy_modules enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.academy_video_assets enable row level security;
alter table public.academy_watch_progress enable row level security;

create policy academy_courses_select_member_catalog
on public.academy_courses
for select
to authenticated
using (
  private.is_active_academy_admin()
  or (private.is_active_academy_member() and status = 'published')
);

create policy academy_modules_select_member_catalog
on public.academy_modules
for select
to authenticated
using (
  private.is_active_academy_admin()
  or (
    private.is_active_academy_member()
    and status = 'published'
    and exists (
      select 1
      from public.academy_courses as course
      where course.id = academy_modules.course_id
        and course.status = 'published'
    )
  )
);

create policy academy_lessons_select_member_catalog
on public.academy_lessons
for select
to authenticated
using (
  private.is_active_academy_admin()
  or (
    private.is_active_academy_member()
    and status = 'published'
    and exists (
      select 1
      from public.academy_modules as module
      join public.academy_courses as course on course.id = module.course_id
      where module.id = academy_lessons.module_id
        and module.status = 'published'
        and course.status = 'published'
    )
  )
);

create policy academy_video_assets_select_member_catalog
on public.academy_video_assets
for select
to authenticated
using (
  private.is_active_academy_admin()
  or (
    private.is_active_academy_member()
    and status = 'ready'
    and exists (
      select 1
      from public.academy_lessons as lesson
      join public.academy_modules as module on module.id = lesson.module_id
      join public.academy_courses as course on course.id = module.course_id
      where lesson.id = academy_video_assets.lesson_id
        and lesson.status = 'published'
        and module.status = 'published'
        and course.status = 'published'
    )
  )
);

create policy academy_watch_progress_select_own
on public.academy_watch_progress
for select
to authenticated
using (
  private.is_active_academy_member()
  and user_id = auth.uid()
);

create or replace function private.save_academy_watch_progress(
  p_lesson_id uuid,
  p_position_seconds double precision,
  p_duration_seconds double precision,
  p_completed boolean
)
returns table (
  lesson_id uuid,
  position_seconds numeric,
  duration_seconds numeric,
  percent_complete numeric,
  completed_at timestamptz,
  last_watched_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_catalog_duration integer;
  v_duration numeric(12, 3);
  v_position numeric(12, 3);
  v_percent numeric(5, 2);
  v_completed_at timestamptz;
begin
  if v_actor is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not exists (
       select 1
       from public.team_members as member
       where member.user_id = v_actor
         and member.status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'Active member required';
  end if;

  if p_lesson_id is null
     or p_position_seconds is null
     or p_duration_seconds is null
     or p_completed is null
     or p_position_seconds < 0
     or p_duration_seconds < 1
     or p_duration_seconds > 43200
     or p_position_seconds > p_duration_seconds + 60 then
    raise exception using errcode = '22023', message = 'Invalid Academy progress';
  end if;

  select coalesce(video.duration_seconds, lesson.duration_seconds)
  into v_catalog_duration
  from public.academy_lessons as lesson
  join public.academy_modules as module on module.id = lesson.module_id
  join public.academy_courses as course on course.id = module.course_id
  join public.academy_video_assets as video on video.lesson_id = lesson.id
  where lesson.id = p_lesson_id
    and lesson.status = 'published'
    and module.status = 'published'
    and course.status = 'published'
    and video.status = 'ready';

  if not found then
    raise exception using errcode = 'P0002', message = 'Published Academy lesson not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'insuccess-academy-progress:' || v_actor::text || ':' || p_lesson_id::text,
      0
    )
  );

  v_duration := least(
    43200::numeric,
    greatest(1::numeric, round(coalesce(v_catalog_duration, p_duration_seconds)::numeric, 3))
  );
  v_position := least(
    v_duration,
    greatest(0::numeric, round(p_position_seconds::numeric, 3))
  );
  v_percent := least(100::numeric, round((v_position / v_duration) * 100, 2));
  v_completed_at := case
    when v_percent >= 90 or (p_completed and v_percent >= 80) then now()
    else null
  end;

  insert into public.academy_watch_progress as current_progress (
    user_id,
    lesson_id,
    position_seconds,
    duration_seconds,
    percent_complete,
    completed_at,
    last_watched_at,
    updated_at
  ) values (
    v_actor,
    p_lesson_id,
    v_position,
    v_duration,
    v_percent,
    v_completed_at,
    now(),
    now()
  )
  on conflict on constraint academy_watch_progress_pkey do update
  set position_seconds = greatest(
        current_progress.position_seconds,
        excluded.position_seconds
      ),
      duration_seconds = greatest(
        current_progress.duration_seconds,
        excluded.duration_seconds
      ),
      percent_complete = greatest(
        current_progress.percent_complete,
        excluded.percent_complete
      ),
      completed_at = coalesce(
        current_progress.completed_at,
        excluded.completed_at
      ),
      last_watched_at = now(),
      updated_at = now();

  return query
  select
    progress.lesson_id,
    progress.position_seconds,
    progress.duration_seconds,
    progress.percent_complete,
    progress.completed_at,
    progress.last_watched_at
  from public.academy_watch_progress as progress
  where progress.user_id = v_actor
    and progress.lesson_id = p_lesson_id;
end;
$$;

create or replace function public.save_academy_watch_progress(
  p_lesson_id uuid,
  p_position_seconds double precision,
  p_duration_seconds double precision,
  p_completed boolean
)
returns table (
  lesson_id uuid,
  position_seconds numeric,
  duration_seconds numeric,
  percent_complete numeric,
  completed_at timestamptz,
  last_watched_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.save_academy_watch_progress($1, $2, $3, $4)
$$;

revoke all on table public.academy_courses from public, anon, authenticated;
revoke all on table public.academy_modules from public, anon, authenticated;
revoke all on table public.academy_lessons from public, anon, authenticated;
revoke all on table public.academy_video_assets from public, anon, authenticated;
revoke all on table public.academy_watch_progress from public, anon, authenticated;

grant select (
  id, slug, title, description, status, sort_order, published_at, created_at, updated_at
) on public.academy_courses to authenticated;
grant select (
  id, course_id, title, description, status, sort_order, published_at, created_at, updated_at
) on public.academy_modules to authenticated;
grant select (
  id, module_id, slug, title, summary, duration_seconds, status, sort_order,
  published_at, created_at, updated_at
) on public.academy_lessons to authenticated;
grant select (
  id, lesson_id, provider, mux_playback_id, playback_policy, status,
  duration_seconds, aspect_ratio, created_at, updated_at
) on public.academy_video_assets to authenticated;
grant select (
  user_id, lesson_id, position_seconds, duration_seconds, percent_complete,
  completed_at, last_watched_at, created_at, updated_at
) on public.academy_watch_progress to authenticated;

revoke all on function private.touch_academy_catalog_record() from public, anon, authenticated;
revoke all on function private.touch_academy_video_asset() from public, anon, authenticated;
revoke all on function private.is_active_academy_member() from public, anon, authenticated;
revoke all on function private.is_active_academy_admin() from public, anon, authenticated;
revoke all on function private.save_academy_watch_progress(uuid, double precision, double precision, boolean)
  from public, anon, authenticated;
revoke all on function public.save_academy_watch_progress(uuid, double precision, double precision, boolean)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_academy_member() to authenticated;
grant execute on function private.is_active_academy_admin() to authenticated;
grant execute on function private.save_academy_watch_progress(uuid, double precision, double precision, boolean)
  to authenticated;
grant execute on function public.save_academy_watch_progress(uuid, double precision, double precision, boolean)
  to authenticated;

commit;
