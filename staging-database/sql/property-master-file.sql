-- AQARI V267 isolated trial: authoritative property/unit master and complete property read model.
-- Additive only. Existing public property/unit identifiers remain canonical and all writes are audited.
begin;

create or replace function private.aqari_property_owners_valid(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(v)='array'
 and jsonb_array_length(v)<=50
 and not exists(
  select 1 from jsonb_array_elements(v) x
  where jsonb_typeof(x)<>'object'
   or exists(select 1 from jsonb_object_keys(x) k where k not in('name','bps','role','email','phone','whatsapp'))
   or length(btrim(coalesce(x->>'name',''))) not between 1 and 200
   or coalesce(x->>'bps','') !~ '^[0-9]{1,5}$'
   or (x->>'bps')::integer not between 1 and 10000
   or length(coalesce(x->>'role',''))>100
   or length(coalesce(x->>'email',''))>320
   or length(coalesce(x->>'phone',''))>40
   or length(coalesce(x->>'whatsapp',''))>40
 )
 and (jsonb_array_length(v)=0 or (select coalesce(sum((x->>'bps')::integer),0) from jsonb_array_elements(v)x)=10000)
$$;
revoke all on function private.aqari_property_owners_valid(jsonb) from public,anon,authenticated;

create table if not exists private.aqari_property_master(
 workspace_id uuid not null,
 property_id uuid not null,
 address text not null default '',
 property_type text not null default '',
 status text not null default 'active',
 stated_income numeric(15,3),
 owners jsonb not null default '[]'::jsonb,
 contact_email text not null default '',
 contact_phone text not null default '',
 contact_whatsapp text not null default '',
 assets jsonb not null default '{"photos":[],"documents":[],"plans":[]}'::jsonb,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(updated_by) references auth.users(id),
 check(length(address)<=1000 and length(property_type)<=120 and length(status) between 1 and 80),
 check(stated_income is null or stated_income>=0),
 check(private.aqari_property_owners_valid(owners)),
 check(length(contact_email)<=320 and length(contact_phone)<=40 and length(contact_whatsapp)<=40),
 check(contact_email='' or contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 check(jsonb_typeof(assets)='object' and octet_length(assets::text)<=200000)
);
alter table private.aqari_property_master enable row level security;
revoke all on private.aqari_property_master from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_master_no_delete on private.aqari_property_master;
create trigger aqari_property_master_no_delete before delete on private.aqari_property_master
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_unit_master(
 workspace_id uuid not null,
 unit_id uuid not null,
 property_id uuid not null,
 floor text not null default '',
 unit_type text not null default '',
 status text not null default 'available',
 stated_rent numeric(15,3),
 automatic_ref text not null default '',
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,unit_id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(updated_by) references auth.users(id),
 check(length(floor)<=100 and length(unit_type)<=120 and length(status) between 1 and 80 and length(automatic_ref)<=200),
 check(stated_rent is null or stated_rent>=0)
);
alter table private.aqari_unit_master enable row level security;
revoke all on private.aqari_unit_master from public,anon,authenticated,service_role;
drop trigger if exists aqari_unit_master_no_delete on private.aqari_unit_master;
create trigger aqari_unit_master_no_delete before delete on private.aqari_unit_master
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_property_master_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 unit_id uuid,
 entity_type text not null check(entity_type in('property','unit')),
 action text not null,
 reason text not null,
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 before_value jsonb,
 after_value jsonb,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(length(action) between 1 and 120 and length(reason) between 3 and 1000)
);
alter table private.aqari_property_master_audit enable row level security;
revoke all on private.aqari_property_master_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_master_audit_immutable on private.aqari_property_master_audit;
create trigger aqari_property_master_audit_immutable before update or delete on private.aqari_property_master_audit
 for each row execute function private.aqari_reject_immutable_change();

-- Unit number is a human/business identifier scoped to one property. It is distinct from unit UUID,
-- government/automatic reference and contract serial, and cannot be duplicated by case/spacing.
create unique index if not exists aqari_units_property_unit_no_ci_uq
 on public.aqari_units(workspace_id,property_id,lower(btrim(unit_no)));

create or replace function private.aqari_property_master_snapshot(w uuid,p uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',x.id,'externalRef',x.external_ref,'name',x.name,
  'address',coalesce(m.address,x.metadata->>'location',''),
  'type',coalesce(nullif(m.property_type,''),x.metadata->>'propertyType',''),
  'status',coalesce(nullif(m.status,''),x.metadata->>'propertyStatus','active'),
  'statedIncome',coalesce(m.stated_income,nullif(x.metadata->>'propertyMonthlyIncome','')::numeric),
  'owners',coalesce(m.owners,'[]'::jsonb),
  'email',coalesce(m.contact_email,''),'phone',coalesce(m.contact_phone,''),'whatsapp',coalesce(m.contact_whatsapp,''),
  'assets',coalesce(m.assets,'{"photos":[],"documents":[],"plans":[]}'::jsonb),
  'revision',coalesce(m.revision,0),'updatedAt',m.updated_at
 )
 from public.aqari_properties x left join private.aqari_property_master m
  on m.workspace_id=x.workspace_id and m.property_id=x.id
 where x.workspace_id=w and x.id=p
$$;
revoke all on function private.aqari_property_master_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_unit_master_snapshot(w uuid,u uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',x.id,'propertyId',x.property_id,'unitNo',x.unit_no,
  'floor',coalesce(m.floor,''),'type',coalesce(m.unit_type,''),'status',coalesce(nullif(m.status,''),'available'),
  'statedRent',m.stated_rent,'automaticRef',coalesce(m.automatic_ref,''),
  'revision',coalesce(m.revision,0),'updatedAt',m.updated_at
 )
 from public.aqari_units x left join private.aqari_unit_master m
  on m.workspace_id=x.workspace_id and m.unit_id=x.id
 where x.workspace_id=w and x.id=u
$$;
revoke all on function private.aqari_unit_master_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_master_save(
 p_workspace_id uuid,p_property_id uuid,p_expected_revision bigint,p_data jsonb,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_row private.aqari_property_master%rowtype; new_row private.aqari_property_master%rowtype;
 old_snapshot jsonb; new_snapshot jsonb; actor text; nm text; owners jsonb; income numeric; rev bigint;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('name','address','type','status','statedIncome','owners','email','phone','whatsapp','assets')) then raise invalid_parameter_value using message='PROPERTY_MASTER_INVALID';end if;
 nm:=btrim(coalesce(p_data->>'name',''));if length(nm) not between 1 and 200 then raise invalid_parameter_value using message='PROPERTY_NAME_REQUIRED';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
 owners:=coalesce(p_data->'owners','[]'::jsonb);if not private.aqari_property_owners_valid(owners) then raise invalid_parameter_value using message='PROPERTY_OWNERS_INVALID_OR_NOT_100_PERCENT';end if;
 begin income:=nullif(p_data->>'statedIncome','')::numeric;exception when others then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end;
 if income is not null and (income<0 or round(income,3)<>income) then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end if;
 if length(coalesce(p_data->>'address',''))>1000 or length(coalesce(p_data->>'type',''))>120 or length(coalesce(p_data->>'status','')) not between 1 and 80 or length(coalesce(p_data->>'email',''))>320 or length(coalesce(p_data->>'phone',''))>40 or length(coalesce(p_data->>'whatsapp',''))>40 then raise invalid_parameter_value using message='PROPERTY_MASTER_FIELD_INVALID';end if;
 if coalesce(p_data->>'email','')<>'' and coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise invalid_parameter_value using message='PROPERTY_EMAIL_INVALID';end if;
 if jsonb_typeof(coalesce(p_data->'assets','{}'::jsonb))<>'object' or octet_length(coalesce(p_data->'assets','{}'::jsonb)::text)>200000 then raise invalid_parameter_value using message='PROPERTY_ASSETS_INVALID';end if;
 perform 1 from public.aqari_properties where workspace_id=p_workspace_id and id=p_property_id for update;if not found then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 old_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 select * into old_row from private.aqari_property_master where workspace_id=p_workspace_id and property_id=p_property_id for update;
 rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception 'PROPERTY_MASTER_REVISION_CONFLICT' using errcode='40001';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_properties set name=nm where workspace_id=p_workspace_id and id=p_property_id;
 insert into private.aqari_property_master(workspace_id,property_id,address,property_type,status,stated_income,owners,contact_email,contact_phone,contact_whatsapp,assets,revision,updated_by,updated_at)
 values(p_workspace_id,p_property_id,btrim(coalesce(p_data->>'address','')),btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','active')),income,owners,lower(btrim(coalesce(p_data->>'email',''))),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'whatsapp','')),coalesce(p_data->'assets','{}'::jsonb),rev+1,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set address=excluded.address,property_type=excluded.property_type,status=excluded.status,stated_income=excluded.stated_income,owners=excluded.owners,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,contact_whatsapp=excluded.contact_whatsapp,assets=excluded.assets,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 returning * into new_row;
 new_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,'property','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'property',new_snapshot);
end $$;
revoke all on function public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text) to authenticated;

create or replace function public.aqari_unit_master_save(
 p_workspace_id uuid,p_property_id uuid,p_unit_id uuid,p_expected_revision bigint,p_data jsonb,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare old_row private.aqari_unit_master%rowtype; old_snapshot jsonb; new_snapshot jsonb; actor text; n text; rent numeric; rev bigint; actual_property uuid;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('unitNo','floor','type','status','statedRent','automaticRef')) then raise invalid_parameter_value using message='UNIT_MASTER_INVALID';end if;
 n:=btrim(coalesce(p_data->>'unitNo',''));if length(n) not between 1 and 120 then raise invalid_parameter_value using message='UNIT_NUMBER_REQUIRED';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
 begin rent:=nullif(p_data->>'statedRent','')::numeric;exception when others then raise invalid_parameter_value using message='UNIT_RENT_INVALID';end;
 if rent is not null and (rent<0 or round(rent,3)<>rent) then raise invalid_parameter_value using message='UNIT_RENT_INVALID';end if;
 if length(coalesce(p_data->>'floor',''))>100 or length(coalesce(p_data->>'type',''))>120 or length(coalesce(p_data->>'status','')) not between 1 and 80 or length(coalesce(p_data->>'automaticRef',''))>200 then raise invalid_parameter_value using message='UNIT_MASTER_FIELD_INVALID';end if;
 select property_id into actual_property from public.aqari_units where workspace_id=p_workspace_id and id=p_unit_id for update;
 if actual_property is null or actual_property<>p_property_id then raise exception 'UNIT_PROPERTY_BINDING_MISMATCH' using errcode='23514';end if;
 if exists(select 1 from public.aqari_units where workspace_id=p_workspace_id and property_id=p_property_id and id<>p_unit_id and lower(btrim(unit_no))=lower(n)) then raise unique_violation using message='UNIT_NUMBER_ALREADY_EXISTS';end if;
 old_snapshot:=private.aqari_unit_master_snapshot(p_workspace_id,p_unit_id);
 select * into old_row from private.aqari_unit_master where workspace_id=p_workspace_id and unit_id=p_unit_id for update;
 rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception 'UNIT_MASTER_REVISION_CONFLICT' using errcode='40001';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_units set unit_no=n where workspace_id=p_workspace_id and id=p_unit_id;
 insert into private.aqari_unit_master(workspace_id,unit_id,property_id,floor,unit_type,status,stated_rent,automatic_ref,revision,updated_by,updated_at)
 values(p_workspace_id,p_unit_id,p_property_id,btrim(coalesce(p_data->>'floor','')),btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','available')),rent,btrim(coalesce(p_data->>'automaticRef','')),rev+1,auth.uid(),now())
 on conflict(workspace_id,unit_id) do update set property_id=excluded.property_id,floor=excluded.floor,unit_type=excluded.unit_type,status=excluded.status,stated_rent=excluded.stated_rent,automatic_ref=excluded.automatic_ref,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 returning * into old_row;
 new_snapshot:=private.aqari_unit_master_snapshot(p_workspace_id,p_unit_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,unit_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,p_unit_id,'unit','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'unit',new_snapshot);
end $$;
revoke all on function public.aqari_unit_master_save(uuid,uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.aqari_unit_master_save(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;

create or replace function public.aqari_property_contract_context(p_workspace_id uuid,p_property_id uuid,p_unit_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;u jsonb;active jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 if p_unit_id is not null then
  u:=private.aqari_unit_master_snapshot(p_workspace_id,p_unit_id);
  if u is null or u->>'propertyId'<>p_property_id::text then raise exception 'UNIT_PROPERTY_BINDING_MISMATCH' using errcode='23514';end if;
  select to_jsonb(l) into active from public.aqari_leases l where l.workspace_id=p_workspace_id and l.unit_id=p_unit_id and l.status in('ready','approved','signing','signed') and coalesce(l.vacated_on,'infinity'::date)>=current_date order by l.start_date nulls first limit 1;
 end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'property',p,'unit',u,'activeLease',active,'binding',jsonb_build_object('propertyId',p_property_id,'unitId',p_unit_id,'propertyRevision',coalesce((p->>'revision')::bigint,0),'unitRevision',coalesce((u->>'revision')::bigint,0)));
end $$;
revoke all on function public.aqari_property_contract_context(uuid,uuid,uuid) from public,anon;
grant execute on function public.aqari_property_contract_context(uuid,uuid,uuid) to authenticated;

create or replace function public.aqari_property_full_file(p_workspace_id uuid,p_property_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;month_start date;year_start date; month_income numeric;year_income numeric;month_expenses numeric;year_expenses numeric;
 units jsonb;contracts jsonb;collections jsonb;expenses jsonb;docs jsonb;audit_rows jsonb;channels jsonb;notices jsonb;
 arrears_amount numeric;arrears_count bigint;employee_count bigint;payroll_count bigint;payroll_paid numeric;maintenance_count bigint;utility_month numeric;utility_year numeric;
begin
 if p_as_of is null or not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 month_start:=date_trunc('month',p_as_of)::date;year_start:=date_trunc('year',p_as_of)::date;
 select coalesce(jsonb_agg(private.aqari_unit_master_snapshot(p_workspace_id,u.id) order by u.unit_no),'[]'::jsonb) into units from public.aqari_units u where u.workspace_id=p_workspace_id and u.property_id=p_property_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contractNo',l.contract_no,'unitId',l.unit_id,'tenantId',l.tenant_id,'status',l.status,'startDate',l.start_date,'endDate',l.end_date,'monthlyRent',l.monthly_rent) order by l.start_date desc nulls last,l.contract_no) filter(where l.id is not null),'[]'::jsonb) into contracts from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and u.property_id=p_property_id;
 select coalesce(sum(case when r.paid_at between month_start and p_as_of and c.payment_id is null then r.amount else 0 end),0),coalesce(sum(case when r.paid_at between year_start and p_as_of and c.payment_id is null then r.amount else 0 end),0),coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',r.reference,'amount',r.amount,'paidAt',r.paid_at,'period',r.period,'status',case when c.payment_id is null then r.status else 'cancelled' end,'method',r.payment_method,'leaseId',r.lease_id) order by r.paid_at desc,r.created_at desc) filter(where r.id is not null),'[]'::jsonb)
 into month_income,year_income,collections
 from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id left join private.aqari_receipt_cancellations c on c.workspace_id=r.workspace_id and c.payment_id=r.id where r.workspace_id=p_workspace_id and u.property_id=p_property_id;
 select coalesce(sum(case when e.state='approved' and e.expense_date between month_start and p_as_of then e.amount else 0 end),0),coalesce(sum(case when e.state='approved' and e.expense_date between year_start and p_as_of then e.amount else 0 end),0),coalesce(jsonb_agg(jsonb_build_object('id',e.id,'date',e.expense_date,'category',e.category,'payee',e.payee,'amount',e.amount,'method',e.method,'reference',e.reference,'state',e.state,'voucherNo',e.voucher_no) order by e.expense_date desc,e.created_at desc) filter(where e.id is not null),'[]'::jsonb)
 into month_expenses,year_expenses,expenses from private.aqari_financial_expenses e where e.workspace_id=p_workspace_id and e.property_id=p_property_id;
 select coalesce(sum(greatest(d.balance,0)),0),count(*) filter(where d.balance>0) into arrears_amount,arrears_count from private.aqari_rent_due_periods d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where d.workspace_id=p_workspace_id and u.property_id=p_property_id and d.period<=date_trunc('month',p_as_of)::date and d.balance>0;
 select count(*) into employee_count from private.aqari_hr_employees h where h.workspace_id=p_workspace_id and p_property_id=any(h.property_ids) and h.status<>'inactive';
 select count(*),coalesce(sum(coalesce(pay.net,pay.basic+pay.allowances+pay.overtime+pay.reward+pay.housing+pay.indemnity+pay.holidays-pay.deductions-pay.advance_repayment-pay.loan_payment-pay.late-pay.absence)) filter(where pay.state='paid'),0) into payroll_count,payroll_paid from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id where pay.workspace_id=p_workspace_id and p_property_id=any(h.property_ids) and pay.month between year_start and date_trunc('month',p_as_of)::date;
 select count(*) into maintenance_count from private.aqari_work_orders o where o.workspace_id=p_workspace_id and o.property_id=p_property_id and o.status<>'cancelled';
 select coalesce(sum(amount_paid) filter(where payment_date between month_start and p_as_of),0),coalesce(sum(amount_paid) filter(where payment_date between year_start and p_as_of),0) into utility_month,utility_year from public.aqari_utility_entries where workspace_id=p_workspace_id and property_id=p_property_id and amount_paid is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'no',d.document_no,'type',d.document_type,'title',d.title,'status',d.status,'uploadedAt',d.uploaded_at) order by d.created_at desc) filter(where d.id is not null),'[]'::jsonb) into docs from public.aqari_documents d join public.aqari_properties x on x.workspace_id=d.workspace_id and x.id=p_property_id where d.workspace_id=p_workspace_id and d.status<>'cancelled' and d.entity_ref in(p_property_id::text,x.external_ref);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entityType',a.entity_type,'unitId',a.unit_id,'action',a.action,'reason',a.reason,'actor',a.actor_name,'at',a.created_at) order by a.created_at desc) filter(where a.id is not null),'[]'::jsonb) into audit_rows from private.aqari_property_master_audit a where a.workspace_id=p_workspace_id and a.property_id=p_property_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'publicUrl',c.public_url,'managementReference',c.management_reference,'tenantVisible',c.tenant_visible,'status',c.status) order by c.created_at) filter(where c.id is not null),'[]'::jsonb) into channels from private.aqari_property_channels c where c.workspace_id=p_workspace_id and c.property_id=p_property_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,'status',n.status,'publishedAt',n.published_at,'expiresAt',n.expires_at) order by n.created_at desc) filter(where n.id is not null),'[]'::jsonb) into notices from private.aqari_property_notices n where n.workspace_id=p_workspace_id and n.property_id=p_property_id;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'asOf',p_as_of,'property',p,'units',units,'contracts',contracts,'collections',collections,'expenses',expenses,'documents',docs,'audit',audit_rows,'channels',channels,'notices',notices,
  'summary',jsonb_build_object('units',jsonb_array_length(units),'contracts',jsonb_array_length(contracts),'arrearsCount',arrears_count,'arrearsAmount',arrears_amount,'employees',employee_count,'maintenance',maintenance_count),
  'finance',jsonb_build_object('month',jsonb_build_object('income',month_income,'expenses',month_expenses,'net',month_income-month_expenses),'year',jsonb_build_object('income',year_income,'expenses',year_expenses,'net',year_income-year_expenses),'basis','actual non-cancelled rent payments minus approved property-linked financial expenses','utilityPaidMonth',utility_month,'utilityPaidYear',utility_year,'utilityIncludedInNet',false,'linkedPayrollRows',payroll_count,'linkedPayrollPaid',payroll_paid,'payrollIncludedInNet',false,'payrollNote','Payroll is displayed for linked employees but is not netted until an authoritative property allocation exists; this prevents double counting employees linked to multiple properties.'));
end $$;
revoke all on function public.aqari_property_full_file(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_full_file(uuid,uuid,date) to authenticated;

commit;
