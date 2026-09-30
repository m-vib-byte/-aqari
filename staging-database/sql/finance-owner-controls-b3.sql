-- AQARI V267 isolated trial — B3 finance allocation methods + owner calculated statements.
-- Additive/revisioned. Original financial/payroll/utility rows remain authoritative and are never expanded into fake monthly movements.
begin;

-- Fail before changing any function if the A2 unit-area dependency is absent.
-- Otherwise the migration succeeds but the first cost-allocation read fails.
do $prerequisite$
begin
 if not exists(select 1 from information_schema.columns where table_schema='private'
  and table_name='aqari_unit_master' and column_name='area_sqm' and data_type='numeric') then
  raise exception 'PROPERTY_COST_AREA_PREREQUISITE_REQUIRED';
 end if;
end $prerequisite$;

alter table private.aqari_property_cost_allocation_heads
 add column if not exists allocation_method text not null default 'amount',
 add column if not exists analysis_frequency text not null default 'one_time',
 add column if not exists basis_snapshot jsonb not null default '{}'::jsonb;
alter table private.aqari_property_cost_allocation_heads drop constraint if exists aqari_property_cost_allocation_heads_allocation_method_check;
alter table private.aqari_property_cost_allocation_heads add constraint aqari_property_cost_allocation_heads_allocation_method_check
 check(allocation_method in('amount','percentage','unit_count','area','custom'));
alter table private.aqari_property_cost_allocation_heads drop constraint if exists aqari_property_cost_allocation_heads_analysis_frequency_check;
alter table private.aqari_property_cost_allocation_heads add constraint aqari_property_cost_allocation_heads_analysis_frequency_check
 check(analysis_frequency in('one_time','monthly','annual','invoice'));
alter table private.aqari_property_cost_allocation_heads drop constraint if exists aqari_property_cost_allocation_heads_basis_snapshot_check;
alter table private.aqari_property_cost_allocation_heads add constraint aqari_property_cost_allocation_heads_basis_snapshot_check
 check(jsonb_typeof(basis_snapshot)='object' and octet_length(basis_snapshot::text)<=100000);

alter table private.aqari_property_cost_allocations
 add column if not exists allocation_method text not null default 'amount',
 add column if not exists weight numeric(18,6),
 add column if not exists share_bps integer,
 add column if not exists basis_snapshot jsonb not null default '{}'::jsonb;
alter table private.aqari_property_cost_allocations drop constraint if exists aqari_property_cost_allocations_allocation_method_check;
alter table private.aqari_property_cost_allocations add constraint aqari_property_cost_allocations_allocation_method_check
 check(allocation_method in('amount','percentage','unit_count','area','custom'));
alter table private.aqari_property_cost_allocations drop constraint if exists aqari_property_cost_allocations_weight_check;
alter table private.aqari_property_cost_allocations add constraint aqari_property_cost_allocations_weight_check check(weight is null or weight>0);
alter table private.aqari_property_cost_allocations drop constraint if exists aqari_property_cost_allocations_share_bps_check;
alter table private.aqari_property_cost_allocations add constraint aqari_property_cost_allocations_share_bps_check check(share_bps is null or share_bps between 1 and 10000);

-- No business count limit for owners. A payload-size guard remains to prevent abusive requests.
create or replace function private.aqari_property_owners_normalize(v jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select case when jsonb_typeof(v)<>'array' then v else coalesce((
  select jsonb_agg((x.value-'share') || jsonb_build_object('id',coalesce(nullif(btrim(x.value->>'id'),''),gen_random_uuid()::text)) order by x.ord)
  from jsonb_array_elements(v) with ordinality x(value,ord)
 ),'[]'::jsonb) end
$$;
revoke all on function private.aqari_property_owners_normalize(jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_property_owners_valid(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(v)='array'
 and octet_length(v::text)<=500000
 and not exists(
  select 1 from jsonb_array_elements(v) x
  where jsonb_typeof(x)<>'object'
   or exists(select 1 from jsonb_object_keys(x) k where k not in('id','name','bps','role','email','phone','whatsapp'))
   or coalesce(x->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
   or length(btrim(coalesce(x->>'name',''))) not between 1 and 200
   or coalesce(x->>'bps','') !~ '^[0-9]{1,5}$'
   or (x->>'bps')::integer not between 1 and 10000
   or length(coalesce(x->>'role',''))>100
   or length(coalesce(x->>'email',''))>320
   or length(coalesce(x->>'phone',''))>40
   or length(coalesce(x->>'whatsapp',''))>40
 )
 and (select count(*) from jsonb_array_elements(v))=(select count(distinct x->>'id') from jsonb_array_elements(v)x)
 and (jsonb_array_length(v)=0 or (select coalesce(sum((x->>'bps')::integer),0) from jsonb_array_elements(v)x)=10000)
$$;
revoke all on function private.aqari_property_owners_valid(jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_validate_partner_owners(rows jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;total numeric:=0;ids text[]:='{}';ident text;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)<1 or octet_length(rows::text)>500000 then raise exception 'PARTNER_OWNERS_REQUIRED' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(rows) loop
  ident:=btrim(r->>'id');
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string'
   or ident is null or length(ident) not between 1 and 150 or ident=any(ids)
   or jsonb_typeof(r->'name') is distinct from 'string' or length(btrim(coalesce(r->>'name',''))) not between 1 and 200
   or jsonb_typeof(r->'role') is distinct from 'string' or length(btrim(coalesce(r->>'role',''))) not between 1 and 100
   or jsonb_typeof(r->'bps') is distinct from 'number' then raise exception 'PARTNER_OWNER_INVALID' using errcode='23514';end if;
  if (r->>'bps')::numeric not between 1 and 10000 or (r->>'bps')::numeric<>trunc((r->>'bps')::numeric) then raise exception 'PARTNER_SHARE_INVALID' using errcode='23514';end if;
  ids:=array_append(ids,ident);total:=total+(r->>'bps')::numeric;
 end loop;
 if total<>10000 then raise exception 'PARTNER_SHARES_MUST_TOTAL_100' using errcode='23514';end if;
end $$;
revoke all on function private.aqari_validate_partner_owners(jsonb) from public,anon,authenticated,service_role;

-- Patch the current authoritative property saver once so old screens may keep sending the UI-only share helper.
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure);
 anchor:='owners:=coalesce(p_data->''owners'',''[]''::jsonb);select coalesce(jsonb_agg(x.value-''share''),''[]''::jsonb) into owners from jsonb_array_elements(owners)x(value);if not private.aqari_property_owners_valid(owners) then';
 replacement:='owners:=private.aqari_property_owners_normalize(coalesce(p_data->''owners'',''[]''::jsonb));if not private.aqari_property_owners_valid(owners) then';
 if strpos(s,replacement)=0 then
  if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'PROPERTY_OWNER_ID_NORMALIZATION_ANCHOR_MISMATCH';end if;
  execute replace(s,anchor,replacement);
 end if;
end $patch$;

create or replace function private.aqari_allocation_weight_rows(w uuid,method text,rows jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if method='unit_count' then
  select coalesce(jsonb_agg(jsonb_build_object('propertyId',p.id,'weight',q.cnt) order by p.id),'[]'::jsonb) into result
  from (select distinct (r->>'propertyId')::uuid id from jsonb_array_elements(rows)r)p
  join lateral(select count(*)::numeric cnt from public.aqari_units u where u.workspace_id=w and u.property_id=p.id)q on true
  where q.cnt>0;
  if jsonb_array_length(result)<>jsonb_array_length(rows) then raise check_violation using message='ALLOCATION_UNIT_COUNT_REQUIRED';end if;
  return result;
 elsif method='area' then
  select coalesce(jsonb_agg(jsonb_build_object('propertyId',p.id,'weight',q.area) order by p.id),'[]'::jsonb) into result
  from (select distinct (r->>'propertyId')::uuid id from jsonb_array_elements(rows)r)p
  join lateral(select count(*) total,count(m.area_sqm) with_area,coalesce(sum(m.area_sqm),0)::numeric area
    from public.aqari_units u left join private.aqari_unit_master m on m.workspace_id=u.workspace_id and m.unit_id=u.id
    where u.workspace_id=w and u.property_id=p.id)q on true
  where q.total>0 and q.total=q.with_area and q.area>0;
  if jsonb_array_length(result)<>jsonb_array_length(rows) then raise check_violation using message='ALLOCATION_COMPLETE_AREA_REQUIRED';end if;
  return result;
 elsif method='custom' then
  return rows;
 end if;
 return rows;
end $$;
revoke all on function private.aqari_allocation_weight_rows(uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_normalize_weighted_allocation(total numeric,weights jsonb,method text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;total_fils bigint;sum_weight numeric;
begin
 if total is null or total<=0 or total<>round(total,3) or jsonb_typeof(weights)<>'array' or jsonb_array_length(weights)<1 then raise invalid_parameter_value using message='INVALID_WEIGHTED_ALLOCATION';end if;
 total_fils:=round(total*1000)::bigint;
 if exists(select 1 from jsonb_array_elements(weights)r where jsonb_typeof(r)<>'object' or coalesce(r->>'propertyId','')!~'^[0-9a-fA-F-]{36}$' or coalesce(r->>'weight','')!~'^\d{1,18}(\.\d{1,6})?$' or (r->>'weight')::numeric<=0) then raise invalid_parameter_value using message='INVALID_ALLOCATION_WEIGHT';end if;
 select sum((r->>'weight')::numeric) into sum_weight from jsonb_array_elements(weights)r;if sum_weight<=0 then raise invalid_parameter_value using message='INVALID_ALLOCATION_WEIGHT';end if;
 with b as(
  select (r->>'propertyId')::uuid property_id,(r->>'weight')::numeric weight,
   floor(total_fils::numeric*(r->>'weight')::numeric/sum_weight)::bigint part,
   (total_fils::numeric*(r->>'weight')::numeric/sum_weight)-floor(total_fils::numeric*(r->>'weight')::numeric/sum_weight) frac
  from jsonb_array_elements(weights)r
 ),ranked as(
  select *,row_number() over(order by frac desc,property_id) rn,(total_fils-sum(part) over())::bigint remainder from b
 ),final as(
  select property_id,weight,part+case when rn<=remainder then 1 else 0 end fils from ranked
 )
 select jsonb_agg(jsonb_build_object('propertyId',property_id,'amount',(fils::numeric/1000)::numeric(15,3),'weight',weight,'shareBps',greatest(1,least(10000,round(weight/sum_weight*10000)::int))) order by property_id) into result from final;
 if (select sum((r->>'amount')::numeric) from jsonb_array_elements(result)r)<>total then raise check_violation using message='ALLOCATION_TOTAL_MISMATCH';end if;
 return result;
end $$;
revoke all on function private.aqari_normalize_weighted_allocation(numeric,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_cost_allocation(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;kind text;ident uuid;source jsonb;expected bigint;next_rev bigint;why text;actor text;rows jsonb;normalized jsonb;weights jsonb;sum_amount numeric;property_ids uuid[];head private.aqari_property_cost_allocation_heads%rowtype;method text;frequency text;basis jsonb;total numeric;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='list' then
  if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data)k where k not in('from','to')) then raise invalid_parameter_value using message='INVALID_ALLOCATION_QUERY';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'manager',private.aqari_manager(w),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'unitCount',coalesce(q.units,0),'areaSqm',coalesce(q.area,0),'areaComplete',coalesce(q.units,0)>0 and q.units=q.with_area) order by p.name,p.id)
     from public.aqari_properties p left join lateral(select count(u.id)::int units,count(m.area_sqm)::int with_area,coalesce(sum(m.area_sqm),0) area from public.aqari_units u left join private.aqari_unit_master m on m.workspace_id=u.workspace_id and m.unit_id=u.id where u.workspace_id=p.workspace_id and u.property_id=p.id)q on true where p.workspace_id=w),'[]'::jsonb),
   'sources',(select coalesce(jsonb_agg(x order by x->>'date' desc,x->>'label'),'[]'::jsonb) from(
    select private.aqari_cost_source(w,'financial_expense',e.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'method',coalesce(h.allocation_method,'amount'),'frequency',coalesce(h.analysis_frequency,'one_time'),'basis',coalesce(h.basis_snapshot,'{}'::jsonb),'allocations',coalesce(a.rows,'[]'::jsonb)) x
     from private.aqari_financial_expenses e left join private.aqari_property_cost_allocation_heads h on h.workspace_id=e.workspace_id and h.source_kind='financial_expense' and h.source_id=e.id left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount,'weight',q.weight,'shareBps',q.share_bps) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=e.workspace_id and q.source_kind='financial_expense' and q.source_id=e.id and q.revision=h.current_revision)a on true where e.workspace_id=w and e.state='approved'
    union all
    select private.aqari_cost_source(w,'payroll',pay.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'method',coalesce(h.allocation_method,'amount'),'frequency',coalesce(h.analysis_frequency,'monthly'),'basis',coalesce(h.basis_snapshot,'{}'::jsonb),'allocations',coalesce(a.rows,'[]'::jsonb)) x
     from private.aqari_hr_payroll pay left join private.aqari_property_cost_allocation_heads h on h.workspace_id=pay.workspace_id and h.source_kind='payroll' and h.source_id=pay.id left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount,'weight',q.weight,'shareBps',q.share_bps) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=pay.workspace_id and q.source_kind='payroll' and q.source_id=pay.id and q.revision=h.current_revision)a on true where pay.workspace_id=w and pay.state='paid'
    union all
    select private.aqari_cost_source(w,'utility',u.id)||jsonb_build_object('revision',coalesce(h.current_revision,0),'method',coalesce(h.allocation_method,'amount'),'frequency',coalesce(h.analysis_frequency,'invoice'),'basis',coalesce(h.basis_snapshot,'{}'::jsonb),'allocations',coalesce(a.rows,'[]'::jsonb)) x
     from public.aqari_utility_entries u left join private.aqari_property_cost_allocation_heads h on h.workspace_id=u.workspace_id and h.source_kind='utility' and h.source_id=u.id left join lateral(select jsonb_agg(jsonb_build_object('propertyId',q.property_id,'amount',q.amount,'weight',q.weight,'shareBps',q.share_bps) order by q.property_id) rows from private.aqari_property_cost_allocations q where q.workspace_id=u.workspace_id and q.source_kind='utility' and q.source_id=u.id and q.revision=h.current_revision)a on true where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null
   )s));
 end if;
 if p_action<>'save' or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data)k where k not in('sourceKind','sourceId','revision','allocations','reason','method','frequency')) then raise invalid_parameter_value using message='INVALID_ALLOCATION_REQUEST';end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;perform private.aqari_require_sensitive_aal2(w);
 kind:=p_data->>'sourceKind';ident:=nullif(p_data->>'sourceId','')::uuid;expected:=coalesce((p_data->>'revision')::bigint,-1);why:=btrim(coalesce(p_data->>'reason',''));rows:=p_data->'allocations';method:=coalesce(nullif(p_data->>'method',''),'amount');frequency:=coalesce(nullif(p_data->>'frequency',''),case kind when 'payroll' then 'monthly' when 'utility' then 'invoice' else 'one_time' end);
 if kind not in('financial_expense','payroll','utility') or ident is null or expected<0 or method not in('amount','percentage','unit_count','area','custom') or frequency not in('one_time','monthly','annual','invoice') or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)<1 or octet_length(rows::text)>200000 or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='ALLOCATION_FIELDS_REQUIRED';end if;
 source:=private.aqari_cost_source(w,kind,ident);total:=(source->>'total')::numeric;
 if exists(select 1 from jsonb_array_elements(rows)r where jsonb_typeof(r)<>'object' or coalesce(r->>'propertyId','')!~'^[0-9a-fA-F-]{36}$') then raise invalid_parameter_value using message='INVALID_ALLOCATION_ROW';end if;
 if (select count(*) from jsonb_array_elements(rows))<>(select count(distinct r->>'propertyId') from jsonb_array_elements(rows)r) then raise unique_violation using message='DUPLICATE_ALLOCATION_PROPERTY';end if;
 select array_agg((r->>'propertyId')::uuid order by (r->>'propertyId')::uuid) into property_ids from jsonb_array_elements(rows)r;
 if exists(select 1 from unnest(property_ids)p where not exists(select 1 from public.aqari_properties x where x.workspace_id=w and x.id=p)) then raise insufficient_privilege using message='ALLOCATION_PROPERTY_NOT_FOUND';end if;
 if kind='payroll' and exists(select 1 from unnest(property_ids)p where not exists(select 1 from jsonb_array_elements_text(coalesce(source->'propertyIds','[]'::jsonb))a(value) where a.value=p::text)) then raise insufficient_privilege using message='PAYROLL_ALLOCATION_OUTSIDE_EMPLOYEE_PROPERTIES';end if;
 if method='amount' then
  if exists(select 1 from jsonb_array_elements(rows)r where exists(select 1 from jsonb_object_keys(r)k where k not in('propertyId','amount')) or coalesce(r->>'amount','')!~'^\d{1,12}(\.\d{1,3})?$' or (r->>'amount')::numeric<=0) then raise invalid_parameter_value using message='INVALID_ALLOCATION_ROW';end if;
  select sum((r->>'amount')::numeric) into sum_amount from jsonb_array_elements(rows)r;if sum_amount is distinct from total then raise check_violation using message='ALLOCATION_TOTAL_MISMATCH';end if;
  select jsonb_agg(jsonb_build_object('propertyId',r->>'propertyId','amount',(r->>'amount')::numeric,'weight',(r->>'amount')::numeric,'shareBps',greatest(1,least(10000,round((r->>'amount')::numeric/total*10000)::int))) order by r->>'propertyId') into normalized from jsonb_array_elements(rows)r;weights:=rows;
 elsif method='percentage' then
  if exists(select 1 from jsonb_array_elements(rows)r where exists(select 1 from jsonb_object_keys(r)k where k not in('propertyId','shareBps')) or coalesce(r->>'shareBps','')!~'^\d{1,5}$' or (r->>'shareBps')::int not between 1 and 10000) or (select sum((r->>'shareBps')::int) from jsonb_array_elements(rows)r)<>10000 then raise check_violation using message='ALLOCATION_PERCENTAGE_MUST_TOTAL_100';end if;
  select jsonb_agg(jsonb_build_object('propertyId',r->>'propertyId','weight',(r->>'shareBps')::numeric) order by r->>'propertyId') into weights from jsonb_array_elements(rows)r;normalized:=private.aqari_normalize_weighted_allocation(total,weights,method);
 elsif method in('unit_count','area') then
  if exists(select 1 from jsonb_array_elements(rows)r where exists(select 1 from jsonb_object_keys(r)k where k<>'propertyId')) then raise invalid_parameter_value using message='INVALID_ALLOCATION_ROW';end if;weights:=private.aqari_allocation_weight_rows(w,method,rows);normalized:=private.aqari_normalize_weighted_allocation(total,weights,method);
 else
  if exists(select 1 from jsonb_array_elements(rows)r where exists(select 1 from jsonb_object_keys(r)k where k not in('propertyId','weight')) or coalesce(r->>'weight','')!~'^\d{1,18}(\.\d{1,6})?$' or (r->>'weight')::numeric<=0) then raise invalid_parameter_value using message='INVALID_ALLOCATION_WEIGHT';end if;weights:=rows;normalized:=private.aqari_normalize_weighted_allocation(total,weights,method);
 end if;
 basis:=jsonb_build_object('method',method,'frequency',frequency,'weights',weights,'sourcePropertyIds',coalesce(source->'propertyIds','[]'::jsonb),'sourceTotal',total);
 select * into head from private.aqari_property_cost_allocation_heads where workspace_id=w and source_kind=kind and source_id=ident for update;if coalesce(head.current_revision,0) is distinct from expected then raise serialization_failure using message='ALLOCATION_REVISION_CONFLICT';end if;
 next_rev:=expected+1;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_property_cost_allocation_heads(workspace_id,source_kind,source_id,current_revision,source_total,source_date,allocation_method,analysis_frequency,basis_snapshot,updated_by,updated_at)
 values(w,kind,ident,next_rev,total,(source->>'date')::date,method,frequency,basis,auth.uid(),now()) on conflict(workspace_id,source_kind,source_id) do update set current_revision=excluded.current_revision,source_total=excluded.source_total,source_date=excluded.source_date,allocation_method=excluded.allocation_method,analysis_frequency=excluded.analysis_frequency,basis_snapshot=excluded.basis_snapshot,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.aqari_property_cost_allocations(workspace_id,source_kind,source_id,revision,property_id,amount,reason,actor_id,actor_name,allocation_method,weight,share_bps,basis_snapshot)
 select w,kind,ident,next_rev,(r->>'propertyId')::uuid,(r->>'amount')::numeric,why,auth.uid(),actor,method,nullif(r->>'weight','')::numeric,nullif(r->>'shareBps','')::int,basis from jsonb_array_elements(normalized)r;
 return jsonb_build_object('workspace_id',w,'sourceKind',kind,'sourceId',ident,'revision',next_rev,'total',total,'method',method,'frequency',frequency,'basis',basis,'allocations',normalized,'actor',actor,'recordedAt',now());
end $$;
revoke all on function public.aqari_property_cost_allocation(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_cost_allocation(uuid,text,jsonb) to authenticated;

create or replace function private.aqari_monthlyized_cost(w uuid,p uuid,month_start date)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v numeric:=0;
begin
 select coalesce(sum(case when coalesce(h.analysis_frequency,case s.kind when 'payroll' then 'monthly' when 'utility' then 'invoice' else 'one_time' end)='annual'
   and month_start between date_trunc('month',s.source_date)::date and (date_trunc('month',s.source_date)+interval '11 months')::date then s.amount/12
   when date_trunc('month',s.source_date)::date=month_start then s.amount else 0 end),0) into v
 from(
  select 'financial_expense' kind,e.id source_id,e.expense_date source_date,private.aqari_cost_amount(w,'financial_expense',e.id,p,e.amount,array[e.property_id]) amount from private.aqari_financial_expenses e where e.workspace_id=w and e.state='approved'
  union all select 'payroll',pay.id,coalesce(pay.paid_at::date,pay.month),private.aqari_cost_amount(w,'payroll',pay.id,p,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),coalesce((select array_agg(distinct j.value::uuid) from jsonb_array_elements_text(coalesce(pay.snapshot->'property_ids',to_jsonb(emp.property_ids)))j(value)),emp.property_ids)) from private.aqari_hr_payroll pay join private.aqari_hr_employees emp on emp.workspace_id=pay.workspace_id and emp.id=pay.employee_id where pay.workspace_id=w and pay.state='paid'
  union all select 'utility',u.id,u.payment_date,private.aqari_cost_amount(w,'utility',u.id,p,u.amount_paid,array[u.property_id]) from public.aqari_utility_entries u where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null
 )s left join private.aqari_property_cost_allocation_heads h on h.workspace_id=w and h.source_kind=s.kind and h.source_id=s.source_id
 where s.amount>0;
 return round(v,3);
end $$;
revoke all on function private.aqari_monthlyized_cost(uuid,uuid,date) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_financial_summary(p_workspace_id uuid,p_property_id uuid,p_as_of date default (now() at time zone 'Asia/Kuwait')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid:=p_workspace_id;p uuid:=p_property_id;month_start date;year_start date;income_month numeric:=0;income_year numeric:=0;expected_month numeric:=0;expected_year numeric:=0;arrears numeric:=0;expense_month numeric:=0;expense_year numeric:=0;finance_month numeric:=0;finance_year numeric:=0;payroll_month numeric:=0;payroll_year numeric:=0;utility_month numeric:=0;utility_year numeric:=0;unallocated_payroll numeric:=0;analytical_month numeric:=0;
begin
 if not private.aqari_can_property(w,p,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can(w,'collections','read') or not private.aqari_can(w,'finance','read') then return jsonb_build_object('workspace_id',w,'property_id',p,'available',false,'reason','PERMISSION_DENIED');end if;
 if p_as_of<'2000-01-01' or p_as_of>(now() at time zone 'Asia/Kuwait')::date+1 then raise invalid_parameter_value using message='INVALID_SUMMARY_DATE';end if;month_start:=date_trunc('month',p_as_of)::date;year_start:=date_trunc('year',p_as_of)::date;
 select coalesce(sum(r.amount) filter(where r.paid_at between month_start and p_as_of),0),coalesce(sum(r.amount) filter(where r.paid_at between year_start and p_as_of),0) into income_month,income_year from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where r.workspace_id=w and u.property_id=p and r.status not in('cancelled','ملغى') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);
 select coalesce(sum(d.due_amount) filter(where d.period between month_start and date_trunc('month',p_as_of)::date),0),coalesce(sum(d.due_amount) filter(where d.period between year_start and date_trunc('month',p_as_of)::date),0),coalesce(sum(greatest(d.balance,0)) filter(where d.period<=date_trunc('month',p_as_of)::date),0) into expected_month,expected_year,arrears from private.aqari_rent_due_periods d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where d.workspace_id=w and u.property_id=p;
 select coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p,e.amount,array[e.property_id])) filter(where e.expense_date between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'financial_expense',e.id,p,e.amount,array[e.property_id])) filter(where e.expense_date between year_start and p_as_of),0) into finance_month,finance_year from private.aqari_financial_expenses e where e.workspace_id=w and e.state='approved';
 select coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),coalesce((select array_agg(distinct j.value::uuid) from jsonb_array_elements_text(coalesce(pay.snapshot->'property_ids',to_jsonb(h.property_ids)))j(value)),h.property_ids))) filter(where coalesce(pay.paid_at::date,pay.month) between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'payroll',pay.id,p,coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment),coalesce((select array_agg(distinct j.value::uuid) from jsonb_array_elements_text(coalesce(pay.snapshot->'property_ids',to_jsonb(h.property_ids)))j(value)),h.property_ids))) filter(where coalesce(pay.paid_at::date,pay.month) between year_start and p_as_of),0) into payroll_month,payroll_year from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id where pay.workspace_id=w and pay.state='paid';
 select coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p,u.amount_paid,array[u.property_id])) filter(where u.payment_date between month_start and p_as_of),0),coalesce(sum(private.aqari_cost_amount(w,'utility',u.id,p,u.amount_paid,array[u.property_id])) filter(where u.payment_date between year_start and p_as_of),0) into utility_month,utility_year from public.aqari_utility_entries u where u.workspace_id=w and u.entry_type='bill' and u.amount_paid>0 and u.payment_date is not null and u.payment_document_id is not null;
 select coalesce(sum(coalesce(pay.net,pay.basic+pay.allowances+pay.overtime-pay.deductions-pay.advance_repayment)),0) into unallocated_payroll from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id where pay.workspace_id=w and pay.state='paid' and coalesce(pay.paid_at::date,pay.month) between year_start and p_as_of and p=any(h.property_ids) and cardinality(h.property_ids)>1 and not exists(select 1 from private.aqari_property_cost_allocation_heads a where a.workspace_id=w and a.source_kind='payroll' and a.source_id=pay.id and a.current_revision>0);
 expense_month:=finance_month+payroll_month+utility_month;expense_year:=finance_year+payroll_year+utility_year;analytical_month:=private.aqari_monthlyized_cost(w,p,month_start);
 return jsonb_build_object('workspace_id',w,'property_id',p,'available',true,'asOf',p_as_of,'arrears',arrears,
  'month',jsonb_build_object('income',income_month,'expectedIncome',expected_month,'expenses',expense_month,'analyticalExpenses',analytical_month,'net',income_month-expense_month,'analyticalNet',income_month-analytical_month,'collectionVariance',income_month-expected_month,'finance',finance_month,'payroll',payroll_month,'utilities',utility_month),
  'year',jsonb_build_object('income',income_year,'expectedIncome',expected_year,'expenses',expense_year,'net',income_year-expense_year,'collectionVariance',income_year-expected_year,'finance',finance_year,'payroll',payroll_year,'utilities',utility_year),
  'unallocatedSharedPayroll',unallocated_payroll,'policy','actual non-cancelled rent collections minus approved property allocations; annual costs remain one original movement and monthly analytical impact is calculated only, never duplicated');
end $$;
revoke all on function public.aqari_property_financial_summary(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_financial_summary(uuid,uuid,date) to authenticated;

create or replace function private.aqari_owner_share_fils(total numeric,owners jsonb,owner_id text)
returns bigint language sql immutable security invoker set search_path='' as $$
 select coalesce((select (x->>'amount_fils')::bigint from jsonb_array_elements(private.aqari_partner_allocate(round(total*1000)::bigint,owners,'{}'::jsonb))x where x->>'owner_id'=owner_id),0)
$$;
revoke all on function private.aqari_owner_share_fils(numeric,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_owner_statement(p_workspace_id uuid,p_property_id uuid,p_as_of date default (now() at time zone 'Asia/Kuwait')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;owners jsonb;f jsonb;result jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;owners:=coalesce(p->'owners','[]'::jsonb);if jsonb_array_length(owners)>0 then perform private.aqari_validate_partner_owners(owners);end if;f:=public.aqari_property_financial_summary(p_workspace_id,p_property_id,p_as_of);
 select coalesce(jsonb_agg(jsonb_build_object('id',o->>'id','name',o->>'name','role',o->>'role','bps',(o->>'bps')::int,
  'month',jsonb_build_object('incomeFils',private.aqari_owner_share_fils((f#>>'{month,income}')::numeric,owners,o->>'id')::text,'expenseFils',private.aqari_owner_share_fils((f#>>'{month,expenses}')::numeric,owners,o->>'id')::text,'netFils',private.aqari_owner_share_fils((f#>>'{month,net}')::numeric,owners,o->>'id')::text),
  'year',jsonb_build_object('incomeFils',private.aqari_owner_share_fils((f#>>'{year,income}')::numeric,owners,o->>'id')::text,'expenseFils',private.aqari_owner_share_fils((f#>>'{year,expenses}')::numeric,owners,o->>'id')::text,'netFils',private.aqari_owner_share_fils((f#>>'{year,net}')::numeric,owners,o->>'id')::text)) order by o->>'name'),'[]'::jsonb) into result from jsonb_array_elements(owners)o;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'asOf',p_as_of,'owners',result,'totals',f,'distributionStatus','calculated_only','autoPayment',false,'note','الحصص محسوبة للعرض فقط. اعتماد وصرف الأرباح عملية منفصلة ولا ينشأ عنها تحويل مالي تلقائي.');
end $$;
revoke all on function public.aqari_property_owner_statement(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_owner_statement(uuid,uuid,date) to authenticated;

commit;
