begin;

create table if not exists private.assessment_baseline_bank (
  question_key text primary key,
  position smallint not null unique check (position between 1 and 15),
  prompt text not null check (char_length(prompt) between 10 and 500),
  help_text text,
  response_type text not null default 'scale' check (
    response_type in ('single_choice', 'multi_choice', 'scale', 'short_text', 'long_text', 'number')
  ),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  response_config jsonb not null default '{}'::jsonb check (jsonb_typeof(response_config) = 'object'),
  personalization_context jsonb not null default '{}'::jsonb check (
    jsonb_typeof(personalization_context) = 'object'
    and octet_length(personalization_context::text) <= 8192
  ),
  dimension text not null check (
    dimension in (
      'direction', 'consistency', 'communication', 'relationships', 'content',
      'leadership', 'learning', 'resilience', 'planning', 'compliance'
    )
  )
);

create table if not exists private.assessment_deep_bank (
  question_key text primary key,
  dimension text not null check (
    dimension in (
      'direction', 'consistency', 'communication', 'relationships', 'content',
      'leadership', 'learning', 'resilience', 'planning', 'compliance'
    )
  ),
  branch text not null check (branch in ('growth', 'balanced', 'strength')),
  local_position smallint not null check (local_position between 1 and 10),
  prompt text not null check (char_length(prompt) between 10 and 500),
  unique (dimension, branch, local_position)
);

revoke all on table private.assessment_baseline_bank from public, anon, authenticated;
revoke all on table private.assessment_deep_bank from public, anon, authenticated;

insert into private.assessment_baseline_bank (
  question_key, position, prompt, help_text, response_type, options, response_config, dimension
)
values
  ('baseline-direction-clarity', 1, 'Ойрын 90 хоногт хүрэх өөрийн гол үр дүнг би тодорхой тайлбарлаж чаддаг.',
    '1 — огт тодорхойгүй, 5 — маш тодорхой', 'scale', '[]'::jsonb,
    '{"min":1,"max":5,"minLabel":"Огт тодорхойгүй","maxLabel":"Маш тодорхой"}'::jsonb, 'direction'),
  ('baseline-primary-goal', 2, 'Одоо хамгийн түрүүнд ямар үр дүнд хүрэхийг хүсэж байна вэ?',
    'Танд хамгийн ойр нэгийг сонгоно уу.', 'single_choice',
    '[{"value":"learn_basics","label":"Сууриа зөв сурах"},{"value":"build_consistency","label":"Тогтмол үйлдлийн хэмнэлтэй болох"},{"value":"content_social","label":"Контент ба сошиал харилцаагаа хөгжүүлэх"},{"value":"team_leadership","label":"Баг хөгжүүлэх"},{"value":"board_director","label":"Board Director зорилгын хөгжлийн зам"}]'::jsonb,
    '{}'::jsonb, 'direction'),
  ('baseline-current-stage', 3, 'Одоогийн туршлагаа аль түвшинтэй хамгийн ойр гэж үзэж байна вэ?',
    'Энэ нь албан rank биш, зөвхөн сурах замыг тохируулна.', 'single_choice',
    '[{"value":"new","label":"Шинээр эхэлж байна","score":1},{"value":"learning","label":"Сууриа сурч байна","score":2},{"value":"active_builder","label":"Тогтмол хэрэгжүүлж байна","score":3},{"value":"team_lead","label":"Баг дэмжиж, удирдаж байна","score":4},{"value":"experienced_leader","label":"Давтагдах багийн систем ажиллуулж байна","score":5}]'::jsonb,
    '{}'::jsonb, 'leadership'),
  ('baseline-weekly-time', 4, 'Долоо хоногт энэ зорилгодоо бодитоор хэдий хэр цаг гаргаж чадах вэ?',
    'Төгс хариулт биш, бодит боломжоо сонгоно уу.', 'single_choice',
    '[{"value":"under_2h","label":"2 цагаас бага","score":1},{"value":"2_5h","label":"2–5 цаг","score":2},{"value":"5_10h","label":"5–10 цаг","score":4},{"value":"over_10h","label":"10 цагаас их","score":5}]'::jsonb,
    '{}'::jsonb, 'planning'),
  ('baseline-primary-channel', 5, 'Хүмүүстэй харилцахдаа аль сувгийг хамгийн тухтай ашигладаг вэ?',
    'Контент ба харилцааны guide үүнд таарна.', 'single_choice',
    '[{"value":"facebook","label":"Facebook"},{"value":"instagram","label":"Instagram"},{"value":"short_video","label":"Богино видео"},{"value":"messaging","label":"Messenger / чат"},{"value":"in_person","label":"Биечлэн уулзах"}]'::jsonb,
    '{}'::jsonb, 'content'),
  ('baseline-biggest-obstacle', 6, 'Одоогоор хамгийн их саад болж байгаа зүйл аль вэ?',
    'Дараагийн 100 асуултын төвлөрлийг тохируулна.', 'single_choice',
    '[{"value":"time","label":"Цаг гаргах"},{"value":"confidence","label":"Өөртөө итгэх итгэл"},{"value":"consistency","label":"Тогтмол байдал"},{"value":"content_ideas","label":"Контентын санаа"},{"value":"follow_up","label":"Follow-up ба харилцаа"},{"value":"knowledge","label":"Мэдлэг, мэдээлэл"}]'::jsonb,
    '{}'::jsonb, 'resilience'),
  ('baseline-consistency', 7, 'Өдөр тутмын чухал ажлуудаа сэтгэл хөдлөлөөс үл хамааран тогтмол хийдэг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'consistency'),
  ('baseline-communication', 8, 'Шинэ хүнтэй дарамтгүй, ойлгомжтой яриа эхлүүлэхдээ итгэлтэй байдаг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'communication'),
  ('baseline-relationships', 9, 'Хүний хэрэгцээг эхлээд сонсоод, өмнөх ярианд нь тохирсон follow-up хийдэг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'relationships'),
  ('baseline-content', 10, 'Өөрийн туршлага, сургамжийг хүмүүст хэрэгтэй контент болгон хувиргаж чаддаг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'content'),
  ('baseline-leadership', 11, 'Бусдад зөвхөн даалгавар өгөхөөс илүү өөрсдөө өсөх системийг нь бий болгож өгдөг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'leadership'),
  ('baseline-learning', 12, 'Шинэ мэдлэгийг сурсан даруйдаа туршиж, үр дүнг нь тэмдэглэдэг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'learning'),
  ('baseline-resilience', 13, 'Татгалзсан хариу эсвэл удаан үр дүнгийн дараа тайван дүгнэж, дахин оролдож чаддаг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'resilience'),
  ('baseline-planning', 14, 'Долоо хоног бүр хийх ажил, follow-up, контентынхаа төлөвлөгөөг урьдчилан гаргадаг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'planning'),
  ('baseline-compliance', 15, 'Үнэ, орлого, аялал, бодлогын мэдээллийг хуваалцахын өмнө хүчинтэй албан эх сурвалж болон approval шаардлагыг шалгадаг.', null, 'scale', '[]'::jsonb, '{"min":1,"max":5}'::jsonb, 'compliance')
on conflict (question_key) do update
set position = excluded.position,
    prompt = excluded.prompt,
    help_text = excluded.help_text,
    response_type = excluded.response_type,
    options = excluded.options,
    response_config = excluded.response_config,
    dimension = excluded.dimension;

with dimensions(dimension, label) as (
  values
    ('direction', 'зорилго ба чиглэл'),
    ('consistency', 'тогтвортой хэрэгжилт'),
    ('communication', 'ойлгомжтой харилцаа'),
    ('relationships', 'итгэлцэл ба follow-up'),
    ('content', 'контент бүтээлт'),
    ('leadership', 'манлайлал ба баг хөгжүүлэлт'),
    ('learning', 'суралцах ба турших'),
    ('resilience', 'тэсвэр ба сэргэлт'),
    ('planning', 'төлөвлөлт ба хэмжилт'),
    ('compliance', 'эх сурвалж ба хариуцлага')
), probes(branch, local_position, prompt_template) as (
  values
    ('growth', 1, '%s дээр эхлэхэд хамгийн амархан нэг үйлдлээ би тодорхой мэддэг.'),
    ('growth', 2, '%s-д зориулж долоо хоногт хамгийн багадаа нэг хамгаалсан цаг гаргаж чаддаг.'),
    ('growth', 3, '%s дээр намайг зогсоодог гол саадыг нэрлэж чаддаг.'),
    ('growth', 4, '%s-ийн саадыг багасгах хүн эсвэл хэрэгслийн дэмжлэг надад тодорхой.'),
    ('growth', 5, '%s-ийн жижиг ахицыг тэмдэглэж, өөрийгөө урамшуулдаг.'),
    ('growth', 6, '%s дээр алдаа гаргасан ч дараагийн оролдлогоо төлөвлөж чаддаг.'),
    ('growth', 7, '%s-ийн талаар асуух нэг тодорхой асуулт надад бэлэн байдаг.'),
    ('growth', 8, '%s-ийн үндсэн алхмыг 15 минутын ажил болгон жижиглэж чаддаг.'),
    ('growth', 9, '%s дээр долоо хоног бүр шалгах нэг энгийн үзүүлэлт сонгосон.'),
    ('growth', 10, '%s-ийг дараагийн 30 хоногт тогтмол давтах бодит төлөвлөгөөтэй.'),
    ('balanced', 1, 'Сүүлийн 30 хоногт %s дээр хийсэн хамгийн бодит нэг үйлдлээ тогтмол давтсан.'),
    ('balanced', 2, '%s сайжруулахын тулд долоо хоног бүр хамгаалж үлдээдэг цаг надад бий.'),
    ('balanced', 3, 'Ачаалал нэмэгдэх үед ч %s-ийн үндсэн дадлаа хадгалж чаддаг.'),
    ('balanced', 4, '%s дээр гаргасан шийдвэрээ бодит үр дүнгээр эргэн шалгадаг.'),
    ('balanced', 5, '%s-тэй холбоотой саад гарахад дараагийн жижиг алхмаа хурдан сонгодог.'),
    ('balanced', 6, '%s дээр юуг зогсоох, үргэлжлүүлэх, эхлүүлэхээ тодорхойлж чаддаг.'),
    ('balanced', 7, '%s-ийн ахицад хэрэгтэй санал хүсэлтийг тайван хүлээн авдаг.'),
    ('balanced', 8, '%s-ийн үйлдлээ бусдад ойлгомжтой, давтаж болохуйц байдлаар тайлбарлаж чаддаг.'),
    ('balanced', 9, '%s дээр долоо хоногийн хэмжигдэхүйц нэг үзүүлэлт ашигладаг.'),
    ('balanced', 10, '%s-ийг 90 хоног тогтвортой хөгжүүлэх бодит төлөвлөгөө надад бий.'),
    ('strength', 1, '%s дээр надад ажилладаг аргаа ямар нөхцөлд давтаж болохыг мэддэг.'),
    ('strength', 2, '%s-ийн сайн дадлаа бусдад зааж болох энгийн алхмууд болгон бичсэн.'),
    ('strength', 3, '%s дээрх үр дүнгээ багийн өөр нөхцөлд тохируулан хэрэглэж чаддаг.'),
    ('strength', 4, '%s-ийн чанарыг хадгалах хэмжүүр, review хэмнэл ашигладаг.'),
    ('strength', 5, '%s дээр бусдын өсөлтийг дэмжихдээ бэлэн хариу өгөхөөс илүү асуулт ашигладаг.'),
    ('strength', 6, '%s-ийн ажлаа өөр хүн давтаж хийхэд ойлгомжтой checklist болгосон.'),
    ('strength', 7, '%s дээр өөрийн сохор цэгийг илрүүлэх тогтмол feedback авдаг.'),
    ('strength', 8, '%s-ийн давуу талаа хэтрүүлэлгүй, бодит нотолгоотой тайлбарлаж чаддаг.'),
    ('strength', 9, '%s-ийн ахицыг хувь хүн болон багийн түвшинд тусад нь хэмждэг.'),
    ('strength', 10, '%s-ийг дараагийн 90 хоногт тогтвортой систем болгох төлөвлөгөөтэй.')
)
insert into private.assessment_deep_bank (question_key, dimension, branch, local_position, prompt)
select
  'tailored-' || dimensions.dimension || '-' || probes.branch || '-' || lpad(probes.local_position::text, 2, '0'),
  dimensions.dimension,
  probes.branch,
  probes.local_position,
  format(probes.prompt_template, dimensions.label)
from dimensions
cross join probes
on conflict (question_key) do update
set dimension = excluded.dimension,
    branch = excluded.branch,
    local_position = excluded.local_position,
    prompt = excluded.prompt;

create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_version text not null default 'insuccess-v1' check (char_length(assessment_version) between 1 and 40),
  status text not null default 'baseline' check (
    status in ('baseline', 'analysis', 'tailored', 'ready_to_complete', 'completed')
  ),
  baseline_answered smallint not null default 0 check (baseline_answered between 0 and 15),
  tailored_answered smallint not null default 0 check (tailored_answered between 0 and 100),
  adaptation_context jsonb not null default '{}'::jsonb check (jsonb_typeof(adaptation_context) = 'object'),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, user_id),
  unique (user_id, assessment_version)
);

create table if not exists public.member_onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_session_id uuid unique,
  status text not null default 'not_started' check (
    status in ('not_started', 'baseline', 'analysis', 'tailored', 'ready_to_complete', 'completed')
  ),
  assessment_version text not null default 'insuccess-v1' check (char_length(assessment_version) between 1 and 40),
  baseline_answered smallint not null default 0 check (baseline_answered between 0 and 15),
  tailored_answered smallint not null default 0 check (tailored_answered between 0 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint member_onboarding_state_active_session_owner_fkey
    foreign key (active_session_id, user_id)
    references public.assessment_sessions(id, user_id)
    on delete cascade
);

create table if not exists public.assessment_questions (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  user_id uuid not null,
  phase text not null check (phase in ('baseline', 'tailored')),
  position smallint not null,
  question_key text not null check (char_length(question_key) between 1 and 100),
  prompt text not null check (char_length(prompt) between 10 and 500),
  help_text text check (help_text is null or char_length(help_text) <= 300),
  response_type text not null check (
    response_type in ('single_choice', 'multi_choice', 'scale', 'short_text', 'long_text', 'number')
  ),
  required boolean not null default true,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  response_config jsonb not null default '{}'::jsonb check (jsonb_typeof(response_config) = 'object'),
  personalization_context jsonb not null default '{}'::jsonb check (
    jsonb_typeof(personalization_context) = 'object'
    and octet_length(personalization_context::text) <= 8192
  ),
  dimension text not null check (
    dimension in (
      'direction', 'consistency', 'communication', 'relationships', 'content',
      'leadership', 'learning', 'resilience', 'planning', 'compliance'
    )
  ),
  created_at timestamptz not null default now(),
  constraint assessment_questions_position_check check (
    (phase = 'baseline' and position between 1 and 15)
    or (phase = 'tailored' and position between 1 and 100)
  ),
  constraint assessment_questions_session_owner_fkey
    foreign key (session_id, user_id)
    references public.assessment_sessions(id, user_id)
    on delete cascade,
  unique (id, session_id, user_id),
  unique (session_id, phase, position),
  unique (session_id, question_key)
);

create table if not exists public.assessment_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  question_id bigint not null,
  user_id uuid not null,
  client_answer_id uuid not null,
  answer_kind text not null check (answer_kind in ('answer', 'skip')),
  answer_value jsonb,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_answers_kind_value_check check (
    (answer_kind = 'answer' and answer_value is not null and skip_reason is null)
    or (answer_kind = 'skip' and answer_value is null and skip_reason = 'not_sure')
  ),
  constraint assessment_answers_question_owner_fkey
    foreign key (question_id, session_id, user_id)
    references public.assessment_questions(id, session_id, user_id)
    on delete cascade,
  unique (session_id, question_id),
  unique (user_id, client_answer_id)
);

create table if not exists public.success_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  profile_version text not null check (char_length(profile_version) between 1 and 40),
  primary_style text not null check (char_length(primary_style) between 1 and 120),
  secondary_style text check (secondary_style is null or char_length(secondary_style) between 1 and 120),
  dimension_scores jsonb not null check (jsonb_typeof(dimension_scores) = 'object'),
  dimension_evidence_counts jsonb not null check (jsonb_typeof(dimension_evidence_counts) = 'object'),
  strengths jsonb not null check (jsonb_typeof(strengths) = 'array'),
  growth_edges jsonb not null check (jsonb_typeof(growth_edges) = 'array'),
  motivation_pattern text not null,
  communication_style text not null,
  work_rhythm text not null,
  confidence_note text not null,
  methodology_note text not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint success_profiles_session_owner_fkey
    foreign key (session_id, user_id)
    references public.assessment_sessions(id, user_id)
    on delete cascade
);

create table if not exists public.success_guides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null unique,
  guide_version text not null check (char_length(guide_version) between 1 and 40),
  board_director_route jsonb not null check (jsonb_typeof(board_director_route) = 'object'),
  content_strategy jsonb not null check (jsonb_typeof(content_strategy) = 'object'),
  social_cadence jsonb not null check (jsonb_typeof(social_cadence) = 'object'),
  relationship_guide jsonb not null check (jsonb_typeof(relationship_guide) = 'object'),
  weekly_plan jsonb not null check (jsonb_typeof(weekly_plan) = 'object'),
  growth_plan jsonb not null check (jsonb_typeof(growth_plan) = 'object'),
  compliance_guardrails jsonb not null check (jsonb_typeof(compliance_guardrails) = 'object'),
  rank_disclaimer text not null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint success_guides_session_owner_fkey
    foreign key (session_id, user_id)
    references public.assessment_sessions(id, user_id)
    on delete cascade
);

create index if not exists idx_assessment_sessions_user_status
  on public.assessment_sessions(user_id, status);
create index if not exists idx_assessment_questions_user_session_order
  on public.assessment_questions(user_id, session_id, phase, position);
create index if not exists idx_assessment_answers_user_session
  on public.assessment_answers(user_id, session_id);
create index if not exists idx_assessment_answers_question
  on public.assessment_answers(question_id);

alter table public.assessment_sessions enable row level security;
alter table public.member_onboarding_state enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.success_profiles enable row level security;
alter table public.success_guides enable row level security;

create policy "assessment_sessions_select_own"
on public.assessment_sessions for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

create policy "member_onboarding_state_select_own"
on public.member_onboarding_state for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

create policy "assessment_questions_select_own"
on public.assessment_questions for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

create policy "assessment_answers_select_own"
on public.assessment_answers for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

create policy "success_profiles_select_own"
on public.success_profiles for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

create policy "success_guides_select_own"
on public.success_guides for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.status in ('pending', 'active')
  )
);

revoke all on table public.assessment_sessions from public, anon, authenticated;
revoke all on table public.member_onboarding_state from public, anon, authenticated;
revoke all on table public.assessment_questions from public, anon, authenticated;
revoke all on table public.assessment_answers from public, anon, authenticated;
revoke all on table public.success_profiles from public, anon, authenticated;
revoke all on table public.success_guides from public, anon, authenticated;
revoke all on sequence public.assessment_questions_id_seq from public, anon, authenticated;
revoke all on sequence public.assessment_answers_id_seq from public, anon, authenticated;

grant select on table public.assessment_sessions to authenticated;
grant select on table public.member_onboarding_state to authenticated;
grant select on table public.assessment_questions to authenticated;
grant select on table public.assessment_answers to authenticated;
grant select on table public.success_profiles to authenticated;
grant select on table public.success_guides to authenticated;

create or replace function private.current_assessment_actor()
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'Authenticated non-anonymous user required';
  end if;

  -- Serialize eligibility checks with admin membership lifecycle changes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-member-state:' || v_actor::text, 0)
  );

  if not exists (
    select 1
    from public.team_members as member
    where member.user_id = v_actor
      and member.status in ('pending', 'active')
  ) then
    raise exception using errcode = '42501', message = 'Pending or active membership required';
  end if;
  if not exists (
    select 1
    from public.member_privacy_preferences as preference
    where preference.user_id = v_actor
      and preference.assessment_consent = true
      and preference.assessment_consent_version is not null
      and preference.assessment_consented_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Assessment consent required';
  end if;
  return v_actor;
end;
$$;

create or replace function private.assessment_numeric_value(p_answer jsonb, p_options jsonb)
returns numeric
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text;
  v_score numeric;
begin
  if p_answer is null then return null; end if;
  if jsonb_typeof(p_answer) = 'number' then
    return (p_answer #>> '{}')::numeric;
  end if;
  if jsonb_typeof(p_answer) <> 'string' then return null; end if;

  v_value := p_answer #>> '{}';
  select (option_row ->> 'score')::numeric
  into v_score
  from jsonb_array_elements(p_options) as option_row
  where option_row ->> 'value' = v_value
    and option_row ? 'score'
  limit 1;
  return v_score;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

create or replace function private.assessment_style_label(p_dimension text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_dimension
    when 'direction' then 'Зорилгын чиглүүлэгч'
    when 'consistency' then 'Тогтвортой хэрэгжүүлэгч'
    when 'communication' then 'Итгэлцэлтэй харилцагч'
    when 'relationships' then 'Харилцаа бүтээгч'
    when 'content' then 'Контент өгүүлэгч'
    when 'leadership' then 'Баг хөгжүүлэгч'
    when 'learning' then 'Тасралтгүй суралцагч'
    when 'resilience' then 'Тэсвэртэй урагшлагч'
    when 'planning' then 'Системтэй төлөвлөгч'
    when 'compliance' then 'Хариуцлагатай бүтээгч'
    else 'Өсөлтөд чиглэсэн бүтээгч'
  end;
$$;

create or replace function private.begin_onboarding_assessment()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_assessment_actor();
  v_session_id uuid;
  v_bank_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('insuccess-assessment:' || v_actor::text, 0));

  select session.id
  into v_session_id
  from public.assessment_sessions as session
  where session.user_id = v_actor
    and session.assessment_version = 'insuccess-v1'
  for update;

  if v_session_id is not null then
    return v_session_id;
  end if;

  select count(*) into v_bank_count from private.assessment_baseline_bank;
  if v_bank_count <> 15 then
    raise exception using errcode = '22023', message = 'Baseline question bank must contain exactly 15 questions';
  end if;

  insert into public.assessment_sessions (user_id, assessment_version, status)
  values (v_actor, 'insuccess-v1', 'baseline')
  returning id into v_session_id;

  insert into public.assessment_questions (
    session_id, user_id, phase, position, question_key, prompt, help_text,
    response_type, required, options, response_config, dimension
  )
  select
    v_session_id,
    v_actor,
    'baseline',
    bank.position,
    bank.question_key,
    bank.prompt,
    bank.help_text,
    bank.response_type,
    true,
    bank.options,
    bank.response_config,
    bank.dimension
  from private.assessment_baseline_bank as bank
  order by bank.position;

  insert into public.member_onboarding_state (
    user_id, active_session_id, status, assessment_version,
    baseline_answered, tailored_answered, started_at, completed_at, updated_at
  )
  values (v_actor, v_session_id, 'baseline', 'insuccess-v1', 0, 0, now(), null, now())
  on conflict (user_id) do update
  set active_session_id = excluded.active_session_id,
      status = excluded.status,
      assessment_version = excluded.assessment_version,
      baseline_answered = excluded.baseline_answered,
      tailored_answered = excluded.tailored_answered,
      started_at = excluded.started_at,
      completed_at = null,
      updated_at = now();

  return v_session_id;
end;
$$;

create or replace function private.assessment_answer_is_valid(
  p_response_type text,
  p_options jsonb,
  p_config jsonb,
  p_answer_kind text,
  p_answer_value jsonb,
  p_skip_reason text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_number numeric;
  v_text text;
  v_min numeric;
  v_max numeric;
  v_count integer;
begin
  if p_answer_kind = 'skip' then
    return p_answer_value is null and p_skip_reason = 'not_sure';
  end if;

  if p_answer_kind <> 'answer' or p_answer_value is null or p_skip_reason is not null then
    return false;
  end if;

  if p_response_type in ('scale', 'number') then
    if jsonb_typeof(p_answer_value) <> 'number' then return false; end if;
    v_number := (p_answer_value #>> '{}')::numeric;
    v_min := coalesce((p_config ->> 'min')::numeric, -1000000000);
    v_max := coalesce((p_config ->> 'max')::numeric, 1000000000);
    if p_response_type = 'scale' and v_number <> trunc(v_number) then return false; end if;
    return v_number between v_min and v_max;
  end if;

  if p_response_type = 'single_choice' then
    if jsonb_typeof(p_answer_value) <> 'string' then return false; end if;
    v_text := p_answer_value #>> '{}';
    return exists (
      select 1
      from jsonb_array_elements(p_options) as option_row
      where option_row ->> 'value' = v_text
    );
  end if;

  if p_response_type = 'multi_choice' then
    if jsonb_typeof(p_answer_value) <> 'array' then return false; end if;
    v_count := jsonb_array_length(p_answer_value);
    if v_count < coalesce((p_config ->> 'minSelections')::integer, 1)
       or v_count > coalesce((p_config ->> 'maxSelections')::integer, 100) then
      return false;
    end if;
    return not exists (
      select 1
      from jsonb_array_elements_text(p_answer_value) as selected(value)
      where not exists (
        select 1
        from jsonb_array_elements(p_options) as option_row
        where option_row ->> 'value' = selected.value
      )
    );
  end if;

  if p_response_type in ('short_text', 'long_text') then
    if jsonb_typeof(p_answer_value) <> 'string' then return false; end if;
    v_text := btrim(p_answer_value #>> '{}');
    return char_length(v_text) between 1 and coalesce((p_config ->> 'maxLength')::integer, 2000);
  end if;

  return false;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return false;
end;
$$;

create or replace function private.save_onboarding_answer(
  p_session_id uuid,
  p_question_id bigint,
  p_client_answer_id uuid,
  p_answer_kind text,
  p_answer_value jsonb,
  p_skip_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_assessment_actor();
  v_status text;
  v_expected_question_id bigint;
  v_baseline_answered integer;
  v_tailored_answered integer;
  v_tailored_questions integer;
  v_next_status text;
  v_question public.assessment_questions%rowtype;
  v_existing public.assessment_answers%rowtype;
begin
  select session.status
  into v_status
  from public.assessment_sessions as session
  where session.id = p_session_id
    and session.user_id = v_actor
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Assessment session not found';
  end if;

  select answer.*
  into v_existing
  from public.assessment_answers as answer
  where answer.user_id = v_actor
    and answer.client_answer_id = p_client_answer_id;

  if found then
    if v_existing.session_id = p_session_id
       and v_existing.question_id = p_question_id
       and v_existing.answer_kind = p_answer_kind
       and v_existing.answer_value is not distinct from p_answer_value
       and v_existing.skip_reason is not distinct from p_skip_reason then
      return;
    end if;
    raise exception using errcode = '22023', message = 'clientAnswerId was already used for a different answer';
  end if;

  if v_status not in ('baseline', 'tailored') then
    raise exception using errcode = '22023', message = 'Assessment is not accepting answers in its current state';
  end if;

  select question.id
  into v_expected_question_id
  from public.assessment_questions as question
  where question.session_id = p_session_id
    and question.user_id = v_actor
    and not exists (
      select 1
      from public.assessment_answers as answer
      where answer.session_id = question.session_id
        and answer.question_id = question.id
    )
  order by case question.phase when 'baseline' then 0 else 1 end, question.position
  limit 1;

  if v_expected_question_id is null or v_expected_question_id <> p_question_id then
    raise exception using errcode = '22023', message = 'Answer must target the current server-authoritative question';
  end if;

  select question.*
  into v_question
  from public.assessment_questions as question
  where question.id = p_question_id
    and question.session_id = p_session_id
    and question.user_id = v_actor;

  if not private.assessment_answer_is_valid(
    v_question.response_type,
    v_question.options,
    v_question.response_config,
    p_answer_kind,
    p_answer_value,
    p_skip_reason
  ) then
    raise exception using errcode = '22023', message = 'Answer does not match the question response contract';
  end if;

  insert into public.assessment_answers (
    session_id, question_id, user_id, client_answer_id,
    answer_kind, answer_value, skip_reason
  )
  values (
    p_session_id, p_question_id, v_actor, p_client_answer_id,
    p_answer_kind, p_answer_value, p_skip_reason
  );

  select
    count(*) filter (where question.phase = 'baseline'),
    count(*) filter (where question.phase = 'tailored')
  into v_baseline_answered, v_tailored_answered
  from public.assessment_answers as answer
  join public.assessment_questions as question on question.id = answer.question_id
  where answer.session_id = p_session_id
    and answer.user_id = v_actor;

  select count(*)
  into v_tailored_questions
  from public.assessment_questions
  where session_id = p_session_id
    and user_id = v_actor
    and phase = 'tailored';

  v_next_status := case
    when v_baseline_answered < 15 then 'baseline'
    when v_tailored_questions < 100 then 'analysis'
    when v_tailored_answered < 100 then 'tailored'
    else 'ready_to_complete'
  end;

  update public.assessment_sessions
  set status = v_next_status,
      baseline_answered = v_baseline_answered,
      tailored_answered = v_tailored_answered,
      last_activity_at = now()
  where id = p_session_id
    and user_id = v_actor;

  update public.member_onboarding_state
  set status = v_next_status,
      baseline_answered = v_baseline_answered,
      tailored_answered = v_tailored_answered,
      updated_at = now()
  where user_id = v_actor
    and active_session_id = p_session_id;
end;
$$;

create or replace function private.snapshot_onboarding_tailored_questions(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_assessment_actor();
  v_status text;
  v_baseline_answered integer;
  v_tailored_answered integer;
  v_tailored_questions integer;
  v_bank_count integer;
  v_dimension_averages jsonb;
  v_primary_goal text;
  v_current_stage text;
  v_weekly_time text;
  v_primary_channel text;
  v_biggest_obstacle text;
begin
  select session.status, session.baseline_answered, session.tailored_answered
  into v_status, v_baseline_answered, v_tailored_answered
  from public.assessment_sessions as session
  where session.id = p_session_id
    and session.user_id = v_actor
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Assessment session not found';
  end if;

  select count(*) into v_tailored_questions
  from public.assessment_questions
  where session_id = p_session_id
    and user_id = v_actor
    and phase = 'tailored';

  if v_tailored_questions = 100 then
    return;
  end if;

  if v_tailored_questions <> 0 then
    raise exception using errcode = '22023', message = 'Tailored question snapshot is incomplete';
  end if;

  if v_status <> 'analysis' or v_baseline_answered <> 15 then
    raise exception using errcode = '22023', message = 'All 15 baseline responses are required before tailored questions';
  end if;

  select count(*) into v_bank_count from private.assessment_deep_bank;
  if v_bank_count <> 300 then
    raise exception using errcode = '22023', message = 'Tailored branch bank must contain exactly 300 questions';
  end if;

  select
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-primary-goal'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-current-stage'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-weekly-time'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-primary-channel'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-biggest-obstacle')
  into v_primary_goal, v_current_stage, v_weekly_time, v_primary_channel, v_biggest_obstacle
  from public.assessment_answers as answer
  join public.assessment_questions as question on question.id = answer.question_id
  where answer.session_id = p_session_id
    and answer.user_id = v_actor
    and answer.answer_kind = 'answer';

  select jsonb_object_agg(scored.dimension, scored.average_score order by scored.dimension)
  into v_dimension_averages
  from (
    select
      question.dimension,
      round(coalesce(avg(
        case
          when answer.answer_kind = 'answer'
            then private.assessment_numeric_value(answer.answer_value, question.options)
          else null
        end
      ), 3), 2) as average_score
    from public.assessment_questions as question
    left join public.assessment_answers as answer
      on answer.question_id = question.id
      and answer.session_id = question.session_id
    where question.session_id = p_session_id
      and question.user_id = v_actor
      and question.phase = 'baseline'
    group by question.dimension
  ) as scored;

  with ranked as (
    select
      bank.question_key,
      bank.dimension,
      bank.branch,
      bank.local_position,
      bank.prompt,
      coalesce((v_dimension_averages ->> bank.dimension)::numeric, 3) as baseline_score,
      row_number() over (
        order by coalesce((v_dimension_averages ->> bank.dimension)::numeric, 3), bank.dimension, bank.local_position
      )::smallint as adaptive_position
    from private.assessment_deep_bank as bank
    where bank.branch = case
      when coalesce((v_dimension_averages ->> bank.dimension)::numeric, 3) < 3 then 'growth'
      when coalesce((v_dimension_averages ->> bank.dimension)::numeric, 3) >= 4 then 'strength'
      else 'balanced'
    end
  )
  insert into public.assessment_questions (
    session_id, user_id, phase, position, question_key, prompt, help_text,
    response_type, required, options, response_config, personalization_context, dimension
  )
  select
    p_session_id,
    v_actor,
    'tailored',
    ranked.adaptive_position,
    ranked.question_key,
    case
      when ranked.baseline_score < 3 then 'Одоо хөгжүүлэх талбар · ' || ranked.prompt
      when ranked.baseline_score >= 4 then 'Давуу талаа системжүүлэх · ' || ranked.prompt
      else 'Тогтвортой болгох · ' || ranked.prompt
    end,
    case
      when ranked.local_position in (4, 8) then 'Энэ өгүүлбэр танд хэр тохирохыг сонгоно уу.'
      else 'Таны эхний 15 хариултад үндэслэн эрэмбэлсэн асуулт.'
    end,
    case when ranked.local_position in (4, 8) then 'single_choice' else 'scale' end,
    true,
    case
      when ranked.local_position in (4, 8) then jsonb_build_array(
        jsonb_build_object('value', 'not_true_yet', 'label', 'Одоогоор надад тохирохгүй', 'score', 1),
        jsonb_build_object('value', 'partly_true', 'label', 'Зарим талаар тохирно', 'score', 3),
        jsonb_build_object('value', 'clearly_true', 'label', 'Надад тодорхой тохирно', 'score', 5)
      )
      else '[]'::jsonb
    end,
    case
      when ranked.local_position in (4, 8) then '{}'::jsonb
      else jsonb_build_object(
        'min', 1,
        'max', 5,
        'minLabel', 'Огт тохирохгүй',
        'maxLabel', 'Бүрэн тохирно'
      )
    end,
    jsonb_build_object(
      'algorithmVersion', 'adaptive-branch-v2',
      'branch', ranked.branch,
      'baselineDimensionScore', ranked.baseline_score,
      'primaryGoal', v_primary_goal,
      'currentStage', v_current_stage,
      'weeklyTime', v_weekly_time,
      'primaryChannel', v_primary_channel,
      'biggestObstacle', v_biggest_obstacle
    ),
    ranked.dimension
  from ranked
  order by ranked.adaptive_position;

  update public.assessment_sessions
  set status = case when v_tailored_answered = 100 then 'ready_to_complete' else 'tailored' end,
      adaptation_context = jsonb_build_object(
        'algorithmVersion', 'adaptive-branch-v2',
        'baselineDimensionAverages', v_dimension_averages,
        'primaryGoal', v_primary_goal,
        'currentStage', v_current_stage,
        'weeklyTime', v_weekly_time,
        'primaryChannel', v_primary_channel,
        'biggestObstacle', v_biggest_obstacle
      ),
      last_activity_at = now()
  where id = p_session_id
    and user_id = v_actor;

  update public.member_onboarding_state
  set status = case when v_tailored_answered = 100 then 'ready_to_complete' else 'tailored' end,
      updated_at = now()
  where user_id = v_actor
    and active_session_id = p_session_id;
end;
$$;

create or replace function private.complete_onboarding_assessment(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_assessment_actor();
  v_status text;
  v_baseline_questions integer;
  v_tailored_questions integer;
  v_baseline_answers integer;
  v_tailored_answers integer;
  v_non_skip_answers integer;
  v_leadership_evidence integer;
  v_consistency_evidence integer;
  v_compliance_evidence integer;
  v_scores jsonb;
  v_evidence_counts jsonb;
  v_primary_dimension text;
  v_secondary_dimension text;
  v_primary_style text;
  v_secondary_style text;
  v_strengths jsonb;
  v_growth_edges jsonb;
  v_motivation_pattern text;
  v_communication_style text;
  v_work_rhythm text;
  v_confidence_note text;
  v_primary_goal text;
  v_current_stage text;
  v_weekly_time text;
  v_primary_channel text;
  v_biggest_obstacle text;
  v_goal_label text;
  v_channel_label text;
  v_obstacle_label text;
  v_daily_minutes integer;
  v_board_appropriate boolean;
  v_methodology_note text := 'Энэ profile нь хэрэглэгчийн өөрийн 115 хариултад суурилсан хөгжлийн чиглүүлэгч бөгөөд сэтгэлзүйн онош, орлого, цолны таамаглал биш.';
  v_rank_disclaimer text := 'Энэ маршрут нь Board Director цол, орлого эсвэл тодорхой хугацаанд үр дүн гарна гэж амлахгүй. Бодит үр дүн нь хүний үйлдэл, багийн нөхцөл болон inCruises-ийн тухайн үеийн албан шаардлагаас хамаарна.';
begin
  select session.status
  into v_status
  from public.assessment_sessions as session
  where session.id = p_session_id
    and session.user_id = v_actor
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Assessment session not found';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  select
    count(*) filter (where question.phase = 'baseline'),
    count(*) filter (where question.phase = 'tailored')
  into v_baseline_questions, v_tailored_questions
  from public.assessment_questions as question
  where question.session_id = p_session_id
    and question.user_id = v_actor;

  select
    count(*) filter (where question.phase = 'baseline'),
    count(*) filter (where question.phase = 'tailored'),
    count(*) filter (where answer.answer_kind = 'answer'),
    count(*) filter (where answer.answer_kind = 'answer' and question.dimension = 'leadership'),
    count(*) filter (where answer.answer_kind = 'answer' and question.dimension = 'consistency'),
    count(*) filter (where answer.answer_kind = 'answer' and question.dimension = 'compliance')
  into v_baseline_answers, v_tailored_answers, v_non_skip_answers,
       v_leadership_evidence, v_consistency_evidence, v_compliance_evidence
  from public.assessment_answers as answer
  join public.assessment_questions as question on question.id = answer.question_id
  where answer.session_id = p_session_id
    and answer.user_id = v_actor;

  if v_status <> 'ready_to_complete'
     or v_baseline_questions <> 15
     or v_tailored_questions <> 100
     or v_baseline_answers <> 15
     or v_tailored_answers <> 100 then
    raise exception using errcode = '22023', message = 'Exactly 15 baseline and 100 tailored responses are required';
  end if;

  select
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-primary-goal'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-current-stage'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-weekly-time'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-primary-channel'),
    max(answer.answer_value #>> '{}') filter (where question.question_key = 'baseline-biggest-obstacle')
  into v_primary_goal, v_current_stage, v_weekly_time, v_primary_channel, v_biggest_obstacle
  from public.assessment_answers as answer
  join public.assessment_questions as question on question.id = answer.question_id
  where answer.session_id = p_session_id
    and answer.user_id = v_actor
    and answer.answer_kind = 'answer';

  select
    jsonb_object_agg(scored.dimension, scored.score order by scored.dimension),
    jsonb_object_agg(scored.dimension, scored.evidence_count order by scored.dimension)
  into v_scores, v_evidence_counts
  from (
    select
      question.dimension,
      round(coalesce(avg(
        case
          when answer.answer_kind = 'answer'
            then private.assessment_numeric_value(answer.answer_value, question.options)
          else null
        end
      ), 0) * 20)::integer as score,
      count(
        case
          when answer.answer_kind = 'answer'
            then private.assessment_numeric_value(answer.answer_value, question.options)
          else null
        end
      )::integer as evidence_count
    from public.assessment_questions as question
    join public.assessment_answers as answer on answer.question_id = question.id
    where question.session_id = p_session_id
      and question.user_id = v_actor
    group by question.dimension
  ) as scored;

  select dimension.key
  into v_primary_dimension
  from jsonb_each_text(v_scores) as dimension(key, value)
  where coalesce((v_evidence_counts ->> dimension.key)::integer, 0) >= 6
  order by dimension.value::integer desc, dimension.key
  limit 1;

  select dimension.key
  into v_secondary_dimension
  from jsonb_each_text(v_scores) as dimension(key, value)
  where dimension.key <> v_primary_dimension
    and coalesce((v_evidence_counts ->> dimension.key)::integer, 0) >= 6
  order by dimension.value::integer desc, dimension.key
  limit 1;

  v_primary_style := case
    when v_primary_dimension is null then 'Нэмэлт мэдээлэл шаардлагатай'
    else private.assessment_style_label(v_primary_dimension)
  end;
  v_secondary_style := case
    when v_secondary_dimension is null then null
    else private.assessment_style_label(v_secondary_dimension)
  end;

  select coalesce(jsonb_agg(
    private.assessment_style_label(ranked.key)
    order by ranked.score desc, ranked.key
  ), '[]'::jsonb)
  into v_strengths
  from (
    select dimension.key, dimension.value::integer as score
    from jsonb_each_text(v_scores) as dimension(key, value)
    where coalesce((v_evidence_counts ->> dimension.key)::integer, 0) >= 6
    order by dimension.value::integer desc, dimension.key
    limit 3
  ) as ranked;

  select coalesce(jsonb_agg(
    private.assessment_style_label(ranked.key)
    order by ranked.score, ranked.key
  ), '[]'::jsonb)
  into v_growth_edges
  from (
    select dimension.key, dimension.value::integer as score
    from jsonb_each_text(v_scores) as dimension(key, value)
    where dimension.value::integer < 60
      and coalesce((v_evidence_counts ->> dimension.key)::integer, 0) >= 6
    order by dimension.value::integer, dimension.key
    limit 3
  ) as ranked;

  v_motivation_pattern := case
    when v_primary_dimension is null then 'Хөдөлгөх хэв маяг дүгнэхэд нэг чиглэлд дор хаяж 6 үнэлэгдэх хариулт шаардлагатай.'
    when v_primary_dimension = 'direction' then 'Тодорхой зорилго, хэмжигдэхүйц ахиц хамгийн сайн хөдөлгөдөг.'
    when v_primary_dimension = 'relationships' then 'Хүний бодит хэрэгцээ, итгэлцэл дээр төвлөрөхөд эрч хүч нэмэгддэг.'
    when v_primary_dimension = 'content' then 'Түүх, санаагаа бүтээл болгон хуваалцах үед идэвх өсдөг.'
    when v_primary_dimension = 'leadership' then 'Бусдын өсөлтийг дэмжих хариуцлага авснаар идэвхждэг.'
    else 'Жижиг, давтагдах үйлдэл болон харагдах ахицад хамгийн сайн хариу үзүүлдэг.'
  end;

  v_communication_style := case
    when coalesce((v_evidence_counts ->> 'communication')::integer, 0) < 6 then 'Харилцааны хэв маяг дүгнэхэд дор хаяж 6 үнэлэгдэх хариулт шаардлагатай.'
    when coalesce((v_scores ->> 'communication')::integer, 60) >= 80 then 'Шууд бөгөөд итгэл төрүүлэх харилцаа; сонсох асуултаа үргэлж хадгал.'
    when coalesce((v_scores ->> 'communication')::integer, 60) >= 60 then 'Тайван, ойлгомжтой харилцаа; ярианы дараагийн алхмыг илүү тодорхой болго.'
    else 'Бэлтгэсэн асуулт, богино ярианы загвараар итгэлээ үе шаттай өсгө.'
  end;

  v_work_rhythm := case
    when coalesce((v_evidence_counts ->> 'consistency')::integer, 0) < 6
      or coalesce((v_evidence_counts ->> 'planning')::integer, 0) < 6
      then 'Ажлын хэмнэл дүгнэхэд тогтвортой байдал ба төлөвлөлтийн чиглэл бүрт дор хаяж 6 үнэлэгдэх хариулт шаардлагатай.'
    when (
      coalesce((v_scores ->> 'consistency')::integer, 60)
      + coalesce((v_scores ->> 'planning')::integer, 60)
    ) / 2 >= 80 then 'Өндөр тогтвортой хэмнэл; долоо хоног бүр хэмжиж, багтаа давтагдах систем болго.'
    when (
      coalesce((v_scores ->> 'consistency')::integer, 60)
      + coalesce((v_scores ->> 'planning')::integer, 60)
    ) / 2 >= 60 then 'Дунд зэргийн тогтвортой хэмнэл; өдөр бүрийн гурван чухал үйлдлийг хамгаал.'
    else 'Бага ачаалалтай эхлэл; 15 минутын тогтмол блок, нэг үзүүлэлтээр хэмнэлээ байгуул.'
  end;

  v_confidence_note := format(
    '115 асуултаас %s-д утгатай хариулт өгсөн. %s “мэдэхгүй” сонголт score-д ороогүй. Үр дүн нь self-report тул бодит үйлдлийн өгөгдлөөр тогтмол шинэчилнэ.',
    v_non_skip_answers,
    115 - v_non_skip_answers
  );

  v_goal_label := case v_primary_goal
    when 'learn_basics' then 'Сууриа зөв сурах'
    when 'build_consistency' then 'Тогтмол үйлдлийн хэмнэлтэй болох'
    when 'content_social' then 'Контент ба сошиал харилцаагаа хөгжүүлэх'
    when 'team_leadership' then 'Баг хөгжүүлэх'
    when 'board_director' then 'Board Director зорилгын хөгжлийн зам'
    else 'Хувийн дараагийн зорилгоо тодруулах'
  end;
  v_channel_label := case v_primary_channel
    when 'facebook' then 'Facebook'
    when 'instagram' then 'Instagram'
    when 'short_video' then 'Богино видео'
    when 'messaging' then 'Messenger / чат'
    when 'in_person' then 'Биечлэн уулзах'
    else 'өөрт тухтай нэг суваг'
  end;
  v_obstacle_label := case v_biggest_obstacle
    when 'time' then 'цаг гаргах'
    when 'confidence' then 'өөртөө итгэх итгэл'
    when 'consistency' then 'тогтмол байдал'
    when 'content_ideas' then 'контентын санаа'
    when 'follow_up' then 'follow-up ба харилцаа'
    when 'knowledge' then 'мэдлэг, мэдээлэл'
    else 'одоогийн гол саад'
  end;
  v_daily_minutes := case v_weekly_time
    when 'under_2h' then 10
    when '2_5h' then 20
    when '5_10h' then 40
    when 'over_10h' then 60
    else 15
  end;
  v_board_appropriate := (
    v_primary_goal = 'board_director'
    and v_current_stage in ('team_lead', 'experienced_leader')
    and v_non_skip_answers >= 92
    and v_leadership_evidence >= 8
    and v_consistency_evidence >= 8
    and v_compliance_evidence >= 8
    and coalesce((v_scores ->> 'leadership')::integer, 0) >= 60
    and coalesce((v_scores ->> 'consistency')::integer, 0) >= 60
    and coalesce((v_scores ->> 'compliance')::integer, 0) >= 60
  );

  if v_non_skip_answers < 30 then
    v_primary_style := 'Нэмэлт мэдээлэл шаардлагатай';
    v_secondary_style := null;
    v_strengths := '[]'::jsonb;
    v_growth_edges := '[]'::jsonb;
    v_motivation_pattern := 'Хариултын нотолгоо бага тул одоогоор тогтвортой motivation pattern дүгнэхгүй.';
    v_communication_style := 'Хариултын нотолгоо бага тул одоогоор харилцааны хэв маяг дүгнэхгүй.';
    v_work_rhythm := 'Хариултын нотолгоо бага тул эхлээд өдөр бүрийн нэг жижиг үйлдлээ тэмдэглэнэ.';
  end if;

  insert into public.success_profiles (
    user_id, session_id, profile_version, primary_style, secondary_style,
    dimension_scores, dimension_evidence_counts, strengths, growth_edges, motivation_pattern,
    communication_style, work_rhythm, confidence_note, methodology_note,
    generated_at, updated_at
  )
  values (
    v_actor, p_session_id, 'success-profile-v1', v_primary_style, v_secondary_style,
    v_scores, v_evidence_counts, v_strengths, v_growth_edges, v_motivation_pattern,
    v_communication_style, v_work_rhythm, v_confidence_note, v_methodology_note,
    now(), now()
  )
  on conflict (user_id) do update
  set session_id = excluded.session_id,
      profile_version = excluded.profile_version,
      primary_style = excluded.primary_style,
      secondary_style = excluded.secondary_style,
      dimension_scores = excluded.dimension_scores,
      dimension_evidence_counts = excluded.dimension_evidence_counts,
      strengths = excluded.strengths,
      growth_edges = excluded.growth_edges,
      motivation_pattern = excluded.motivation_pattern,
      communication_style = excluded.communication_style,
      work_rhythm = excluded.work_rhythm,
      confidence_note = excluded.confidence_note,
      methodology_note = excluded.methodology_note,
      generated_at = excluded.generated_at,
      updated_at = now();

  insert into public.success_guides (
    user_id, session_id, guide_version, board_director_route,
    content_strategy, social_cadence, relationship_guide, weekly_plan, growth_plan,
    compliance_guardrails, rank_disclaimer, generated_at, updated_at
  )
  values (
    v_actor,
    p_session_id,
    'success-guide-v1',
    case when v_board_appropriate then
      jsonb_build_object(
        'title', 'Board Director хөгжлийн маршрут',
        'promise', false,
        'appropriate', true,
        'reason', 'Таны сонгосон зорилго, одоогийн багийн туршлага, leadership, consistency, compliance-ийн хангалттай self-report нотолгоонд суурилсан боломжит хөгжлийн зам; албан rank eligibility биш.',
        'current_stage', v_current_stage,
        'target', 'Board Director зорилгын хөгжлийн зам',
        'primaryStyle', v_primary_style,
        'gaps', v_growth_edges,
        'day_30', jsonb_build_array(
          'Өдөр бүрийн гол үйлдлээ тэмдэглэж, долоо хоног бүр бодит үр дүнгээр дүгнэх.',
          'Харилцаа, follow-up, контентын нэг тогтмол хэмнэлийг багтаа турших.',
          'Албан эх сурвалж ашигласан контент бүрээ Content Studio хяналтаар оруулах.'
        ),
        'day_60', jsonb_build_array(
          'Тогтсон хэмнэлийн саадыг дүгнэж, checklist-ээ хялбарчлах.',
          'Нэг багийн гишүүнд хэмнэлийг өөрөө давтаж сурахад нь туслах.'
        ),
        'day_90', jsonb_build_array(
          'Өөрт ажилласан хэмнэлийг багийн давтагдах checklist болгох.',
          'Гишүүн бүрийн дараагийн алхмыг хэмжигдэхүйц байдлаар дэмжих.',
          'Profile score бус бодит үйлдэл, сургалтын ахицаар маршрутаа шинэчлэх.'
        )
      )
    else
      jsonb_build_object(
        'title', 'Board Director хөгжлийн маршрут',
        'promise', false,
        'appropriate', false,
        'reason', case
          when v_primary_goal is distinct from 'board_director' then 'Та энэ зорилгыг одоогийн үндсэн чиглэлээр сонгоогүй тул тусгай Board Director маршрут нээгээгүй.'
          when v_non_skip_answers < 92 then 'Хариултын нотолгоо хангалтгүй тул Board Director хөгжлийн маршрут санал болгохгүй.'
          else 'Одоогоор суурь дадал, багийн туршлага, leadership, consistency эсвэл compliance-ийн аль нэгийг эхэлж хөгжүүлэх шаардлагатай.'
        end,
        'disclaimer', v_rank_disclaimer
      )
    end,
    jsonb_build_object(
      'goal', v_goal_label,
      'primaryPillars', case v_primary_goal
        when 'learn_basics' then jsonb_build_array('Сурсан нэг ойлголт', 'Асуулт ба хариулт', 'Бодит жижиг туршилт')
        when 'content_social' then jsonb_build_array('Хувийн сургамж', 'Хэрэгтэй асуулт', 'Хянагдсан FAQ', 'Бодит үйл явц')
        when 'team_leadership' then jsonb_build_array('Багийн өсөлт', 'Давтагдах дадал', 'Coaching асуулт', 'Бодит дүгнэлт')
        when 'board_director' then jsonb_build_array('Leadership сургамж', 'Багийн систем', 'Хүний өсөлт', 'Хариуцлагатай харилцаа')
        else jsonb_build_array('Өдөр тутмын ахиц', 'Сургамж', 'Асуулт ба хариулт')
      end,
      'pillars', case v_primary_goal
        when 'content_social' then jsonb_build_array('Хувийн сургамж', 'Хэрэгтэй асуулт', 'Хянагдсан FAQ', 'Бодит үйл явц')
        when 'team_leadership' then jsonb_build_array('Багийн өсөлт', 'Давтагдах дадал', 'Coaching асуулт')
        else jsonb_build_array('Өдөр тутмын ахиц', 'Сургамж', 'Асуулт ба хариулт')
      end,
      'personalizationBasis', v_strengths,
      'currentObstacle', v_obstacle_label,
      'rule', 'Хувийн түүхийг баримтаас ялгаж, бүтээгдэхүүн эсвэл орлогын claim бүрт албан эх сурвалж хэрэглэнэ.'
    ),
    jsonb_build_object(
      'channels', jsonb_build_array(v_channel_label),
      'formats', case v_primary_channel
        when 'short_video' then jsonb_build_array('30–60 секундийн сургамж', 'Нэг асуулт', 'Хянагдсан FAQ видео')
        when 'messaging' then jsonb_build_array('Зөвшөөрөлтэй нэг нэгийн яриа', 'Follow-up асуулт', 'Хянагдсан богино тайлбар')
        when 'in_person' then jsonb_build_array('Биечлэн сонсох асуулт', 'Уулзалтын дараах тэмдэглэл', 'Зөвшөөрөлтэй follow-up')
        else jsonb_build_array('Сургамжийн пост', 'Нээлттэй асуулт', 'Хянагдсан FAQ')
      end,
      'recommendedFrequency', case v_weekly_time
        when 'under_2h' then '7 хоногт 1 чанартай нийтлэл эсвэл яриа'
        when '2_5h' then '7 хоногт 2 чанартай нийтлэл эсвэл яриа'
        when '5_10h' then '7 хоногт 3 чанартай нийтлэл эсвэл яриа'
        when 'over_10h' then '7 хоногт 3–4 чанартай нийтлэл эсвэл яриа'
        else '7 хоногт 1 чанартай нийтлэл эсвэл яриа'
      end,
      'weeklyCadence', jsonb_build_array(
        jsonb_build_object('day', 'Эхний блок', 'focus', v_channel_label || ' дээр ' || v_goal_label || ' зорилготой нэг хэрэгтэй санаа'),
        jsonb_build_object('day', 'Дараагийн блок', 'focus', 'Хүний хэрэгцээг сонсох нэг асуулт'),
        jsonb_build_object('day', 'Review', 'focus', v_obstacle_label || ' саадыг дүгнэж, дараагийн жижиг алхмыг сонгох')
      ),
      'engagementRule', 'Сэтгэгдэл, мессеж бүрт яаравчлахгүйгээр сонсож, зөвхөн тохирсон дараагийн алхам санал болгоно.'
    ),
    jsonb_build_object(
      'preferredChannel', v_channel_label,
      'conversationStart', 'Нээлттэй асуултаар хэрэгцээг сонсоно; өөрийн зорилгыг тулгахгүй.',
      'followUp', 'Өмнөх ярианы бодит контекст, зөвшөөрсөн хугацааг ' || v_channel_label || ' сувгийн хэв маягт тохируулна.',
      'boundary', 'Дарамт, айдас, баталгаагүй амлалт ашиглахгүй.'
    ),
    jsonb_build_object(
      'Даваа', jsonb_build_object('title', v_goal_label, 'action', v_daily_minutes || ' минутын нэг гол үйлдэл болон нэг хэмжүүрээ сонго.'),
      'Мягмар', jsonb_build_object('title', 'Харилцаа', 'action', v_channel_label || ' сувгаар нэг чанартай яриа эхлүүлж, хэрэгцээг нь сонс.'),
      'Лхагва', jsonb_build_object('title', 'Гол саад', 'action', v_obstacle_label || ' саадыг багасгах нэг жижиг өөрчлөлт хий.'),
      'Пүрэв', jsonb_build_object('title', 'Суралцах', 'action', 'Academy-ийн нэг ойлголтыг ' || v_daily_minutes || ' минут бодит үйлдлээр турш.'),
      'Баасан', jsonb_build_object('title', 'Контент', 'action', v_channel_label || ' сувгийн нэг ноорог бэлдэж, нийтлэхээс өмнө хянуул.'),
      'Бямба', jsonb_build_object('title', 'Давтах', 'action', 'Энэ долоо хоногт ажилласан нэг үйлдлийг дахин хий.'),
      'Ням', jsonb_build_object('title', 'Дүгнэлт', 'action', 'Бодит ахицаа дүгнэж, дараагийн долоо хоногийн ачааллыг тохируул.')
    ),
    jsonb_build_object(
      'day_30', jsonb_build_array(
        v_goal_label || ' зорилгод өдөр бүр ' || v_daily_minutes || ' минутын хэмнэл тогтоох.',
        v_obstacle_label || ' саадыг багасгах нэг давтагдах арга сонгох.',
        v_channel_label || ' сувгийн долоо хоногийн хэмжүүрээ тэмдэглэх.'
      ),
      'day_60', jsonb_build_array(
        'Ажилласан хэмнэлээ бодит үр дүнгээр засаж хялбарчлах.',
        'Харилцаа, суралцах, контентын нэг процессыг checklist болгох.'
      ),
      'day_90', jsonb_build_array(
        v_goal_label || ' зорилгын бодит ахицыг 90 хоногийн эхлэлтэй харьцуулах.',
        'Дараагийн 90 хоногийн нэг зорилго, нэг хэмжүүр, нэг дэмжлэгээ сонгох.'
      )
    ),
    jsonb_build_object(
      'rules', jsonb_build_array(
        'Орлого, цол, аяллын үр дүн амлахгүй.',
        'Үнэ, бодлого, урамшууллын claim бүрийг хүчинтэй албан эх сурвалжаар шалгана.',
        'Нийтлэх контентыг тусдаа reviewer болон шаардлагатай approval reference-ээр хянуулна.',
        'Assessment-ийн хувийн хариултыг контентод шууд нийтлэхгүй.'
      ),
      'contentWorkflow', 'draft → internal review → corporate approval reference'
    ),
    v_rank_disclaimer,
    now(),
    now()
  )
  on conflict (user_id) do update
  set session_id = excluded.session_id,
      guide_version = excluded.guide_version,
      board_director_route = excluded.board_director_route,
      content_strategy = excluded.content_strategy,
      social_cadence = excluded.social_cadence,
      relationship_guide = excluded.relationship_guide,
      weekly_plan = excluded.weekly_plan,
      growth_plan = excluded.growth_plan,
      compliance_guardrails = excluded.compliance_guardrails,
      rank_disclaimer = excluded.rank_disclaimer,
      generated_at = excluded.generated_at,
      updated_at = now();

  update public.assessment_sessions
  set status = 'completed',
      baseline_answered = 15,
      tailored_answered = 100,
      completed_at = now(),
      last_activity_at = now()
  where id = p_session_id
    and user_id = v_actor;

  update public.member_onboarding_state
  set status = 'completed',
      baseline_answered = 15,
      tailored_answered = 100,
      completed_at = now(),
      updated_at = now()
  where user_id = v_actor
    and active_session_id = p_session_id;
end;
$$;

create or replace function public.begin_onboarding_assessment()
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.begin_onboarding_assessment();
$$;

create or replace function public.save_onboarding_answer(
  p_session_id uuid,
  p_question_id bigint,
  p_client_answer_id uuid,
  p_answer_kind text,
  p_answer_value jsonb,
  p_skip_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.save_onboarding_answer(
    p_session_id,
    p_question_id,
    p_client_answer_id,
    p_answer_kind,
    p_answer_value,
    p_skip_reason
  );
$$;

create or replace function public.snapshot_onboarding_tailored_questions(p_session_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.snapshot_onboarding_tailored_questions(p_session_id);
$$;

create or replace function public.complete_onboarding_assessment(p_session_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_onboarding_assessment(p_session_id);
$$;

revoke execute on function private.current_assessment_actor() from public, anon, authenticated;
revoke execute on function private.assessment_numeric_value(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function private.assessment_style_label(text) from public, anon, authenticated;
revoke execute on function private.begin_onboarding_assessment() from public, anon, authenticated;
revoke execute on function private.assessment_answer_is_valid(text, jsonb, jsonb, text, jsonb, text) from public, anon, authenticated;
revoke execute on function private.save_onboarding_answer(uuid, bigint, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function private.snapshot_onboarding_tailored_questions(uuid) from public, anon, authenticated;
revoke execute on function private.complete_onboarding_assessment(uuid) from public, anon, authenticated;
revoke execute on function public.begin_onboarding_assessment() from public, anon, authenticated;
revoke execute on function public.save_onboarding_answer(uuid, bigint, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.snapshot_onboarding_tailored_questions(uuid) from public, anon, authenticated;
revoke execute on function public.complete_onboarding_assessment(uuid) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_assessment_actor() to authenticated;
grant execute on function private.begin_onboarding_assessment() to authenticated;
grant execute on function private.save_onboarding_answer(uuid, bigint, uuid, text, jsonb, text) to authenticated;
grant execute on function private.snapshot_onboarding_tailored_questions(uuid) to authenticated;
grant execute on function private.complete_onboarding_assessment(uuid) to authenticated;
grant execute on function public.begin_onboarding_assessment() to authenticated;
grant execute on function public.save_onboarding_answer(uuid, bigint, uuid, text, jsonb, text) to authenticated;
grant execute on function public.snapshot_onboarding_tailored_questions(uuid) to authenticated;
grant execute on function public.complete_onboarding_assessment(uuid) to authenticated;

commit;
