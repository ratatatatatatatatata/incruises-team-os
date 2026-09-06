begin;

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'processing', 'cancelled', 'completed')),
  requested_at timestamptz not null default now(),
  cancelled_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint account_deletion_request_timestamps_check check (
    (status = 'requested' and cancelled_at is null and completed_at is null)
    or (status = 'processing' and cancelled_at is null and completed_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create index if not exists idx_account_deletion_requests_status_requested
  on public.account_deletion_requests(status, requested_at)
  where status in ('requested', 'processing');

alter table public.account_deletion_requests enable row level security;

create policy "account_deletion_requests_select_own"
on public.account_deletion_requests for select to authenticated
using (
  (select auth.uid()) is not null
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  and (select auth.uid()) = user_id
);

create policy "account_deletion_requests_admin_select"
on public.account_deletion_requests for select to authenticated
using (
  exists (
    select 1
    from public.team_members as member
    where member.user_id = (select auth.uid())
      and member.role = 'admin'
      and member.status = 'active'
  )
);

revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant select on table public.account_deletion_requests to authenticated;

create or replace function private.request_account_deletion()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_status text;
begin
  if v_actor is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'Authenticated non-anonymous user required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-account-deletion:' || v_actor::text, 0)
  );

  select status into v_existing_status
  from public.account_deletion_requests
  where user_id = v_actor
  for update;

  if v_existing_status = 'completed' then
    raise exception using errcode = '22023', message = 'Account deletion is already completed';
  end if;
  if v_existing_status in ('requested', 'processing') then
    return v_existing_status;
  end if;

  insert into public.account_deletion_requests (
    user_id, status, requested_at, cancelled_at, completed_at, updated_at
  ) values (
    v_actor, 'requested', now(), null, null, now()
  )
  on conflict (user_id) do update
  set status = 'requested',
      requested_at = now(),
      cancelled_at = null,
      completed_at = null,
      updated_at = now();

  return 'requested';
end;
$$;

create or replace function private.cancel_account_deletion_request()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_status text;
begin
  if v_actor is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'Authenticated non-anonymous user required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('insuccess-account-deletion:' || v_actor::text, 0)
  );

  select status into v_existing_status
  from public.account_deletion_requests
  where user_id = v_actor
  for update;

  if v_existing_status is null then
    raise exception using errcode = '22023', message = 'No account deletion request exists';
  end if;
  if v_existing_status = 'cancelled' then
    return 'cancelled';
  end if;
  if v_existing_status <> 'requested' then
    raise exception using errcode = '22023', message = 'Only a requested deletion can be cancelled';
  end if;

  update public.account_deletion_requests
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  where user_id = v_actor
    and status = 'requested';

  return 'cancelled';
end;
$$;

create or replace function public.request_account_deletion()
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.request_account_deletion();
$$;

create or replace function public.cancel_account_deletion_request()
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_account_deletion_request();
$$;

-- A deliberately data-free RPC gives the public readiness endpoint a stable
-- database round trip without exposing PostgREST's OpenAPI root or any table.
create or replace function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke execute on function private.request_account_deletion() from public, anon, authenticated;
revoke execute on function private.cancel_account_deletion_request() from public, anon, authenticated;
revoke execute on function public.request_account_deletion() from public, anon, authenticated;
revoke execute on function public.cancel_account_deletion_request() from public, anon, authenticated;
revoke execute on function public.health_check() from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.request_account_deletion() to authenticated;
grant execute on function private.cancel_account_deletion_request() to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion_request() to authenticated;
grant execute on function public.health_check() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
