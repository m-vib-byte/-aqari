-- Isolated V267 only. A versioned exit request and settlement review, not a
-- clearance certificate, lease termination, debt write-off or cash movement.
begin;
create sequence private.aqari_exit_review_seq;
create table private.aqari_exit_reviews (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null, revision integer not null check(revision>0),
 request_id uuid not null unique, document_no text not null unique,
 vacate_on date not null, reason text not null check(length(btrim(reason)) between 3 and 1000),
 document_id uuid references public.aqari_documents(id), checks jsonb not null,
 snapshot jsonb not null, actor_id uuid not null, actor_name text not null,
 created_at timestamptz not null default now(), request_data jsonb not null,
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,lease_id,revision)
);
create index aqari_exit_review_document on private.aqari_exit_reviews(document_id);
alter table private.aqari_exit_reviews enable row level security;
revoke all on private.aqari_exit_reviews from public,anon,authenticated;
revoke all on sequence private.aqari_exit_review_seq from public,anon,authenticated;
create function private.aqari_exit_review_immutable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'EXIT_IMMUTABLE' using errcode='23514';end $$;
revoke all on function private.aqari_exit_review_immutable() from public,anon,authenticated;
create trigger aqari_exit_review_immutable before update or delete on private.aqari_exit_reviews
for each row execute function private.aqari_exit_review_immutable();

create function public.aqari_exit_review(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;allowed text[];k text;lid uuid;req uuid;rev integer;
 c public.aqari_leases;e private.aqari_exit_reviews;doc uuid;v_date date;why text;normalized jsonb;
 checks_value jsonb;item jsonb;actor text;snap jsonb;seq_value text;rows jsonb;
begin
 -- Settlement review contains financial records; contract visibility alone is insufficient.
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'contracts','read')
  or not private.aqari_can(w,'collections','read') or not private.aqari_can(w,'finance','read')
  or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>12000 then raise exception 'EXIT_INVALID_DATA' using errcode='22023';end if;
 allowed:=case p_action when 'list' then array['lease_id'] when 'get' then array['request_id']
  when 'save' then array['request_id','lease_id','revision','vacate_on','reason','document_id','checks'] else null end;
 if allowed is null then raise exception 'EXIT_UNKNOWN_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'EXIT_UNKNOWN_FIELD' using errcode='22023';end if;end loop;
 if p_action='get' then
  if jsonb_typeof(d->'request_id') is distinct from 'string' then raise exception 'EXIT_INVALID_REQUEST' using errcode='22023';end if;
  req:=(d->>'request_id')::uuid;
  select * into e from private.aqari_exit_reviews x where x.workspace_id=w and x.request_id=req;
  if not found then return jsonb_build_object('entry',null);end if;
  if not private.aqari_can_lease(w,e.lease_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('entry',to_jsonb(e)-'request_data');
 end if;
 if d ? 'lease_id' then
  if jsonb_typeof(d->'lease_id') is distinct from 'string' then raise exception 'EXIT_INVALID_LEASE' using errcode='22023';end if;
  lid:=(d->>'lease_id')::uuid;
  if not private.aqari_can_lease(w,lid,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if p_action='list' then
  if (select count(*) from public.aqari_leases l where l.workspace_id=w and private.aqari_can_lease(w,l.id,'contracts','read'))>2000
   or (select count(*) from private.aqari_exit_reviews x where x.workspace_id=w and x.lease_id=lid)>2000 then raise exception 'EXIT_LIST_LIMIT' using errcode='22023';end if;
  select coalesce(jsonb_agg(to_jsonb(x)-'request_data' order by x.revision desc),'[]') into rows from private.aqari_exit_reviews x where x.workspace_id=w and x.lease_id=lid;
  return jsonb_build_object('can_write',private.aqari_can(w,'contracts','write'),
   'leases',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'tenant_name',t.full_name,'property_name',p.name,'unit_no',u.unit_no,'start_date',l.start_date,'status',l.status) order by l.contract_no,l.id)
    from public.aqari_leases l join public.aqari_tenants t on t.workspace_id=w and t.id=l.tenant_id
    join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
    where l.workspace_id=w and private.aqari_can_lease(w,l.id,'contracts','read')),'[]'),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'document_no',x.document_no) order by x.created_at desc,x.id)
    from public.aqari_documents x join public.aqari_leases l on l.workspace_id=w and l.id=lid and x.entity_ref=l.external_ref
    where x.workspace_id=w and x.entity_type='lease' and x.status='uploaded' and private.aqari_document_entity(w,'lease',x.entity_ref,'read')),'[]'),
   'entries',rows);
 end if;
 if lid is null or not private.aqari_can_lease(w,lid,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d->'request_id') is distinct from 'string' then raise exception 'EXIT_INVALID_REQUEST' using errcode='22023';end if;
 req:=(d->>'request_id')::uuid;
 if jsonb_typeof(d->'revision') is distinct from 'number' or d->>'revision' !~ '^[0-9]{1,8}$' then raise exception 'EXIT_INVALID_REVISION' using errcode='22023';end if;
 rev:=(d->>'revision')::integer;
 if jsonb_typeof(d->'vacate_on') is distinct from 'string' or d->>'vacate_on' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'EXIT_INVALID_DATE' using errcode='22023';end if;
 v_date:=(d->>'vacate_on')::date;
 if jsonb_typeof(d->'reason') is distinct from 'string' or length(btrim(d->>'reason')) not between 3 and 1000 then raise exception 'EXIT_INVALID_REASON' using errcode='22023';end if;
 why:=btrim(d->>'reason');
 if d->'document_id' is not null and d->'document_id'<>'null'::jsonb then
  if jsonb_typeof(d->'document_id')<>'string' then raise exception 'EXIT_INVALID_DOCUMENT' using errcode='22023';end if;
  doc:=(d->>'document_id')::uuid;
 end if;
 checks_value:=d->'checks';
 if jsonb_typeof(checks_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(checks_value))<>6 then raise exception 'EXIT_INVALID_CHECKS' using errcode='22023';end if;
 foreach k in array array['rent','deposit','utilities','maintenance','keys','other'] loop
  item:=checks_value->k;
  if item is null or jsonb_typeof(item)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(item) key) is distinct from array['note','status']
   or jsonb_typeof(item->'status') is distinct from 'string' or item->>'status' not in ('pending','reviewed','outstanding')
   or jsonb_typeof(item->'note') is distinct from 'string' or length(item->>'note')>500
   or (item->>'status'<>'pending' and length(btrim(item->>'note'))<3) then raise exception 'EXIT_INVALID_CHECKS' using errcode='22023';end if;
 end loop;
 normalized:=jsonb_build_object('request_id',req,'lease_id',lid,'revision',rev,'vacate_on',v_date,'reason',why,'document_id',doc,'checks',checks_value);
 -- Same lock order as rent/deposit writes. Retry identity checked before a later lease change.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'EXIT_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 select * into c from public.aqari_leases l where l.workspace_id=w and l.id=lid for update;
 if not found or not private.aqari_manager(w) or not private.aqari_can_lease(w,lid,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into e from private.aqari_exit_reviews x where x.workspace_id=w and x.request_id=req;
 if found then
  if e.actor_id<>auth.uid() or e.request_data<>normalized then raise exception 'EXIT_REQUEST_CONFLICT' using errcode='22023';end if;
  return jsonb_build_object('entry',to_jsonb(e)-'request_data');
 end if;
 if c.status not in ('signed','expired') then raise exception 'EXIT_CONTRACT_REQUIRED' using errcode='22023';end if;
 if v_date<c.start_date then raise exception 'EXIT_BEFORE_CONTRACT' using errcode='22023';end if;
 if rev<>(select coalesce(max(x.revision),0) from private.aqari_exit_reviews x where x.workspace_id=w and x.lease_id=lid) then raise exception 'EXIT_STALE_REVISION' using errcode='22023';end if;
 if doc is not null and not exists(select 1 from public.aqari_documents x where x.id=doc and x.workspace_id=w and x.entity_type='lease'
  and x.entity_ref=c.external_ref and x.status='uploaded' and private.aqari_document_entity(w,'lease',x.entity_ref,'read')) then raise exception 'EXIT_INVALID_DOCUMENT' using errcode='22023';end if;
 select jsonb_build_object('lease_id',c.id,'contract_no',c.contract_no,'tenant_id',t.id,'tenant_name',t.full_name,
  'property_id',p.id,'property_name',p.name,'unit_id',u.id,'unit_no',u.unit_no,'start_date',c.start_date,'end_date',c.end_date,
  'lease_status',c.status,'contract_deposit',c.deposit::text,
  'rent_payments_total',coalesce((select sum(r.amount) from public.aqari_rent_payments r where r.workspace_id=w and r.lease_id=lid and r.status in ('مدفوع','جزئي','paid','partial')),0)::numeric(18,3)::text,
  'deposit_balance',coalesce((select sum(case x.kind when 'receipt' then x.amount else -x.amount end) from private.aqari_deposit_entries x where x.workspace_id=w and x.lease_id=lid),0)::numeric(18,3)::text,
  'document',case when doc is null then null else (select jsonb_build_object('id',x.id,'document_no',x.document_no,'title',x.title,'checksum_sha256',x.checksum_sha256) from public.aqari_documents x where x.id=doc and x.workspace_id=w) end,
  'clearance_issued',false,'lease_terminated',false,'final_balance_verified',false)
 into snap from public.aqari_tenants t join public.aqari_units u on u.workspace_id=w and u.id=c.unit_id
 join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id where t.workspace_id=w and t.id=c.tenant_id;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 seq_value:=nextval('private.aqari_exit_review_seq')::text;
 insert into private.aqari_exit_reviews(id,workspace_id,lease_id,revision,request_id,document_no,vacate_on,reason,document_id,checks,snapshot,actor_id,actor_name,request_data)
 values(gen_random_uuid(),w,lid,rev+1,req,'EX-'||repeat('0',greatest(0,8-length(seq_value)))||seq_value,v_date,why,doc,checks_value,snap,auth.uid(),coalesce(actor,auth.uid()::text),normalized) returning * into e;
 return jsonb_build_object('entry',to_jsonb(e)-'request_data');
end $$;
revoke all on function public.aqari_exit_review(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_exit_review(uuid,text,jsonb) to authenticated;
commit;
