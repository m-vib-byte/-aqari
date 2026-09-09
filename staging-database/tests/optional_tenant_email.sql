-- Synthetic append-only fixtures; all data, accounts and portal test grants roll back.
-- Apply optional-tenant-email.sql before this test, or combine both inside one rollback.
begin;
insert into private.aqari_allowed_users values('optional-email-test@example.invalid','اختبار البريد الاختياري','general_manager','aqari-v267-staging',true,now());
insert into auth.users(id,email,email_confirmed_at) values('67244444-4444-4444-8444-444444444444','optional-email-test@example.invalid',now());
select set_config('request.jwt.claim.sub','67244444-4444-4444-8444-444444444444',true);
set local role authenticated;
do $$
declare w uuid; state jsonb; d jsonb; t jsonb; c jsonb; p jsonb; candidate jsonb; saved jsonb; variant jsonb; f text; lease_id uuid;
begin
 select workspace_id into strict w from public.aqari_memberships where user_id=auth.uid() and is_active;
 state:=public.aqari_read_state_v267(w);d:=state->'payload';
 t:='{"id":"optional-email-t","nameAr":"مستأجر اختبار البريد","nameEn":"Optional Email Test","civilId":"678901234568","passportNo":"TEST-OPTIONAL","phone":"55550001","nationality":"اختبار","address":"","attachments":[]}'::jsonb;
 c:='{"id":"optional-email-c","contract_no":"OPTIONAL-EMAIL-TEST","source":"v267-cloud","detailsVersion":2,"rentalTermsVersion":1,"tenantId":"optional-email-t","tenant":"مستأجر اختبار البريد","property":"عقار اختبار البريد المؤقت","unit":"OPTIONAL-01","floor":"الأول","contractRent":100,"discount":0,"rent":100,"deposit":0,"advance":0,"cleaningFee":0,"start_date":"2026-01-01","end_date":"2027-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"لم يستلم","receivedAt":"","evictionNotice":"لم يُبلّغ","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'::jsonb
 ||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'));
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار اختبار البريد المؤقت"]]'::jsonb);
 -- Positive cases use subtransactions so each starts with the same authoritative revision.
 for variant in select value from jsonb_array_elements('[{}, {"email":null}, {"email":""}, {"email":"   "}, {"email":"saved@example.invalid"}]') loop
  p:=t||variant;
  candidate:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(p));
  candidate:=jsonb_set(candidate,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c||jsonb_build_object('tenantProfile',p)));
  begin
   saved:=public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);
   if not exists(select 1 from public.aqari_tenants where workspace_id=w and external_ref=t->>'id' and email is not distinct from nullif(lower(btrim(p->>'email')),'')) then raise exception 'OPTIONAL_EMAIL_PROJECTION_FAILED';end if;
   if not exists(select 1 from jsonb_array_elements(saved->'payload'->'contractsV202') x where x->>'id'=c->>'id' and x->'tenantProfile'=p) then raise exception 'OPTIONAL_EMAIL_READBACK_FAILED';end if;
   raise exception 'POSITIVE_CASE_ROLLBACK';
  exception when raise_exception then if sqlerrm<>'POSITIVE_CASE_ROLLBACK' then raise;end if;end;
 end loop;
 for variant in select value from jsonb_array_elements('[{"email":"wrong"},{"email":"missing@host"},{"email":"two@@example.invalid"},{"email":"a b@example.invalid"},{"email":123},{"email":false},{"email":{}}]') loop
  p:=t||variant;
  candidate:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(p));
  candidate:=jsonb_set(candidate,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c||jsonb_build_object('tenantProfile',p)));
  begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'INVALID_EMAIL_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'TENANT_DETAILS_INVALID' then raise;end if;end;
 end loop;
 foreach f in array array['nameAr','nameEn','nationality','civilId','passportNo','phone'] loop
  p:=t-f;
  candidate:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(p));
  candidate:=jsonb_set(candidate,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c||jsonb_build_object('tenantProfile',p)));
  begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'MANDATORY_IDENTITY_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'TENANT_FIELD_REQUIRED:'||f then raise;end if;end;
 end loop;
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 saved:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if jsonb_array_length(public.aqari_contract_history(w,c->>'id'))<>1 then raise exception 'CONTRACT_HISTORY_MISSING';end if;
 -- A subsequent contact update cannot rewrite the frozen contract's tenant snapshot.
 p:=t||'{"email":"later@example.invalid"}';
 candidate:=jsonb_set(d,'{tenantProfilesV267}',(select jsonb_agg(case when x->>'id'=t->>'id' then p else x end) from jsonb_array_elements(d->'tenantProfilesV267') x));
 candidate:=jsonb_set(candidate,'{contractsV202}',(select jsonb_agg(case when x->>'id'=c->>'id' then c||jsonb_build_object('tenantProfile',p,'changeReason','Attempted historical contact replacement') else x end) from jsonb_array_elements(d->'contractsV202') x));
 begin perform public.aqari_save_state_v267(w,candidate,(saved->>'revision')::bigint);raise exception 'CONTRACT_CONTACT_SNAPSHOT_REWRITTEN';
 exception when raise_exception then if sqlerrm<>'TENANT_SNAPSHOT_MISMATCH' then raise;end if;end;
 perform set_config('aqari.test.optional_email_workspace',w::text,true);
 perform set_config('aqari.test.optional_email_tenant',(select id::text from public.aqari_tenants where workspace_id=w and external_ref=t->>'id'),true);
end $$;
reset role;
-- Direct fixture grant isolates the existing ownership predicate; this does not create
-- a real portal user or weaken provisioning. Matching verified email remains mandatory.
insert into public.aqari_portal_accounts(user_id,workspace_id,tenant_id) values('67244444-4444-4444-8444-444444444444',current_setting('aqari.test.optional_email_workspace')::uuid,current_setting('aqari.test.optional_email_tenant')::uuid);
set local role authenticated;
do $$ begin
 if private.aqari_owns_tenant(current_setting('aqari.test.optional_email_workspace')::uuid,current_setting('aqari.test.optional_email_tenant')::uuid) then raise exception 'EMAILLESS_PORTAL_ACCESS';end if;
 begin perform public.aqari_tenant_portal_snapshot();raise exception 'EMAILLESS_PORTAL_SNAPSHOT';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.aqari_tenants set email='optional-email-test@example.invalid' where id=current_setting('aqari.test.optional_email_tenant')::uuid;
set local role authenticated;
do $$ begin
 if not private.aqari_owns_tenant(current_setting('aqari.test.optional_email_workspace')::uuid,current_setting('aqari.test.optional_email_tenant')::uuid) then raise exception 'VERIFIED_MATCHING_PORTAL_DENIED';end if;
end $$;
reset role;
update auth.users set email_confirmed_at=null where id='67244444-4444-4444-8444-444444444444';
set local role authenticated;
do $$ begin
 if private.aqari_owns_tenant(current_setting('aqari.test.optional_email_workspace')::uuid,current_setting('aqari.test.optional_email_tenant')::uuid) then raise exception 'UNVERIFIED_PORTAL_ALLOWED';end if;
end $$;
reset role;
rollback;
select 'PASS: optional missing/null/blank email and valid email save and reread, invalid values rejected, identity fields mandatory, contract history and contact snapshot retained, portal requires verified matching email; synthetic fixtures rolled back' result;
