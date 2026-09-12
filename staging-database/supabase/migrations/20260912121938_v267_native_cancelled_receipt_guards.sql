-- Upgrade an existing final-gap register without changing or deleting stored data.
-- Verify the isolated target and backup before hosted application.
begin;
create or replace function public.aqari_final_gap_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}')returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;actor text;pay public.aqari_rent_payments;credit private.aqari_tenant_ledger_entries;used numeric;amount_value numeric;tenant uuid;posting_date date;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action not in ('list','preference','account','post_payment','reserve','tenant_entry','allocate_credit','cancel_receipt','channel','rate') then raise exception 'INVALID_GAP_ACTION' using errcode='22023';end if;
 if p_action<>'list' then perform private.aqari_require_sensitive_aal2(w);end if;
 -- Serialize with the existing period-close and payment lock, before locking
 -- individual credit/payment rows. This prevents concurrent over-allocation.
 if p_action in ('post_payment','reserve','tenant_entry','allocate_credit','cancel_receipt') then
  posting_date:=case p_action when 'tenant_entry' then (d->>'occurred_on')::date when 'allocate_credit' then (d->>'period')::date else current_date end;
  if p_action in ('post_payment','cancel_receipt') then select paid_at into posting_date from public.aqari_rent_payments where workspace_id=w and id=(d->>'payment_id')::uuid;end if;
  perform private.aqari_financial_open(w,posting_date);
 end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 if p_action='list' then return jsonb_build_object(
  'tenants',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.full_name)),'[]')from public.aqari_tenants t where t.workspace_id=w),
  'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)),'[]')from public.aqari_properties p where p.workspace_id=w),
  'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'tenant_id',l.tenant_id)),'[]')from public.aqari_leases l where l.workspace_id=w),
  'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'reference',p.reference,'amount',p.amount,'method',p.payment_method,'collector',coalesce(p.receipt->>'collectorName',p.receipt->>'collector','غير محدد'))),'[]')from public.aqari_rent_payments p where p.workspace_id=w and p.status<>'cancelled' and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)),
  'preferences',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_tenant_preferences x where x.workspace_id=w),
  'accounts',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by'),'[]')from private.aqari_collection_accounts x where x.workspace_id=w),
  'postings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_collection_postings x where x.workspace_id=w),
  'credit_allocations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_credit_allocations x where x.workspace_id=w),
  'cancellations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_receipt_cancellations x where x.workspace_id=w),
  'reserves',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_reserve_entries x where x.workspace_id=w),
  'ledger',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_tenant_ledger_entries x where x.workspace_id=w),
  'channels',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by'),'[]')from private.aqari_property_channels x where x.workspace_id=w),
  'ratings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from private.aqari_tenant_year_ratings x where x.workspace_id=w),
  'collector_performance',(select coalesce(jsonb_agg(to_jsonb(x)),'[]')from(select coalesce(p.receipt->>'collectorName',p.receipt->>'collector','غير محدد') collector,count(*) operations,sum(p.amount) amount from public.aqari_rent_payments p where p.workspace_id=w and p.status<>'cancelled' and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) group by 1)x));end if;
 if length(btrim(coalesce(d->>'reason','')))<3 and p_action not in ('preference','account','channel','rate') then raise exception 'REASON_REQUIRED' using errcode='23514';end if;
 if p_action='preference' then insert into private.aqari_tenant_preferences values(w,(d->>'tenant_id')::uuid,d->>'preferred_channel',now(),1,auth.uid(),now()) on conflict(workspace_id,tenant_id)do update set preferred_channel=excluded.preferred_channel,consent_at=excluded.consent_at,revision=private.aqari_tenant_preferences.revision+1,updated_by=auth.uid(),updated_at=now();end if;
 if p_action='account' then insert into private.aqari_collection_accounts(id,workspace_id,property_id,kind,name,masked_reference,created_by)values((d->>'id')::uuid,w,(d->>'property_id')::uuid,d->>'kind',d->>'name',d->>'masked_reference',auth.uid());end if;
 if p_action='post_payment' then select * into strict pay from public.aqari_rent_payments where workspace_id=w and id=(d->>'payment_id')::uuid for update;
  if pay.status='cancelled' or exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=pay.id)then raise exception 'CANCELLED_PAYMENT_POSTING' using errcode='23514';end if;
  if not exists(select 1 from private.aqari_collection_accounts a join public.aqari_units u on u.workspace_id=a.workspace_id and u.property_id=a.property_id join public.aqari_leases l on l.workspace_id=u.workspace_id and l.unit_id=u.id where a.workspace_id=w and a.id=(d->>'account_id')::uuid and l.id=pay.lease_id and a.status='active' and a.kind=case when pay.payment_method='cash'then'cashbox'else'bank'end)then raise exception 'PAYMENT_ACCOUNT_MISMATCH' using errcode='23514';end if;
  insert into private.aqari_collection_postings values((d->>'id')::uuid,w,pay.id,(d->>'account_id')::uuid,pay.amount,auth.uid(),now());end if;
 if p_action='reserve' then insert into private.aqari_reserve_entries values((d->>'id')::uuid,w,(d->>'property_id')::uuid,d->>'direction',(d->>'amount')::numeric,d->>'reason',null,auth.uid(),now());if(select coalesce(sum(case when direction='hold'then amount else -amount end),0)from private.aqari_reserve_entries where workspace_id=w and property_id=(d->>'property_id')::uuid)<0 then raise exception 'RESERVE_OVER_RELEASE' using errcode='23514';end if;end if;
 if p_action='tenant_entry' then
  if nullif(d->>'lease_id','') is not null and not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=(d->>'lease_id')::uuid and l.tenant_id=(d->>'tenant_id')::uuid)then raise exception 'TENANT_LEASE_MISMATCH' using errcode='23514';end if;
  insert into private.aqari_tenant_ledger_entries values((d->>'id')::uuid,w,(d->>'tenant_id')::uuid,nullif(d->>'lease_id','')::uuid,d->>'direction',d->>'kind',(d->>'amount')::numeric,(d->>'occurred_on')::date,d->>'reason',d->>'source_type',d->>'source_id',auth.uid(),now());end if;
 if p_action='allocate_credit' then
  select * into strict credit from private.aqari_tenant_ledger_entries where workspace_id=w and id=(d->>'credit_entry_id')::uuid and direction='credit' for update;
  if not exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=(d->>'lease_id')::uuid and l.tenant_id=credit.tenant_id)then raise exception 'CREDIT_TENANT_MISMATCH' using errcode='23514';end if;
  if (d->>'period')::date is distinct from date_trunc('month',(d->>'period')::date)::date then raise exception 'CREDIT_PERIOD_REQUIRED' using errcode='23514';end if;
  select coalesce(sum(amount),0)into used from private.aqari_credit_allocations where workspace_id=w and credit_entry_id=credit.id;amount_value:=(d->>'amount')::numeric;if used+amount_value>credit.amount then raise exception 'CREDIT_OVERALLOCATION' using errcode='23514';end if;insert into private.aqari_credit_allocations values((d->>'id')::uuid,w,credit.id,(d->>'lease_id')::uuid,(d->>'period')::date,amount_value,auth.uid(),now());end if;
 if p_action='cancel_receipt' then select * into strict pay from public.aqari_rent_payments where workspace_id=w and id=(d->>'payment_id')::uuid for update;
  if pay.status='cancelled' then raise exception 'ALREADY_CANCELLED_RECEIPT' using errcode='23514';end if;
  insert into private.aqari_receipt_cancellations values((d->>'id')::uuid,w,pay.id,d->>'reason',auth.uid(),actor,now(),to_jsonb(pay));insert into private.aqari_tenant_ledger_entries values(gen_random_uuid(),w,(select tenant_id from public.aqari_leases where workspace_id=w and id=pay.lease_id),pay.lease_id,'debit','receipt_cancellation',pay.amount,pay.paid_at,d->>'reason','receipt_cancellation',pay.id::text,auth.uid(),now());end if;
 if p_action='channel' then insert into private.aqari_property_channels(id,workspace_id,property_id,kind,public_url,management_reference,tenant_visible,status,created_by)values((d->>'id')::uuid,w,(d->>'property_id')::uuid,d->>'kind',d->>'public_url',coalesce(d->>'management_reference',''),coalesce((d->>'tenant_visible')::boolean,false),'active',auth.uid());end if;
 if p_action='rate' then tenant:=(d->>'tenant_id')::uuid;
  with months as(select l.id lease_id,l.monthly_rent,g::date period,extract(quarter from g)::integer quarter from public.aqari_leases l cross join lateral generate_series(date_trunc('month',greatest(l.start_date,make_date((d->>'year')::integer,1,1)))::date,date_trunc('month',least(l.end_date,make_date((d->>'year')::integer,12,31)))::date,'1 month')g where l.workspace_id=w and l.tenant_id=tenant),
  evidence as(select quarter,count(*) due_months,count(*)filter(where coalesce((select sum(p.amount)from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=m.lease_id and p.period=m.period and p.paid_at<=m.period+4 and p.status<>'cancelled' and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)),0)>=m.monthly_rent)paid_early_months from months m group by quarter),
  summary as(select coalesce(count(*)filter(where due_months>0 and due_months=paid_early_months),0)::integer stars,coalesce(jsonb_agg(jsonb_build_object('quarter',quarter,'due_months',due_months,'paid_early_months',paid_early_months)order by quarter),'[]')proof from evidence)
  insert into private.aqari_tenant_year_ratings(workspace_id,tenant_id,rating_year,stars,rating,quarter_evidence,calculated_at,source_revision)select w,tenant,(d->>'year')::integer,least(4,s.stars),case when s.stars=4 then 'ممتاز' when s.stars>=2 then 'ملتزم' else 'بحاجة إلى متابعة'end,s.proof,now(),md5(w::text||tenant::text||(d->>'year')||s.proof::text)from summary s
  on conflict(workspace_id,tenant_id,rating_year)do update set stars=excluded.stars,rating=excluded.rating,quarter_evidence=excluded.quarter_evidence,calculated_at=now(),source_revision=excluded.source_revision;end if;
 return public.aqari_final_gap_register(w,'list');
end$$;
commit;
