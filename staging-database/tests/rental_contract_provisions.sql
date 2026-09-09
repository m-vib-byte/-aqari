-- Synthetic append-only fixtures; every change and identity is rolled back.
begin;
insert into private.aqari_allowed_users values('linked-details-test@example.invalid','اختبار الربط','general_manager','aqari-v267-staging',true,now());
insert into auth.users(id,email) values('67222222-2222-4222-8222-222222222222','linked-details-test@example.invalid');
select set_config('request.jwt.claim.sub','67222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $$
<<verify>>
declare w uuid; state jsonb; d jsonb; candidate jsonb; t jsonb; c jsonb; saved jsonb; ledger jsonb; receipt jsonb; row_data jsonb; f text; n bigint;
begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid() and is_active;
 state:=public.aqari_read_state_v267(w);d:=state->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 t:='{"id":"linked-details-t","nameAr":"مستأجر اختبار ربط","nameEn":"Linked Test Tenant","civilId":"678901234567","passportNo":"TEST-PASSPORT","phone":"55550000","nationality":"اختبار","email":"linked-tenant@example.invalid","address":"","attachments":[]}'::jsonb;
 c:='{"id":"linked-details-c","contract_no":"LINKED-TEST","source":"v267-cloud","detailsVersion":2,"tenantId":"linked-details-t","tenant":"مستأجر اختبار ربط","property":"عقار اختبار ربط مؤقت","unit":"TEST-01","floor":"الأول","contractRent":100,"discount":10,"rent":90,"deposit":50,"advance":0,"cleaningFee":5,"start_date":"2026-01-01","end_date":"2027-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"مستلم","evictionNotice":"لم يُبلّغ"}'::jsonb
 ||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'),'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00');
 c:=c||'{"rentalTermsVersion":1,"contractReceived":"لم يستلم","receivedAt":"","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'::jsonb;
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار اختبار ربط مؤقت"]]'::jsonb);
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 saved:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if jsonb_array_length(public.aqari_contract_history(w,c->>'id'))<>1 then raise exception 'INITIAL_VERSION_MISSING';end if;
 c:=c||jsonb_build_object('freeMonthApproved',true,'freeMonthPeriod','2026-10','depositReceivedOn','2026-09-01','changeReason','Synthetic documented approval');
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c else x end) from jsonb_array_elements(d->'contractsV202') x));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 if jsonb_array_length(public.aqari_contract_history(w,c->>'id'))<>2 then raise exception 'AMENDMENT_HISTORY_MISSING';end if;
 if public.aqari_contract_history(w,c->>'id')#>>'{0,before_snapshot,freeMonthApproved}'<>'false' then raise exception 'ORIGINAL_OVERWRITTEN';end if;
 c:=c||'{"rentAdjustments":[{"effectiveMonth":"2026-11","discount":20,"rent":80,"reason":"Synthetic future discount approval"}],"changeReason":"Approve a future discount"}'::jsonb;
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c else x end) from jsonb_array_elements(d->'contractsV202') x));
 saved:=public.aqari_save_state_v267(w,d,(saved->>'revision')::bigint);
 candidate:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c||'{"rentAdjustments":[]}'::jsonb else x end) from jsonb_array_elements(d->'contractsV202') x));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'PRIOR_ADJUSTMENT_DELETED';exception when raise_exception then if sqlerrm='PRIOR_ADJUSTMENT_DELETED' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c||'{"status":"signed"}'::jsonb else x end) from jsonb_array_elements(d->'contractsV202') x));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'UNSIGNED_CONTRACT_ACTIVATED';exception when raise_exception then if sqlerrm='UNSIGNED_CONTRACT_ACTIVATED' then raise;end if;end;
end $$;
reset role;
do $$ declare c jsonb:='{"rentalTermsVersion":1,"rent":90,"freeMonthApproved":true,"freeMonthPeriod":"2026-10","rentAdjustments":[{"effectiveMonth":"2026-11","rent":80}]}';begin
 if private.aqari_contract_due(c,'2026-09')<>90 or private.aqari_contract_due(c,'2026-10')<>0 or private.aqari_contract_due(c,'2026-11')<>80 then raise exception 'PERIOD_AMOUNT_FAILED';end if;
end $$;
select 'PASS: pending delivery, optional receipt date, documented free month, dated discount, immutable history, signed-file gate, period arithmetic' as result;
rollback;
