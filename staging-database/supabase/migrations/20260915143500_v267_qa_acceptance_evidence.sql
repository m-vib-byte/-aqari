-- AQARI V267 Preview/Staging only: sanitized evidence for real hosted Phase-B role acceptance.
-- No tokens, passwords or e-mail addresses are stored here.

create table if not exists private.aqari_qa_acceptance_runs(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 actor_id uuid not null references auth.users(id),
 candidate_sha text not null check(candidate_sha ~ '^[0-9a-f]{40}$'),
 preview_host text not null check(length(preview_host) between 1 and 253),
 passed boolean not null,
 results jsonb not null check(jsonb_typeof(results)='object'),
 created_at timestamptz not null default now()
);
create index if not exists aqari_qa_acceptance_runs_scope on private.aqari_qa_acceptance_runs(workspace_id,created_at desc);
alter table private.aqari_qa_acceptance_runs enable row level security;
revoke all on private.aqari_qa_acceptance_runs from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_acceptance_runs_immutable on private.aqari_qa_acceptance_runs;
create trigger aqari_qa_acceptance_runs_immutable before update or delete on private.aqari_qa_acceptance_runs for each row execute function private.aqari_reject_immutable_change();

create or replace function public.aqari_qa_acceptance_report(
 p_workspace_id uuid,
 p_candidate_sha text,
 p_preview_host text,
 p_results jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 wslug text; rid uuid; clean_host text:=lower(btrim(coalesce(p_preview_host,''))); raw text;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 select slug into wslug from public.aqari_workspaces where id=p_workspace_id;
 if wslug is distinct from 'aqari-v267-staging' then
  raise insufficient_privilege using message='QA_STAGING_ONLY';
 end if;
 if coalesce(p_candidate_sha,'') !~ '^[0-9a-f]{40}$' then
  raise invalid_parameter_value using message='QA_EVIDENCE_SHA_REQUIRED';
 end if;
 if clean_host !~ '^aqari-[a-z0-9-]+[.]vercel[.]app$' or length(clean_host)>253 then
  raise invalid_parameter_value using message='QA_EVIDENCE_HOST_INVALID';
 end if;
 if jsonb_typeof(p_results) is distinct from 'object' or pg_column_size(p_results)>16384 then
  raise invalid_parameter_value using message='QA_EVIDENCE_INVALID';
 end if;
 raw:=lower(p_results::text);
 if raw ~ '(password|access[_-]?token|refresh[_-]?token|authorization|bearer|email|secret|api[_-]?key)' or raw like '%@%' then
  raise invalid_parameter_value using message='QA_EVIDENCE_SECRET_REJECTED';
 end if;
 if not (p_results ? 'passed') or jsonb_typeof(p_results->'passed')<>'boolean' then
  raise invalid_parameter_value using message='QA_EVIDENCE_RESULT_REQUIRED';
 end if;
 insert into private.aqari_qa_acceptance_runs(workspace_id,actor_id,candidate_sha,preview_host,passed,results)
 values(p_workspace_id,auth.uid(),lower(p_candidate_sha),clean_host,(p_results->>'passed')::boolean,p_results)
 returning id into rid;
 return jsonb_build_object('ok',true,'id',rid,'passed',(p_results->>'passed')::boolean,'candidate_sha',lower(p_candidate_sha));
end $$;
revoke all on function public.aqari_qa_acceptance_report(uuid,text,text,jsonb) from public,anon;
grant execute on function public.aqari_qa_acceptance_report(uuid,text,text,jsonb) to authenticated;
