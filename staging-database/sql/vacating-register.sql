-- Isolated V267 target only. No source records or money are invented/backfilled.
create table private.aqari_vacating (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null, revision bigint not null check(revision>0),
 state text not null default 'draft' check(state in('draft','issued')),
 vacated_on date not null, keys_received boolean not null, inspection text not null,
 obligations jsonb not null, document_ids uuid[] not null, reason text not null,
 created_by uuid not null, updated_by uuid not null, updated_at timestamptz not null default now(),
 issued_by uuid, issued_name text, issued_at timestamptz, certificate_no text unique, snapshot jsonb,
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,lease_id), unique(workspace_id,id)
);
create table private.aqari_vacating_operations (
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null,
 actor_id uuid not null, action text not null, request_data jsonb not null,
 result jsonb not null, recorded_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
);
create sequence private.aqari_vacating_seq;
alter table private.aqari_vacating enable row level security;
alter table private.aqari_vacating_operations enable row level security;
revoke all on private.aqari_vacating,private.aqari_vacating_operations from public,anon,authenticated;
revoke all on sequence private.aqari_vacating_seq from public,anon,authenticated;
create function private.aqari_vacating_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='aqari_vacating_operations' or tg_op='DELETE' then
  raise exception 'VACATING_IMMUTABLE' using errcode='23514';
 end if;
 if old.state='issued' then
  raise exception 'VACATING_IMMUTABLE' using errcode='23514';
 end if;return new;
end $$;
revoke all on function private.aqari_vacating_immutable() from public,anon,authenticated;
create trigger vacating_immutable before update or delete on private.aqari_vacating for each row execute function private.aqari_vacating_immutable();
create trigger vacating_operation_immutable before update or delete on private.aqari_vacating_operations for each row execute function private.aqari_vacating_immutable();

-- Keep the original contractual end date. The occupancy exclusion uses the
-- separately audited effective end, so a later tenancy cannot overlap occupancy.
alter table public.aqari_leases add column vacated_on date check(vacated_on>=start_date and vacated_on<=end_date);
alter table public.aqari_leases drop constraint aqari_leases_workspace_id_unit_id_daterange_excl;
alter table public.aqari_leases add constraint aqari_leases_workspace_id_unit_id_daterange_excl
 exclude using gist(workspace_id with =,unit_id with =,daterange(start_date,coalesce(vacated_on,end_date),'[]') with &&) where(status<>'cancelled');

create function private.aqari_vacating_lease_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v private.aqari_vacating;
begin
 select * into v from private.aqari_vacating where workspace_id=new.workspace_id and lease_id=new.id and state='issued';
 if found then
  if new.snapshot is distinct from v.snapshot->'contract_snapshot' or new.tenant_id::text is distinct from v.snapshot#>>'{lease,tenant_id}'
   or new.unit_id::text is distinct from v.snapshot#>>'{lease,unit_id}' or new.start_date::text is distinct from v.snapshot#>>'{lease,start_date}'
   or new.end_date::text is distinct from v.snapshot#>>'{lease,end_date}' or new.monthly_rent::text is distinct from v.snapshot#>>'{lease,monthly_rent}' then
   raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';
  end if;
  new.status:='expired';new.vacated_on:=v.vacated_on;
 elsif new.vacated_on is not null then raise exception 'VACATING_ISSUE_REQUIRED' using errcode='23514';
 end if;return new;
end $$;
revoke all on function private.aqari_vacating_lease_guard() from public,anon,authenticated;
create trigger zz_vacating_lease_guard before insert or update on public.aqari_leases for each row execute function private.aqari_vacating_lease_guard();

-- Serialize operational sources with final issuance and the existing financial
-- workspace lock. Closing an already documented maintenance exception is allowed.
create function private.aqari_vacating_source_lock() returns trigger language plpgsql security definer set search_path='' as $$
declare row_value jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;w uuid:=(row_value->>'workspace_id')::uuid;
begin
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if tg_table_name='aqari_maintenance_requests' and exists(select 1 from private.aqari_vacating where workspace_id=w and lease_id=(row_value->>'lease_id')::uuid and state='issued') then
  if tg_op<>'UPDATE' then raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';end if;
  if new.status not in('completed','cancelled') or new.cost is distinct from old.cost then raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.aqari_vacating_source_lock() from public,anon,authenticated;
create trigger zz_vacating_source_lock before insert or update or delete on public.aqari_maintenance_requests for each row execute function private.aqari_vacating_source_lock();
create trigger zz_vacating_source_lock before insert or update or delete on public.aqari_utility_entries for each row execute function private.aqari_vacating_source_lock();

-- A deliberately conservative statement: no daily proration, cross-month netting,
-- unconfirmed payments or contract deposit fields are treated as paid money.
create function private.aqari_vacating_statement(w uuid,lid uuid,on_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.aqari_leases;rent_rows jsonb;rent_due numeric;deposit_json jsonb;maintenance_count bigint;utility_count bigint;docs jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can_lease(w,lid,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found or on_day is null or on_day<l.start_date or on_day>l.end_date or on_day>(now() at time zone 'Asia/Kuwait')::date then raise exception 'VACATING_INVALID_DATE' using errcode='22023';end if;
 if l.end_date-l.start_date>36600 then raise exception 'VACATING_PERIOD_LIMIT' using errcode='22023';end if;
 with periods as(select generate_series(date_trunc('month',l.start_date),date_trunc('month',on_day),interval '1 month')::date period),
 amounts as(select period,private.aqari_reminder_due(l.snapshot,l.monthly_rent,period) due,
  coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.period=periods.period and p.status in('مدفوع','جزئي','paid','partial')),0) paid from periods)
 select jsonb_agg(jsonb_build_object('period',period,'due',due::numeric(18,3)::text,'paid',paid::numeric(18,3)::text,'remaining',greatest(due-paid,0)::numeric(18,3)::text) order by period),sum(greatest(due-paid,0)) into rent_rows,rent_due from amounts;
 if rent_due is null or exists(select 1 from jsonb_array_elements(rent_rows) x where x->>'due' is null) then raise exception 'VACATING_RENT_UNVERIFIED' using errcode='22023';end if;
 deposit_json:=private.aqari_deposit_lease_json(w,lid);
 select count(*) into maintenance_count from public.aqari_maintenance_requests where workspace_id=w and lease_id=lid and status not in('completed','cancelled');
 -- Unallocated property-wide bills also block clearance. Never silently assign
 -- them to one tenant or assume the tenant owes the whole property bill.
 select count(*) into utility_count from public.aqari_utility_entries e join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
  where e.workspace_id=w and e.property_id=u.property_id and e.entry_type='bill' and (e.amount_due is null or e.amount_paid is null or e.amount_due>e.amount_paid or e.payment_status<>'paid');
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'sha256',d.checksum_sha256,'purpose',d.metadata->>'purpose') order by d.created_at),'[]') into docs
  from public.aqari_documents d where d.workspace_id=w and d.entity_type='lease' and d.entity_ref in(l.external_ref,l.id::text) and d.status='uploaded' and d.checksum_sha256 is not null;
 return jsonb_build_object('lease',to_jsonb(l)-'import_source'-'snapshot','contract_snapshot',l.snapshot,'identity',deposit_json,
  'periods',rent_rows,'rent_remaining',rent_due::numeric(18,3)::text,'deposit_balance',deposit_json->>'balance',
  'open_maintenance',maintenance_count,'unallocated_utility_bills',utility_count,'documents',docs,
  'has_future_payments',exists(select 1 from public.aqari_rent_payments where workspace_id=w and lease_id=lid and period>date_trunc('month',on_day)::date),
  'source_review_required',l.import_source is not null,
  'deposit_history_missing',nullif(l.snapshot->>'depositReceivedOn','') is not null and (deposit_json->>'received')::numeric=0,
  'uncertain_payments',exists(select 1 from public.aqari_rent_payments where workspace_id=w and lease_id=lid and status not in('مدفوع','جزئي','paid','partial')));
end $$;
revoke all on function private.aqari_vacating_statement(uuid,uuid,date) from public,anon,authenticated;

create function private.aqari_vacating_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;ident uuid;v private.aqari_vacating;op private.aqari_vacating_operations;expected bigint;k text;allowed text[];
 app public.aqari_app_state;data jsonb;contract jsonb;ref text;
 statement jsonb;result jsonb;item jsonb;docid uuid;ids uuid[];day date;total numeric:=0;why text;exception_reason text;actor text;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>50000 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
 allowed:=case action when 'list' then array[]::text[] when 'get' then array['lease_id'] when 'statement' then array['lease_id','vacated_on'] when 'operation' then array['id']
  when 'save' then array['id','lease_id','revision','vacated_on','keys_received','inspection','obligations','document_ids','reason']
  when 'issue' then array['id','lease_id','revision','reason','exception_reason','review_token'] else null end;
 if allowed is null then raise exception 'VACATING_UNKNOWN_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'VACATING_UNKNOWN_FIELD' using errcode='22023';end if;end loop;
 if action='list' then
  if (select count(*) from public.aqari_leases where workspace_id=w)>2000 then raise exception 'VACATING_LIST_LIMIT' using errcode='22023';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'start_date',l.start_date,'end_date',l.end_date,'state',v.state,'revision',v.revision) order by l.contract_no)
   from public.aqari_leases l left join private.aqari_vacating v on v.workspace_id=w and v.lease_id=l.id where l.workspace_id=w and l.status in('signed','expired') and private.aqari_can_lease(w,l.id,'contracts','read')),'[]');
 end if;
 if action='operation' then
  ident:=(d->>'id')::uuid;select * into op from private.aqari_vacating_operations where workspace_id=w and id=ident and actor_id=auth.uid();
  if not found then return null;end if;
  if not private.aqari_can_lease(w,op.lease_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('id',op.id,'action',op.action,'request',op.request_data,'result',op.result);
 end if;
 lid:=(d->>'lease_id')::uuid;
 if lid is null or not private.aqari_can_lease(w,lid,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='get' then return (select to_jsonb(x) from private.aqari_vacating x where workspace_id=w and lease_id=lid);end if;
 if action='statement' then
  statement:=private.aqari_vacating_statement(w,lid,(d->>'vacated_on')::date);
  return statement||jsonb_build_object('review_token',md5(statement::text));
 end if;
 if not private.aqari_can_lease(w,lid,'contracts','write') or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 ident:=(d->>'id')::uuid;expected:=(d->>'revision')::bigint;why:=btrim(d->>'reason');
 if ident is null or expected is null or expected<0 or why is null or length(why) not between 3 and 500 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'VACATING_WORKSPACE_MISSING' using errcode='22023';end if;
 perform 1 from public.aqari_leases where workspace_id=w and id=lid and status in('signed','expired') for update;
 if not found then raise exception 'VACATING_ACTIVE_CONTRACT_REQUIRED' using errcode='22023';end if;
 if not private.aqari_manager(w) or not private.aqari_can_lease(w,lid,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into op from private.aqari_vacating_operations where workspace_id=w and id=ident;
 if found then
  if op.actor_id<>auth.uid() or op.action<>action or op.request_data<>d then raise exception 'VACATING_REQUEST_CONFLICT' using errcode='22023';end if;
  return op.result;
 end if;
 select * into v from private.aqari_vacating where workspace_id=w and lease_id=lid for update;
 if coalesce(v.revision,0)<>expected then raise exception 'VACATING_STALE_REVISION' using errcode='40001';end if;
 if v.state='issued' then raise exception 'VACATING_IMMUTABLE' using errcode='23514';end if;
 if action='save' then
  day:=(d->>'vacated_on')::date;statement:=private.aqari_vacating_statement(w,lid,day);
  if jsonb_typeof(d->'keys_received') is distinct from 'boolean' or jsonb_typeof(d->'inspection') is distinct from 'string' or length(btrim(d->>'inspection')) not between 3 and 2000
   or jsonb_typeof(d->'obligations') is distinct from 'array' or jsonb_array_length(d->'obligations')>100 or jsonb_typeof(d->'document_ids') is distinct from 'array' or jsonb_array_length(d->'document_ids')>50 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
  for item in select value from jsonb_array_elements(d->'obligations') loop
   if jsonb_typeof(item)<>'object' or (item-array['description','amount'])<>'{}'::jsonb or jsonb_typeof(item->'description') is distinct from 'string' or length(btrim(item->>'description')) not between 3 and 500
    or jsonb_typeof(item->'amount') is distinct from 'string' or item->>'amount' !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'VACATING_INVALID_OBLIGATION' using errcode='22023';end if;
  end loop;
  select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(d->'document_ids');
  foreach docid in array ids loop
   if not exists(select 1 from jsonb_array_elements(statement->'documents') x where x->>'id'=docid::text) then raise exception 'VACATING_DOCUMENT_REQUIRED' using errcode='22023';end if;
  end loop;
  insert into private.aqari_vacating(id,workspace_id,lease_id,revision,vacated_on,keys_received,inspection,obligations,document_ids,reason,created_by,updated_by)
   values(coalesce(v.id,ident),w,lid,expected+1,day,(d->>'keys_received')::boolean,btrim(d->>'inspection'),d->'obligations',ids,why,auth.uid(),auth.uid())
   on conflict(workspace_id,lease_id) do update set revision=expected+1,vacated_on=excluded.vacated_on,keys_received=excluded.keys_received,inspection=excluded.inspection,
    obligations=excluded.obligations,document_ids=excluded.document_ids,reason=excluded.reason,updated_by=auth.uid(),updated_at=now() returning * into v;
 else
  if v.id is null then raise exception 'VACATING_DRAFT_REQUIRED' using errcode='22023';end if;
  statement:=private.aqari_vacating_statement(w,lid,v.vacated_on);
  if d->>'review_token' is distinct from md5(statement::text) then raise exception 'VACATING_REVIEW_CHANGED' using errcode='40001';end if;
  if not v.keys_received or cardinality(v.document_ids)=0 or not exists(select 1 from jsonb_array_elements(statement->'documents') x where (x->>'id')::uuid=any(v.document_ids) and x->>'purpose'='vacating_handover') then raise exception 'VACATING_HANDOVER_REQUIRED' using errcode='22023';end if;
  foreach docid in array v.document_ids loop
   if not exists(select 1 from jsonb_array_elements(statement->'documents') x where x->>'id'=docid::text) then raise exception 'VACATING_DOCUMENT_REQUIRED' using errcode='22023';end if;
  end loop;
  if (statement->>'deposit_balance')::numeric<>0 or (statement->>'has_future_payments')::boolean then raise exception 'VACATING_REFUND_REQUIRED' using errcode='22023';end if;
  if (statement->>'source_review_required')::boolean or (statement->>'deposit_history_missing')::boolean or (statement->>'uncertain_payments')::boolean then raise exception 'VACATING_SOURCE_REVIEW_REQUIRED' using errcode='22023';end if;
  select coalesce(sum((x->>'amount')::numeric),0) into total from jsonb_array_elements(v.obligations) x;
  exception_reason:=btrim(coalesce(d->>'exception_reason',''));
  if length(exception_reason)>2000 then raise exception 'VACATING_INVALID_DATA' using errcode='22023';end if;
  if (statement->>'rent_remaining')::numeric+total>0 or (statement->>'open_maintenance')::bigint>0 or (statement->>'unallocated_utility_bills')::bigint>0 then
   if length(exception_reason)<10 then raise exception 'VACATING_OPEN_OBLIGATIONS' using errcode='22023';end if;
  end if;
  perform private.aqari_financial_open(w,v.vacated_on);
  select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
  select * into app from public.aqari_app_state where workspace_id=w;
  data:=private.aqari_unwrap(app.payload);ref:=statement#>>'{lease,external_ref}';
  select x into contract from jsonb_array_elements(coalesce(data->'contractsV202','[]')) x where x->>'id'=ref;
  if contract is null or contract is distinct from statement->'contract_snapshot' then raise exception 'VACATING_SOURCE_UNLINKED' using errcode='22023';end if;
  contract:=contract||jsonb_build_object('status','expired','vacatedOn',v.vacated_on,'changeReason',why);
  statement:=statement||jsonb_build_object('original_contract_snapshot',statement->'contract_snapshot','contract_snapshot',contract);
  statement:=statement||jsonb_build_object('exception_reason',exception_reason,'additional_obligations',v.obligations,'additional_total',total::numeric(18,3)::text,'inspection',v.inspection,'document_ids',to_jsonb(v.document_ids),'keys_received',v.keys_received);
  update private.aqari_vacating set state='issued',revision=revision+1,issued_by=auth.uid(),issued_name=coalesce(actor,auth.uid()::text),issued_at=now(),
   certificate_no='VC-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||nextval('private.aqari_vacating_seq'),snapshot=statement,reason=why,updated_by=auth.uid(),updated_at=now()
   where id=v.id returning * into v;
  data:=jsonb_set(data,'{contractsV202}',(select jsonb_agg(case when x->>'id'=ref then contract else x end order by n) from jsonb_array_elements(data->'contractsV202') with ordinality a(x,n)));
  update public.aqari_app_state set payload=case when app.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(app.payload,'{snapshot,values,aqari_v30}',data)
   when app.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(app.payload,'{values,aqari_v30}',data) else data end,
   revision=app.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;
  update public.aqari_notification_outbox set status='cancelled' where workspace_id=w and lease_id=lid and status in('awaiting_configuration','queued') and kind='rent_reminder';
 end if;
 result:=to_jsonb(v);
 insert into private.aqari_vacating_operations(id,workspace_id,lease_id,actor_id,action,request_data,result) values(ident,w,lid,auth.uid(),action,d,result);
 return result;
end $$;
revoke all on function private.aqari_vacating_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_vacating_register(uuid,text,jsonb) to authenticated;
create function public.aqari_vacating_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_vacating_register(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_vacating_register(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_vacating_register(uuid,text,jsonb) to authenticated;
