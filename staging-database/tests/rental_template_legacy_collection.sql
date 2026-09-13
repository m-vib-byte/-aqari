-- LOCAL ONLY: reuses the pre-upgrade signed lease in fixtures/unit-readiness-existing.sql.
-- The fixture existed before readiness and template guards; no guard is disabled here.
begin;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
<<verify>>
declare w uuid:='76620000-0000-4000-8000-000000000900';s jsonb;d jsonb;c jsonb;row_data jsonb;r jsonb;receipt jsonb;after_save jsonb;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';c:=d#>'{contractsV202,0}';
 if c->>'id'<>'readiness-projection-c' or c->>'status'<>'signed' or c?'contractTemplate' then raise exception 'EXPECTED_PRE_UPGRADE_UNTEMPLATED_CONTRACT';end if;
 if (public.aqari_rental_templates(w,'context'))->'items'<>'[]'::jsonb then raise exception 'LEGACY_WORKSPACE_MUST_HAVE_NO_PUBLISHED_TEMPLATE';end if;
 row_data:=jsonb_build_array('TEMPLATE-LEGACY-RECEIPT',c->>'tenant',20,'جزئي',c->>'property',current_date::text,c->>'unit','موظف اختبار',to_char(current_date,'YYYY-MM'),'نقدي');
 r:=jsonb_build_object('receiptNo',row_data->>0,'contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',20,'due',100,'period',to_char(current_date,'YYYY-MM'),'paidAt',current_date::text,'status','جزئي','method','نقدي','transactionNo','TEMPLATE-LEGACY-CASH-REFERENCE','accountant',c->>'accountant');
 receipt:=jsonb_build_object('id',row_data->>0,'detailsVersion',2,'template','rent-voucher-v267-1','record',row_data,'contract',c,'accountant',c->>'accountant','transactionNo','TEMPLATE-LEGACY-CASH-REFERENCE');
 d:=d||jsonb_build_object('collections',jsonb_build_array(row_data),'rentLedgerV202',jsonb_build_array(r),'rentReceiptsV267',jsonb_build_array(receipt));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);after_save:=public.aqari_read_state_v267(w);
 if after_save#>'{payload,contractsV202,0}' is distinct from c or after_save#>'{payload,rentReceiptsV267,0}' is distinct from receipt then raise exception 'LEGACY_CONTRACT_OR_RECEIPT_CHANGED';end if;
 if not exists(select 1 from public.aqari_rent_payments where workspace_id=w and reference='TEMPLATE-LEGACY-RECEIPT' and amount=20 and payment_method='نقدي' and record=r and aqari_rent_payments.receipt=verify.receipt) then raise exception 'LEGACY_COLLECTION_PROJECTION_MISSING';end if;
 -- Ordinary later saves preserve the stored financial movement and old contract exactly.
 perform public.aqari_save_state_v267(w,after_save->'payload',(after_save->>'revision')::bigint);
 if public.aqari_read_state_v267(w)#>'{payload,contractsV202,0}' is distinct from c then raise exception 'LEGACY_CONTRACT_REWRITTEN';end if;
end $$;
reset role;
rollback;
select 'PASS: a pre-upgrade signed contract without a template still accepts a referenced cash receipt; original contract and receipt remain unchanged with one payment projection.' as result;
