-- Reviewed helper restoration candidate. Preview test first; production approval is separate.
begin;
do $guard$
declare dependency text;
begin
 foreach dependency in array array['private.aqari_can_lease(uuid,uuid,text,text)','private.aqari_commercial_legacy_history(uuid,uuid)','private.aqari_assert_commercial_collections(uuid,uuid)','private.aqari_rent_due_on(jsonb,date,date)','private.aqari_contract_due(jsonb,text)'] loop
  if to_regprocedure(dependency) is null then raise exception 'HELPER_PREREQUISITE_MISSING:%',dependency;end if;
 end loop;
 foreach dependency in array array['public.aqari_leases','public.aqari_rent_payments','private.aqari_commercial_collections','private.aqari_commercial_collection_reversals','private.aqari_commercial_terms','private.aqari_tenant_ledger_entries','private.aqari_tenant_adjustments','private.aqari_credit_allocations','private.aqari_receipt_cancellations'] loop
  if to_regclass(dependency) is null then raise exception 'HELPER_TABLE_MISSING:%',dependency;end if;
 end loop;
end $guard$;
do $restore$
begin
 if to_regprocedure('private.aqari_official_statement(uuid,uuid,date,date)') is null then
  execute $definition$CREATE OR REPLACE FUNCTION private.aqari_official_statement(w uuid, lid uuid, from_date date, to_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.aqari_leases;opening numeric;charges numeric;payments numeric;credits numeric;finish date;
begin
 if auth.uid() is null or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found or l.status not in ('signed','expired') or l.start_date is null or l.end_date is null or l.monthly_rent is null then raise exception 'DOCUMENT_ACTIVE_LEASE_REQUIRED' using errcode='23514';end if;
 if from_date is null or to_date is null or from_date>to_date or from_date<l.start_date or to_date>(now() at time zone 'Asia/Kuwait')::date or to_date-l.start_date>36600 then raise exception 'INVALID_DOCUMENT_RANGE' using errcode='23514';end if;
 if exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=l.tenant_id and e.kind in ('opening_credit','opening_debit','opening_balance') and e.occurred_on<=to_date) then raise exception 'DOCUMENT_OPENING_RECONCILIATION_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=l.tenant_id and e.lease_id is null and e.direction='debit' and e.occurred_on<=to_date) then raise exception 'DOCUMENT_UNALLOCATED_DEBT_REVIEW_REQUIRED' using errcode='23514';end if;
 if exists(select 1 from private.aqari_tenant_ledger_entries e join private.aqari_credit_allocations a on a.workspace_id=e.workspace_id and a.credit_entry_id=e.id where e.workspace_id=w and e.lease_id=lid and a.lease_id<>lid) then raise exception 'DOCUMENT_CREDIT_TRANSFER_REVIEW_REQUIRED' using errcode='23514';end if;
 if not private.aqari_commercial_legacy_history(w,lid) then perform private.aqari_assert_commercial_collections(w,lid);end if;
 finish:=least(l.end_date,coalesce(l.vacated_on,l.end_date),to_date);
 with entries as (
  select private.aqari_rent_due_on(l.snapshot,l.start_date,p::date) on_date,'charge'::text stream,case when l.snapshot->>'rentalTermsVersion'='1' then coalesce(private.aqari_contract_due(l.snapshot,to_char(p,'YYYY-MM')),l.monthly_rent) else l.monthly_rent end amount from generate_series(date_trunc('month',l.start_date),date_trunc('month',finish),interval '1 month')p
  union all select p.paid_at,'payment',p.amount from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.paid_at<=to_date and p.status in ('paid','partial','مدفوع','جزئي') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  union all select a.occurred_on,case a.direction when 'debit' then 'charge' else 'credit' end,a.amount from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.occurred_on<=to_date
  union all select e.occurred_on,case e.direction when 'debit' then 'charge' else 'credit' end,e.amount from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.lease_id=lid and e.occurred_on<=to_date and e.kind<>'receipt_cancellation'
  union all select a.period,'credit',a.amount from private.aqari_credit_allocations a join private.aqari_tenant_ledger_entries e on e.workspace_id=w and e.id=a.credit_entry_id where a.workspace_id=w and a.lease_id=lid and e.lease_id is null and a.period<=to_date
  union all select c.occurred_on,'payment',c.amount from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=to_date
  union all select r.occurred_on,'charge',r.amount from private.aqari_commercial_collection_reversals r join private.aqari_commercial_collections c on c.workspace_id=r.workspace_id and c.id=r.collection_id where r.workspace_id=w and c.lease_id=lid and r.occurred_on<=to_date
 )select coalesce(sum(case when stream='charge' then amount else -amount end)filter(where on_date<from_date),0),coalesce(sum(amount)filter(where stream='charge' and on_date between from_date and to_date),0),coalesce(sum(amount)filter(where stream='payment' and on_date between from_date and to_date),0),coalesce(sum(amount)filter(where stream='credit' and on_date between from_date and to_date),0) into opening,charges,payments,credits from entries;
 return jsonb_build_object('fromDate',from_date::text,'toDate',to_date::text,'openingBalance',opening::numeric(18,3)::text,'charges',charges::numeric(18,3)::text,'payments',payments::numeric(18,3)::text,'credits',credits::numeric(18,3)::text,'closingBalance',(opening+charges-payments-credits)::numeric(18,3)::text,'commercialIncluded',exists(select 1 from private.aqari_commercial_terms c where c.workspace_id=w and c.lease_id=lid),'camIncluded',exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='common_charge' and a.occurred_on<=to_date),'commercialCollectionsIncluded',exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=to_date));
end $function$
$definition$;
 elsif md5(pg_get_functiondef('private.aqari_official_statement(uuid,uuid,date,date)'::regprocedure)) <> '46d0c68f84f24ea5c7426c3e6f3d6ed7' then raise exception 'REVIEWED_STATEMENT_CHANGED';end if;
 if to_regprocedure('private.aqari_contact_channel_allowed(jsonb,text)') is null then
  execute $definition$CREATE OR REPLACE FUNCTION private.aqari_contact_channel_allowed(profile jsonb, channel text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select case lower(coalesce(nullif(btrim(profile->>'preferredContact'),''),'both')) when 'both' then channel in ('email','whatsapp') when 'email' then channel='email' when 'whatsapp' then channel='whatsapp' when 'phone' then false when 'none' then false else false end $function$
$definition$;
 elsif md5(pg_get_functiondef('private.aqari_contact_channel_allowed(jsonb,text)'::regprocedure)) <> 'a4d4b055a9315961d00b3d802b31ff00' then raise exception 'REVIEWED_CONTACT_CHANGED';end if;
end $restore$;
revoke all on function private.aqari_official_statement(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function private.aqari_contact_channel_allowed(jsonb,text) from public,anon,authenticated;
commit;
