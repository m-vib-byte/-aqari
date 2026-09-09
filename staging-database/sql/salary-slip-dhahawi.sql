-- V267 Staging only. Detailed salary slip; preserve existing issued salaries and audit.
begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='public.aqari_hr(uuid,text,jsonb)'::regprocedure)<>'5a9d8028c97bc395ff1d46b57ff5b607' then raise exception 'HR_RPC_CHANGED_REVIEW_REQUIRED';end if;
end $$;
alter table private.aqari_hr_payroll add column loan_payment numeric(12,3) not null default 0 check(loan_payment>=0);
alter table private.aqari_hr_payroll add column reward numeric(12,3) not null default 0 check(reward>=0);
alter table private.aqari_hr_payroll add column housing numeric(12,3) not null default 0 check(housing>=0);
alter table private.aqari_hr_payroll add column indemnity numeric(12,3) not null default 0 check(indemnity>=0);
alter table private.aqari_hr_payroll add column holidays numeric(12,3) not null default 0 check(holidays>=0);
alter table private.aqari_hr_payroll add column late numeric(12,3) not null default 0 check(late>=0);
alter table private.aqari_hr_payroll add column absence numeric(12,3) not null default 0 check(absence>=0);
alter table private.aqari_hr_payroll add column slip_details jsonb not null default '{"template":"standard"}';
alter table private.aqari_hr_payroll add column voucher_no text;
alter table private.aqari_hr_payroll add column issued_at timestamptz;
create unique index hr_voucher_number_unique on private.aqari_hr_payroll(workspace_id,voucher_no) where voucher_no is not null;
create sequence private.aqari_hr_voucher_seq;
revoke all on sequence private.aqari_hr_voucher_seq from public,anon,authenticated;
alter table private.aqari_hr_payroll drop column net;
alter table private.aqari_hr_payroll add column net numeric(12,3) generated always as (basic+allowances+overtime+loan_payment+reward+housing+indemnity+holidays-deductions-late-absence-advance_repayment) stored check(net>=0);
create function private.aqari_hr_slip_details(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;
begin
 if jsonb_typeof(v) is distinct from 'object' or coalesce(v->>'template','') not in ('standard','dhahawi-v1') or exists(select 1 from jsonb_object_keys(v) x where x not in ('template','payer_ar','payer_en')) then raise exception 'نموذج سند غير صالح.';end if;
 foreach k in array array['payer_ar','payer_en'] loop
  if v ? k and (jsonb_typeof(v->k) is distinct from 'string' or length(v->>k)>200 or (v->>k) ~ '[<>[:cntrl:]]') then raise exception 'اسم مسؤول صرف غير صالح.';end if;
 end loop;
 return v;
end $$;
revoke all on function private.aqari_hr_slip_details(jsonb) from public,anon,authenticated;
-- Server-side immutability also protects the template and the financial breakdown.
create function private.aqari_hr_freeze_slip() returns trigger language plpgsql set search_path='' as $$
begin
 if old.state<>'draft' and (to_jsonb(new)-array['net','revision','updated_at','state','admin_approval','chairman_approval','paid_at']) is distinct from (to_jsonb(old)-array['net','revision','updated_at','state','admin_approval','chairman_approval','paid_at']) then raise exception 'الراتب الصادر ثابت ولا يمكن تعديل نموذج السند أو بياناته.';end if;
 return new;
end $$;
revoke all on function private.aqari_hr_freeze_slip() from public,anon,authenticated;
create trigger hr_freeze_slip before update on private.aqari_hr_payroll for each row execute function private.aqari_hr_freeze_slip();
create or replace function public.aqari_hr(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id; d jsonb:=p_data; e private.aqari_hr_employees; p private.aqari_hr_payroll; doc private.aqari_hr_documents;
 props uuid[]; profile jsonb; result jsonb; key text; uid uuid; ident uuid; n integer; balance numeric; period date; approval jsonb;
begin
 if not private.aqari_can(w,'employees','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d)<>'object' then raise exception 'بيانات غير صالحة.';end if;
 if p_action='list' then
  return jsonb_build_object('manager',private.aqari_manager(w),'employees',coalesce((select jsonb_agg(to_jsonb(x) order by x.profile->>'name_ar') from private.aqari_hr_employees x where x.workspace_id=w and private.aqari_hr_can(w,x.property_ids,'read')),'[]'),
   'members',case when private.aqari_manager(w) then (select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',q.display_name)) from public.aqari_memberships m left join public.aqari_profiles q on q.user_id=m.user_id where m.workspace_id=w and m.is_active) else '[]'::jsonb end,
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name) order by q.name) from public.aqari_properties q where q.workspace_id=w and private.aqari_hr_can(w,array[q.id],'read')),'[]'));
 end if;
 if p_action in ('access','grant') then
  if not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if p_action='grant' then
   if not private.aqari_can(w,'employees','write') then raise insufficient_privilege using message='SECTION_WRITE_DENIED';end if;
   uid:=(d->>'user_id')::uuid;select array_agg(distinct x::uuid) into props from jsonb_array_elements_text(d->'property_ids') x;
   if not exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=uid and is_active) or cardinality(props) is null
    or exists(select 1 from unnest(props) x where not exists(select 1 from public.aqari_properties where id=x and workspace_id=w)) then raise exception 'اختر حساباً نشطاً وعقاراً محفوظاً.';end if;
   profile:=d->'permissions';
   if jsonb_typeof(profile)<>'object' or (select count(*) from jsonb_object_keys(profile))<>5 then raise exception 'صلاحيات غير مكتملة.';end if;
   foreach key in array array['read','add','edit','approve_admin','approve_chairman'] loop
    if jsonb_typeof(profile->key) is distinct from 'boolean' then raise exception 'صلاحية غير صالحة.';end if;
   end loop;
   -- CAS also covers revocation; read=false revokes all HR access immediately.
   insert into private.aqari_hr_grants(workspace_id,user_id,property_ids,permissions) select w,uid,props,profile where coalesce((d->>'revision')::bigint,0)=0
    on conflict do nothing;
   get diagnostics n=row_count;
   if n=0 then
    update private.aqari_hr_grants set property_ids=props,permissions=profile,revision=revision+1 where workspace_id=w and user_id=uid and revision=(d->>'revision')::bigint;
    get diagnostics n=row_count;if n=0 then raise serialization_failure using message='REVISION_CONFLICT';end if;
   end if;
  end if;
  return jsonb_build_object('members',(select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'name',q.display_name)) from public.aqari_memberships m left join public.aqari_profiles q on q.user_id=m.user_id where m.workspace_id=w and m.is_active),
   'grants',coalesce((select jsonb_agg(to_jsonb(g)) from private.aqari_hr_grants g where g.workspace_id=w),'[]'),
   'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from private.aqari_hr_audit where workspace_id=w and entity='aqari_hr_grants' order by id desc limit 100) x),'[]'));
 end if;
 ident:=(d->>'employee_id')::uuid;
 -- Lock employee first for every mutation; serializes advance repayment and property reassignment.
 select * into e from private.aqari_hr_employees where id=ident and workspace_id=w for update;
 if p_action='save_employee' then
  select array_agg(distinct x::uuid) into props from jsonb_array_elements_text(d->'property_ids') x;
  if cardinality(props) is null or exists(select 1 from unnest(props) x where not exists(select 1 from public.aqari_properties where id=x and workspace_id=w)) then raise exception 'اختر عقاراً محفوظاً واحداً على الأقل.';end if;
  if not private.aqari_hr_can(w,props,case when e.id is null then 'add' else 'edit' end) or (e.id is not null and not private.aqari_hr_can(w,e.property_ids,'edit')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  uid:=case when d ? 'user_id' then nullif(d->>'user_id','')::uuid else e.user_id end;
  if uid is distinct from e.user_id and not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if uid is not null and not exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=uid and is_active) then raise exception 'اختر حساب دخول نشطاً في مساحة العمل.';end if;
  profile:=d->'profile';
  if jsonb_typeof(profile)<>'object' or (select count(*) from jsonb_object_keys(profile)) not between 9 and 10 or exists(select 1 from jsonb_object_keys(profile) k where k not in ('name_ar','name_en','civil_id','passport','nationality','nationality_en','phone','job_ar','job_en','work_location')) then raise exception 'أكمل بيانات الموظف.';end if;
  foreach key in array array['name_ar','name_en','civil_id','passport','nationality','phone','job_ar','job_en','work_location'] loop
   if jsonb_typeof(profile->key) is distinct from 'string' or length(btrim(profile->>key)) not between 1 and 200 or (profile->>key) ~ '[<>[:cntrl:]]' then raise exception 'أكمل جميع الحقول النصية دون رموز HTML.';end if;
  end loop;
  if profile ? 'nationality_en' and (jsonb_typeof(profile->'nationality_en')<>'string' or length(profile->>'nationality_en')>200 or (profile->>'nationality_en') ~ '[<>[:cntrl:]]') then raise exception 'راجع الجنسية بالإنجليزي.';end if;
  if coalesce(d->>'hired_on','') !~ '^\d{4}-\d{2}-\d{2}$' or (d->>'hired_on')::date<'1900-01-01'::date or d->>'status' not in ('active','leave','inactive') then raise exception 'راجع تاريخ التعيين والحالة.';end if;
  if e.id is null then
   if coalesce((d->>'revision')::bigint,0)<>0 then raise serialization_failure using message='REVISION_CONFLICT';end if;
   insert into private.aqari_hr_employees(id,workspace_id,user_id,profile,property_ids,basic,allowances,hired_on,status) values(ident,w,uid,profile,props,private.aqari_hr_money(d->'basic'),private.aqari_hr_money(d->'allowances'),(d->>'hired_on')::date,d->>'status');
  else
   if e.revision is distinct from (d->>'revision')::bigint then raise serialization_failure using message='REVISION_CONFLICT';end if;
   update private.aqari_hr_employees x set user_id=uid,profile=d->'profile',property_ids=props,basic=private.aqari_hr_money(d->'basic'),allowances=private.aqari_hr_money(d->'allowances'),hired_on=(d->>'hired_on')::date,status=d->>'status',revision=x.revision+1,updated_at=now() where x.id=e.id;
  end if;
  select * into e from private.aqari_hr_employees where id=ident;
 else
  if e.id is null or not private.aqari_hr_can(w,e.property_ids,'read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if p_action in ('event','prepare','save_payroll','issue','paid','reserve','finalize') and not private.aqari_hr_can(w,e.property_ids,case when p_action in ('event','prepare','reserve','finalize') then 'add' else 'edit' end) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action in ('event','edit_event') then
  if p_action='edit_event' and not private.aqari_hr_can(w,e.property_ids,'edit') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if d->>'kind' not in ('leave','advance') or length(btrim(d->>'notes')) not between 1 and 1000 then raise exception 'أدخل نوع السجل ومرجعه.';end if;
  if p_action='event' then
  insert into private.aqari_hr_events(id,workspace_id,employee_id,kind,on_date,until_date,amount,notes) values((d->>'id')::uuid,w,e.id,d->>'kind',(d->>'on_date')::date,case when d->>'kind'='leave' then (d->>'until_date')::date end,case when d->>'kind'='advance' then private.aqari_hr_money(d->'amount') end,d->>'notes');
  else
   update private.aqari_hr_events set kind=d->>'kind',on_date=(d->>'on_date')::date,until_date=case when d->>'kind'='leave' then (d->>'until_date')::date end,amount=case when d->>'kind'='advance' then private.aqari_hr_money(d->'amount') end,notes=d->>'notes',revision=revision+1 where id=(d->>'id')::uuid and employee_id=e.id and workspace_id=w and revision=(d->>'revision')::bigint;
   get diagnostics n=row_count;if n=0 then raise serialization_failure using message='REVISION_CONFLICT';end if;
   select coalesce((select sum(amount) from private.aqari_hr_events where employee_id=e.id and kind='advance'),0)-coalesce((select sum(advance_repayment-loan_payment) from private.aqari_hr_payroll where employee_id=e.id and state='paid'),0) into balance;
   if balance<0 then raise exception 'التصحيح يقلل السلف عن الأقساط المصروفة بالفعل.';end if;
  end if;
 elsif p_action='prepare' then
  period:=(d->>'month')::date;
  if period is null or period<'2000-01-01' or period>date_trunc('month',now() at time zone 'Asia/Kuwait')::date+interval '1 month' then raise exception 'اختر شهر راتب صحيحاً.';end if;
  n:=private.aqari_hr_prepare(w,period,e.id);
  if n=0 and not exists(select 1 from private.aqari_hr_payroll where employee_id=e.id and month=period) then raise exception 'راجع حالة الموظف وتاريخ تعيينه.';end if;
 elsif p_action in ('save_payroll','issue','approve_admin','approve_chairman','paid') then
  select * into p from private.aqari_hr_payroll where id=(d->>'payroll_id')::uuid and employee_id=e.id and workspace_id=w for update;
  if p.id is null then raise exception 'الراتب غير موجود.';end if;
  if p.revision is distinct from (d->>'revision')::bigint then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if p_action='save_payroll' then
   if p.state<>'draft' then raise exception 'الراتب الصادر ثابت ولا يمكن تعديله.';end if;
   if d->>'method' not in ('cash','cheque','transfer') or length(coalesce(d->>'reference',''))>120 or length(coalesce(d->>'notes',''))>1000 then raise exception 'راجع طريقة الصرف والمرجع.';end if;
   update private.aqari_hr_payroll set loan_payment=case when d ? 'loan_payment' then private.aqari_hr_money(d->'loan_payment') else p.loan_payment end,reward=case when d ? 'reward' then private.aqari_hr_money(d->'reward') else p.reward end,housing=case when d ? 'housing' then private.aqari_hr_money(d->'housing') else p.housing end,indemnity=case when d ? 'indemnity' then private.aqari_hr_money(d->'indemnity') else p.indemnity end,holidays=case when d ? 'holidays' then private.aqari_hr_money(d->'holidays') else p.holidays end,late=case when d ? 'late' then private.aqari_hr_money(d->'late') else p.late end,absence=case when d ? 'absence' then private.aqari_hr_money(d->'absence') else p.absence end,slip_details=case when d ? 'slip_details' then private.aqari_hr_slip_details(d->'slip_details') else p.slip_details end,overtime=private.aqari_hr_money(d->'overtime'),deductions=private.aqari_hr_money(d->'deductions'),advance_repayment=private.aqari_hr_money(d->'advance_repayment'),method=d->>'method',reference=coalesce(d->>'reference',''),notes=coalesce(d->>'notes',''),revision=revision+1,updated_at=now() where id=p.id;
  elsif p_action='issue' then
   if p.state<>'draft' or (p.method<>'cash' and btrim(p.reference)='') then raise exception 'أكمل مرجع الشيك أو التحويل قبل الإصدار.';end if;
   if p.slip_details->>'template'='dhahawi-v1' and (btrim(coalesce(p.slip_details->>'payer_ar',''))='' or btrim(coalesce(p.slip_details->>'payer_en',''))='') then raise exception 'أكمل اسم مسؤول الصرف بالعربي والإنجليزي في السند.';end if;
   update private.aqari_hr_payroll set issued_at=now(),voucher_no=(case when p.slip_details->>'template'='dhahawi-v1' then 'DT-' else 'AQ-' end)||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_hr_voucher_seq')::text,6,'0'),state='issued',revision=revision+1,updated_at=now() where id=p.id;
  elsif p_action in ('approve_admin','approve_chairman') then
   if not private.aqari_hr_can(w,e.property_ids,p_action) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   if p.state<>'issued' then raise exception 'يلزم إصدار الراتب أولاً.';end if;
   if (p_action='approve_admin' and p.admin_approval is not null) or (p_action='approve_chairman' and p.chairman_approval is not null) then raise exception 'الاعتماد محفوظ بالفعل.';end if;
   if (p_action='approve_admin' and p.chairman_approval->>'user_id'=auth.uid()::text) or (p_action='approve_chairman' and p.admin_approval->>'user_id'=auth.uid()::text) then raise exception 'يلزم حساب مختلف للاعتماد الثاني.';end if;
   select jsonb_build_object('user_id',auth.uid(),'name',coalesce(display_name,auth.uid()::text),'at',now()) into approval from public.aqari_profiles where user_id=auth.uid();
   update private.aqari_hr_payroll set admin_approval=case when p_action='approve_admin' then approval else admin_approval end,chairman_approval=case when p_action='approve_chairman' then approval else chairman_approval end,revision=revision+1,updated_at=now() where id=p.id;
  else
   if p.state<>'issued' or p.admin_approval is null or p.chairman_approval is null or not exists(select 1 from private.aqari_hr_documents where payroll_id=p.id and status='ready' and attestations='{"signature":true,"fingerprint":true,"stamp":true}'::jsonb) then raise exception 'يلزم الاعتمادان والنسخة الموقعة مع البصمة والختم قبل إثبات الصرف.';end if;
   select coalesce((select sum(amount) from private.aqari_hr_events where employee_id=e.id and kind='advance'),0)-coalesce((select sum(advance_repayment-loan_payment) from private.aqari_hr_payroll where employee_id=e.id and state='paid'),0) into balance;
   if p.advance_repayment>balance then raise exception 'قسط السلفة يتجاوز الرصيد المتبقي.';end if;
   update private.aqari_hr_payroll set state='paid',paid_at=now(),revision=revision+1,updated_at=now() where id=p.id;
  end if;
 elsif p_action='reserve' then
  if d->>'kind' not in ('document','employment_contract','signed_salary') or length(coalesce(d->>'filename','')) not between 1 and 200 or (d->>'filename')~'[/\\[:cntrl:]]' then raise exception 'اسم أو نوع المستند غير صالح.';end if;
  if d->>'kind'='signed_salary' then
   select * into p from private.aqari_hr_payroll where id=(d->>'payroll_id')::uuid and employee_id=e.id and workspace_id=w;
   if p.id is null or p.state='draft' then raise exception 'أصدر الراتب قبل رفع نسخته الموقعة.';end if;
  end if;
  uid:=(d->>'id')::uuid;
  insert into private.aqari_hr_documents(id,workspace_id,employee_id,payroll_id,kind,filename,mime_type,size_bytes,storage_path,created_by)
  values(uid,w,e.id,p.id,d->>'kind',d->>'filename',d->>'mime_type',(d->>'size_bytes')::bigint,w::text||'/'||e.id::text||'/'||case when p.id is not null then to_char(p.month,'YYYY/MM')||'/' else 'documents/' end||uid::text,auth.uid()) on conflict(id) do nothing;
  select * into doc from private.aqari_hr_documents where id=uid and employee_id=e.id and workspace_id=w and created_by=auth.uid();
  if doc.id is null or doc.filename<>d->>'filename' or doc.mime_type<>d->>'mime_type' or doc.size_bytes<>(d->>'size_bytes')::bigint or doc.payroll_id is distinct from p.id or doc.kind<>d->>'kind' then raise exception 'تعارض مرجع الرفع.';end if;
  return to_jsonb(doc);
 elsif p_action='finalize' then
  select * into doc from private.aqari_hr_documents where id=(d->>'id')::uuid and employee_id=e.id and workspace_id=w for update;
  if doc.id is null then raise exception 'المستند غير موجود.';end if;
  if doc.status='ready' then return to_jsonb(doc);end if;
  if doc.kind='signed_salary' and d->'attestations' is distinct from '{"signature":true,"fingerprint":true,"stamp":true}'::jsonb then raise exception 'أكد وجود التوقيع والبصمة وختم الإدارة في النسخة الفعلية.';end if;
  if not exists(select 1 from storage.objects where bucket_id='aqari-hr-private' and name=doc.storage_path and (metadata->>'size')::bigint=doc.size_bytes and metadata->>'mimetype'=doc.mime_type) then raise exception 'STORED_FILE_NOT_CONFIRMED';end if;
  update private.aqari_hr_documents set status='ready',uploaded_at=now(),attestations=case when kind='signed_salary' then d->'attestations' else '{}' end where id=doc.id returning * into doc;
  return to_jsonb(doc);
 elsif p_action not in ('get','save_employee') then raise exception 'عملية غير معروفة.';
 end if;
 select coalesce((select sum(amount) from private.aqari_hr_events where employee_id=e.id and kind='advance'),0)-coalesce((select sum(advance_repayment-loan_payment) from private.aqari_hr_payroll where employee_id=e.id and state='paid'),0) into balance;
 return jsonb_build_object('employee',to_jsonb(e),'advance_balance',balance,
  'permissions',jsonb_build_object('read',true,'add',private.aqari_hr_can(w,e.property_ids,'add'),'edit',private.aqari_hr_can(w,e.property_ids,'edit'),'approve_admin',private.aqari_hr_can(w,e.property_ids,'approve_admin'),'approve_chairman',private.aqari_hr_can(w,e.property_ids,'approve_chairman')),
  'payroll',coalesce((select jsonb_agg(to_jsonb(x) order by x.month desc) from private.aqari_hr_payroll x where employee_id=e.id),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.on_date desc) from private.aqari_hr_events x where employee_id=e.id),'[]'),
  'documents',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from private.aqari_hr_documents x where employee_id=e.id),'[]'),
  'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select * from private.aqari_hr_audit where workspace_id=w and employee_id=e.id order by id desc limit 100) x),'[]'));
end $$;
commit;
