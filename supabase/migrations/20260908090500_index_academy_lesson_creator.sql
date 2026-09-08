begin;

create index if not exists academy_lessons_created_by_idx
  on public.academy_lessons(created_by);

commit;
