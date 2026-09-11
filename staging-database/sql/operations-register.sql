-- AQARI V267 controlled operations RPC.
-- CODE ONLY: review and apply to isolated Staging after operations-completion.sql.
begin;

alter table private.aqari_legal_costs
 add column document_id uuid references public.aqari_documents(id);
alter table private.aqari_petty_cash_entries
 add column document_id uuid references public.aqari_documents(id);

create table private.aqari_tenant_adjustments(
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null,
 kind text not null check(kind in ('cheque_return','legal_cost','common_charge','manual_correction')),
 direction text not null check(direction in ('debit','credit')),
 amount numeric(15,3) not null check(amount>0), occurred_on date not null,
 source_type text not null, source_id uuid not null, reason text not null,
 actor_id uuid not null, created_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,source_type,source_id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
);
alter table private.aqari_tenant_adjustments enable row level security;
revoke all on private.aqari_tenant_adjustments from public,anon,authenticated;

create table private.aqari_operations_audit(
 id bigint generated always as identity primary key, workspace_id uuid not null,
 domain text not null, entity_id uuid not null, action text not null,
 actor_id uuid not null, actor_name text not null, reason text not null default '',
 recorded_at timestamptz not null default now(), before_value jsonb, after_value jsonb not null
);
create index aqari_operations_audit_scope on private.aqari_operations_audit(workspace_id,recorded_at desc,id desc);
alter table private.aqari_operations_audit enable row level security;
revoke all on private.aqari_operations_audit from public,anon,authenticated;

create trigger aqari_tenant_adjustments_immutable before update or delete on private.aqari_tenant_adjustments
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_operations_audit_immutable before update or delete on private.aqari_operations_audit
 for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_operations_document(w uuid,p uuid,d uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select d is not null and exists(
  select 1 from public.aqari_documents doc
  join public.aqari_properties prop on prop.workspace_id=doc.workspace_id and prop.external_ref=doc.entity_ref
  join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  where doc.id=d and doc.workspace_id=w and doc.entity_type='property' and prop.id=p
   and doc.status='uploaded' and doc.checksum_sha256 ~ '^[a-f0-9]{64}$' and doc.size_bytes>0
   and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type
 )
$$;
revoke all on function private.aqari_operations_document(uuid,uuid,uuid) from public,anon,authenticated;

create function private.aqari_operations_expense(
 w uuid,p uuid,d date,category text,payee text,amount numeric,reference text,
 description text,document_id uuid,expense_id uuid,actor_name text
) returns private.aqari_financial_expenses
language plpgsql volatile security definer set search_path='' as $$
declare e private.aqari_financial_expenses;
begin
 perform private.aqari_financial_open(w,d);
 if not private.aqari_operations_document(w,p,document_id) then
  raise exception 'DOCUMENT_REQUIRED_AND_UNVERIFIED' using errcode='23514';
 end if;
 insert into private.aqari_financial_expenses(
  id,workspace_id,property_id,expense_date,category,payee,amount,method,reference,description,document_id,
  state,revision,voucher_no,created_by,approved_by,approved_by_name,approved_at,approval_reason
 ) values(
  expense_id,w,p,d,category,payee,amount,'bank',reference,description,document_id,
  'approved',1,'EX-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_expense_voucher_seq')::text,8,'0'),
  auth.uid(),auth.uid(),actor_name,now(),'اعتماد آلي مرتبط بسجل تشغيلي معتمد'
 ) returning * into e;
 return e;
end $$;
revoke all on function private.aqari_operations_expense(uuid,uuid,date,text,text,numeric,text,text,uuid,uuid,text) from public,anon,authenticated;

create function public.aqari_operations_register(
 p_workspace_id uuid,p_domain text,p_action text,p_data jsonb default '{}'
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=p_data; ident uuid; expected integer; before_row jsonb; after_row jsonb;
 actor text; why text; now_date date:=(now() at time zone 'Asia/Kuwait')::date;
 cheque private.aqari_cheques; vendor private.aqari_vendors; work_order private.aqari_work_orders;
 legal_case private.aqari_legal_cases; fund private.aqari_petty_cash_funds; entry private.aqari_petty_cash_entries;
 expense private.aqari_financial_expenses; property_id uuid; lease_id uuid; document_id uuid; expense_id uuid;
 amount_value numeric(15,3); next_state text; from_state text; event_id uuid; result jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if p_action<>'list' then perform private.aqari_require_sensitive_aal2(w); end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>32000 then raise exception 'INVALID_OPERATION_DATA' using errcode='22023'; end if;
 if p_domain not in ('overview','cheques','vendors','work_orders','legal_cases','petty_cash') then raise exception 'INVALID_OPERATION_DOMAIN' using errcode='22023'; end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 if p_action='list' then
  return case p_domain
   when 'overview' then jsonb_build_object(
    'health',public.aqari_operations_health(w),
    'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=w),
    'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'name',coalesce(doc.document_no||' — ','')||doc.title,'property_id',p.id) order by doc.created_at desc),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded'),
    'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'tenant_id',l.tenant_id,'unit_id',l.unit_id,'status',l.status) order by l.contract_no),'[]') from public.aqari_leases l where l.workspace_id=w),
    'vendors',(select coalesce(jsonb_agg(to_jsonb(v) order by v.name),'[]') from private.aqari_vendors v where v.workspace_id=w and v.status<>'archived'),
    'funds',(select coalesce(jsonb_agg(to_jsonb(f) order by f.name),'[]') from private.aqari_petty_cash_funds f where f.workspace_id=w),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]') from (select * from private.aqari_operations_audit a where a.workspace_id=w order by a.id desc limit 100) a)
   )
   when 'cheques' then jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(c) order by c.due_on,c.id),'[]') from private.aqari_cheques c where c.workspace_id=w),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at desc,e.id),'[]') from private.aqari_cheque_events e where e.workspace_id=w))
   when 'vendors' then jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(v) order by v.name,v.id),'[]') from private.aqari_vendors v where v.workspace_id=w),
    'contracts',(select coalesce(jsonb_agg(to_jsonb(c) order by c.ends_on,c.id),'[]') from private.aqari_vendor_contracts c where c.workspace_id=w))
   when 'work_orders' then jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc,o.id),'[]') from private.aqari_work_orders o where o.workspace_id=w))
   when 'legal_cases' then jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(c) order by c.opened_on desc,c.id),'[]') from private.aqari_legal_cases c where c.workspace_id=w),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurs_at desc,e.id),'[]') from private.aqari_legal_case_events e where e.workspace_id=w),
    'costs',(select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_on desc,c.id),'[]') from private.aqari_legal_costs c where c.workspace_id=w))
   when 'petty_cash' then jsonb_build_object('funds',(select coalesce(jsonb_agg(to_jsonb(f) order by f.name,f.id),'[]') from private.aqari_petty_cash_funds f where f.workspace_id=w),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]') from private.aqari_petty_cash_entries e where e.workspace_id=w))
  end;
 end if;

 ident:=nullif(d->>'id','')::uuid;
 if ident is null then raise exception 'OPERATION_ID_REQUIRED' using errcode='22023'; end if;
 why:=btrim(coalesce(d->>'reason',''));
 if p_action not in ('create','save') and length(why)<3 then raise exception 'OPERATION_REASON_REQUIRED' using errcode='22023'; end if;

 if p_domain='cheques' then
  if not private.aqari_can(w,'collections','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_action='create' then
   lease_id:=nullif(d->>'lease_id','')::uuid; amount_value:=private.aqari_hr_money(d->'amount');
   if not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=lease_id) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
   if coalesce(d->>'kind','') not in ('postdated','guarantee') or length(btrim(coalesce(d->>'cheque_no','')))<2 or length(btrim(coalesce(d->>'bank_name','')))<2 or coalesce(d->>'due_on','') !~ '^\d{4}-\d{2}-\d{2}$' or amount_value<=0 then raise exception 'INVALID_CHEQUE_DATA' using errcode='22023'; end if;
   insert into private.aqari_cheques(id,workspace_id,lease_id,cheque_no,bank_name,kind,amount,due_on,created_by)
    values(ident,w,lease_id,btrim(d->>'cheque_no'),btrim(d->>'bank_name'),d->>'kind',amount_value,(d->>'due_on')::date,auth.uid()) returning * into cheque;
   after_row:=to_jsonb(cheque);
  elsif p_action='transition' then
   expected:=(d->>'revision')::integer; event_id:=nullif(d->>'event_id','')::uuid; next_state:=d->>'state';
   select * into cheque from private.aqari_cheques c where c.workspace_id=w and c.id=ident for update;
   if not found then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
   if cheque.revision is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT'; end if;
   from_state:=cheque.state;
   if not ((from_state='scheduled' and next_state in ('deposited','cancelled')) or (from_state='deposited' and next_state in ('cleared','returned')) or (from_state='returned' and next_state in ('redeposited','settled','cancelled')) or (from_state='redeposited' and next_state in ('cleared','returned'))) then raise exception 'INVALID_CHEQUE_TRANSITION' using errcode='23514'; end if;
   if next_state in ('deposited','cleared','returned','redeposited') and length(btrim(coalesce(d->>'bank_reference','')))<3 then raise exception 'CHEQUE_REFERENCE_REQUIRED' using errcode='22023'; end if;
   if event_id is null then raise exception 'CHEQUE_EVENT_ID_REQUIRED' using errcode='22023'; end if;
   if exists(select 1 from private.aqari_cheque_events e where e.id=event_id) then raise exception 'DUPLICATE_OPERATION' using errcode='23505'; end if;
   before_row:=to_jsonb(cheque);
   update private.aqari_cheques c set state=next_state,renewal_frozen=case when next_state='returned' then true when next_state in ('cleared','settled') then false else c.renewal_frozen end,revision=c.revision+1,updated_at=now() where c.id=ident returning * into cheque;
   insert into private.aqari_cheque_events(id,workspace_id,cheque_id,from_state,to_state,occurred_at,bank_reference,reason,debt_adjustment,actor_id,actor_name,snapshot)
    values(event_id,w,ident,from_state,next_state,now(),btrim(coalesce(d->>'bank_reference','')),why,case when next_state='returned' then cheque.amount else 0 end,auth.uid(),actor,to_jsonb(cheque));
   if next_state='returned' then
    insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
     values(event_id,w,cheque.lease_id,'cheque_return','debit',cheque.amount,now_date,'cheque_event',event_id,why,auth.uid()) on conflict(workspace_id,source_type,source_id) do nothing;
   end if;
   after_row:=to_jsonb(cheque);
  else raise exception 'INVALID_CHEQUE_ACTION' using errcode='22023'; end if;

 elsif p_domain='vendors' then
  if not private.aqari_can(w,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_action<>'save' then raise exception 'INVALID_VENDOR_ACTION' using errcode='22023'; end if;
  select * into vendor from private.aqari_vendors v where v.workspace_id=w and v.id=ident for update;
  expected:=coalesce((d->>'revision')::integer,0); if coalesce(vendor.revision,0) is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT'; end if;
  if length(btrim(coalesce(d->>'name',''))) not between 2 and 200 or coalesce(d->>'status','active') not in ('active','suspended','archived') then raise exception 'INVALID_VENDOR_DATA' using errcode='22023'; end if;
  before_row:=case when vendor.id is null then null else to_jsonb(vendor) end;
  if vendor.id is null then
   insert into private.aqari_vendors(id,workspace_id,name,civil_or_license_no,phone,email,status,rating,rating_basis,created_by)
    values(ident,w,btrim(d->>'name'),btrim(coalesce(d->>'license_no','')),btrim(coalesce(d->>'phone','')),nullif(btrim(coalesce(d->>'email','')),''),coalesce(d->>'status','active'),nullif(d->>'rating','')::numeric,btrim(coalesce(d->>'rating_basis','')),auth.uid()) returning * into vendor;
  else
   update private.aqari_vendors v set name=btrim(d->>'name'),civil_or_license_no=btrim(coalesce(d->>'license_no','')),phone=btrim(coalesce(d->>'phone','')),email=nullif(btrim(coalesce(d->>'email','')),''),status=coalesce(d->>'status','active'),rating=nullif(d->>'rating','')::numeric,rating_basis=btrim(coalesce(d->>'rating_basis','')),revision=v.revision+1,updated_at=now()
    where v.workspace_id=w and v.id=ident returning * into vendor;
  end if;
  after_row:=to_jsonb(vendor);

 elsif p_domain='work_orders' then
  if not private.aqari_can(w,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_action='create' then
   property_id:=nullif(d->>'property_id','')::uuid;
   if not private.aqari_can_property(w,property_id,'maintenance','write') or not exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=(d->>'vendor_id')::uuid and v.status='active') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
   amount_value:=private.aqari_hr_money(d->'approved_amount');
   if length(btrim(coalesce(d->>'order_no','')))<2 or length(btrim(coalesce(d->>'description',''))) not between 3 and 5000 or amount_value<0 then raise exception 'INVALID_WORK_ORDER_DATA' using errcode='22023'; end if;
   insert into private.aqari_work_orders(id,workspace_id,property_id,maintenance_request_id,vendor_id,vendor_contract_id,order_no,description,approved_amount,created_by)
    values(ident,w,property_id,nullif(d->>'maintenance_request_id','')::uuid,(d->>'vendor_id')::uuid,nullif(d->>'vendor_contract_id','')::uuid,btrim(d->>'order_no'),btrim(d->>'description'),amount_value,auth.uid()) returning * into work_order;
   after_row:=to_jsonb(work_order);
  elsif p_action='status' then
   expected:=(d->>'revision')::integer; next_state:=d->>'state'; select * into work_order from private.aqari_work_orders o where o.workspace_id=w and o.id=ident for update;
   if not found then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
   if work_order.revision is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT'; end if;
   if not ((work_order.status='draft' and next_state in ('approved','cancelled')) or (work_order.status='approved' and next_state in ('assigned','cancelled')) or (work_order.status='assigned' and next_state in ('in_progress','cancelled')) or (work_order.status='in_progress' and next_state in ('completed','cancelled'))) then raise exception 'INVALID_WORK_ORDER_TRANSITION' using errcode='23514'; end if;
   before_row:=to_jsonb(work_order);
   update private.aqari_work_orders o set status=next_state,approved_by=case when next_state='approved' then auth.uid() else o.approved_by end,approved_at=case when next_state='approved' then now() else o.approved_at end,completed_at=case when next_state='completed' then now() else o.completed_at end,revision=o.revision+1 where o.id=ident returning * into work_order;
   after_row:=to_jsonb(work_order);
  elsif p_action='invoice' then
   expected:=(d->>'revision')::integer; select * into work_order from private.aqari_work_orders o where o.workspace_id=w and o.id=ident for update;
   if not found or work_order.status<>'completed' then raise exception 'WORK_ORDER_NOT_COMPLETED' using errcode='23514'; end if;
   if work_order.revision is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT'; end if;
   if work_order.invoice_id is not null then raise exception 'WORK_ORDER_ALREADY_INVOICED' using errcode='23505'; end if;
   amount_value:=private.aqari_hr_money(d->'amount'); document_id:=nullif(d->>'document_id','')::uuid; expense_id:=nullif(d->>'expense_id','')::uuid;
   if amount_value<=0 or amount_value>work_order.approved_amount or length(btrim(coalesce(d->>'invoice_id','')))<2 or length(btrim(coalesce(d->>'reference','')))<3 then raise exception 'INVALID_WORK_ORDER_INVOICE' using errcode='22023'; end if;
   select * into vendor from private.aqari_vendors v where v.workspace_id=w and v.id=work_order.vendor_id;
   before_row:=to_jsonb(work_order);
   expense:=private.aqari_operations_expense(w,work_order.property_id,now_date,'أمر شغل وصيانة',vendor.name,amount_value,btrim(d->>'reference'),'فاتورة أمر الشغل '||work_order.order_no,document_id,expense_id,actor);
   update private.aqari_work_orders o set invoice_id=btrim(d->>'invoice_id'),invoice_amount=amount_value,expense_key='expense:'||expense.id::text,revision=o.revision+1 where o.id=ident returning * into work_order;
   after_row:=to_jsonb(work_order)||jsonb_build_object('expense',to_jsonb(expense));
  else raise exception 'INVALID_WORK_ORDER_ACTION' using errcode='22023'; end if;

 elsif p_domain='legal_cases' then
  if not private.aqari_can(w,'legal','write') and not private.aqari_can(w,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_action='create' then
   lease_id:=nullif(d->>'lease_id','')::uuid;
   if not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=lease_id) or length(btrim(coalesce(d->>'case_no','')))<2 or length(btrim(coalesce(d->>'court','')))<2 or length(btrim(coalesce(d->>'kind','')))<2 then raise exception 'INVALID_LEGAL_CASE_DATA' using errcode='22023'; end if;
   insert into private.aqari_legal_cases(id,workspace_id,lease_id,case_no,court,kind,opened_on,summary,created_by)
    values(ident,w,lease_id,btrim(d->>'case_no'),btrim(d->>'court'),btrim(d->>'kind'),coalesce(nullif(d->>'opened_on','')::date,now_date),btrim(coalesce(d->>'summary','')),auth.uid()) returning * into legal_case;
   after_row:=to_jsonb(legal_case);
  elsif p_action='event' then
   event_id:=nullif(d->>'event_id','')::uuid; select * into legal_case from private.aqari_legal_cases c where c.workspace_id=w and c.id=ident for update;
   if not found or d->>'kind' not in ('hearing','filing','judgment','appeal','note','status_change') or length(btrim(coalesce(d->>'title','')))<2 then raise exception 'INVALID_LEGAL_EVENT' using errcode='22023'; end if;
   insert into private.aqari_legal_case_events(id,workspace_id,case_id,kind,occurs_at,title,details,document_id,actor_id)
    values(event_id,w,ident,d->>'kind',coalesce(nullif(d->>'occurs_at','')::timestamptz,now()),btrim(d->>'title'),btrim(coalesce(d->>'details','')),nullif(d->>'document_id','')::uuid,auth.uid());
   after_row:=jsonb_build_object('id',event_id,'case_id',ident,'kind',d->>'kind');
  elsif p_action='cost' then
   event_id:=nullif(d->>'cost_id','')::uuid; expense_id:=nullif(d->>'expense_id','')::uuid; document_id:=nullif(d->>'document_id','')::uuid;
   select * into legal_case from private.aqari_legal_cases c where c.workspace_id=w and c.id=ident for update;
   if not found then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
   amount_value:=private.aqari_hr_money(d->'amount');
   select u.property_id into property_id from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=legal_case.lease_id;
   if amount_value<=0 or d->>'kind' not in ('court_fee','lawyer_fee','expert_fee','execution_fee','other') or ((d->>'charge_to_tenant')::boolean and length(btrim(coalesce(d->>'legal_basis','')))<5) then raise exception 'INVALID_LEGAL_COST' using errcode='22023'; end if;
   expense:=private.aqari_operations_expense(w,property_id,coalesce(nullif(d->>'occurred_on','')::date,now_date),'مصاريف قضائية',btrim(coalesce(d->>'payee','جهة قضائية أو قانونية')),amount_value,btrim(d->>'reference'),'مصاريف القضية '||legal_case.case_no,document_id,expense_id,actor);
   insert into private.aqari_legal_costs(id,workspace_id,case_id,lease_id,amount,occurred_on,kind,charge_to_tenant,legal_basis,approved_by,approved_at,expense_key,document_id,actor_id)
    values(event_id,w,ident,legal_case.lease_id,amount_value,coalesce(nullif(d->>'occurred_on','')::date,now_date),d->>'kind',coalesce((d->>'charge_to_tenant')::boolean,false),btrim(coalesce(d->>'legal_basis','')),auth.uid(),now(),'expense:'||expense.id::text,document_id,auth.uid());
   if coalesce((d->>'charge_to_tenant')::boolean,false) then insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
    values(event_id,w,legal_case.lease_id,'legal_cost','debit',amount_value,coalesce(nullif(d->>'occurred_on','')::date,now_date),'legal_cost',event_id,btrim(d->>'legal_basis'),auth.uid()); end if;
   after_row:=jsonb_build_object('id',event_id,'expense',to_jsonb(expense));
  else raise exception 'INVALID_LEGAL_ACTION' using errcode='22023'; end if;

 elsif p_domain='petty_cash' then
  if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_action='create' then
   amount_value:=private.aqari_hr_money(d->'ceiling');
   if length(btrim(coalesce(d->>'name','')))<2 or amount_value<=0 then raise exception 'INVALID_PETTY_CASH_FUND' using errcode='22023'; end if;
   insert into private.aqari_petty_cash_funds(id,workspace_id,custodian_id,name,ceiling)
    values(ident,w,nullif(d->>'custodian_id','')::uuid,btrim(d->>'name'),amount_value) returning * into fund;
   after_row:=to_jsonb(fund);
  elsif p_action='entry' then
   event_id:=nullif(d->>'entry_id','')::uuid; select * into fund from private.aqari_petty_cash_funds f where f.workspace_id=w and f.id=ident for update;
   if not found or fund.status<>'open' then raise exception 'PETTY_CASH_FUND_NOT_OPEN' using errcode='23514'; end if;
   amount_value:=private.aqari_hr_money(d->'amount'); next_state:=d->>'kind'; before_row:=to_jsonb(fund);
   if next_state not in ('fund','spend','settle') or amount_value<=0 then raise exception 'INVALID_PETTY_CASH_ENTRY' using errcode='22023'; end if;
   if next_state='fund' and fund.balance+amount_value>fund.ceiling then raise exception 'PETTY_CASH_CEILING' using errcode='23514'; end if;
   if next_state in ('spend','settle') and fund.balance<amount_value then raise exception 'PETTY_CASH_INSUFFICIENT' using errcode='23514'; end if;
   if next_state='spend' then
    property_id:=nullif(d->>'property_id','')::uuid; document_id:=nullif(d->>'document_id','')::uuid; expense_id:=nullif(d->>'expense_id','')::uuid;
    expense:=private.aqari_operations_expense(w,property_id,now_date,btrim(coalesce(d->>'category','مصروف عهدة')),actor,amount_value,btrim(d->>'reference'),'مصروف من العهدة '||fund.name,document_id,expense_id,actor);
   end if;
   update private.aqari_petty_cash_funds f set balance=case when next_state='fund' then f.balance+amount_value else f.balance-amount_value end,revision=f.revision+1 where f.id=ident returning * into fund;
   insert into private.aqari_petty_cash_entries(id,workspace_id,fund_id,kind,amount,balance_after,invoice_id,property_id,approved_by,approved_at,document_id,actor_id,snapshot)
    values(event_id,w,ident,next_state,amount_value,fund.balance,nullif(d->>'invoice_id',''),property_id,case when next_state='spend' then auth.uid() end,case when next_state='spend' then now() end,document_id,auth.uid(),jsonb_build_object('fund',to_jsonb(fund),'expense',to_jsonb(expense)));
   after_row:=to_jsonb(fund)||jsonb_build_object('entry_id',event_id,'expense',to_jsonb(expense));
  else raise exception 'INVALID_PETTY_CASH_ACTION' using errcode='22023'; end if;
 else raise exception 'OVERVIEW_READ_ONLY' using errcode='22023'; end if;

 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,p_domain,ident,p_action,auth.uid(),actor,why,before_row,after_row);
 return after_row;
end $$;

revoke all on function private.aqari_operations_document(uuid,uuid,uuid),
 private.aqari_operations_expense(uuid,uuid,date,text,text,numeric,text,text,uuid,uuid,text),
 public.aqari_operations_register(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_operations_register(uuid,text,text,jsonb) to authenticated;
commit;
