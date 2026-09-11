-- Isolated development database only. Requires staff-property-scope.sql; no business records seeded.
begin;
create sequence private.aqari_expense_voucher_seq;
create table private.aqari_financial_expenses (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null, expense_date date not null, category text not null, payee text not null,
 amount numeric(12,3) not null check(amount>0), method text not null check(method in ('cash','bank','cheque')),
 reference text not null default '', description text not null default '', document_id uuid references public.aqari_documents(id),
 state text not null default 'draft' check(state in ('draft','approved','cancelled')), revision bigint not null default 1,
 voucher_no text unique, created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 approved_by uuid, approved_by_name text, approved_at timestamptz, approval_reason text,
 cancelled_by uuid, cancelled_by_name text, cancelled_at timestamptz, cancel_reason text,
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(state<>'approved' or (document_id is not null and voucher_no is not null and approved_by is not null and approved_at is not null)),
 check(state<>'cancelled' or (cancelled_by is not null and cancelled_at is not null and length(btrim(cancel_reason))>=3))
);
create index on private.aqari_financial_expenses(workspace_id,expense_date,property_id);
create index on private.aqari_financial_expenses(document_id);
-- A confirmed payment reference cannot book two live expenses in the same workspace.
create unique index aqari_expense_payment_reference on private.aqari_financial_expenses(workspace_id,method,reference)
 where state='approved' and method<>'cash';
create table private.aqari_financial_periods (
 workspace_id uuid not null references public.aqari_workspaces(id), month date not null check(extract(day from month)=1),
 closed_by uuid not null, closed_by_name text not null, closed_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 3 and 500), snapshot jsonb not null,
 primary key(workspace_id,month)
);
create table private.aqari_financial_audit (
 id bigint generated always as identity primary key, workspace_id uuid not null, property_id uuid,
 entity_id text not null, action text not null, actor_id uuid not null, actor_name text not null,
 recorded_at timestamptz not null default now(), reason text, before_value jsonb, after_value jsonb
);
create index on private.aqari_financial_audit(workspace_id,recorded_at desc,id desc);
alter table private.aqari_financial_expenses enable row level security;
alter table private.aqari_financial_periods enable row level security;
alter table private.aqari_financial_audit enable row level security;
revoke all on private.aqari_financial_expenses,private.aqari_financial_periods,private.aqari_financial_audit from public,anon,authenticated;
revoke all on sequence private.aqari_expense_voucher_seq from public,anon,authenticated;

create function private.aqari_financial_open(w uuid,d date) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if d is null then raise exception 'تاريخ العملية المالية مطلوب.';end if;
 -- Same serialization point as app-state payments; period close never takes a
 -- payroll/expense row lock, preventing a close-vs-post check-then-write race.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'مساحة العمل غير متاحة.';end if;
 if exists(select 1 from private.aqari_financial_periods p where p.workspace_id=w and p.month=date_trunc('month',d)::date) then
  raise exception 'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.';
 end if;
end $$;
create function private.aqari_financial_row_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb; b jsonb; w uuid; d date;
begin
 if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new;end if;
 n:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 w:=(n->>'workspace_id')::uuid;
 if tg_op in ('UPDATE','DELETE') then b:=to_jsonb(old);end if;
 if tg_op='UPDATE' and n->>'workspace_id' is distinct from b->>'workspace_id' then raise exception 'لا يمكن نقل السجل المالي إلى مساحة عمل أخرى.';end if;
 if tg_table_name='aqari_hr_events' then
  if n->>'kind'='advance' then perform private.aqari_financial_open(w,(n->>'on_date')::date);end if;
  if b->>'kind'='advance' then perform private.aqari_financial_open(w,(b->>'on_date')::date);end if;
  return case when tg_op='DELETE' then old else new end;
 end if;
 if tg_table_name='aqari_rent_payments' then d:=(n->>'paid_at')::date;
 elsif tg_table_name='aqari_hr_payroll' then d:=(n->>'month')::date;
 else d:=(n->>'expense_date')::date;end if;
 perform private.aqari_financial_open(w,d);
 if tg_op in ('UPDATE','DELETE') then
  if tg_table_name='aqari_rent_payments' then perform private.aqari_financial_open(w,(b->>'paid_at')::date);
  elsif tg_table_name='aqari_hr_payroll' then perform private.aqari_financial_open(w,(b->>'month')::date);
  else perform private.aqari_financial_open(w,(b->>'expense_date')::date);end if;
 end if;
 if tg_table_name='aqari_hr_payroll' then
  if n->>'paid_at' is not null then perform private.aqari_financial_open(w,((n->>'paid_at')::timestamptz at time zone 'Asia/Kuwait')::date);end if;
  if b->>'paid_at' is not null then perform private.aqari_financial_open(w,((b->>'paid_at')::timestamptz at time zone 'Asia/Kuwait')::date);end if;
 end if;
 if tg_table_name='aqari_financial_expenses' and tg_op<>'INSERT' then
  if tg_op='DELETE' or old.state='cancelled' then raise exception 'المصروف محفوظ في الأرشيف ولا يقبل الحذف أو التعديل.';end if;
  if old.state='approved' and (new.state<>'cancelled' or
   (to_jsonb(new)-array['state','revision','updated_at','cancelled_by','cancelled_by_name','cancelled_at','cancel_reason']) is distinct from
   (to_jsonb(old)-array['state','revision','updated_at','cancelled_by','cancelled_by_name','cancelled_at','cancel_reason'])) then
   raise exception 'المصروف المعتمد ثابت؛ التصحيح بإلغاء موثق ثم سجل جديد.';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger v267_financial_period_payment before insert or update or delete on public.aqari_rent_payments for each row execute function private.aqari_financial_row_guard();
create trigger v267_financial_period_payroll before insert or update or delete on private.aqari_hr_payroll for each row execute function private.aqari_financial_row_guard();
create trigger v267_financial_period_advance before insert or update or delete on private.aqari_hr_events for each row execute function private.aqari_financial_row_guard();
create trigger v267_financial_period_expense before insert or update or delete on private.aqari_financial_expenses for each row execute function private.aqari_financial_row_guard();

-- Preserve existing HR bodies while aligning the lock order with scheduled payroll:
-- app-state/workspace first, then employee, then payroll/event. Never lock the
-- employee first and subsequently wait for the period serialization lock.
do $patch$
declare source text; anchor text; replacement text;
begin
 source:=pg_get_functiondef('public.aqari_hr(uuid,text,jsonb)'::regprocedure);
 anchor:=' if p_action=''list'' then';
 replacement:=' if p_action not in (''list'',''get'',''access'') then perform 1 from public.aqari_app_state where workspace_id=w for update; end if;'||chr(10)||anchor;
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'HR financial lock anchor mismatch';end if;
 execute replace(source,anchor,replacement);
 source:=pg_get_functiondef('private.aqari_hr_prepare(uuid,date,uuid)'::regprocedure);
 anchor:=' insert into private.aqari_hr_payroll(workspace_id,employee_id,month,snapshot,basic,allowances)';
 replacement:=' perform 1 from public.aqari_app_state where workspace_id=w for update;'||chr(10)||anchor;
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'Payroll financial lock anchor mismatch';end if;
 execute replace(source,anchor,replacement);
end $patch$;

create function private.aqari_financial_legacy_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb:=private.aqari_unwrap(old.payload); n jsonb:=private.aqari_unwrap(new.payload); k text;
begin
 if coalesce(b->'expenses','[]') is distinct from coalesce(n->'expenses','[]') then
  raise exception 'استخدم سجل المصروفات المعتمدة؛ محفوظات المصروفات السابقة لا تُعدّل.';
 end if;
 if exists(select 1 from private.aqari_financial_periods p where p.workspace_id=new.workspace_id) then
  foreach k in array array['journalEntries','openingBalancesV267','depositReceiptsV267','depositRefundsV267','partnerDistributionsV267','partnerAdjustmentsV267','partnerReservesV267','payroll','bank','cashbox','deposits','advances','invoices'] loop
   if b->k is distinct from n->k then raise exception 'توجد فترة مقفلة؛ لا يمكن تغيير دفتر قديم غير مرتبط بتاريخ قيد معتمد.';end if;
  end loop;
 end if;
 return new;
end $$;
create trigger v267_financial_legacy_guard before update of payload on public.aqari_app_state for each row execute function private.aqari_financial_legacy_guard();

create function public.aqari_financial_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id; d jsonb:=p_data; e private.aqari_financial_expenses; b jsonb; v_month date; v_date date; prop uuid; ident uuid;
 v_amount numeric; v_doc uuid; actor text; why text; k text; allowed text[]; summary jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>16000 then raise exception 'بيانات غير صالحة.';end if;
 allowed:=case p_action when 'list' then array['month'] when 'save' then array['id','revision','property_id','expense_date','category','payee','amount','method','reference','description','document_id']
 when 'approve' then array['id','revision','reason'] when 'cancel' then array['id','revision','reason'] when 'close_period' then array['month','reason'] else null end;
 if allowed is null then raise exception 'عملية غير معروفة.';end if;
 for k in select jsonb_object_keys(d) loop if not(k=any(allowed)) then raise exception 'حقل غير مسموح.';end if;end loop;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);
 if p_action in ('list','close_period') then
  if coalesce(d->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'اختر شهراً صحيحاً.';end if;
  v_month:=((d->>'month')||'-01')::date;
 end if;
 if p_action='list' then
  select jsonb_build_object('approved_expenses',coalesce(sum(x.amount) filter(where x.state='approved'),0)::text,'count',count(*) filter(where x.state='approved')) into summary
  from private.aqari_financial_expenses x where x.workspace_id=w and x.expense_date>=v_month and x.expense_date<(v_month+interval '1 month')::date and private.aqari_can_property(w,x.property_id,'finance','read');
  return jsonb_build_object('manager',private.aqari_manager(w),'can_write',private.aqari_can(w,'finance','write'),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) from public.aqari_properties p where p.workspace_id=w and private.aqari_can_property(w,p.id,'finance','read')),'[]'),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',doc.id,'property_id',p.id,'title',doc.title,'document_no',doc.document_no) order by doc.created_at desc,doc.id) from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref
    where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded' and private.aqari_can(w,'documents','read') and private.aqari_can_property(w,p.id,'finance','read')),'[]'),
   'expenses',coalesce((select jsonb_agg(to_jsonb(x) order by x.expense_date desc,x.created_at desc,x.id) from private.aqari_financial_expenses x where x.workspace_id=w and x.expense_date>=v_month and x.expense_date<(v_month+interval '1 month')::date and private.aqari_can_property(w,x.property_id,'finance','read')),'[]'),
   'period',case when private.aqari_manager(w) then (select to_jsonb(p) from private.aqari_financial_periods p where p.workspace_id=w and p.month=v_month)
    else (select jsonb_build_object('month',p.month,'closed_at',p.closed_at) from private.aqari_financial_periods p where p.workspace_id=w and p.month=v_month) end,
   'history',coalesce((select jsonb_agg(to_jsonb(a) order by a.id desc) from (select x.entity_id,x.action,x.actor_name,x.recorded_at,x.reason,x.id from private.aqari_financial_audit x where x.workspace_id=w and
     (private.aqari_manager(w) or (x.property_id is not null and private.aqari_can_property(w,x.property_id,'finance','read'))) and
     (x.entity_id=v_month::text or exists(select 1 from private.aqari_financial_expenses ex where ex.workspace_id=w and ex.id::text=x.entity_id and ex.expense_date>=v_month and ex.expense_date<(v_month+interval '1 month')::date)) order by x.id desc limit 100) a),'[]'),'summary',summary);
 end if;
 if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='close_period' then
  if not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  why:=btrim(d->>'reason');if why is null or length(why) not between 3 and 500 then raise exception 'سبب الإقفال مطلوب من ٣ إلى ٥٠٠ حرف.';end if;
  if v_month>=date_trunc('month',now() at time zone 'Asia/Kuwait')::date then raise exception 'يمكن إقفال الأشهر المنتهية فقط.';end if;
  if exists(select 1 from private.aqari_financial_periods p where p.workspace_id=w and p.month=v_month) then return public.aqari_financial_register(w,'list',jsonb_build_object('month',d->>'month'));end if;
  if exists(select 1 from private.aqari_financial_expenses x where x.workspace_id=w and x.expense_date>=v_month and x.expense_date<(v_month+interval '1 month')::date and x.state='draft') then raise exception 'توجد مصروفات مسودة في الشهر؛ اعتمدها أو ألغها قبل الإقفال.';end if;
  if exists(select 1 from private.aqari_hr_payroll p where p.workspace_id=w and p.month=v_month and p.state<>'paid') then raise exception 'توجد رواتب غير مكتملة في الشهر؛ لا يمكن الإقفال.';end if;
  summary:=jsonb_build_object('scope','posted_rent_payments_and_approved_expenses_only','rent_payments',
   (select coalesce(sum(p.amount),0) from public.aqari_rent_payments p where p.workspace_id=w and p.paid_at>=v_month and p.paid_at<(v_month+interval '1 month')::date),
   'rent_payment_count',(select count(*) from public.aqari_rent_payments p where p.workspace_id=w and p.paid_at>=v_month and p.paid_at<(v_month+interval '1 month')::date),
   'approved_expenses',(select coalesce(sum(x.amount),0) from private.aqari_financial_expenses x where x.workspace_id=w and x.expense_date>=v_month and x.expense_date<(v_month+interval '1 month')::date and x.state='approved'),
   'approved_expense_count',(select count(*) from private.aqari_financial_expenses x where x.workspace_id=w and x.expense_date>=v_month and x.expense_date<(v_month+interval '1 month')::date and x.state='approved'),
   'legacy_finance_reconciled',false);
  insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot) values(w,v_month,auth.uid(),actor,why,summary);
  insert into private.aqari_financial_audit(workspace_id,entity_id,action,actor_id,actor_name,reason,after_value) values(w,v_month::text,'period.close',auth.uid(),actor,why,summary);
  return public.aqari_financial_register(w,'list',jsonb_build_object('month',d->>'month'));
 end if;
 ident:=(d->>'id')::uuid;if ident is null then raise exception 'معرف المصروف مطلوب.';end if;
 select * into e from private.aqari_financial_expenses x where x.id=ident for update;
 if found and (e.workspace_id<>w or not private.aqari_can_property(w,e.property_id,'finance','write')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if coalesce(e.revision,0) is distinct from (d->>'revision')::bigint then raise exception 'تغير السجل؛ حدّث البيانات قبل الحفظ.' using errcode='40001';end if;
 b:=case when e.id is not null then to_jsonb(e) end;
 if p_action='save' then
  if e.id is not null and e.state<>'draft' then raise exception 'المصروف المعتمد أو الملغى لا يقبل التعديل.';end if;
  prop:=(d->>'property_id')::uuid;
  if prop is null or not private.aqari_can_property(w,prop,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if coalesce(d->>'expense_date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'تاريخ المصروف مطلوب.';end if;
  v_date:=(d->>'expense_date')::date;
  if v_date>(now() at time zone 'Asia/Kuwait')::date then raise exception 'تاريخ المصروف لا يكون مستقبلياً.';end if;
  perform private.aqari_financial_open(w,v_date);
  if e.id is not null then perform private.aqari_financial_open(w,e.expense_date);end if;
  foreach k in array array['category','payee','method'] loop if jsonb_typeof(d->k)<>'string' or nullif(btrim(d->>k),'') is null then raise exception 'أكمل فئة المصروف والمستفيد وطريقة الصرف.';end if;end loop;
  if length(btrim(d->>'category'))>120 or length(btrim(d->>'payee'))>200 or length(coalesce(d->>'reference',''))>200 or length(coalesce(d->>'description',''))>2000 or d->>'method' not in ('cash','bank','cheque') then raise exception 'بيانات المصروف غير صالحة.';end if;
  if d->>'method'<>'cash' and nullif(btrim(d->>'reference'),'') is null then raise exception 'رقم مرجع التحويل أو الشيك مطلوب.';end if;
  v_amount:=private.aqari_hr_money(d->'amount');if v_amount<=0 then raise exception 'مبلغ المصروف يجب أن يكون أكبر من صفر.';end if;
  v_doc:=nullif(d->>'document_id','')::uuid;
  if v_doc is not null and not exists(select 1 from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.id=v_doc and doc.workspace_id=w and doc.entity_type='property' and p.id=prop and doc.status='uploaded') then raise exception 'اختر مستنداً محفوظاً للعقار نفسه.';end if;
  insert into private.aqari_financial_expenses(id,workspace_id,property_id,expense_date,category,payee,amount,method,reference,description,document_id,created_by)
   values(ident,w,prop,v_date,btrim(d->>'category'),btrim(d->>'payee'),v_amount,d->>'method',btrim(coalesce(d->>'reference','')),btrim(coalesce(d->>'description','')),v_doc,auth.uid())
  on conflict(id) do update set property_id=excluded.property_id,expense_date=excluded.expense_date,category=excluded.category,payee=excluded.payee,amount=excluded.amount,method=excluded.method,reference=excluded.reference,description=excluded.description,document_id=excluded.document_id,revision=aqari_financial_expenses.revision+1,updated_at=now()
  returning * into e;
  why:='حفظ مسودة المصروف';
 else
  if e.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  why:=btrim(d->>'reason');if why is null or length(why) not between 3 and 500 then raise exception 'سبب الإجراء مطلوب من ٣ إلى ٥٠٠ حرف.';end if;
  perform private.aqari_financial_open(w,e.expense_date);
  if p_action='approve' then
   if e.state<>'draft' then raise exception 'يُعتمد المصروف المسودة فقط.';end if;
   if e.document_id is null or not exists(select 1 from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref
    join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
    where doc.id=e.document_id and doc.workspace_id=w and doc.entity_type='property' and p.id=e.property_id and doc.status='uploaded' and doc.checksum_sha256 ~ '^[a-f0-9]{64}$'
    and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type) then raise exception 'اربط فاتورة مرفوعة ومؤكد حفظها قبل اعتماد المصروف.';end if;
   update private.aqari_financial_expenses x set state='approved',voucher_no='EX-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_expense_voucher_seq')::text,8,'0'),approved_by=auth.uid(),approved_by_name=actor,approved_at=now(),approval_reason=why,revision=x.revision+1,updated_at=now() where x.id=ident returning * into e;
  else
   if e.state='cancelled' then raise exception 'المصروف ملغى ومحفوظ مسبقاً.';end if;
   update private.aqari_financial_expenses x set state='cancelled',cancelled_by=auth.uid(),cancelled_by_name=actor,cancelled_at=now(),cancel_reason=why,revision=x.revision+1,updated_at=now() where x.id=ident returning * into e;
  end if;
 end if;
 insert into private.aqari_financial_audit(workspace_id,property_id,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,e.property_id,e.id::text,'expense.'||p_action,auth.uid(),actor,why,b,to_jsonb(e));
 return to_jsonb(e);
end $$;
revoke all on function private.aqari_financial_open(uuid,date),private.aqari_financial_row_guard(),private.aqari_financial_legacy_guard(),public.aqari_financial_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_financial_register(uuid,text,jsonb) to authenticated;
commit;
