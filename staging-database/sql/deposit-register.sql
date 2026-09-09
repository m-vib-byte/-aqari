-- Additive V267 deposit ledger. Apply only to the authorized isolated test project.
-- Contract deposit fields are agreed amounts, never evidence of received money.
create sequence private.aqari_deposit_voucher_seq;
create table private.aqari_deposit_entries(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 kind text not null check(kind in ('receipt','refund')),
 status text not null default 'confirmed' check(status='confirmed'),
 voucher_no text not null unique,
 amount numeric(15,3) not null check(amount>0),
 on_date date not null,
 method text not null check(method in ('cash','knet','bank','cheque')),
 reference text not null default '' check(length(reference)<=120),
 reason text not null default '' check(length(reason)<=500),
 actor_id uuid not null,
 actor_name text not null,
 created_at timestamptz not null default now(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 balance_after numeric(15,3) not null check(balance_after>=0),
 request_data jsonb not null check(jsonb_typeof(request_data)='object'),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,id),
 check(method='cash' or length(btrim(reference))>=3),
 check(kind<>'refund' or length(btrim(reason))>=3)
);
create index aqari_deposit_lease_history on private.aqari_deposit_entries(workspace_id,lease_id,created_at,id);
create unique index aqari_deposit_transfer_reference on private.aqari_deposit_entries(workspace_id,kind,method,lower(reference)) where method<>'cash';
alter table private.aqari_deposit_entries enable row level security;
revoke all on private.aqari_deposit_entries from public,anon,authenticated;
revoke all on sequence private.aqari_deposit_voucher_seq from public,anon,authenticated;

create function private.aqari_deposit_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'DEPOSIT_ENTRY_IMMUTABLE' using errcode='23514';
end $$;
revoke all on function private.aqari_deposit_immutable() from public,anon,authenticated;
create trigger aqari_deposit_immutable before update or delete on private.aqari_deposit_entries for each row execute function private.aqari_deposit_immutable();

-- These serializers are private and executable only by the checked RPC owner.
create function private.aqari_deposit_entry_json(e private.aqari_deposit_entries) returns jsonb language sql stable security invoker set search_path='' as $$
 select (to_jsonb(e)-'request_data')||jsonb_build_object('amount',e.amount::text,'balance_after',e.balance_after::text)
$$;
create function private.aqari_deposit_lease_json(w uuid,l uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',x.id,'contract_no',x.contract_no,'tenant_id',x.tenant_id,'tenant_name',t.full_name,
  'property_id',p.id,'property_name',p.name,'unit_id',u.id,'unit_no',u.unit_no,'status',x.status,'contract_deposit',x.deposit::text,
  'received',a.received::text,'refunded',a.refunded::text,'balance',(a.received-a.refunded)::numeric(18,3)::text,
  'can_receive',x.status='signed' and private.aqari_can_lease(w,x.id,'collections','write'),
  'can_refund',private.aqari_manager(w) and private.aqari_can_lease(w,x.id,'collections','write'))
 from public.aqari_leases x
 join public.aqari_tenants t on t.workspace_id=w and t.id=x.tenant_id
 join public.aqari_units u on u.workspace_id=w and u.id=x.unit_id
 join public.aqari_properties p on p.workspace_id=w and p.id=u.property_id
 cross join lateral(select coalesce(sum(e.amount) filter(where e.kind='receipt'),0)::numeric(18,3) received,
  coalesce(sum(e.amount) filter(where e.kind='refund'),0)::numeric(18,3) refunded
  from private.aqari_deposit_entries e where e.workspace_id=w and e.lease_id=x.id) a
 where x.workspace_id=w and x.id=l
$$;
revoke all on function private.aqari_deposit_entry_json(private.aqari_deposit_entries),private.aqari_deposit_lease_json(uuid,uuid) from public,anon,authenticated;

create function public.aqari_deposit_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;action text:=p_action;k text;allowed text[];ident uuid;lid uuid;
 e private.aqari_deposit_entries;contract public.aqari_leases;lease_json jsonb;normalized jsonb;amount_value numeric;v_date date;
 v_method text;v_ref text;why text;v_kind text;actor text;available numeric;rows jsonb;options jsonb;v_seq text;minimum_balance numeric;maximum_balance numeric;
begin
 if auth.uid() is null or not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>8000 then raise exception 'DEPOSIT_INVALID_DATA' using errcode='22023';end if;
 allowed:=case action when 'list' then array['lease_id'] when 'get' then array['id']
  when 'receive' then array['id','lease_id','amount','on_date','method','reference','reason']
  when 'refund' then array['id','lease_id','amount','on_date','method','reference','reason'] else null end;
 if allowed is null then raise exception 'DEPOSIT_UNKNOWN_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'DEPOSIT_UNKNOWN_FIELD' using errcode='22023';end if;end loop;
 if action='list' then
  if d ? 'lease_id' then
   if jsonb_typeof(d->'lease_id')<>'string' then raise exception 'DEPOSIT_INVALID_LEASE' using errcode='22023';end if;
   lid:=(d->>'lease_id')::uuid;
   if not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  end if;
  if (select count(*) from public.aqari_leases l where l.workspace_id=w and private.aqari_can_lease(w,l.id,'collections','read'))>2000 then raise exception 'DEPOSIT_LIST_LIMIT' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.aqari_deposit_lease_json(w,l.id) order by l.contract_no,l.id),'[]') into options
   from public.aqari_leases l where l.workspace_id=w and private.aqari_can_lease(w,l.id,'collections','read');
  if (select count(*) from private.aqari_deposit_entries x where x.workspace_id=w and x.lease_id=lid)>2000 then raise exception 'DEPOSIT_HISTORY_LIMIT' using errcode='22023';end if;
  select coalesce(jsonb_agg(private.aqari_deposit_entry_json(x) order by x.created_at desc,x.id),'[]') into rows
   from private.aqari_deposit_entries x where x.workspace_id=w and x.lease_id=lid;
  return jsonb_build_object('manager',private.aqari_manager(w),'leases',options,'entries',rows);
 end if;
 if jsonb_typeof(d->'id') is distinct from 'string' or nullif(d->>'id','') is null then raise exception 'DEPOSIT_INVALID_REQUEST_ID' using errcode='22023';end if;
 ident:=(d->>'id')::uuid;
 if action='get' then
  select * into e from private.aqari_deposit_entries x where x.workspace_id=w and x.id=ident;
  if not found then return jsonb_build_object('entry',null,'lease',null);end if;
  if not private.aqari_can_lease(w,e.lease_id,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('entry',private.aqari_deposit_entry_json(e),'lease',private.aqari_deposit_lease_json(w,e.lease_id));
 end if;
 if jsonb_typeof(d->'lease_id') is distinct from 'string' then raise exception 'DEPOSIT_INVALID_LEASE' using errcode='22023';end if;
 lid:=(d->>'lease_id')::uuid;
 if not private.aqari_can_lease(w,lid,'collections','write') or (action='refund' and not private.aqari_manager(w)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d->'amount') is distinct from 'string' or d->>'amount' !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' then raise exception 'DEPOSIT_INVALID_AMOUNT' using errcode='22023';end if;
 amount_value:=(d->>'amount')::numeric;
 if amount_value<=0 or amount_value>999999999999.999 then raise exception 'DEPOSIT_INVALID_AMOUNT' using errcode='22023';end if;
 if jsonb_typeof(d->'on_date') is distinct from 'string' or d->>'on_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'DEPOSIT_INVALID_DATE' using errcode='22023';end if;
 v_date:=(d->>'on_date')::date;
 if v_date>(now() at time zone 'Asia/Kuwait')::date then raise exception 'DEPOSIT_FUTURE_DATE' using errcode='22023';end if;
 if jsonb_typeof(d->'method') is distinct from 'string' or d->>'method' not in ('cash','knet','bank','cheque') then raise exception 'DEPOSIT_INVALID_METHOD' using errcode='22023';end if;
 v_method:=d->>'method';
 if d ? 'reference' and jsonb_typeof(d->'reference') is distinct from 'string' then raise exception 'DEPOSIT_INVALID_REFERENCE' using errcode='22023';end if;
 if d ? 'reason' and jsonb_typeof(d->'reason') is distinct from 'string' then raise exception 'DEPOSIT_INVALID_REASON' using errcode='22023';end if;
 v_ref:=btrim(coalesce(d->>'reference',''));why:=btrim(coalesce(d->>'reason',''));
 if length(v_ref)>120 or (v_method<>'cash' and length(v_ref)<3) then raise exception 'DEPOSIT_INVALID_REFERENCE' using errcode='22023';end if;
 if length(why)>500 or (action='refund' and length(why)<3) then raise exception 'DEPOSIT_INVALID_REASON' using errcode='22023';end if;
 v_kind:=case action when 'receive' then 'receipt' else 'refund' end;
 normalized:=jsonb_build_object('id',ident,'lease_id',lid,'kind',v_kind,'amount',amount_value::numeric(15,3)::text,
  'on_date',v_date,'method',v_method,'reference',v_ref,'reason',why);
 -- Match the existing financial close/app-state lock order: workspace before lease.
 -- All deposit writes serialize here, so two refund requests cannot spend one balance.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'DEPOSIT_WORKSPACE_UNAVAILABLE' using errcode='22023';end if;
 select * into contract from public.aqari_leases l where l.workspace_id=w and l.id=lid for update;
 if not found or not private.aqari_can_lease(w,lid,'collections','write') or (action='refund' and not private.aqari_manager(w)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into e from private.aqari_deposit_entries x where x.workspace_id=w and x.id=ident;
 if found then
  if e.actor_id<>auth.uid() or e.request_data<>normalized then raise exception 'DEPOSIT_REQUEST_CONFLICT' using errcode='22023';end if;
  -- A successful uncertain request is recoverable after period close/lease expiry.
  return jsonb_build_object('entry',private.aqari_deposit_entry_json(e),'lease',private.aqari_deposit_lease_json(w,lid));
 end if;
 begin
  perform private.aqari_financial_open(w,v_date);
 exception when raise_exception then
  if sqlerrm='الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise exception 'DEPOSIT_PERIOD_CLOSED' using errcode='22023';end if;
  raise;
 end;
 if action='receive' and contract.status<>'signed' then raise exception 'DEPOSIT_SIGNED_CONTRACT_REQUIRED' using errcode='22023';end if;
 if action='receive' and contract.deposit is null then raise exception 'DEPOSIT_DOCUMENTED_AMOUNT_REQUIRED' using errcode='22023';end if;
 lease_json:=private.aqari_deposit_lease_json(w,lid);available:=(lease_json->>'balance')::numeric;
 if action='refund' and amount_value>available then raise exception 'DEPOSIT_REFUND_EXCEEDS_BALANCE' using errcode='22023';end if;
 with dates as (select x.on_date,sum(case x.kind when 'receipt' then x.amount else -x.amount end) delta from private.aqari_deposit_entries x where x.workspace_id=w and x.lease_id=lid group by x.on_date
   union all select v_date,0::numeric), daily as(select on_date,sum(delta) delta from dates group by on_date),
   running as(select on_date,sum(delta) over(order by on_date rows unbounded preceding) balance from daily)
  select min(balance),max(balance) into minimum_balance,maximum_balance from running where on_date>=v_date;
 if action='refund' and amount_value>coalesce(minimum_balance,0) then raise exception 'DEPOSIT_REFUND_DATE_BALANCE' using errcode='22023';end if;
 if action='receive' and coalesce(maximum_balance,0)+amount_value>contract.deposit then raise exception 'DEPOSIT_RECEIPT_EXCEEDS_CONTRACT' using errcode='22023';end if;
 if action='receive' and available+amount_value>contract.deposit then raise exception 'DEPOSIT_RECEIPT_EXCEEDS_CONTRACT' using errcode='22023';end if;
 if v_method<>'cash' and exists(select 1 from private.aqari_deposit_entries x where x.workspace_id=w and x.kind=v_kind and x.method=v_method and lower(x.reference)=lower(v_ref)) then raise exception 'DEPOSIT_REFERENCE_EXISTS' using errcode='22023';end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 v_seq:=nextval('private.aqari_deposit_voucher_seq')::text;
 insert into private.aqari_deposit_entries(id,workspace_id,lease_id,kind,voucher_no,amount,on_date,method,reference,reason,actor_id,actor_name,snapshot,balance_after,request_data)
 values(ident,w,lid,v_kind,(case action when 'receive' then 'DP-' else 'DF-' end)||to_char(v_date,'YYYYMMDD')||'-'||repeat('0',greatest(0,8-length(v_seq)))||v_seq,
  amount_value,v_date,v_method,v_ref,why,auth.uid(),coalesce(actor,auth.uid()::text),
  jsonb_build_object('lease_id',lid,'contract_no',lease_json->>'contract_no','tenant_id',lease_json->>'tenant_id','tenant_name',lease_json->>'tenant_name',
   'property_id',lease_json->>'property_id','property_name',lease_json->>'property_name','unit_id',lease_json->>'unit_id','unit_no',lease_json->>'unit_no'),
  available+(case action when 'receive' then amount_value else -amount_value end),normalized) returning * into e;
 return jsonb_build_object('entry',private.aqari_deposit_entry_json(e),'lease',private.aqari_deposit_lease_json(w,lid));
end $$;
revoke all on function public.aqari_deposit_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_deposit_register(uuid,text,jsonb) to authenticated;
