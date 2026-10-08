begin;
-- Additive observation ledger; member workflows remain unchanged.
create table public.ceo_runs (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(), snapshot jsonb not null, report jsonb,
 constraint ceo_report_size check (report is null or octet_length(report::text)<12000)
);
create index ceo_runs_created_idx on public.ceo_runs(created_at desc);
create table public.ceo_experiments (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.ceo_runs(id),
 policy_id text not null check(policy_id in ('finish_action','start_checkin','complete_map','mentor_support','assign_mentor')),
 approved_by uuid not null references auth.users(id), started_at timestamptz not null default now(),
 status text not null default 'running' check(status in ('running','measured','accepted','rejected','stopped')),
 before_snapshot jsonb not null, after_snapshot jsonb, measured_at timestamptz, learning_eligible boolean, delta numeric,
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_note text check(length(review_note)<=1000)
);
create unique index ceo_one_running_idx on public.ceo_experiments((true)) where status='running';
create index ceo_experiments_started_idx on public.ceo_experiments(started_at desc);
create table public.ceo_events (
 id bigint generated always as identity primary key, experiment_id uuid not null references public.ceo_experiments(id),
 actor_id uuid not null references auth.users(id), event text not null check(event in ('approved','measured','accepted','rejected','stopped')), created_at timestamptz not null default now()
);
create index ceo_events_experiment_idx on public.ceo_events(experiment_id);
alter table public.ceo_runs enable row level security;
alter table public.ceo_experiments enable row level security;
alter table public.ceo_events enable row level security;
revoke all on public.ceo_runs,public.ceo_experiments,public.ceo_events from anon,authenticated;
grant select on public.ceo_runs,public.ceo_experiments,public.ceo_events to authenticated;
create policy ceo_runs_admin_read on public.ceo_runs for select to authenticated using((select private.current_user_is_team_admin()));
create policy ceo_experiments_admin_read on public.ceo_experiments for select to authenticated using((select private.current_user_is_team_admin()));
create policy ceo_events_admin_read on public.ceo_events for select to authenticated using((select private.current_user_is_team_admin()));

create function private.ceo_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 with active as(select user_id,role from public.team_members where status='active')
 select jsonb_build_object('version',1,'asOf',now(),'windowStart',now()-interval '14 days',
 'cohort',(select md5(coalesce(string_agg(user_id::text||':'||role,',' order by user_id),'')) from active),
 'metrics',jsonb_build_object(
 'activeMembers',(select count(*) from active),
 'mappedMembers',(select count(*) from active a where exists(select 1 from public.member_success_maps s where s.user_id=a.user_id and s.completed_at is not null)),
 'completedMembers14d',(select count(*) from active a where exists(select 1 from public.member_actions m where m.member_user_id=a.user_id and m.status='done' and m.completed_at>=now()-interval '14 days' and m.completed_at<=now())),
 'checkinMembers14d',(select count(*) from active a where exists(select 1 from public.member_checkins c where c.user_id=a.user_id and c.created_at>=now()-interval '14 days' and c.created_at<=now())),
 'openSupport',(select count(*) from public.support_requests s join active a on a.user_id=s.member_user_id where s.status in ('unassigned','assigned','acknowledged','in_progress')),
 'unassignedMembers',(select count(*) from active a where a.role in ('user','builder') and not exists(select 1 from public.member_relationships r join active coach on coach.user_id=r.coach_user_id where r.member_user_id=a.user_id)),
 'actionsCreated14d',(select count(*) from public.member_actions m join active a on a.user_id=m.member_user_id where m.created_at>=now()-interval '14 days' and m.created_at<=now())
 )) into result;
 return result;
end; $$;

create function private.begin_ceo_run() returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.ceo_runs; history jsonb;
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(809241001);
 if exists(select 1 from public.ceo_runs where created_at>now()-interval '60 seconds') or
 (select count(*) from public.ceo_runs where created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'))>=8 then raise exception 'CEO_RUN_LIMIT'; end if;
 insert into public.ceo_runs(actor_id,snapshot) values(auth.uid(),private.ceo_snapshot()) returning * into run;
 select coalesce(jsonb_agg(jsonb_build_object('policyId',h.policy_id,'verdict',h.status,'delta',h.delta,'experimentId',h.id)),'[]'::jsonb)
 into history from(select * from public.ceo_experiments where status in ('accepted','rejected') and learning_eligible=true order by reviewed_at desc limit 50)h;
 return jsonb_build_object('id',run.id,'snapshot',run.snapshot,'learning',history);
end; $$;

create function private.finish_ceo_run(p_id uuid,p_report jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_report->>'version' is distinct from 'ceo-v1' or (p_report->>'source' is distinct from 'rules' and p_report->>'source' is distinct from 'ai_gateway') or jsonb_typeof(p_report->'orderedPolicyIds') is distinct from 'array' then raise exception 'CEO_INVALID_REPORT'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_report->'orderedPolicyIds') i where i not in ('finish_action','start_checkin','complete_map','mentor_support','assign_mentor'))
 or jsonb_array_length(p_report->'orderedPolicyIds')<>(select count(distinct i) from jsonb_array_elements_text(p_report->'orderedPolicyIds') i) then raise exception 'CEO_INVALID_REPORT'; end if;
 update public.ceo_runs set report=p_report where id=p_id and actor_id=auth.uid() and report is null and created_at>now()-interval '5 minutes';
 if not found then raise exception 'CEO_RUN_CONFLICT'; end if;
end; $$;

create function private.start_ceo_experiment(p_run_id uuid,p_policy_id text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.ceo_runs where id=p_run_id and created_at>now()-interval '24 hours' and report->'orderedPolicyIds' ? p_policy_id) then raise exception 'CEO_REFRESH_REQUIRED'; end if;
 insert into public.ceo_experiments(run_id,policy_id,approved_by,before_snapshot) values(p_run_id,p_policy_id,auth.uid(),private.ceo_snapshot()) returning id into result;
 insert into public.ceo_events(experiment_id,actor_id,event) values(result,auth.uid(),'approved');
 return result;
end; $$;

create function private.measure_ceo_experiment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare experiment public.ceo_experiments; after_state jsonb; eligible boolean; metric text; change numeric; n int;
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into experiment from public.ceo_experiments where id=p_id for update;
 if not found or experiment.status<>'running' then raise exception 'CEO_EXPERIMENT_CONFLICT'; end if;
 if experiment.started_at>now()-interval '14 days' then raise exception 'CEO_TOO_EARLY'; end if;
 after_state:=private.ceo_snapshot(); n:=(experiment.before_snapshot->'metrics'->>'activeMembers')::int;
 eligible:=n>=10 and experiment.before_snapshot->>'cohort'=after_state->>'cohort' and n=(after_state->'metrics'->>'activeMembers')::int;
 metric:=case experiment.policy_id when 'complete_map' then 'mappedMembers' when 'start_checkin' then 'checkinMembers14d' when 'assign_mentor' then 'unassignedMembers' else 'completedMembers14d' end;
 if eligible then change:=round(((after_state->'metrics'->>metric)::numeric-(experiment.before_snapshot->'metrics'->>metric)::numeric)/n*100,1); if experiment.policy_id='assign_mentor' then change:=-change; end if; end if;
 update public.ceo_experiments set status='measured',after_snapshot=after_state,measured_at=now(),learning_eligible=eligible,delta=change where id=p_id;
 insert into public.ceo_events(experiment_id,actor_id,event) values(p_id,auth.uid(),'measured');
end; $$;

create function private.review_ceo_experiment(p_id uuid,p_verdict text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare experiment public.ceo_experiments;
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_verdict not in ('accepted','rejected') or p_verdict is null or p_note is null or length(trim(p_note)) not between 10 and 1000 then raise exception 'CEO_INVALID_REVIEW'; end if;
 select * into experiment from public.ceo_experiments where id=p_id for update;
 if not found or experiment.status<>'measured' then raise exception 'CEO_EXPERIMENT_CONFLICT'; end if;
 if p_verdict='accepted' and (experiment.learning_eligible is distinct from true or coalesce(experiment.delta,0)<=0) then raise exception 'CEO_INSUFFICIENT_EVIDENCE'; end if;
 update public.ceo_experiments set status=p_verdict,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) where id=p_id;
 insert into public.ceo_events(experiment_id,actor_id,event) values(p_id,auth.uid(),p_verdict);
end; $$;

create function private.stop_ceo_experiment(p_id uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.current_user_is_team_admin(),false) then raise exception 'CEO_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_note is null or length(trim(p_note)) not between 10 and 1000 then raise exception 'CEO_INVALID_REVIEW'; end if;
 update public.ceo_experiments set status='stopped',reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note),learning_eligible=false where id=p_id and status='running';
 if not found then raise exception 'CEO_EXPERIMENT_CONFLICT'; end if;
 insert into public.ceo_events(experiment_id,actor_id,event) values(p_id,auth.uid(),'stopped');
end; $$;
create function public.stop_ceo_experiment(p_id uuid,p_note text) returns void language sql security invoker set search_path='' as $$ select private.stop_ceo_experiment(p_id,p_note); $$;

create function public.ceo_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.ceo_snapshot(); $$;
create function public.begin_ceo_run() returns jsonb language sql security invoker set search_path='' as $$ select private.begin_ceo_run(); $$;
create function public.finish_ceo_run(p_id uuid,p_report jsonb) returns void language sql security invoker set search_path='' as $$ select private.finish_ceo_run(p_id,p_report); $$;
create function public.start_ceo_experiment(p_run_id uuid,p_policy_id text) returns uuid language sql security invoker set search_path='' as $$ select private.start_ceo_experiment(p_run_id,p_policy_id); $$;
create function public.measure_ceo_experiment(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.measure_ceo_experiment(p_id); $$;
create function public.review_ceo_experiment(p_id uuid,p_verdict text,p_note text) returns void language sql security invoker set search_path='' as $$ select private.review_ceo_experiment(p_id,p_verdict,p_note); $$;
revoke all on function private.ceo_snapshot(),private.begin_ceo_run(),private.finish_ceo_run(uuid,jsonb),private.start_ceo_experiment(uuid,text),private.measure_ceo_experiment(uuid),private.review_ceo_experiment(uuid,text,text),private.stop_ceo_experiment(uuid,text) from public,anon,authenticated;
revoke all on function public.ceo_snapshot(),public.begin_ceo_run(),public.finish_ceo_run(uuid,jsonb),public.start_ceo_experiment(uuid,text),public.measure_ceo_experiment(uuid),public.review_ceo_experiment(uuid,text,text),public.stop_ceo_experiment(uuid,text) from public,anon,authenticated;
grant execute on function private.ceo_snapshot(),private.begin_ceo_run(),private.finish_ceo_run(uuid,jsonb),private.start_ceo_experiment(uuid,text),private.measure_ceo_experiment(uuid),private.review_ceo_experiment(uuid,text,text),private.stop_ceo_experiment(uuid,text) to authenticated;
grant execute on function public.ceo_snapshot(),public.begin_ceo_run(),public.finish_ceo_run(uuid,jsonb),public.start_ceo_experiment(uuid,text),public.measure_ceo_experiment(uuid),public.review_ceo_experiment(uuid,text,text),public.stop_ceo_experiment(uuid,text) to authenticated;
commit;
