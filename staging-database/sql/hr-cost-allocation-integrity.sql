-- Shared exact-fils calculation. Current employee allocations are used; historical
-- allocation snapshots are a separate requirement. No business rows are rewritten.
begin;
create or replace function private.aqari_hr_cost_split(p_workspace uuid,p_employee uuid,p_net numeric)
returns table(property_id uuid,share numeric,allocated_net numeric)
language plpgsql stable security invoker set search_path='' as $split$
declare props uuid[]; allocations integer; total numeric;
begin
 select e.property_ids into props from private.aqari_hr_employees e where e.id=p_employee and e.workspace_id=p_workspace;
 if coalesce(cardinality(props),0)=0 then raise exception 'HR_COST_ALLOCATION_REQUIRED';end if;
 if p_net is null or p_net::text in ('NaN','Infinity','-Infinity') or p_net<0 or p_net<>round(p_net,3) then raise exception 'INVALID_AMOUNT';end if;
 select count(*),sum(a.share) into allocations,total from private.aqari_hr_cost_allocations a where a.employee_id=p_employee and a.active;
 if (allocations=0 and cardinality(props)<>1) or (allocations>0 and (total<>100 or exists(
  select 1 from private.aqari_hr_cost_allocations a where a.employee_id=p_employee and a.active
   and (a.workspace_id<>p_workspace or not a.property_id=any(props))
  ))) then raise exception 'HR_COST_ALLOCATION_REQUIRED';end if;
 return query
 with portions as (
  select q.id,coalesce(a.share,case when allocations=0 then 100.00 else 0.00 end) as pct
  from unnest(props) q(id) left join private.aqari_hr_cost_allocations a on a.employee_id=p_employee and a.property_id=q.id and a.active
 ), raw as (
  select id,pct,p_net*1000*pct/100 as fils from portions
 ), ranked as (
  select id,pct,floor(fils) as base,row_number() over(order by fils-floor(fils) desc,id) as position,
   p_net*1000-sum(floor(fils)) over() as remainder from raw
 ) select id,pct,(base+case when position<=remainder then 1 else 0 end)/1000 from ranked order by id;
end $split$;
revoke all on function private.aqari_hr_cost_split(uuid,uuid,numeric) from public,anon,authenticated;

-- Patch only known report/validation expressions, retaining later salary fixes and ACLs.
do $migration$
declare source text:=pg_get_functiondef('public.aqari_hr_cycle(uuid,text,jsonb)'::regprocedure);old_text text;new_text text;pair text[];
begin
 if strpos(source,'-- HR_COST_ALLOCATION_INTEGRITY_V1')>0 then return;end if;
 foreach pair slice 1 in array array[
  array[$old$  select coalesce(sum((x->>'share')::numeric),0),array_agg((x->>'property_id')::uuid) into total_share,props from jsonb_array_elements(d->'allocations') x;$old$,$new$  -- HR_COST_ALLOCATION_INTEGRITY_V1
  if jsonb_typeof(d->'allocations') is distinct from 'array' or jsonb_array_length(d->'allocations')=0 then raise exception 'ALLOCATIONS_REQUIRED';end if;
  if exists(select 1 from jsonb_array_elements(d->'allocations') x where
   jsonb_typeof(x) is distinct from 'object' or x->>'property_id' is null or
   coalesce(x->>'share','') !~ '^[0-9]+([.][0-9]{1,2})?$'
  ) then raise exception 'INVALID_ALLOCATION_SHARE';end if;
  if exists(select 1 from jsonb_array_elements(d->'allocations') x where (x->>'share')::numeric<=0 or (x->>'share')::numeric>100) then raise exception 'INVALID_ALLOCATION_SHARE';end if;
  select coalesce(sum((x->>'share')::numeric),0),array_agg((x->>'property_id')::uuid) into total_share,props from jsonb_array_elements(d->'allocations') x;$new$],
  array[$old$'share',coalesce(a.share,100.00),'allocated_net',round(x.net*coalesce(a.share,100.00)/100,3)$old$,$new$'share',a.share,'allocated_net',a.allocated_net$new$],
  array[$old$left join private.aqari_hr_cost_allocations a on a.employee_id=x.employee_id and a.property_id=property and a.active$old$,$new$join lateral private.aqari_hr_cost_split(w,x.employee_id,x.net) a on a.property_id=property$new$],
  array[$old$coalesce(a.share,case when cardinality(e.property_ids)=1 then 100 else 0 end) as share,
     round(x.net*coalesce(a.share,case when cardinality(e.property_ids)=1 then 100 else 0 end)/100,3) as allocated_cost$old$,$new$a.share as share,
     a.allocated_net as allocated_cost$new$],
  array[$old$left join private.aqari_hr_cost_allocations a on a.employee_id=e.id and a.property_id=q.id and a.active$old$,$new$join lateral private.aqari_hr_cost_split(w,x.employee_id,x.net) a on a.property_id=q.id$new$],
  array[$old$  insert into private.aqari_hr_months(workspace_id,property_id,month,state,reason,reviewed_by,reviewed_at,approved_by,approved_at,closed_by,closed_at)$old$,$new$  perform a.allocated_net from private.aqari_hr_payroll x join private.aqari_hr_employees q on q.id=x.employee_id
   cross join lateral private.aqari_hr_cost_split(w,x.employee_id,x.net) a
   where x.workspace_id=w and x.month=period and property=any(q.property_ids) and a.property_id=property;
  insert into private.aqari_hr_months(workspace_id,property_id,month,state,reason,reviewed_by,reviewed_at,approved_by,approved_at,closed_by,closed_at)$new$],
  array[$old$from private.aqari_hr_payroll x join private.aqari_hr_employees e on e.id=x.employee_id
    join public.aqari_properties q on q.id=any(e.property_ids) and q.workspace_id=w$old$,$new$from private.aqari_hr_payroll x join private.aqari_hr_employees employee_scope on employee_scope.id=x.employee_id
    join public.aqari_properties q on q.id=any(employee_scope.property_ids) and q.workspace_id=w$new$]
 ] loop
  old_text:=pair[1];new_text:=pair[2];
  if (length(source)-length(replace(source,old_text,'')))/length(old_text)<>1 then raise exception 'HR_ALLOCATION_PATCH_ANCHOR_MISSING_OR_AMBIGUOUS';end if;
  source:=replace(source,old_text,new_text);
 end loop;
 execute source;
end $migration$;
commit;
