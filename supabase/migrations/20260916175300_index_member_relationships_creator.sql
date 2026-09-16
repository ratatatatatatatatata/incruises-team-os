begin;

create index if not exists member_relationships_created_by_idx
  on public.member_relationships (created_by)
  where created_by is not null;

commit;
