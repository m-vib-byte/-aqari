-- Preview/isolated only; requires the existing atomic execution package schema.
-- No business data changes and no expansion of caller privileges.
begin;
do $$begin
 if to_regclass('private.aqari_contract_execution_packages') is null
 or to_regprocedure('private.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamp with time zone,text,integer)') is null then
  raise exception 'EXECUTION_PACKAGE_BASE_SCHEMA_REQUIRED';
 end if;
end $$;
create or replace function private.aqari_contract_execution_package_source(
 p_workspace_id uuid,
 p_contract_ref text,
 p_settlement_id uuid,
 p_contract_document_id uuid,
 p_prepared_at timestamptz,
 p_receipt_no text default '',
 p_contract_receipt_sequence integer default null
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 data jsonb; c jsonb; signed_c jsonb; lease public.aqari_leases%rowtype;
 reservation private.aqari_rent_receipt_serial_reservations%rowtype;
 actor text; first_period date; due_on date; entitlement_due numeric(15,3); credit_amount numeric(15,3); rent_payable numeric(15,3);
 contract_deposit numeric(15,3); deposit_balance numeric(15,3); deposit_due numeric(15,3); advance_due numeric(15,3); fees_due numeric(15,3); total_due numeric(15,3);
 clauses text; canonical_title text; canonical_body text; canonical_payload jsonb; canonical_hash text; template_version integer;
 tenant_title text; tenant_body text; tenant_payload jsonb; tenant_hash text;
 owner_title text; owner_body text; owner_payload jsonb; owner_hash text;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id)
   or not private.aqari_can(p_workspace_id,'contracts','write')
   or not private.aqari_can(p_workspace_id,'collections','write') then
  raise insufficient_privilege using message='GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED';
 end if;
 if p_settlement_id is null or p_contract_document_id is null or btrim(coalesce(p_contract_ref,''))=''
   or length(p_contract_ref)>200 or p_contract_ref ~ '[[:cntrl:]]'
   or p_prepared_at < now()-interval '10 minutes' or p_prepared_at > now()+interval '1 minute' then
  raise exception 'EXECUTION_PACKAGE_INVALID_REQUEST' using errcode='22023';
 end if;
 select private.aqari_unwrap(s.payload) into data from public.aqari_app_state s where s.workspace_id=p_workspace_id;
 if data is null then raise exception 'EXECUTION_PACKAGE_STATE_REQUIRED' using errcode='P0002';end if;
 if (select count(*) from jsonb_array_elements(coalesce(data->'contractsV202','[]'::jsonb)) x where x->>'id'=p_contract_ref)<>1 then
  raise exception 'EXECUTION_PACKAGE_CONTRACT_REQUIRED' using errcode='P0002';
 end if;
 select value into c from jsonb_array_elements(data->'contractsV202') x where x->>'id'=p_contract_ref;
 if c->>'source'<>'v267-cloud' or c->>'status'<>'signing' or btrim(coalesce(c->>'contract_no',''))='' then
  raise exception 'EXECUTION_PACKAGE_SIGNING_REQUIRED' using errcode='23514';
 end if;
 select * into lease from public.aqari_leases l where l.workspace_id=p_workspace_id and l.external_ref=p_contract_ref;
 if not found or lease.status<>'signing' or lease.contract_no<>c->>'contract_no'
   or not private.aqari_can_lease(p_workspace_id,lease.id,'collections','write') then
  raise exception 'EXECUTION_PACKAGE_LEASE_REQUIRED' using errcode='23514';
 end if;
 if coalesce(c#>>'{rentEntitlement,startDate}','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'EXECUTION_PACKAGE_ENTITLEMENT_REQUIRED' using errcode='23514';
 end if;
 first_period:=date_trunc('month',(c#>>'{rentEntitlement,startDate}')::date)::date;
 -- Signing leases intentionally have no posted due schedule yet. Use the same
 -- authoritative calculation as schedule projection without posting a due early.
 entitlement_due:=private.aqari_reminder_due(lease.snapshot,lease.monthly_rent,first_period);
 due_on:=private.aqari_rent_due_on(lease.snapshot,lease.start_date,first_period);
 select coalesce(sum(a.amount),0)::numeric(15,3) into credit_amount
 from private.aqari_credit_allocations a
 where a.workspace_id=p_workspace_id and a.lease_id=lease.id and a.period=first_period;
 if entitlement_due is null or entitlement_due<0 or due_on is null then
  raise exception 'EXECUTION_PACKAGE_DUE_REQUIRED' using errcode='23514';
 end if;
 rent_payable:=greatest(entitlement_due-coalesce(credit_amount,0),0)::numeric(15,3);
 contract_deposit:=coalesce(nullif(c->>'deposit','')::numeric,0);
 select coalesce(sum(case x.kind when 'receipt' then x.amount else -x.amount end),0)::numeric(15,3)
 into deposit_balance from private.aqari_deposit_entries x where x.workspace_id=p_workspace_id and x.lease_id=lease.id;
 deposit_due:=greatest(contract_deposit-deposit_balance,0)::numeric(15,3);
 advance_due:=coalesce(nullif(c->>'advance','')::numeric,0)::numeric(15,3);
 fees_due:=coalesce(nullif(c->>'cleaningFee','')::numeric,0)::numeric(15,3);
 total_due:=(rent_payable+deposit_due+advance_due+fees_due)::numeric(15,3);
 if rent_payable>0 then
  select * into reservation from private.aqari_rent_receipt_serial_reservations r
   where r.receipt_no=btrim(coalesce(p_receipt_no,'')) and r.operation_ref=p_settlement_id;
  if not found or reservation.workspace_id<>p_workspace_id or reservation.contract_ref<>p_contract_ref
     or reservation.contract_sequence is distinct from p_contract_receipt_sequence or reservation.consumed_at is not null then
   raise exception 'EXECUTION_PACKAGE_RECEIPT_RESERVATION_REQUIRED' using errcode='23514';
  end if;
 else
  if btrim(coalesce(p_receipt_no,''))<>'' or p_contract_receipt_sequence is not null then
   raise exception 'EXECUTION_PACKAGE_FAKE_RECEIPT' using errcode='23514';
  end if;
 end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);
 signed_c:=c||jsonb_build_object('status','signed','changeReason','اعتماد تسوية الإبرام وإتمام توقيع العقد');
 clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality)
   from jsonb_array_elements(coalesce(signed_c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
 if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_PACKAGE_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
 canonical_title:='عقد إيجار '||(signed_c->>'contract_no');
 canonical_body:='عقد إيجار رقم '||(signed_c->>'contract_no')||E'\nالمستأجر: '||coalesce(signed_c->>'tenant','')||E'\nالعقار: '||(signed_c->>'property')||' — الوحدة: '||(signed_c->>'unit')||E'\nمدة العقد: '||(signed_c->>'start_date')||' إلى '||(signed_c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(signed_c->>'contractRent',signed_c->>'rent')||' د.ك — الخصم: '||coalesce(signed_c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(signed_c->>'deposit','0')||' د.ك — العربون: '||coalesce(signed_c->>'advance','0')||' د.ك — الرسوم: '||coalesce(signed_c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
 canonical_payload:=jsonb_build_object('contractNo',signed_c->>'contract_no','tenant',signed_c->>'tenant','property',signed_c->>'property','unit',signed_c->>'unit','startDate',signed_c->>'start_date','endDate',signed_c->>'end_date','contractRent',signed_c->>'contractRent','discount',signed_c->>'discount','deposit',signed_c->>'deposit','advance',signed_c->>'advance','fees',signed_c->>'cleaningFee','template',signed_c->'contractTemplate','executionSettlementId',p_settlement_id,'contractSnapshot',signed_c);
 canonical_hash:=encode(extensions.digest(canonical_title||E'\n'||canonical_body||E'\n'||canonical_payload::text,'sha256'),'hex');
 template_version:=coalesce(nullif(signed_c#>>'{contractTemplate,version}','')::integer,1);
 tenant_title:=canonical_title||' — نسخة المستأجر'; tenant_body:='نسخة المستأجر'||E'\n'||canonical_body;
 tenant_payload:=canonical_payload||jsonb_build_object('copyRole','tenant','copyLabelAr','نسخة المستأجر','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 tenant_hash:=encode(extensions.digest(tenant_title||E'\n'||tenant_body||E'\n'||tenant_payload::text,'sha256'),'hex');
 owner_title:=canonical_title||' — نسخة المالك / الإدارة'; owner_body:='نسخة المالك / الإدارة'||E'\n'||canonical_body;
 owner_payload:=canonical_payload||jsonb_build_object('copyRole','owner','copyLabelAr','نسخة المالك / الإدارة','canonicalSeriesId',p_contract_document_id,'contractNo',signed_c->>'contract_no');
 owner_hash:=encode(extensions.digest(owner_title||E'\n'||owner_body||E'\n'||owner_payload::text,'sha256'),'hex');
 return jsonb_build_object(
  'workspace_id',p_workspace_id,'contract_ref',p_contract_ref,'contract_no',signed_c->>'contract_no','lease_id',lease.id,
  'settlement_id',p_settlement_id,'contract_document_id',p_contract_document_id,'prepared_at',p_prepared_at,'actor_id',auth.uid(),'actor_name',actor,
  'pre_contract_snapshot',c,'signed_contract_snapshot',signed_c,
  'first_period',first_period,'due_on',due_on,'entitlement_due',entitlement_due,'credit_amount',coalesce(credit_amount,0),
  'amounts',jsonb_build_object('rent',rent_payable,'deposit',deposit_due,'advance',advance_due,'fees',fees_due,'total',total_due),
  'receipt_no',btrim(coalesce(p_receipt_no,'')),'contract_receipt_sequence',p_contract_receipt_sequence,
  'tenant_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-TENANT','title',tenant_title,'body',tenant_body,'payload',tenant_payload,'content_sha256',tenant_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'owner_document',jsonb_build_object('document_no','CT-'||(signed_c->>'contract_no')||'-OWNER','title',owner_title,'body',owner_body,'payload',owner_payload,'content_sha256',owner_hash,'template_version',template_version,'issued_at',p_prepared_at,'issued_by_name',actor),
  'canonical_content_sha256',canonical_hash
 );
end $$;
revoke all on function private.aqari_contract_execution_package_source(uuid,text,uuid,uuid,timestamptz,text,integer) from public,anon,authenticated,service_role;


commit;
