-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- LOCAL ONLY acceptance after payment-method-reference-existing.sql and guard twice.
-- All assertions use that dedicated synthetic workspace; this transaction rolls back.
begin;
select set_config('request.jwt.claim.sub','768b0000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:='768b0000-0000-4000-8000-000000000098';d jsonb;rev bigint;candidate jsonb;c jsonb;r jsonb;l jsonb;v jsonb;oldpay jsonb;payid uuid;method text;ref jsonb;expected text;before_count bigint;begin
 select payload,revision into d,rev from public.aqari_app_state where workspace_id=w;
 select to_jsonb(p),id into strict oldpay,payid from public.aqari_rent_payments p where workspace_id=w and reference='PAYMENT-LEGACY-CASH';
 if oldpay#>>'{record,transactionNo}'<>'' then raise exception 'HISTORICAL_REFERENCE_CHANGED';end if;
 -- Ordinary state read/save does not retroactively require a fabricated reference.
 perform public.aqari_save_state_v267(w,d,rev);select revision into rev from public.aqari_app_state where workspace_id=w;
 if (select to_jsonb(p) from public.aqari_rent_payments p where id=payid) is distinct from oldpay then raise exception 'HISTORY_REWRITTEN_ON_REPLAY';end if;
 c:=d->'contractsV202'->0;
 select count(*) into before_count from public.aqari_rent_payments where workspace_id=w;
 -- Use the actual public save/projection boundary, for both old/new details versions.
 foreach method in array array['نقدي','كي نت','KNET','تحويل بنكي','شيك','أخرى'] loop
  r:=jsonb_build_array('PAYMENT-NEW-TEST',c->>'tenant',1,'جزئي',c->>'property','2026-09-10','1','اختبار مرجع','2026-09',method);
  l:=jsonb_build_object('receiptNo','PAYMENT-NEW-TEST','contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit','1','tenant',c->>'tenant','paid',1,'due',100,'period','2026-09','paidAt','2026-09-10','status','جزئي','method',method,'accountant',c->>'accountant','transactionNo','TX-0001');
  v:=jsonb_build_object('id','PAYMENT-NEW-TEST','template','rent-voucher-v267-1','record',r,'contract',c,'detailsVersion',2,'accountant',c->>'accountant','transactionNo','TX-0001');
  candidate:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',d->'collections'||jsonb_build_array(r)),'{rentLedgerV202}',d->'rentLedgerV202'||jsonb_build_array(l)),'{rentReceiptsV267}',d->'rentReceiptsV267'||jsonb_build_array(v));
  begin
   perform public.aqari_save_state_v267(w,candidate,rev);
   if not exists(select 1 from public.aqari_rent_payments where workspace_id=w and reference='PAYMENT-NEW-TEST' and payment_method=method and record=l and receipt=v) then raise exception 'NEW_REFERENCE_NOT_PERSISTED';end if;
   raise exception 'POSITIVE_ROLLBACK';
  exception when raise_exception then if sqlerrm<>'POSITIVE_ROLLBACK' then raise;end if;end;
 end loop;
 -- Cash used to bypass the transaction check. It must now reject missing/invalid refs.
 method:='نقدي';r:=jsonb_set(r,'{9}',to_jsonb(method));l:=l||jsonb_build_object('method',method);v:=v||jsonb_build_object('record',r);
 for ref in select value from jsonb_array_elements('[null,"","   ","\u00A0","\u00A0\u1680\u2007\u202F\u205F\u3000",123,true,"—","N/A","TX\n1","TX\u200B1","TX\u061C1","TX\u00AD1","TX\u180E1"]') union all select to_jsonb(repeat('x',151)) loop
  l:=l||jsonb_build_object('transactionNo',ref);v:=v||jsonb_build_object('transactionNo',ref);
  candidate:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',d->'collections'||jsonb_build_array(r)),'{rentLedgerV202}',d->'rentLedgerV202'||jsonb_build_array(l)),'{rentReceiptsV267}',d->'rentReceiptsV267'||jsonb_build_array(v));
  begin perform public.aqari_save_state_v267(w,candidate,rev);raise exception 'INVALID_CASH_REFERENCE_ACCEPTED';
  exception when check_violation then if sqlerrm<>'أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي.' then raise;end if;end;
 end loop;
 -- A nonempty invented method with a real-looking reference was accepted before.
 foreach method in array array['crypto','غير محدد','bank '] loop
  r:=jsonb_set(r,'{9}',to_jsonb(method));l:=l||jsonb_build_object('method',method,'transactionNo','TX-VALID');v:=v||jsonb_build_object('record',r,'transactionNo','TX-VALID');
  candidate:=jsonb_set(jsonb_set(jsonb_set(d,'{collections}',d->'collections'||jsonb_build_array(r)),'{rentLedgerV202}',d->'rentLedgerV202'||jsonb_build_array(l)),'{rentReceiptsV267}',d->'rentReceiptsV267'||jsonb_build_array(v));
  begin perform public.aqari_save_state_v267(w,candidate,rev);raise exception 'UNKNOWN_METHOD_ACCEPTED';
  exception when check_violation then if sqlerrm<>'اختر طريقة دفع صحيحة قبل إصدار الوصل.' then raise;end if;end;
 end loop;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>before_count or (select revision from public.aqari_app_state where workspace_id=w)<>rev then raise exception 'REJECTED_PAYMENT_LEFT_DATA';end if;
 -- The existing audited cancellation path still accepts the old blank-reference receipt.
 perform public.aqari_final_gap_register(w,'cancel_receipt',jsonb_build_object('id','768b0000-0000-4000-8000-000000000080','payment_id',payid,'reason','إلغاء وصل اختبار تاريخي دون تغيير أصله'));
 if (select to_jsonb(p) from public.aqari_rent_payments p where id=payid) is distinct from oldpay then raise exception 'CANCELLATION_REWROTE_OLD_RECEIPT';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_final_gap_register(w,'list')->'cancellations') x where x->>'payment_id'=payid::text and x->>'approved_by'=auth.uid()::text and nullif(x->>'approved_by_name','') is not null and x->>'cancelled_at' is not null and x->'snapshot'=oldpay) then raise exception 'HISTORICAL_CANCELLATION_AUDIT_MISSING';end if;
 -- Authenticated clients cannot directly edit/delete old records to evade the new guard.
 begin execute format('update public.aqari_rent_payments set payment_method=''cash'' where id=%L',payid);raise exception 'DIRECT_UPDATE_ALLOWED';exception when insufficient_privilege then null;end;
 begin execute format('delete from public.aqari_rent_payments where id=%L',payid);raise exception 'DIRECT_DELETE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Native table insert cannot bypass the rule with a downgraded/empty snapshot.
do $$declare oldrow public.aqari_rent_payments;newid uuid;method text;ref jsonb;rec jsonb;voucher jsonb;begin
 select * into strict oldrow from public.aqari_rent_payments where workspace_id='768b0000-0000-4000-8000-000000000098' and reference='PAYMENT-LEGACY-CASH';
 -- Exact old ON CONFLICT DO NOTHING is a replay, not a new row; AFTER INSERT skips it.
 insert into public.aqari_rent_payments select oldrow.* on conflict(id) do nothing;
 foreach method in array array['cash','knet','bank','cheque','other'] loop
  rec:=jsonb_build_object('method',method,'transactionNo','NATIVE-REFERENCE');voucher:=jsonb_build_object('transactionNo','NATIVE-REFERENCE','record',jsonb_build_array('NATIVE-NEW','tenant',1,'partial','property','2026-09-10','unit','','2026-09',method));
  begin
   insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values(gen_random_uuid(),oldrow.workspace_id,oldrow.lease_id,'NATIVE-NEW',1,oldrow.period,oldrow.paid_at,'partial',method,rec,voucher);
   raise exception 'POSITIVE_ROLLBACK';exception when raise_exception then if sqlerrm<>'POSITIVE_ROLLBACK' then raise;end if;end;
 end loop;
 for ref in select value from jsonb_array_elements('[null,"",123,true]') loop
  begin insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values(gen_random_uuid(),oldrow.workspace_id,oldrow.lease_id,'NATIVE-REJECT',1,oldrow.period,oldrow.paid_at,'partial','cash',jsonb_build_object('transactionNo',ref),jsonb_build_object('transactionNo',ref));raise exception 'NATIVE_REFERENCE_BYPASS';exception when check_violation then if sqlerrm not like 'أدخل مرجع الحركة%' then raise;end if;end;
 end loop;
 foreach method in array array['', 'bitcoin'] loop
  begin insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values(gen_random_uuid(),oldrow.workspace_id,oldrow.lease_id,'NATIVE-REJECT',1,oldrow.period,oldrow.paid_at,'partial',method,'{"method":"cash","transactionNo":"TX-OK"}','{"transactionNo":"TX-OK"}');raise exception 'NATIVE_METHOD_BYPASS';exception when check_violation then if sqlerrm<>'اختر طريقة دفع صحيحة قبل إصدار الوصل.' then raise;end if;end;
 end loop;
 for voucher in select value from jsonb_array_elements('[{}, {"transactionNo":"WRONG"}, {"transactionNo":"TX-OK","record":[0,0,0,0,0,0,0,0,0,"bank"]}]') loop
  begin insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values(gen_random_uuid(),oldrow.workspace_id,oldrow.lease_id,'NATIVE-REJECT',1,oldrow.period,oldrow.paid_at,'partial','cash','{"method":"cash","transactionNo":"TX-OK"}',voucher);raise exception 'NATIVE_SNAPSHOT_BYPASS';exception when check_violation then if sqlerrm<>'طريقة الدفع ومرجع الحركة لا يتطابقان مع الوصل المحفوظ.' then raise;end if;end;
 end loop;
 if (select prosecdef from pg_proc where oid='private.aqari_payment_method_reference_guard()'::regprocedure) then raise exception 'GUARD_UNNECESSARILY_PRIVILEGED';end if;
 if has_function_privilege('anon','private.aqari_payment_method_reference_guard()','execute') or has_function_privilege('authenticated','private.aqari_payment_method_reference_guard()','execute') then raise exception 'GUARD_RPC_EXPOSED';end if;
end $$;
set constraints all immediate;
rollback;
select 'PASS: explicit known method/reference on new payments; cash/noncash/native/snapshot rejection; old receipt and idempotent replay preserved; historical audited cancellation and denied direct update/delete; invoker guard only';
