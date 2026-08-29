begin;

drop policy if exists "content_drafts_transition_compatibility" on public.content_drafts;
revoke update on table public.content_drafts from authenticated;

commit;
