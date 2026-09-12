-- Isolated acceptance/rejection test for G05-09..11. All synthetic data rolls back.
begin;

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('opening-manager@example.invalid','مدير اختبار الرصيد الافتتاحي','general_manager','aqari-v267-staging'),
 ('opening-viewer@example.invalid','مشاهد اختبار الرصيد الافتتاحي','viewer','aqari-v267-staging');

insert into auth.users(id,email,email_confirmed_at) values
 ('7f6b1000-0000-4000-8000-000000000001','opening-manager@example.invalid',now()),
 ('7f6b1000-0000-4000-8000-000000000002','opening-viewer@example.invalid',now());

select set_config('request.jwt.claim.sub','7f6b1000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('opening.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);

insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('7f6b1000-0000-4000-8000-000000000010',current_setting('opening.w')::uuid,'opening-property','عقار اختبار الرصيد الافتتاحي','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('7f6b1000-0000-4000-8000-000000000011',current_setting('opening.w')::uuid,'7f6b1000-0000-4000-8000-000000000010','OPEN-1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values
 ('7f6b1000-0000-4000-8000-000000000012',current_setting('opening.w')::uuid,'opening-tenant','مستأجر اختبار الرصيد الافتتاحي','761000000001','76100001','opening-tenant@example.invalid','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('7f6b1000-0000-4000-8000-000000000013',current_setting('opening.w')::uuid,'opening-lease','7f6b1000-0000-4000-8000-000000000012','7f6b1000-0000-4000-8000-000000000011','OPEN-LEASE-1','2026-01-01','2026-12-31',100,0,'signed','{}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('7f6b1000-0000-4000-8000-000000000014',current_setting('opening.w')::uuid,'7f6b1000-0000-4000-8000-000000000013','OPEN-LIVE-PAY',100,'2026-02-01','2026-02-02','paid','bank','{}','{}');

set local role authenticated;

do $$
declare
  w uuid:=current_setting('opening.w')::uuid;
  r jsonb;
begin
  perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000020","tenant_id":"7f6b1000-0000-4000-8000-000000000012","lease_id":"7f6b1000-0000-4000-8000-000000000013","direction":"debit","kind":"opening_debit","amount":"40.000","occurred_on":"2026-01-01","reason":"رصيد افتتاحي مدين من المصدر القديم","source_type":"legacy_import","source_id":"opening-debit-1"}');
  perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000021","tenant_id":"7f6b1000-0000-4000-8000-000000000012","lease_id":"7f6b1000-0000-4000-8000-000000000013","direction":"credit","kind":"opening_credit","amount":"10.000","occurred_on":"2026-01-01","reason":"رصيد افتتاحي دائن من المصدر القديم","source_type":"legacy_import","source_id":"opening-credit-1"}');
  perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"7f6b1000-0000-4000-8000-000000000022","tenant_id":"7f6b1000-0000-4000-8000-000000000012","lease_id":"7f6b1000-0000-4000-8000-000000000013","direction":"credit","kind":"adjustment","amount":"5.000","occurred_on":"2026-02-03","reason":"تسوية لاحقة غير افتتاحية","source_type":"manual","source_id":"adjustment-1"}');

  r:=public.aqari_opening_balance_statement(w,'7f6b1000-0000-4000-8000-000000000012');
  if jsonb_array_length(r->'opening_entries')<>2 then raise exception 'OPENING_ENTRY_COUNT_FAILED:%',r; end if;
  if (r#>>'{totals,opening_debit}')::numeric<>40.000 then raise exception 'OPENING_DEBIT_FAILED:%',r; end if;
  if (r#>>'{totals,opening_credit}')::numeric<>10.000 then raise exception 'OPENING_CREDIT_FAILED:%',r; end if;
  if (r#>>'{totals,opening_net}')::numeric<>30.000 then raise exception 'OPENING_NET_FAILED:%',r; end if;
  if (r#>>'{totals,non_opening_credit}')::numeric<>5.000 then raise exception 'NON_OPENING_LEDGER_FAILED:%',r; end if;
  if (r#>>'{totals,actual_collections}')::numeric<>100.000 then raise exception 'LIVE_COLLECTION_FAILED:%',r; end if;
  if exists(select 1 from jsonb_array_elements(r->'opening_entries') x where x->>'kind'='adjustment') then raise exception 'ADJUSTMENT_MIXED_IN_OPENING'; end if;
end $$;

select set_config('request.jwt.claim.sub','7f6b1000-0000-4000-8000-000000000002',true);
do $$begin
  begin
    perform public.aqari_opening_balance_statement(current_setting('opening.w')::uuid,null);
    raise exception 'VIEWER_OPENING_BALANCE_ACCESS';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
select 'PASS: opening balances remain distinct from live collections and later ledger adjustments; unauthorized viewer denied.' result;
