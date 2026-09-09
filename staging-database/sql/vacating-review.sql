-- Additive review dossier; NOT a final settlement, waiver or financial movement.
-- Run only on the independently authorized test database after deposit-register.sql.
create table private.aqari_vacating_reviews (
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 revision integer not null check(revision>0),
 created_at timestamptz not null default now(),
 actor_id uuid not null,
 actor_name text not null,
 request_data jsonb not null,
 evidence jsonb not null,
 unique(workspace_id,lease_id,revision),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
);
alter table private.aqari_vacating_reviews enable row level security;
revoke all on private.aqari_vacating_reviews from public,anon,authenticated;
create function private.aqari_vacating_review_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'VACATING_REVIEW_IMMUTABLE' using errcode='23514';end $$;
revoke all on function private.aqari_vacating_review_immutable() from public,anon,authenticated;
create trigger aqari_vacating_immutable before update or delete on private.aqari_vacating_reviews
 for each row execute function private.aqari_vacating_review_immutable();

create function private.aqari_vacating_evidence(w uuid,l uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('lease',private.aqari_deposit_lease_json(w,l),'contract',to_jsonb(x),
  'rent_payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount::text,'status',p.status,'period',p.period,'paid_at',p.paid_at) order by p.id)
   from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l),'[]'::jsonb),
  'deposits',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'amount',d.amount::text,'kind',d.kind,'on_date',d.on_date) order by d.id)
   from private.aqari_deposit_entries d where d.workspace_id=w and d.lease_id=l),'[]'::jsonb))
 from public.aqari_leases x where x.workspace_id=w and x.id=l
$$;
revoke all on function private.aqari_vacating_evidence(uuid,uuid) from public,anon,authenticated;

create function public.aqari_vacating_review(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;a text:=p_action;k text;allowed text[];lid uuid;ident uuid;
 current_review private.aqari_vacating_reviews;old_review private.aqari_vacating_reviews;latest_revision integer;
 evidence jsonb;normalized jsonb;v_date date;value numeric;actor text;rows jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'contracts','read') or not private.aqari_can(w,'collections','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>20000 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
 allowed:=case a when 'list' then array[]::text[] when 'read' then array['lease_id'] when 'get' then array['id']
  when 'save' then array['id','lease_id','revision','evidence_token','vacate_date','keys_returned','inspection_complete','utilities_verified','rent_due','utilities_due','damage_due','other_due','reason'] else null end;
 if allowed is null then raise exception 'VACATING_ACTION_UNAVAILABLE' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'VACATING_UNKNOWN_FIELD' using errcode='22023';end if;end loop;
 if a='list' then
  if (select count(*) from public.aqari_leases where workspace_id=w)>2000 then raise exception 'VACATING_LIST_LIMIT' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.aqari_deposit_lease_json(w,l.id) order by l.contract_no,l.id),'[]') into rows
   from public.aqari_leases l where l.workspace_id=w and private.aqari_can_lease(w,l.id,'contracts','read') and private.aqari_can_lease(w,l.id,'collections','read');
  return jsonb_build_object('leases',rows);
 end if;
 if a in ('get','save') then
  if jsonb_typeof(d->'id') is distinct from 'string' then raise exception 'VACATING_INVALID_ID' using errcode='22023';end if;
  ident:=(d->>'id')::uuid;
 end if;
 if a='get' then
  select * into old_review from private.aqari_vacating_reviews where workspace_id=w and id=ident;
  if not found then return jsonb_build_object('review',null);end if;
  lid:=old_review.lease_id;
 else
  if jsonb_typeof(d->'lease_id') is distinct from 'string' then raise exception 'VACATING_INVALID_LEASE' using errcode='22023';end if;
  lid:=(d->>'lease_id')::uuid;
 end if;
 if not private.aqari_can_lease(w,lid,'contracts','read') or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if a='get' then return jsonb_build_object('review',to_jsonb(old_review));end if;
 -- Match workspace/lease lock ordering of deposits and application-state writes.
 -- Read evidence under the same lock used for saves, then compare again at save.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'VACATING_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 perform 1 from public.aqari_leases where workspace_id=w and id=lid for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w and lease_id=lid)>2000 or
    (select count(*) from private.aqari_deposit_entries where workspace_id=w and lease_id=lid)>2000 then raise exception 'VACATING_EVIDENCE_LIMIT' using errcode='22023';end if;
 evidence:=private.aqari_vacating_evidence(w,lid);
 select * into current_review from private.aqari_vacating_reviews where workspace_id=w and lease_id=lid order by revision desc limit 1;
 latest_revision:=coalesce(current_review.revision,0);
 if a='read' then
  return jsonb_build_object('review',case when latest_revision=0 then null else to_jsonb(current_review) end,
   'can_edit',private.aqari_can_lease(w,lid,'contracts','write'),'revision',latest_revision,'evidence',evidence,'evidence_token',md5(evidence::text),
   'stale',latest_revision>0 and current_review.evidence<>evidence,'can_finalize',false,
   'blockers',jsonb_build_array('OBLIGATIONS_RECONCILIATION_REQUIRED','REVIEW_ONLY'));
 end if;
 if not private.aqari_can_lease(w,lid,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d->'revision') is distinct from 'number' or d->>'revision' !~ '^[0-9]{1,8}$' then raise exception 'VACATING_INVALID_REVISION' using errcode='22023';end if;
 if jsonb_typeof(d->'evidence_token') is distinct from 'string' or d->>'evidence_token' !~ '^[a-f0-9]{32}$' then raise exception 'VACATING_INVALID_EVIDENCE' using errcode='22023';end if;
 if jsonb_typeof(d->'vacate_date') is distinct from 'string' or d->>'vacate_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'VACATING_INVALID_DATE' using errcode='22023';end if;
 v_date:=(d->>'vacate_date')::date;
 if evidence#>>'{contract,start_date}' is null or v_date<(evidence#>>'{contract,start_date}')::date then raise exception 'VACATING_BEFORE_CONTRACT' using errcode='22023';end if;
 foreach k in array array['keys_returned','inspection_complete','utilities_verified'] loop
  if jsonb_typeof(d->k) is distinct from 'boolean' then raise exception 'VACATING_INVALID_CHECKLIST' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 3 and 2000 then raise exception 'VACATING_REASON_REQUIRED' using errcode='22023';end if;
 normalized:=d||jsonb_build_object('id',ident,'lease_id',lid,'vacate_date',v_date,'reason',btrim(d->>'reason'));
 foreach k in array array['rent_due','utilities_due','damage_due','other_due'] loop
  if not(d ? k) then raise exception 'VACATING_INVALID_AMOUNT' using errcode='22023';end if;
  if d->k='null'::jsonb then continue;end if;
  if jsonb_typeof(d->k) is distinct from 'string' or d->>k !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'VACATING_INVALID_AMOUNT' using errcode='22023';end if;
  value:=(d->>k)::numeric;
  normalized:=normalized||jsonb_build_object(k,value::numeric(15,3)::text);
 end loop;
 select * into old_review from private.aqari_vacating_reviews where workspace_id=w and id=ident;
 if found then
  if old_review.actor_id<>auth.uid() or old_review.request_data<>normalized then raise exception 'VACATING_REQUEST_CONFLICT' using errcode='22023';end if;
  return jsonb_build_object('review',to_jsonb(old_review));
 end if;
 if latest_revision<>(d->>'revision')::integer then raise exception 'VACATING_REVISION_CONFLICT' using errcode='22023';end if;
 if md5(evidence::text)<>d->>'evidence_token' then raise exception 'VACATING_EVIDENCE_CHANGED' using errcode='22023';end if;
 if evidence#>>'{contract,status}' not in ('signed','expired') then raise exception 'VACATING_SIGNED_CONTRACT_REQUIRED' using errcode='22023';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_vacating_reviews(id,workspace_id,lease_id,revision,actor_id,actor_name,request_data,evidence)
 values(ident,w,lid,latest_revision+1,auth.uid(),coalesce(actor,auth.uid()::text),normalized,evidence) returning * into current_review;
 return jsonb_build_object('review',to_jsonb(current_review));
end $$;
revoke all on function public.aqari_vacating_review(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_vacating_review(uuid,text,jsonb) to authenticated;
