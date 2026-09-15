-- AQARI V267 Staging: activate the persisted finance/contact gap register on the current path.
-- This migration is additive; financial history and cancellation evidence are immutable.
begin;

create table if not exists private.aqari_contact_preference_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null,
 tenant_id uuid not null,
 actor_id uuid not null,
 before_snapshot jsonb not null,
 after_snapshot jsonb not null,
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id)
);
alter table private.aqari_contact_preference_audit enable row level security;
revoke all on private.aqari_contact_preference_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_contact_preference_audit_immutable on private.aqari_contact_preference_audit;
create trigger aqari_contact_preference_audit_immutable before update or delete on private.aqari_contact_preference_audit for each row execute function private.aqari_reject_immutable_change();

create or replace function public.aqari_final_gap_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);actor text;pay public.aqari_rent_payments;credit private.aqari_tenant_ledger_entries;
 used numeric;amount_value numeric;posting_date date;tenant uuid;property_ref uuid;channel text;before_pref jsonb;after_pref jsonb;rating_year integer;source_rev text;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action not in('list','preference','account','post_payment','reserve','tenant_entry','allocate_credit','cancel_receipt','channel','rate') then raise invalid_parameter_value using message='INVALID_GAP_ACTION';end if;
 if p_action<>'list' then perform private.aqari_require_sensitive_aal2(w);end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);

 if p_action='list' then
  return jsonb_build_object(
   'workspace_id',w,'user_id',auth.uid(),
   'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.full_name) order by t.full_name,t.id) from public.aqari_tenants t where t.workspace_id=w),'[]'::jsonb),
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) from public.aqari_properties p where p.workspace_id=w and private.aqari_can_property(w,p.id,'properties','read')),'[]'::jsonb),
   'leases',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'tenant_id',l.tenant_id) order by l.contract_no,l.id) from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and private.aqari_can_property(w,u.property_id,'properties','read')),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'reference',p.reference,'amount',p.amount,'method',p.payment_method,'collector',coalesce(p.receipt->>'collectorName',p.receipt->>'collector','غير محدد')) order by p.paid_at desc,p.id) from public.aqari_rent_payments p join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where p.workspace_id=w and private.aqari_can_property(w,u.property_id,'properties','read') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)),'[]'::jsonb),
   'preferences',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc,x.tenant_id) from private.aqari_tenant_preferences x where x.workspace_id=w),'[]'::jsonb),
   'accounts',coalesce((select jsonb_agg(to_jsonb(x)-'created_by' order by x.created_at desc,x.id) from private.aqari_collection_accounts x where x.workspace_id=w and private.aqari_can_property(w,x.property_id,'properties','read')),'[]'::jsonb),
   'postings',coalesce((select jsonb_agg(to_jsonb(x) order by x.posted_at desc,x.id) from private.aqari_collection_postings x join private.aqari_collection_accounts a on a.workspace_id=x.workspace_id and a.id=x.account_id where x.workspace_id=w and private.aqari_can_property(w,a.property_id,'properties','read')),'[]'::jsonb),
   'reserves',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from private.aqari_reserve_entries x where x.workspace_id=w and private.aqari_can_property(w,x.property_id,'properties','read')),'[]'::jsonb),
   'ledger',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_on desc,x.created_at desc,x.id) from private.aqari_tenant_ledger_entries x where x.workspace_id=w),'[]'::jsonb),
   'credit_allocations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from private.aqari_credit_allocations x where x.workspace_id=w),'[]'::jsonb),
   'cancellations',coalesce((select jsonb_agg(to_jsonb(x) order by x.cancelled_at desc,x.id) from private.aqari_receipt_cancellations x where x.workspace_id=w),'[]'::jsonb),
   'channels',coalesce((select jsonb_agg(to_jsonb(x)-'created_by' order by x.created_at desc,x.id) from private.aqari_property_channels x where x.workspace_id=w and private.aqari_can_property(w,x.property_id,'properties','read')),'[]'::jsonb),
   'ratings',coalesce((select jsonb_agg(to_jsonb(x) order by x.rating_year desc,x.tenant_id) from private.aqari_tenant_year_ratings x where x.workspace_id=w),'[]'::jsonb),
   'collector_performance',coalesce((select jsonb_agg(to_jsonb(x) order by x.amount desc,x.collector) from(select coalesce(p.receipt->>'collectorName',p.receipt->>'collector','غير محدد') collector,count(*) operations,sum(p.amount) amount from public.aqari_rent_payments p where p.workspace_id=w and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) group by 1)x),'[]'::jsonb)
  );
 end if;

 if p_action in('post_payment','reserve','tenant_entry','allocate_credit','cancel_receipt') then
  posting_date:=case when p_action='tenant_entry' then (d->>'occurred_on')::date when p_action='allocate_credit' then (d->>'period')::date else current_date end;
  if p_action in('post_payment','cancel_receipt') then select paid_at into posting_date from public.aqari_rent_payments where workspace_id=w and id=nullif(d->>'payment_id','')::uuid;end if;
  if posting_date is null then raise no_data_found using message='FINANCIAL_SOURCE_NOT_FOUND';end if;
  perform private.aqari_financial_open(w,posting_date);
 end if;

 if p_action='preference' then
  tenant:=nullif(d->>'tenant_id','')::uuid;channel:=lower(btrim(coalesce(d->>'preferred_channel','')));
  if channel not in('both','email','whatsapp','phone','none','sms','push') or not exists(select 1 from public.aqari_tenants where workspace_id=w and id=tenant) then raise invalid_parameter_value using message='INVALID_CONTACT_PREFERENCE';end if;
  select to_jsonb(x) into before_pref from private.aqari_tenant_preferences x where x.workspace_id=w and x.tenant_id=tenant for update;
  insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,revision,updated_by,updated_at) values(w,tenant,channel,null,1,auth.uid(),now()) on conflict(workspace_id,tenant_id) do update set preferred_channel=excluded.preferred_channel,consent_at=null,revision=private.aqari_tenant_preferences.revision+1,updated_by=auth.uid(),updated_at=now();
  update public.aqari_tenants set profile=coalesce(profile,'{}'::jsonb)||jsonb_build_object('preferredContact',channel) where workspace_id=w and id=tenant;
  select to_jsonb(x) into after_pref from private.aqari_tenant_preferences x where x.workspace_id=w and x.tenant_id=tenant;
  if before_pref is distinct from after_pref then insert into private.aqari_contact_preference_audit(workspace_id,tenant_id,actor_id,before_snapshot,after_snapshot) values(w,tenant,auth.uid(),coalesce(before_pref,'null'::jsonb),after_pref);end if;

 elsif p_action='account' then
  property_ref:=nullif(d->>'property_id','')::uuid;
  if not private.aqari_can_property(w,property_ref,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  insert into private.aqari_collection_accounts(id,workspace_id,property_id,kind,name,masked_reference,created_by) values(nullif(d->>'id','')::uuid,w,property_ref,d->>'kind',btrim(d->>'name'),btrim(d->>'masked_reference'),auth.uid());

 elsif p_action='post_payment' then
  select * into strict pay from public.aqari_rent_payments where workspace_id=w and id=(d->>'payment_id')::uuid for update;
  if exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=pay.id) then raise check_violation using message='CANCELLED_PAYMENT_POSTING';end if;
  if not exists(select 1 from private.aqari_collection_accounts a join public.aqari_units u on u.workspace_id=a.workspace_id and u.property_id=a.property_id join public.aqari_leases l on l.workspace_id=u.workspace_id and l.unit_id=u.id where a.workspace_id=w and a.id=(d->>'account_id')::uuid and l.id=pay.lease_id and a.status='active' and a.kind=case when lower(coalesce(pay.payment_method,''))='cash' then 'cashbox' else 'bank' end and private.aqari_can_property(w,a.property_id,'properties','write')) then raise check_violation using message='PAYMENT_ACCOUNT_MISMATCH';end if;
  insert into private.aqari_collection_postings(id,workspace_id,payment_id,account_id,amount,posted_by) values((d->>'id')::uuid,w,pay.id,(d->>'account_id')::uuid,pay.amount,auth.uid());

 elsif p_action='reserve' then
  property_ref:=nullif(d->>'property_id','')::uuid;if not private.aqari_can_property(w,property_ref,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if length(btrim(coalesce(d->>'reason','')))<3 then raise invalid_parameter_value using message='REASON_REQUIRED';end if;
  insert into private.aqari_reserve_entries(id,workspace_id,property_id,direction,amount,reason,source_id,actor_id) values((d->>'id')::uuid,w,property_ref,d->>'direction',(d->>'amount')::numeric,btrim(d->>'reason'),null,auth.uid());
  if(select coalesce(sum(case when direction='hold' then amount else -amount end),0) from private.aqari_reserve_entries where workspace_id=w and property_id=property_ref)<0 then raise check_violation using message='RESERVE_OVER_RELEASE';end if;

 elsif p_action='tenant_entry' then
  if length(btrim(coalesce(d->>'reason','')))<3 then raise invalid_parameter_value using message='REASON_REQUIRED';end if;
  tenant:=nullif(d->>'tenant_id','')::uuid;if not exists(select 1 from public.aqari_tenants where workspace_id=w and id=tenant) then raise no_data_found using message='TENANT_NOT_FOUND';end if;
  if nullif(d->>'lease_id','') is not null and not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=(d->>'lease_id')::uuid and l.tenant_id=tenant) then raise check_violation using message='TENANT_LEASE_MISMATCH';end if;
  insert into private.aqari_tenant_ledger_entries(id,workspace_id,tenant_id,lease_id,direction,kind,amount,occurred_on,reason,source_type,source_id,actor_id) values((d->>'id')::uuid,w,tenant,nullif(d->>'lease_id','')::uuid,d->>'direction',d->>'kind',(d->>'amount')::numeric,(d->>'occurred_on')::date,btrim(d->>'reason'),d->>'source_type',d->>'source_id',auth.uid());

 elsif p_action='allocate_credit' then
  if length(btrim(coalesce(d->>'reason','')))<3 then raise invalid_parameter_value using message='REASON_REQUIRED';end if;
  select * into strict credit from private.aqari_tenant_ledger_entries where workspace_id=w and id=(d->>'credit_entry_id')::uuid and direction='credit' for update;
  if not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=(d->>'lease_id')::uuid and l.tenant_id=credit.tenant_id and private.aqari_can_property(w,u.property_id,'properties','write')) then raise check_violation using message='CREDIT_TENANT_MISMATCH';end if;
  if (d->>'period')::date is distinct from date_trunc('month',(d->>'period')::date)::date then raise check_violation using message='CREDIT_PERIOD_REQUIRED';end if;
  select coalesce(sum(amount),0) into used from private.aqari_credit_allocations where workspace_id=w and credit_entry_id=credit.id;amount_value:=(d->>'amount')::numeric;if amount_value<=0 or used+amount_value>credit.amount then raise check_violation using message='CREDIT_OVERALLOCATION';end if;
  insert into private.aqari_credit_allocations(id,workspace_id,credit_entry_id,lease_id,period,amount,actor_id) values((d->>'id')::uuid,w,credit.id,(d->>'lease_id')::uuid,(d->>'period')::date,amount_value,auth.uid());

 elsif p_action='cancel_receipt' then
  if length(btrim(coalesce(d->>'reason','')))<3 then raise invalid_parameter_value using message='REASON_REQUIRED';end if;
  select * into strict pay from public.aqari_rent_payments where workspace_id=w and id=(d->>'payment_id')::uuid for update;
  insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,cancelled_at,snapshot) values((d->>'id')::uuid,w,pay.id,btrim(d->>'reason'),auth.uid(),actor,now(),to_jsonb(pay));
  insert into private.aqari_tenant_ledger_entries(id,workspace_id,tenant_id,lease_id,direction,kind,amount,occurred_on,reason,source_type,source_id,actor_id) values(gen_random_uuid(),w,(select tenant_id from public.aqari_leases where workspace_id=w and id=pay.lease_id),pay.lease_id,'debit','receipt_cancellation',pay.amount,pay.paid_at,btrim(d->>'reason'),'receipt_cancellation',pay.id::text,auth.uid());

 elsif p_action='channel' then
  property_ref:=nullif(d->>'property_id','')::uuid;if not private.aqari_can_property(w,property_ref,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  insert into private.aqari_property_channels(id,workspace_id,property_id,kind,public_url,management_reference,tenant_visible,status,created_by) values((d->>'id')::uuid,w,property_ref,d->>'kind',d->>'public_url',coalesce(d->>'management_reference',''),coalesce((d->>'tenant_visible')::boolean,false),'active',auth.uid());

 elsif p_action='rate' then
  tenant:=nullif(d->>'tenant_id','')::uuid;rating_year:=(d->>'year')::integer;
  if rating_year not between 2000 and 2200 or not exists(select 1 from public.aqari_tenants where workspace_id=w and id=tenant) then raise invalid_parameter_value using message='INVALID_TENANT_RATING';end if;
  select coalesce(revision::text,'0') into source_rev from public.aqari_app_state where workspace_id=w;
  with months as(
   select s.lease_id,s.period,s.due_amount,extract(quarter from s.period)::integer quarter
   from private.aqari_rent_due_periods s join public.aqari_leases l on l.workspace_id=s.workspace_id and l.id=s.lease_id
   where s.workspace_id=w and l.tenant_id=tenant and extract(year from s.period)=rating_year and s.due_amount>0
  ),evidence as(
   select m.quarter,count(*) due_months,count(*) filter(where coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=m.lease_id and p.period=m.period and p.paid_at<=m.period+4 and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)),0)>=m.due_amount) paid_early_months from months m group by m.quarter
  ),summary as(select coalesce(count(*) filter(where due_months>0 and due_months=paid_early_months),0)::integer stars,coalesce(jsonb_agg(jsonb_build_object('quarter',quarter,'due_months',due_months,'paid_early_months',paid_early_months) order by quarter),'[]'::jsonb) proof from evidence)
  insert into private.aqari_tenant_year_ratings(workspace_id,tenant_id,rating_year,stars,rating,quarter_evidence,calculated_at,source_revision)
  select w,tenant,rating_year,least(4,s.stars),case when s.stars=4 then 'ممتاز' when s.stars>=2 then 'ملتزم' else 'بحاجة للمتابعة' end,s.proof,now(),coalesce(source_rev,'0') from summary s
  on conflict(workspace_id,tenant_id,rating_year) do update set stars=excluded.stars,rating=excluded.rating,quarter_evidence=excluded.quarter_evidence,calculated_at=excluded.calculated_at,source_revision=excluded.source_revision;
 end if;
 return public.aqari_final_gap_register(w,'list','{}'::jsonb);
end $$;
revoke all on function public.aqari_final_gap_register(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_final_gap_register(uuid,text,jsonb) to authenticated;
commit;
