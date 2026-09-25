-- AQARI V267: fail closed before casting the monthly payroll property scope to uuid.
-- This is additive: it replaces only the existing HR cycle function definition and does not mutate business rows.
create or replace function public.aqari_hr_cycle(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id; d jsonb:=coalesce(p_data,'{}'::jsonb); e private.aqari_hr_employees;
 r private.aqari_hr_records; p private.aqari_hr_payroll; s private.aqari_hr_salary_registry;
 ident uuid; property uuid; period date; props uuid[]; payload jsonb; n integer; expected bigint; total_share numeric;
begin
 if auth.uid() is null or jsonb_typeof(d)<>'object' then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 ident:=nullif(d->>'employee_id','')::uuid;
 if ident is not null then select * into e from private.aqari_hr_employees where workspace_id=w and id=ident for update; end if;

 if p_action='context' then
  if not private.aqari_can(w,'employees','read') and not exists(select 1 from private.aqari_hr_employees x where x.workspace_id=w and x.user_id=auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return jsonb_build_object(
   'manager',private.aqari_manager(w),
   'self_employee_id',(select id from private.aqari_hr_employees x where x.workspace_id=w and x.user_id=auth.uid()),
   'employees',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'profile',x.profile,'status',x.status,'property_ids',x.property_ids,'basic',x.basic,'allowances',x.allowances) order by x.profile->>'name_ar')
     from private.aqari_hr_employees x where x.workspace_id=w and (x.user_id=auth.uid() or private.aqari_hr_can(w,x.property_ids,'read'))),'[]'::jsonb),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'metadata',q.metadata) order by q.name) from public.aqari_properties q where q.workspace_id=w and (private.aqari_manager(w) or private.aqari_hr_can(w,array[q.id],'read'))),'[]'::jsonb),
   'expiry_alerts',coalesce((select jsonb_agg(z order by z.expires_on) from (
      select x.id as employee_id,x.profile->>'name_ar' employee_name,'civil_id' kind,a.civil_expires_on expires_on from private.aqari_hr_employee_details a join private.aqari_hr_employees x on x.id=a.employee_id where a.workspace_id=w and a.civil_expires_on<=current_date+60 and private.aqari_hr_can(w,x.property_ids,'read')
      union all select x.id,x.profile->>'name_ar','passport',a.passport_expires_on from private.aqari_hr_employee_details a join private.aqari_hr_employees x on x.id=a.employee_id where a.workspace_id=w and a.passport_expires_on<=current_date+60 and private.aqari_hr_can(w,x.property_ids,'read')
      union all select x.id,x.profile->>'name_ar','work_permit',a.work_permit_expires_on from private.aqari_hr_employee_details a join private.aqari_hr_employees x on x.id=a.employee_id where a.workspace_id=w and a.work_permit_expires_on<=current_date+60 and private.aqari_hr_can(w,x.property_ids,'read')
    ) z),'[]'::jsonb)
  );
 end if;

 if e.id is null or not private.aqari_hr_cycle_can(w,e.id,'read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;

 if p_action='employee' then
  return jsonb_build_object('employee',to_jsonb(e),
   'details',coalesce((select to_jsonb(x) from private.aqari_hr_employee_details x where x.employee_id=e.id),'{}'::jsonb),
   'allocations',coalesce((select jsonb_agg(to_jsonb(x) order by property_id) from private.aqari_hr_cost_allocations x where x.employee_id=e.id and x.active),'[]'::jsonb),
   'records',coalesce((select jsonb_agg(to_jsonb(x) order by starts_at desc) from private.aqari_hr_records x where x.employee_id=e.id),'[]'::jsonb),
   'documents',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('metadata',coalesce((select to_jsonb(m) from private.aqari_hr_document_metadata m where m.document_id=x.id),'{}'::jsonb)) order by x.created_at desc) from private.aqari_hr_documents x where x.employee_id=e.id),'[]'::jsonb),
   'payroll',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('registry',coalesce((select jsonb_agg(to_jsonb(g) order by g.version desc) from private.aqari_hr_salary_registry g where g.payroll_id=x.id),'[]'::jsonb)) order by x.month desc) from private.aqari_hr_payroll x where x.employee_id=e.id),'[]'::jsonb),
   'settlement',coalesce((select to_jsonb(x) from private.aqari_hr_exit_settlements x where x.employee_id=e.id),'{}'::jsonb),
   'self',private.aqari_hr_cycle_self(w,e.id));
 end if;

 if p_action='save_details' then
  if not private.aqari_hr_can(w,e.property_ids,'edit') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  expected:=coalesce((d->>'revision')::bigint,0);
  if length(coalesce(d->>'email',''))>254 or (coalesce(d->>'email','')<>'' and d->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then raise exception 'INVALID_EMPLOYEE_EMAIL'; end if;
  payload:=coalesce(d->'employment','{}'::jsonb); if jsonb_typeof(payload)<>'object' then raise exception 'INVALID_EMPLOYMENT_DETAILS'; end if;
  insert into private.aqari_hr_employee_details(workspace_id,employee_id,email,civil_expires_on,passport_expires_on,work_permit_expires_on,contract_starts_on,contract_ends_on,emergency_contact,employment)
  select w,e.id,coalesce(d->>'email',''),nullif(d->>'civil_expires_on','')::date,nullif(d->>'passport_expires_on','')::date,nullif(d->>'work_permit_expires_on','')::date,nullif(d->>'contract_starts_on','')::date,nullif(d->>'contract_ends_on','')::date,coalesce(d->'emergency_contact','{}'::jsonb),payload where expected=0
  on conflict(employee_id) do nothing; get diagnostics n=row_count;
  if n=0 then update private.aqari_hr_employee_details set email=coalesce(d->>'email',''),civil_expires_on=nullif(d->>'civil_expires_on','')::date,passport_expires_on=nullif(d->>'passport_expires_on','')::date,work_permit_expires_on=nullif(d->>'work_permit_expires_on','')::date,contract_starts_on=nullif(d->>'contract_starts_on','')::date,contract_ends_on=nullif(d->>'contract_ends_on','')::date,emergency_contact=coalesce(d->'emergency_contact','{}'::jsonb),employment=payload,revision=revision+1,updated_at=now() where employee_id=e.id and revision=expected;get diagnostics n=row_count;if n=0 then raise serialization_failure using message='REVISION_CONFLICT';end if;end if;
  return (select to_jsonb(x) from private.aqari_hr_employee_details x where x.employee_id=e.id);
 end if;

 if p_action='save_allocations' then
  if not private.aqari_hr_can(w,e.property_ids,'edit') or jsonb_typeof(d->'allocations')<>'array' then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  select coalesce(sum((x->>'share')::numeric),0),array_agg((x->>'property_id')::uuid) into total_share,props from jsonb_array_elements(d->'allocations') x;
  if total_share<>100 or props is null or not props <@ e.property_ids or exists(select 1 from unnest(props) x group by x having count(*)>1) then raise exception 'ALLOCATIONS_MUST_TOTAL_100';end if;
  update private.aqari_hr_cost_allocations set active=false,revision=revision+1,updated_at=now() where employee_id=e.id and active;
  insert into private.aqari_hr_cost_allocations(workspace_id,employee_id,property_id,share)
  select w,e.id,(x->>'property_id')::uuid,(x->>'share')::numeric from jsonb_array_elements(d->'allocations') x
  on conflict(employee_id,property_id) do update set share=excluded.share,active=true,revision=private.aqari_hr_cost_allocations.revision+1,updated_at=now();
  return jsonb_build_object('saved',true,'allocations',(select jsonb_agg(to_jsonb(x)) from private.aqari_hr_cost_allocations x where x.employee_id=e.id and x.active));
 end if;

 if p_action='add_record' then
  if private.aqari_hr_cycle_self(w,e.id) then
   if d->>'kind' not in ('leave_request','advance_request','salary_certificate','document_update','general_request') then raise insufficient_privilege using message='SELF_SERVICE_KIND_DENIED'; end if;
  elsif not private.aqari_hr_can(w,e.property_ids,'add') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  property:=nullif(d->>'property_id','')::uuid;
  if property is not null and not property=any(e.property_ids) then raise insufficient_privilege using message='PROPERTY_SCOPE_DENIED'; end if;
  insert into private.aqari_hr_records(id,workspace_id,employee_id,property_id,kind,status,starts_at,ends_at,minutes,amount,title,details,created_by)
  values((d->>'id')::uuid,w,e.id,property,d->>'kind','submitted',(d->>'starts_at')::timestamptz,nullif(d->>'ends_at','')::timestamptz,nullif(d->>'minutes','')::integer,nullif(d->>'amount','')::numeric,d->>'title',coalesce(d->>'details',''),auth.uid()) returning * into r;
  return to_jsonb(r);
 end if;

 if p_action='decide_record' then
  if not private.aqari_hr_can(w,e.property_ids,'edit') or d->>'status' not in ('approved','rejected','completed','cancelled') or length(btrim(coalesce(d->>'reason',''))) not between 3 and 1000 then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  update private.aqari_hr_records set status=d->>'status',decision_reason=d->>'reason',decided_by=auth.uid(),decided_at=now(),revision=revision+1,updated_at=now() where id=(d->>'id')::uuid and employee_id=e.id and revision=(d->>'revision')::bigint and status='submitted' returning * into r;
  if r.id is null then raise serialization_failure using message='REVISION_CONFLICT';end if;return to_jsonb(r);
 end if;

 if p_action='save_document_metadata' then
  if not private.aqari_hr_can(w,e.property_ids,'edit') or d->>'document_type' not in ('civil_id','passport','work_permit','employment_contract','certificate','custody','other') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if not exists(select 1 from private.aqari_hr_documents x where x.id=(d->>'document_id')::uuid and x.workspace_id=w and x.employee_id=e.id and x.status='ready') then raise exception 'READY_DOCUMENT_REQUIRED';end if;
  expected:=coalesce((d->>'revision')::bigint,0);
  insert into private.aqari_hr_document_metadata(document_id,workspace_id,employee_id,document_type,document_number,issued_on,expires_on)
  select (d->>'document_id')::uuid,w,e.id,d->>'document_type',coalesce(d->>'document_number',''),nullif(d->>'issued_on','')::date,nullif(d->>'expires_on','')::date where expected=0
  on conflict(document_id) do nothing;get diagnostics n=row_count;
  if n=0 then update private.aqari_hr_document_metadata set document_type=d->>'document_type',document_number=coalesce(d->>'document_number',''),issued_on=nullif(d->>'issued_on','')::date,expires_on=nullif(d->>'expires_on','')::date,revision=revision+1,updated_at=now() where document_id=(d->>'document_id')::uuid and employee_id=e.id and revision=expected;get diagnostics n=row_count;if n=0 then raise serialization_failure using message='REVISION_CONFLICT';end if;end if;
  return (select to_jsonb(x) from private.aqari_hr_document_metadata x where x.document_id=(d->>'document_id')::uuid);
 end if;

 if p_action='sync_payroll' then
  if not private.aqari_hr_can(w,e.property_ids,'edit') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  period:=(d->>'month')::date; select * into p from private.aqari_hr_payroll where employee_id=e.id and month=period for update;
  if p.id is null or p.state<>'draft' then raise exception 'PAYROLL_DRAFT_REQUIRED';end if;
  update private.aqari_hr_payroll x set
   overtime=coalesce((select sum(amount) from private.aqari_hr_records where employee_id=e.id and kind='overtime' and status='approved' and starts_at>=period and starts_at<period+interval '1 month'),0),
   reward=coalesce((select sum(amount) from private.aqari_hr_records where employee_id=e.id and kind='bonus' and status='approved' and starts_at>=period and starts_at<period+interval '1 month'),0),
   late=coalesce((select sum(amount) from private.aqari_hr_records where employee_id=e.id and kind='late' and status='approved' and starts_at>=period and starts_at<period+interval '1 month'),0),
   absence=coalesce((select sum(amount) from private.aqari_hr_records where employee_id=e.id and kind='absence' and status='approved' and starts_at>=period and starts_at<period+interval '1 month'),0),
   deductions=coalesce((select sum(amount) from private.aqari_hr_records where employee_id=e.id and kind='deduction' and status='approved' and starts_at>=period and starts_at<period+interval '1 month'),0),
   revision=x.revision+1,updated_at=now() where x.id=p.id returning * into p;return to_jsonb(p);
 end if;

 if p_action='month_report' then
  period:=(d->>'month')::date;
  if nullif(btrim(d->>'property_id'),'') is null then raise exception 'PROPERTY_REQUIRED' using errcode='22023';end if;
  begin property:=(d->>'property_id')::uuid;exception when invalid_text_representation then raise exception 'INVALID_PROPERTY_ID' using errcode='22023';end;
  if not private.aqari_hr_can(w,array[property],'read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('month',coalesce((select to_jsonb(x) from private.aqari_hr_months x where x.workspace_id=w and x.property_id=property and x.month=period),jsonb_build_object('workspace_id',w,'property_id',property,'month',period,'state','open','revision',0)),
   'rows',coalesce((select jsonb_agg(jsonb_build_object('employee_id',x.employee_id,'name_ar',x.snapshot->>'name_ar','name_en',x.snapshot->>'name_en','state',x.state,'basic',x.basic,'allowances',x.allowances,'additions',x.basic+x.allowances+x.overtime+x.reward+x.loan_payment+x.housing+x.indemnity+x.holidays,'deductions',x.late+x.absence+x.deductions+x.advance_repayment,'net',x.net,'share',coalesce(a.share,100.00),'allocated_net',round(x.net*coalesce(a.share,100.00)/100,3)) order by x.snapshot->>'name_ar') from private.aqari_hr_payroll x join private.aqari_hr_employees q on q.id=x.employee_id left join private.aqari_hr_cost_allocations a on a.employee_id=x.employee_id and a.property_id=property and a.active where x.workspace_id=w and x.month=period and property=any(q.property_ids)),'[]'::jsonb));
 end if;

 if p_action='month_action' then
  period:=(d->>'month')::date;property:=(d->>'property_id')::uuid;
  if not private.aqari_hr_can(w,array[property],case when d->>'state'='closed' then 'approve_chairman' else 'approve_admin' end) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if d->>'state' not in ('reviewed','approved','closed') or length(btrim(coalesce(d->>'reason',''))) not between 3 and 1000 then raise exception 'MONTH_ACTION_REASON_REQUIRED';end if;
  if d->>'state'='closed' and exists(select 1 from private.aqari_hr_payroll x join private.aqari_hr_employees q on q.id=x.employee_id where x.workspace_id=w and x.month=period and property=any(q.property_ids) and x.state<>'paid') then raise exception 'UNPAID_PAYROLL_EXISTS';end if;
  insert into private.aqari_hr_months(workspace_id,property_id,month,state,reason,reviewed_by,reviewed_at,approved_by,approved_at,closed_by,closed_at)
  values(w,property,period,d->>'state',d->>'reason',case when d->>'state'='reviewed' then auth.uid() end,case when d->>'state'='reviewed' then now() end,case when d->>'state'='approved' then auth.uid() end,case when d->>'state'='approved' then now() end,case when d->>'state'='closed' then auth.uid() end,case when d->>'state'='closed' then now() end)
  on conflict(workspace_id,property_id,month) do update set state=excluded.state,reason=excluded.reason,reviewed_by=coalesce(private.aqari_hr_months.reviewed_by,excluded.reviewed_by),reviewed_at=coalesce(private.aqari_hr_months.reviewed_at,excluded.reviewed_at),approved_by=coalesce(private.aqari_hr_months.approved_by,excluded.approved_by),approved_at=coalesce(private.aqari_hr_months.approved_at,excluded.approved_at),closed_by=coalesce(private.aqari_hr_months.closed_by,excluded.closed_by),closed_at=coalesce(private.aqari_hr_months.closed_at,excluded.closed_at),revision=private.aqari_hr_months.revision+1
  where private.aqari_hr_months.revision=(d->>'revision')::bigint and private.aqari_hr_months.state<>'closed';
  get diagnostics n=row_count;if n=0 then raise serialization_failure using message='REVISION_CONFLICT';end if;return (select to_jsonb(x) from private.aqari_hr_months x where x.workspace_id=w and x.property_id=property and x.month=period);
 end if;

 if p_action in ('annual_report','cost_report') then
  if not private.aqari_can(w,'employees','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  period:=make_date((d->>'year')::integer,1,1);property:=nullif(d->>'property_id','')::uuid;
  if property is not null and not private.aqari_hr_can(w,array[property],'read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('year',extract(year from period)::integer,'rows',coalesce((
   select jsonb_agg(row_to_json(z) order by z.month,z.employee_name) from (
    select to_char(x.month,'YYYY-MM') as "month",x.employee_id,x.snapshot->>'name_ar' as employee_name,x.state,x.net,
     q.id as property_id,q.name as property_name,coalesce(a.share,case when cardinality(e.property_ids)=1 then 100 else 0 end) as share,
     round(x.net*coalesce(a.share,case when cardinality(e.property_ids)=1 then 100 else 0 end)/100,3) as allocated_cost
    from private.aqari_hr_payroll x join private.aqari_hr_employees e on e.id=x.employee_id
    join public.aqari_properties q on q.id=any(e.property_ids) and q.workspace_id=w
    left join private.aqari_hr_cost_allocations a on a.employee_id=e.id and a.property_id=q.id and a.active
    where x.workspace_id=w and x.month>=period and x.month<period+interval '1 year'
     and (property is null or q.id=property) and private.aqari_hr_can(w,array[q.id],'read')
   ) z),'[]'::jsonb));
 end if;

 if p_action='archive_employee' then
  if not private.aqari_manager(w) or length(btrim(coalesce(d->>'reason',''))) not between 3 and 1000 then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  insert into private.aqari_hr_exit_settlements(id,workspace_id,employee_id,last_working_day,reason,salary_due,leave_due,indemnity,deductions,custody_cleared,clearance_notes)
  values((d->>'id')::uuid,w,e.id,(d->>'last_working_day')::date,d->>'reason',coalesce((d->>'salary_due')::numeric,0),coalesce((d->>'leave_due')::numeric,0),coalesce((d->>'indemnity')::numeric,0),coalesce((d->>'deductions')::numeric,0),coalesce((d->>'custody_cleared')::boolean,false),coalesce(d->>'clearance_notes','')) returning to_jsonb(private.aqari_hr_exit_settlements.*) into payload;
  update private.aqari_hr_employees set status='inactive',revision=revision+1,updated_at=now() where id=e.id;
  insert into private.aqari_hr_employee_details(workspace_id,employee_id,archived_at,archived_by,archive_reason) values(w,e.id,now(),auth.uid(),d->>'reason') on conflict(employee_id) do update set archived_at=now(),archived_by=auth.uid(),archive_reason=d->>'reason',revision=private.aqari_hr_employee_details.revision+1,updated_at=now();
  return payload;
 end if;

 if p_action='settlement_action' then
  if not private.aqari_manager(w) or d->>'state' not in ('approved','paid') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if d->>'state'='paid' and exists(select 1 from private.aqari_hr_records x where x.employee_id=e.id and x.kind='custody' and x.status not in ('completed','cancelled')) then raise exception 'OPEN_CUSTODY_EXISTS';end if;
  update private.aqari_hr_exit_settlements set state=d->>'state',approved_by=case when d->>'state'='approved' then auth.uid() else approved_by end,approved_at=case when d->>'state'='approved' then now() else approved_at end,paid_by=case when d->>'state'='paid' then auth.uid() else paid_by end,paid_at=case when d->>'state'='paid' then now() else paid_at end,revision=revision+1,updated_at=now() where employee_id=e.id and revision=(d->>'revision')::bigint and ((d->>'state'='approved' and state='draft') or (d->>'state'='paid' and state='approved')) returning to_jsonb(private.aqari_hr_exit_settlements.*) into payload;
  if payload is null then raise serialization_failure using message='REVISION_CONFLICT';end if;return payload;
 end if;

 if p_action='salary_export' then
  select * into p from private.aqari_hr_payroll where id=(d->>'payroll_id')::uuid and employee_id=e.id and workspace_id=w;
  if p.id is null or p.state='draft' then raise exception 'ISSUED_PAYROLL_REQUIRED';end if;
  select * into s from private.aqari_hr_salary_registry where payroll_id=p.id and status='active';
  if s.id is null then
   payload:=private.aqari_hr_cycle_payload(p);
   insert into private.aqari_hr_salary_registry(workspace_id,employee_id,payroll_id,version,voucher_no,snapshot,snapshot_sha256,issued_by)
   values(w,e.id,p.id,1,coalesce(p.voucher_no,p.id::text),payload,encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex'),auth.uid()) returning * into s;
  end if;
  return jsonb_build_object('registry',to_jsonb(s)-'verification_token','verification_token',s.verification_token,'payload',s.snapshot);
 end if;

 if p_action='void_salary' then
  if not private.aqari_manager(w) or length(btrim(coalesce(d->>'reason',''))) not between 3 and 1000 then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  update private.aqari_hr_salary_registry set status='void',voided_by=auth.uid(),voided_at=now(),reason=d->>'reason' where id=(d->>'registry_id')::uuid and employee_id=e.id and status='active' returning * into s;
  if s.id is null then raise exception 'ACTIVE_SALARY_NOT_FOUND';end if;return to_jsonb(s)-'verification_token';
 end if;

 if p_action='correct_salary' then
  if not private.aqari_manager(w) or length(btrim(coalesce(d->>'reason',''))) not between 3 and 1000 or jsonb_typeof(d->'snapshot')<>'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select * into s from private.aqari_hr_salary_registry where id=(d->>'replaces_id')::uuid and employee_id=e.id and status='void' for update;
  if s.id is null or exists(select 1 from private.aqari_hr_salary_registry where payroll_id=s.payroll_id and status='active') then raise exception 'VOID_SALARY_REQUIRED';end if;
  payload:=d->'snapshot';
  insert into private.aqari_hr_salary_registry(workspace_id,employee_id,payroll_id,version,voucher_no,snapshot,snapshot_sha256,issued_by,replaces_id,reason)
  values(w,e.id,s.payroll_id,s.version+1,s.voucher_no||'-C'||(s.version+1),payload,encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex'),auth.uid(),s.id,d->>'reason') returning * into s;
  update private.aqari_hr_salary_registry set status='corrected' where id=s.replaces_id;
  return to_jsonb(s)-'verification_token';
 end if;

 raise exception 'UNKNOWN_HR_CYCLE_ACTION';
end $$;
