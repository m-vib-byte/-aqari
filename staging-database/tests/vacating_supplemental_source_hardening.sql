-- Synthetic acceptance in one rollback transaction; no DDL or stored PDFs changed.
begin;
insert into public.aqari_workspaces(id,slug,name) values('76a10000-0000-4000-8000-000000000900','supplemental-source-test','Synthetic supplemental source');
insert into public.aqari_app_state(workspace_id,payload) values('76a10000-0000-4000-8000-000000000900','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('supplemental-manager@example.invalid','مدير مصدر التسوية','general_manager','supplemental-source-test'),
 ('supplemental-accountant@example.invalid','محاسب مصدر التسوية','accountant','supplemental-source-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('76a10000-0000-4000-8000-000000000001','supplemental-manager@example.invalid',now()),
 ('76a10000-0000-4000-8000-000000000002','supplemental-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','76a10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$declare w uuid:=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;n integer;begin
 for n in 1..7 loop
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(('76a10000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,w,'SUP-P-'||n,'عقار مصدر '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(('76a10000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,w,('76a10000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'SUP-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',('76a10000-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid,'property_id',('76a10000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'unit_no','SUP-'||n,
    'expected_revision',0,'state','ready','inspected_on','2026-08-01','source_ref','فحص وحدة اصطناعية','reason','جاهزية اختبار مصدر التسوية'));
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(('76a10000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,w,'SUP-T-'||n,'مستأجر مصدر '||n,'76110000000'||n,'7611000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(('76a10000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,w,'SUP-L-'||n,('76a10000-0000-4000-8000-'||lpad((300+n)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'SUP-L-'||n,'2026-08-01','2026-12-31',100,0,'signed','{}');
  insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
   values(('76a10000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,w,('76a10000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,'SUP-PAY-'||n,case n when 4 then 100.001 else 100 end,'2026-08-01','2026-08-05','paid','cash','{}','{}');
  insert into public.aqari_utility_meters(id,workspace_id,property_id,source_key,kind,source_refs) values(('76a10000-0000-4000-8000-'||lpad((700+n)::text,12,'0'))::uuid,w,('76a10000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'SUP-M-'||n,'water','[]');
 end loop;
 -- Property bills have no tenant adjustment at all; absence of that ledger
 -- must not be mistaken for a zero utility balance.
 insert into public.aqari_utility_entries(id,workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,amount_paid,payment_status,source_ref) values
 (('76a10000-0000-4000-8000-'||lpad((802)::text,12,'0'))::uuid,w,('76a10000-0000-4000-8000-'||lpad((102)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((702)::text,12,'0'))::uuid,'bill','SUP-UNPAID','2026-08-01',20,0,'unpaid','فاتورة اصطناعية مفتوحة'),
 (('76a10000-0000-4000-8000-'||lpad((803)::text,12,'0'))::uuid,w,('76a10000-0000-4000-8000-'||lpad((103)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((703)::text,12,'0'))::uuid,'bill','SUP-UNKNOWN','2026-08-01',20,null,'unknown','فاتورة اصطناعية غير مؤكدة');
end $$;
set local role authenticated;
do $$declare w uuid:=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;n integer;r jsonb;d jsonb;begin
 for n in 1..7 loop
  d:=jsonb_build_object('lease_id',('76a10000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,'vacate_date','2026-08-31','keys_returned',true,'inspection_completed',true,'meters_recorded',true,
   'damage_amount','0.000','damage_notes','','charges_resolved',true,'charges_reference','مراجعة اختبار مصادر التسوية','revision',0);
  if n=1 then
   perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
   begin perform public.aqari_vacating_settlement(w,'save',d);raise exception 'AAL1_SAVED_SETTLEMENT';
   exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
   perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  end if;
  r:=public.aqari_vacating_settlement(w,'save',d);
  if n=1 then
   perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
   begin perform public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id',('76a10000-0000-4000-8000-'||lpad((401)::text,12,'0'))::uuid,'revision',r#>>'{settlement,revision}'));raise exception 'AAL1_FINALIZED_SETTLEMENT';
   exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
   perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  end if;
  r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id',('76a10000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,'revision',r#>>'{settlement,revision}'));
  if n in(2,3) and (r#>'{settlement,settlement_snapshot}') ? 'utility_balance' then raise exception 'OPEN_BILL_CAPTURED_AS_ZERO';end if;
  if n=1 and (r#>>'{settlement,settlement_snapshot,utility_balance}' is distinct from '0.000' or r#>>'{settlement,settlement_snapshot,legal_balance}' is distinct from '0.000') then raise exception 'VALID_ZERO_NOT_CAPTURED';end if;
 end loop;
 begin perform private.aqari_vacating_has_open_utility(w,('76a10000-0000-4000-8000-'||lpad((401)::text,12,'0'))::uuid);raise exception 'PRIVATE_SOURCE_HELPER_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Synthetic legacy snapshots model missing/negative archived credit, without
-- weakening constraints or altering any production history.
update private.aqari_vacating_settlements set settlement_snapshot=jsonb_set(settlement_snapshot,'{final_balances,tenant_credit}','"-0.001"') where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and lease_id=('76a10000-0000-4000-8000-'||lpad((405)::text,12,'0'))::uuid;
update private.aqari_vacating_settlements set settlement_snapshot=settlement_snapshot#-'{final_balances,tenant_credit}' where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and lease_id=('76a10000-0000-4000-8000-'||lpad((406)::text,12,'0'))::uuid;
-- An unrelated UPDATE on an already finalized row cannot fabricate a missing
-- historical review, even when the current property has no bill.
update private.aqari_vacating_settlements set settlement_snapshot=settlement_snapshot-array['utility_balance','legal_balance','supplemental_review','supplemental_reviewed_at'] where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and lease_id=('76a10000-0000-4000-8000-'||lpad((407)::text,12,'0'))::uuid;
update private.aqari_vacating_settlements set updated_at=now() where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and lease_id=('76a10000-0000-4000-8000-'||lpad((407)::text,12,'0'))::uuid;
do $$begin
 if exists(select 1 from private.aqari_vacating_settlements where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and lease_id=('76a10000-0000-4000-8000-'||lpad((407)::text,12,'0'))::uuid and settlement_snapshot ? 'utility_balance') then raise exception 'OLD_SNAPSHOT_RECAPTURED';end if;
end $$;

-- Build a valid body/hash independently, including forged zero fields when
-- needed, so acceptance calls the public issue RPC directly, not context only.
do $$
declare w uuid:=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;lid uuid;ident uuid;s private.aqari_vacating_settlements;
 spec jsonb;v jsonb;b text;snap jsonb;k text;no text;slot integer;n integer;request jsonb;requests jsonb:='[]';
begin
 -- The eighth distinct request is prepared for the later-bill scenario.
 for slot in 1..8 loop
 n:=case when slot=8 then 1 else slot end;
 lid:=('76a10000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid;ident:=gen_random_uuid();
 select * into strict s from private.aqari_vacating_settlements where workspace_id=w and lease_id=lid;
 spec:=private.aqari_official_template('final_settlement');no:=public.aqari_official_document_number(w,ident,'final_settlement',lid)->>'document_no';
 v:=jsonb_build_object('documentNo',no,'issuedAt',current_date::text,'tenantName','مستأجر مصدر '||n,'contractNo','SUP-L-'||n,'propertyName','عقار مصدر '||n,'unitNo','SUP-'||n,
  'rentBalance','0.000','damageBalance','0.000','utilityBalance','0.000','legalBalance','0.000','depositBalance','0.000','netBalance','0.000','approvedBy',s.finalized_by_name);
 b:=spec->>'body';for k in select jsonb_array_elements_text(spec->'required') loop b:=replace(b,'{{'||k||'}}',v->>k);end loop;
 snap:=jsonb_build_object('kind','final_settlement','title',spec->>'title','documentNo',no,'version',1,'issuedAt',v->>'issuedAt','body',b,'payload',v);
 request:=jsonb_build_object('id',ident,'version_id',gen_random_uuid(),'event_id',gen_random_uuid(),'kind','final_settlement','document_no',no,'entity_type','lease','entity_id',lid,
  'title',spec->>'title','body',b,'payload',v,'template_version',1,'content_sha256',encode(sha256(convert_to(private.aqari_official_canonical(snap),'UTF8')),'hex'),'reason','اختبار إصدار التسوية مباشرة');
 if slot=8 then perform set_config('supp.late_request',request::text,true);
 else requests:=requests||jsonb_build_array(request);end if;
 end loop;
 perform set_config('supp.requests',requests::text,true);
end $$;
set local role authenticated;
do $$declare w uuid:=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;reqs jsonb:=current_setting('supp.requests')::jsonb;r jsonb;n integer;expected text;begin
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_official_document_register(w,'issue',reqs->0);raise exception 'AAL1_ISSUED_FINAL_SETTLEMENT';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 r:=public.aqari_official_document_register(w,'issue',reqs->0);
 if r#>>'{version,payload,netBalance}' is distinct from '0.000' then raise exception 'VALID_ZERO_ISSUE_FAILED';end if;
 for n in 2..7 loop
  expected:=case when n in(2,3) then 'DOCUMENT_OPEN_UTILITIES_REVIEW_REQUIRED' when n in(4,5,6) then 'DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED' else 'DOCUMENT_SUPPLEMENTAL_SETTLEMENT_REVIEW_REQUIRED' end;
  begin perform public.aqari_official_document_register(w,'issue',reqs->(n-1));raise exception 'UNTRUSTED_FINAL_SETTLEMENT_ISSUED:%',n;
  exception when check_violation then if sqlerrm<>expected then raise exception 'WRONG_SOURCE_REJECTION:%:%',n,sqlerrm;end if;end;
 end loop;
end $$;
reset role;
-- A later bill must also block a NEW document from the old zero snapshot.
insert into public.aqari_utility_entries(id,workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,amount_paid,payment_status,source_ref)
 values(('76a10000-0000-4000-8000-'||lpad((801)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((101)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((701)::text,12,'0'))::uuid,'bill','SUP-AFTER-FINALIZE','2026-08-01',20,0,'unpaid','فاتورة بعد لقطة الصفر الاصطناعية');
set local role authenticated;
do $$declare w uuid:=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;req jsonb:=current_setting('supp.requests')::jsonb->0;r jsonb;begin
 begin perform public.aqari_official_document_register(w,'issue',current_setting('supp.late_request')::jsonb);raise exception 'OLD_ZERO_SNAPSHOT_ISSUED_WITH_OPEN_BILL';
 exception when check_violation then if sqlerrm<>'DOCUMENT_OPEN_UTILITIES_REVIEW_REQUIRED' then raise;end if;end;
 r:=public.aqari_official_document_register(w,'get',jsonb_build_object('id',req->>'id'));
 if jsonb_array_length(r->'versions')<>1 or r#>'{versions,0,payload}' is distinct from req->'payload' then raise exception 'ARCHIVED_DOCUMENT_CHANGED';end if;
 r:=public.aqari_official_document_register(w,'issue',req);if r->>'replayed' is distinct from 'true' then raise exception 'ARCHIVED_ISSUE_RETRY_CHANGED';end if;
end $$;
reset role;
-- Exercise each utility mutation branch on this transaction's synthetic bill.
-- No new client write privilege is granted by the serialization trigger.
update public.aqari_utility_entries set amount_paid=20,payment_status='paid' where id=('76a10000-0000-4000-8000-'||lpad((801)::text,12,'0'))::uuid and workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;
do $$begin
 if private.aqari_vacating_has_open_utility(('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((401)::text,12,'0'))::uuid) then raise exception 'PAID_BILL_STILL_REPORTED_OPEN';end if;
end $$;
update public.aqari_utility_entries set amount_paid=null,payment_status='unknown' where id=('76a10000-0000-4000-8000-'||lpad((801)::text,12,'0'))::uuid and workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;
do $$begin
 if not private.aqari_vacating_has_open_utility(('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((401)::text,12,'0'))::uuid) then raise exception 'UNKNOWN_PAID_AMOUNT_TREATED_AS_ZERO';end if;
end $$;
delete from public.aqari_utility_entries where id=('76a10000-0000-4000-8000-'||lpad((801)::text,12,'0'))::uuid and workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid;
do $$begin
 if private.aqari_vacating_has_open_utility(('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid,('76a10000-0000-4000-8000-'||lpad((401)::text,12,'0'))::uuid) then raise exception 'REMOVED_SYNTHETIC_BILL_REMAINS_IN_SOURCE';end if;
end $$;
do $$begin
 if exists(select 1 from private.aqari_vacating_release_authorizations where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid) then raise exception 'SUPPLEMENTAL_GUARD_CREATED_RELEASE_PERMIT';end if;
 if exists(select 1 from public.aqari_leases where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid and vacated_on is not null) then raise exception 'SUPPLEMENTAL_GUARD_RELEASED_LEASE';end if;
 if (select count(*) from private.aqari_official_document_versions where workspace_id=('76a10000-0000-4000-8000-'||lpad((900)::text,12,'0'))::uuid)<>1 then raise exception 'REJECTED_ISSUE_LEFT_VERSION';end if;
end $$;
rollback;
select 'PASS: zero supplemental snapshot requires no open property bill; direct issue rejects unknown bills, old zero snapshots and positive/negative/missing tenant credit; AAL2, archived document/retry and release isolation preserved';
