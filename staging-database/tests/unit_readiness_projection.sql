-- Regression on the real application state RPC, after the readiness migration.
begin;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
do $$declare w uuid:='76620000-0000-4000-8000-000000000900';state jsonb;d jsonb;c jsonb;r jsonb;row_data jsonb;receipt jsonb;p uuid;prior jsonb;begin
 state:=public.aqari_read_state_v267(w);d:=state->'payload';c:=d->'contractsV202'->0;prior:=c;
 -- Its existing lease predates readiness and must still support collection.
 row_data:=jsonb_build_array('READINESS-RECEIPT',c->>'tenant',20,'جزئي',c->>'property',current_date::text,c->>'unit','موظف اختبار',to_char(current_date,'YYYY-MM'),'نقدي');
 r:=jsonb_build_object('receiptNo',row_data->>0,'contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',20,'due',100,'period',to_char(current_date,'YYYY-MM'),'paidAt',current_date::text,'status','جزئي','method','نقدي','transactionNo','','accountant',c->>'accountant');
 receipt:=jsonb_build_object('id',row_data->>0,'detailsVersion',2,'template','rent-voucher-v267-1','record',row_data,'contract',c,'accountant',c->>'accountant','transactionNo','');
 d:=d||jsonb_build_object('collections',jsonb_build_array(row_data),'rentLedgerV202',jsonb_build_array(r),'rentReceiptsV267',jsonb_build_array(receipt));
 perform public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 state:=public.aqari_read_state_v267(w);
 if state->'payload' is distinct from d then raise exception 'READINESS_PAYMENT_READBACK_MISMATCH';end if;
 -- A new unit and tenancy through the same RPC must be rejected atomically.
 c:=c||jsonb_build_object('id','readiness-new-projection','unit','2','contract_no','READINESS-NEW-PROJECTION','status','draft');
 begin
  perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',d->'contractsV202'||jsonb_build_array(c)),(state->>'revision')::bigint);
  raise exception 'STATE_RPC_BYPASSED_READINESS';
 exception when check_violation then if sqlerrm<>'UNIT_NOT_READY' then raise;end if;end;
 if public.aqari_read_state_v267(w) is distinct from state then raise exception 'DENIED_LEASE_CHANGED_STATE_OR_REVISION';end if;
 -- Explicit readiness permits the same draft; no blanket approval or guessed state.
 select id into p from public.aqari_properties where workspace_id=w and name=c->>'property';
 perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','76620000-0000-4000-8000-000000000901','property_id',p,'unit_no','2','expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','محضر فحص اصطناعي','reason','اجتازت الوحدة الفحص'));
 perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',d->'contractsV202'||jsonb_build_array(c)),(state->>'revision')::bigint);
 if public.aqari_read_state_v267(w)#>'{payload,contractsV202,0}' is distinct from prior then raise exception 'EXISTING_CONTRACT_MUTATED';end if;
 if public.aqari_read_state_v267(w)#>'{payload,rentReceiptsV267,0}' is distinct from receipt then raise exception 'EXISTING_RECEIPT_MUTATED';end if;
end$$;
reset role;
do $$begin
 if (select count(*) from public.aqari_rent_payments where workspace_id='76620000-0000-4000-8000-000000000900' and amount=20 and reference='READINESS-RECEIPT')<>1 then raise exception 'PAYMENT_PROJECTION_LOST_OR_DUPLICATED';end if;
 if (select count(*) from public.aqari_leases where workspace_id='76620000-0000-4000-8000-000000000900')<>2 then raise exception 'NEW_READY_LEASE_NOT_PROJECTED';end if;
end$$;
rollback;
select 'PASS: real state RPC rejects unreviewed new lease atomically, accepts reviewed unit, preserves legacy contract and receipt, and projects one payment';
