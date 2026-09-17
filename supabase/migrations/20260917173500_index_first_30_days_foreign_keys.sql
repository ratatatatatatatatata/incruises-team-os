begin;

create index if not exists coach_notes_support_request_member_idx
  on public.coach_notes (support_request_id, member_user_id)
  where support_request_id is not null;

create index if not exists member_action_events_actor_idx
  on public.member_action_events (actor_user_id)
  where actor_user_id is not null;

create index if not exists support_request_events_actor_idx
  on public.support_request_events (actor_user_id)
  where actor_user_id is not null;

create index if not exists support_requests_checkin_idx
  on public.support_requests (checkin_id)
  where checkin_id is not null;

commit;
