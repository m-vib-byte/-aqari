-- LOCAL ISOLATED DATABASE ONLY. Run after staff-property-scope.sql.
-- Do not execute against any hosted project while Staging/Production separation is unresolved.
-- Every identity, permission, contract, payment and state write below rolls back.
-- Synthetic SQL fixtures prove authorization and persistence, not real-account/device tests.
-- Legacy-compatible contracts deliberately exercise existing imported/older records.
-- They are not evidence of a signed upload or the separate current contract-approval gate.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('staff-scope-manager@example.invalid','مدير اختبار عزل الموظفين','general_manager','aqari-v267-staging'),
 ('staff-scope-collector@example.invalid','محصل اختبار العقار أ','accountant','aqari-v267-staging'),
 ('staff-scope-accountant@example.invalid','محاسب اختبار العقار أ','accountant','aqari-v267-staging'),
 ('staff-scope-maintenance@example.invalid','صيانة اختبار العقار ب','property_manager','aqari-v267-staging'),
 ('staff-scope-viewer@example.invalid','عرض اختبار العقار أ','viewer','aqari-v267-staging'),
 ('staff-scope-unassigned@example.invalid','موظف اختبار غير مسند','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76400000-0000-4000-8000-000000000001','staff-scope-manager@example.invalid',now()),
 ('76400000-0000-4000-8000-000000000002','staff-scope-collector@example.invalid',now()),
 ('76400000-0000-4000-8000-000000000003','staff-scope-accountant@example.invalid',now()),
 ('76400000-0000-4000-8000-000000000004','staff-scope-maintenance@example.invalid',now()),
 ('76400000-0000-4000-8000-000000000005','staff-scope-viewer@example.invalid',now()),
 ('76400000-0000-4000-8000-000000000006','staff-scope-unassigned@example.invalid',now());
select set_config('aqari.test.scope.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76400000-0000-4000-8000-000000000001' and is_active),true);
-- Retain existing data for an explicit preservation assertion, not just a final rollback.
create temporary table aqari_staff_scope_baseline on commit drop as
 select private.aqari_unwrap(payload) as payload from public.aqari_app_state where workspace_id=current_setting('aqari.test.scope.workspace')::uuid;
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;state jsonb;d jsonb;t jsonb;c jsonb;r jsonb;row_data jsonb;receipt jsonb;suffix text;rent_paid numeric;
begin
 if public.aqari_workspace_access(w)#>>'{features,staff_access}' is distinct from 'true' then raise exception 'STAFF_TOOL_NOT_DISCOVERABLE';end if;
 state:=public.aqari_read_state_v267(w);d:=(state->'payload');
 if d is null then raise exception 'SCOPE_EXISTING_WORKSPACE_REQUIRED';end if;
 for suffix in select unnest(array['a','b']) loop
  t:=jsonb_build_object('id','staff-scope-t-'||suffix,'nameAr','مستأجر اختبار عزل '||suffix,'nameEn','Staff Scope Tenant '||upper(suffix),'civilId',case when suffix='a' then '764000000001' else '764000000002' end,'passportNo','SCOPE-'||upper(suffix),'phone',case when suffix='a' then '76400001' else '76400002' end,'nationality','اختبار','email','staff-scope-tenant-'||suffix||'@example.invalid','attachments','[]'::jsonb);
  c:=jsonb_build_object('id','staff-scope-c-'||suffix,'source','v267-cloud','detailsVersion',2,'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار اختبار عزل الموظفين '||suffix,'unit','SCOPE-1','floor','الأول','contract_no','STAFF-SCOPE-CONTRACT-'||upper(suffix),'start_date',to_char(current_date-interval '1 month','YYYY-MM-DD'),'end_date',to_char(current_date+interval '1 year','YYYY-MM-DD'),'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'),'receivedAt',to_char((now()-interval '1 hour') at time zone 'Asia/Kuwait','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00','contractReceived','مستلم','evictionNotice','لم يُبلّغ','accountant','محاسب عزل اصطناعي','contractRent',100,'discount',0,'rent',100,'deposit',0,'advance',0,'cleaningFee',0,'status','signed');
  d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||jsonb_build_array(jsonb_build_array(c->>'property')));
  d:=jsonb_set(d,'{tenants}',coalesce(d->'tenants','[]')||jsonb_build_array(jsonb_build_array(t->>'nameAr',c->>'property',t->>'phone','اختبار عزل',t->>'id')));
  d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
  d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
  d:=jsonb_set(d,'{leases}',coalesce(d->'leases','[]')||jsonb_build_array(jsonb_build_array(c->>'tenant',c->>'unit',100,c->>'end_date',c->>'id')));
  d:=jsonb_set(d,'{tenantDirectoryV202}',coalesce(d->'tenantDirectoryV202','[]')||jsonb_build_array(jsonb_build_object('property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','contractNo',c->>'contract_no','phone',t->>'phone','civilId',t->>'civilId','tenantProfileId',t->>'id')));
  rent_paid:=case when suffix='a' then 20 else 30 end;
  row_data:=jsonb_build_array('STAFF-SCOPE-RECEIPT-'||upper(suffix),c->>'tenant',rent_paid,'جزئي',c->>'property',current_date::text,c->>'unit','موظف اختبار',to_char(current_date,'YYYY-MM'),'نقدي');
  r:=jsonb_build_object('receiptNo',row_data->>0,'contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',rent_paid,'due',100,'period',to_char(current_date,'YYYY-MM'),'paidAt',current_date::text,'status','جزئي','method','نقدي','transactionNo','','accountant',c->>'accountant');
  receipt:=jsonb_build_object('id',row_data->>0,'detailsVersion',2,'template','rent-voucher-v267-1','record',row_data,'contract',c,'accountant',c->>'accountant','transactionNo','');
  d:=jsonb_set(d,'{collections}',coalesce(d->'collections','[]')||jsonb_build_array(row_data));
  d:=jsonb_set(d,'{rentLedgerV202}',coalesce(d->'rentLedgerV202','[]')||jsonb_build_array(r));
  d:=jsonb_set(d,'{rentReceiptsV267}',coalesce(d->'rentReceiptsV267','[]')||jsonb_build_array(receipt));
 end loop;
 d:=d||'{"staffScopePrivateFixtureV267":{"marker":"owner-only-scope-fixture"}}'::jsonb;
 perform public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if (select count(*) from public.aqari_leases where workspace_id=w and external_ref in ('staff-scope-c-a','staff-scope-c-b'))<>2 or (select count(*) from public.aqari_rent_payments where workspace_id=w and reference in ('STAFF-SCOPE-RECEIPT-A','STAFF-SCOPE-RECEIPT-B'))<>2 then raise exception 'SCOPE_FIXTURE_PROJECTION_FAILED';end if;
 perform set_config('aqari.test.scope.property_a',(select id::text from public.aqari_properties where workspace_id=w and name='عقار اختبار عزل الموظفين a'),true);
 perform set_config('aqari.test.scope.property_b',(select id::text from public.aqari_properties where workspace_id=w and name='عقار اختبار عزل الموظفين b'),true);
end $$;

-- Grant explicitly; no base role receives implicit access to all properties.
do $$
declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;pa uuid:=current_setting('aqari.test.scope.property_a')::uuid;pb uuid:=current_setting('aqari.test.scope.property_b')::uuid;data jsonb;listed jsonb;
begin
 data:=jsonb_build_object('user_id','76400000-0000-4000-8000-000000000002','operational_role','collector','property_ids',jsonb_build_array(pa),'is_active',true,'revision',0,'reason','إسناد اصطناعي للمحصل في العقار أ');
 if public.aqari_staff_access(w,'save',data)->>'revision'<>'1' then raise exception 'SCOPE_GRANT_REVISION_FAILED';end if;
 perform public.aqari_staff_access(w,'save',data||'{"user_id":"76400000-0000-4000-8000-000000000003","operational_role":"accountant"}');
 perform public.aqari_staff_access(w,'save',data||jsonb_build_object('user_id','76400000-0000-4000-8000-000000000004','operational_role','maintenance','property_ids',jsonb_build_array(pb)));
 perform public.aqari_staff_access(w,'save',data||'{"user_id":"76400000-0000-4000-8000-000000000005","operational_role":"viewer"}');
 listed:=public.aqari_staff_access(w,'list');
 if listed->>'manager'<>'true' or not exists(select 1 from jsonb_array_elements(listed->'assignments') x where x->>'user_id'=data->>'user_id' and x->>'operational_role'='collector' and x->'property_ids'=jsonb_build_array(pa) and x->>'revision'='1' and x->>'is_active'='true') then raise exception 'SCOPE_GRANT_READBACK_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(listed->'audit') x where x->>'actor_name'='مدير اختبار عزل الموظفين' and nullif(x->>'recorded_at','') is not null and x->>'reason'=data->>'reason') then raise exception 'SCOPE_GRANT_AUDIT_FAILED';end if;
 begin perform public.aqari_staff_access(w,'save',data);raise exception 'SCOPE_STALE_GRANT_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_staff_access(w,'save',data||'{"revision":1,"operational_role":"maintenance"}');raise exception 'SCOPE_BASE_ROLE_ESCALATION';exception when insufficient_privilege then null;end;
 begin perform public.aqari_staff_access(w,'save',data||'{"revision":1,"property_ids":["76400000-0000-4000-8000-000000000099"]}');raise exception 'SCOPE_FOREIGN_PROPERTY_GRANTED';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.aqari_staff_access(w,'save',data||'{"revision":1,"property_ids":[]}');raise exception 'SCOPE_EMPTY_ACTIVE_GRANT';exception when sqlstate '22023' then null;end;
 perform public.aqari_manage_partner_access(w,'staff-scope-partner@example.invalid',pa,'شريك اختبار العزل',true,0,'اختبار عدم ترقية الشريك إلى موظف');
end $$;
reset role;
insert into auth.users(id,email,email_confirmed_at) values('76400000-0000-4000-8000-000000000007','staff-scope-partner@example.invalid',now());
set local role authenticated;
do $$begin
 begin perform public.aqari_staff_access(current_setting('aqari.test.scope.workspace')::uuid,'save',jsonb_build_object('user_id','76400000-0000-4000-8000-000000000007','operational_role','viewer','property_ids',jsonb_build_array(current_setting('aqari.test.scope.property_a')::uuid),'is_active',true,'revision',0,'reason','محاولة إسناد شريك كموظف'));raise exception 'SCOPE_PARTNER_PROMOTED_TO_STAFF';exception when insufficient_privilege then null;end;
end $$;

select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000002',true);
do $$
declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;pa uuid:=current_setting('aqari.test.scope.property_a')::uuid;pb uuid:=current_setting('aqari.test.scope.property_b')::uuid;state jsonb;d jsonb;candidate jsonb;r jsonb;receipt jsonb;row_data jsonb;k text;
begin
 if not private.aqari_can_property(w,pa,'collections','write') or private.aqari_can_property(w,pb,'collections','read') or private.aqari_can_property(w,pa,'finance','read') or private.aqari_can_property(w,pa,'partners','read') or private.aqari_can_property(w,pa,'employees','read') then raise exception 'SCOPE_COLLECTOR_CEILING_FAILED';end if;
 if (select count(*) from public.aqari_properties where workspace_id=w)<>1 or not exists(select 1 from public.aqari_properties where id=pa) then raise exception 'SCOPE_COLLECTOR_PROPERTY_LEAK';end if;
 if (select count(*) from public.aqari_tenants where workspace_id=w)<>1 or not exists(select 1 from public.aqari_tenants where external_ref='staff-scope-t-a') then raise exception 'SCOPE_COLLECTOR_TENANT_LEAK';end if;
 if (select count(*) from public.aqari_leases where workspace_id=w)<>1 or not exists(select 1 from public.aqari_leases where external_ref='staff-scope-c-a') then raise exception 'SCOPE_COLLECTOR_LEASE_LEAK';end if;
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>1 or (select sum(amount) from public.aqari_rent_payments where workspace_id=w)<>20 then raise exception 'SCOPE_COLLECTOR_PAYMENT_LEAK';end if;
 begin
  if exists(select 1 from public.aqari_app_state where workspace_id=w) then raise exception 'SCOPE_RAW_BULK_STATE_LEAK';end if;
 exception when insufficient_privilege then null;end;
 state:=public.aqari_read_state_v267(w);d:=(state->'payload');
 foreach k in array array['properties','tenants','tenantProfilesV267','leases','contractsV202','tenantDirectoryV202','collections','rentLedgerV202','rentReceiptsV267'] loop
  if jsonb_array_length(coalesce(d->k,'[]'))<>1 then raise exception 'SCOPE_BULK_PROJECTION_FAILED:%',k;end if;
 end loop;
 if d ?| array['staffScopePrivateFixtureV267','propertySharesV267','propertyPartnersV267','partnerDistributionsV267','expenses','accounts','openingBalancesV267','employees','payroll'] or d::text like '%staff-scope-c-b%' or d::text like '%STAFF-SCOPE-RECEIPT-B%' then raise exception 'SCOPE_BULK_PRIVATE_DATA_LEAK';end if;
 foreach k in array array['staffScopePrivateFixtureV267','unknownScopeWriteV267','expenses','openingBalancesV267','propertySharesV267','payroll'] loop
  begin perform public.aqari_save_state_v267(w,jsonb_build_object(k,'[{"fixture":"unauthorized"}]'::jsonb),(state->>'revision')::bigint);raise exception 'SCOPE_UNKNOWN_OR_FINANCE_KEY_ACCEPTED:%',k;exception when insufficient_privilege then if sqlerrm<>'STAFF_STATE_KEY_DENIED' then raise;end if;end;
 end loop;
 begin perform public.aqari_staff_access(w,'list');raise exception 'SCOPE_NONMANAGER_GRANTS_LISTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id',auth.uid(),'operational_role','accountant','property_ids',jsonb_build_array(pb),'is_active',true,'revision',1,'reason','محاولة تصعيد ذاتي'));raise exception 'SCOPE_SELF_GRANT_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_partner_access_list(w);raise exception 'SCOPE_COLLECTOR_PARTNER_LIST_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_manage_partner_access(w,'staff-scope-injected-partner@example.invalid',pa,'شريك مزور',true,0,'محاولة غير مخولة');raise exception 'SCOPE_COLLECTOR_PARTNER_GRANT';exception when insufficient_privilege then null;end;
 -- A forged outside-property collection must fail with permission denial before financial validation.
 candidate:=jsonb_set(d,'{collections}',(d->'collections')||jsonb_build_array(jsonb_build_array('STAFF-SCOPE-FORGED','مستأجر اختبار عزل b',10,'جزئي','عقار اختبار عزل الموظفين b',current_date::text,'SCOPE-1','موظف اختبار',to_char(current_date,'YYYY-MM'),'نقدي')));
 begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'SCOPE_FOREIGN_COLLECTION_ACCEPTED';exception when insufficient_privilege then if sqlerrm<>'STAFF_PROPERTY_DENIED' then raise;end if;end;
 -- Save a valid additional partial collection using only the visible subset.
 r:=(d#>'{rentLedgerV202,0}')||'{"receiptNo":"STAFF-SCOPE-RECEIPT-A2","paid":10}'::jsonb;
 row_data:=jsonb_set(jsonb_set(d#>'{collections,0}','{0}','"STAFF-SCOPE-RECEIPT-A2"'),'{2}','10');
 receipt:=(d#>'{rentReceiptsV267,0}')||jsonb_build_object('id','STAFF-SCOPE-RECEIPT-A2','record',row_data);
 d:=jsonb_set(d,'{collections}',(d->'collections')||jsonb_build_array(row_data));
 d:=jsonb_set(d,'{rentLedgerV202}',(d->'rentLedgerV202')||jsonb_build_array(r));
 d:=jsonb_set(d,'{rentReceiptsV267}',(d->'rentReceiptsV267')||jsonb_build_array(receipt));
 state:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if (select count(*) from public.aqari_rent_payments where workspace_id=w)<>2 or (select sum(amount) from public.aqari_rent_payments where workspace_id=w)<>30 then raise exception 'SCOPE_COLLECTION_SAVE_READBACK_FAILED';end if;
 -- Omitting a previously visible row is not a deletion mechanism.
 d:=(state->'payload');candidate:=jsonb_set(d,'{collections}','[]');
 state:=public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);d:=(state->'payload');
 if jsonb_array_length(d->'collections')<>2 or not exists(select 1 from jsonb_array_elements(d->'collections') x where x->>0='STAFF-SCOPE-RECEIPT-A') or not exists(select 1 from jsonb_array_elements(d->'collections') x where x->>0='STAFF-SCOPE-RECEIPT-A2') or (select count(*) from public.aqari_rent_payments where workspace_id=w)<>2 then raise exception 'SCOPE_COLLECTION_OMISSION_DELETED_SAVED_ROW';end if;
end $$;

select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000003',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;pa uuid:=current_setting('aqari.test.scope.property_a')::uuid;pb uuid:=current_setting('aqari.test.scope.property_b')::uuid;state jsonb;candidate jsonb;begin
 if not private.aqari_can_property(w,pa,'finance','write') or private.aqari_can_property(w,pb,'finance','read') or private.aqari_can_property(w,pa,'contracts','write') or private.aqari_can_property(w,pa,'properties','write') or private.aqari_can_property(w,pa,'tenants','write') or private.aqari_can_property(w,pa,'partners','read') then raise exception 'SCOPE_ACCOUNTANT_CEILING_FAILED';end if;
 if (select count(*) from public.aqari_properties where workspace_id=w)<>1 or (select count(*) from public.aqari_rent_payments where workspace_id=w)<>2 then raise exception 'SCOPE_ACCOUNTANT_PROPERTY_OR_PAYMENT_LEAK';end if;
 state:=public.aqari_read_state_v267(w);candidate:=jsonb_set((state->'payload'),'{contractsV202,0,accountant}','"تعديل غير مخول"');
 begin perform public.aqari_save_state_v267(w,candidate,(state->>'revision')::bigint);raise exception 'SCOPE_ACCOUNTANT_CONTRACT_WRITE';exception when insufficient_privilege then null;end;
 begin perform public.aqari_save_state_v267(w,'{"expenses":[{"fixture":"blocked legacy finance"}]}',(state->>'revision')::bigint);raise exception 'SCOPE_ACCOUNTANT_LEGACY_FINANCE_WRITE';exception when insufficient_privilege then if sqlerrm<>'STAFF_STATE_KEY_DENIED' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000004',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;pa uuid:=current_setting('aqari.test.scope.property_a')::uuid;pb uuid:=current_setting('aqari.test.scope.property_b')::uuid;d jsonb;begin
 if not private.aqari_can_property(w,pb,'maintenance','write') or private.aqari_can_property(w,pa,'maintenance','read') or private.aqari_can_property(w,pb,'contracts','read') or private.aqari_can_property(w,pb,'collections','read') or private.aqari_can_property(w,pb,'finance','read') or private.aqari_can_property(w,pb,'partners','read') or private.aqari_can_property(w,pb,'employees','read') then raise exception 'SCOPE_MAINTENANCE_CEILING_FAILED';end if;
 if (select count(*) from public.aqari_properties where workspace_id=w)<>1 or not exists(select 1 from public.aqari_properties where id=pb) or exists(select 1 from public.aqari_leases where workspace_id=w) or exists(select 1 from public.aqari_rent_payments where workspace_id=w) then raise exception 'SCOPE_MAINTENANCE_NORMALIZED_LEAK';end if;
 d:=(public.aqari_read_state_v267(w)->'payload');
 if jsonb_array_length(coalesce(d->'contractsV202','[]'))<>0 or jsonb_array_length(coalesce(d->'collections','[]'))<>0 or d::text like '%staff-scope-t-a%' then raise exception 'SCOPE_MAINTENANCE_BULK_LEAK';end if;
end $$;
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000005',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;pa uuid:=current_setting('aqari.test.scope.property_a')::uuid;state jsonb;begin
 if not private.aqari_can_property(w,pa,'properties','read') or private.aqari_can_property(w,pa,'properties','write') or private.aqari_can_property(w,pa,'collections','write') or private.aqari_can_property(w,pa,'finance','read') or private.aqari_can_property(w,pa,'partners','read') then raise exception 'SCOPE_VIEWER_CEILING_FAILED';end if;
 if (select count(*) from public.aqari_properties where workspace_id=w)<>1 or (select count(*) from public.aqari_leases where workspace_id=w)<>1 then raise exception 'SCOPE_VIEWER_NORMALIZED_LEAK';end if;
 state:=public.aqari_read_state_v267(w);
 begin perform public.aqari_save_state_v267(w,state->'payload',(state->>'revision')::bigint);raise exception 'SCOPE_VIEWER_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000006',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;d jsonb;item record;begin
 if private.aqari_can_property(w,current_setting('aqari.test.scope.property_a')::uuid,'collections','read') or exists(select 1 from public.aqari_properties where workspace_id=w) or exists(select 1 from public.aqari_tenants where workspace_id=w) or exists(select 1 from public.aqari_leases where workspace_id=w) or exists(select 1 from public.aqari_rent_payments where workspace_id=w) then raise exception 'SCOPE_UNASSIGNED_ROLE_DEFAULT_ACCESS';end if;
 begin perform public.aqari_read_state_v267(w);raise exception 'SCOPE_UNASSIGNED_BULK_ACCESS';exception when insufficient_privilege then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
end $$;

select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000007',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;begin
 if exists(select 1 from public.aqari_properties where workspace_id=w) or exists(select 1 from public.aqari_rent_payments where workspace_id=w) then raise exception 'SCOPE_PARTNER_RAW_DATA_LEAK';end if;
 begin perform public.aqari_staff_access(w,'list');raise exception 'SCOPE_PARTNER_STAFF_DIRECTORY_LEAK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_read_state_v267(w);raise exception 'SCOPE_PARTNER_BULK_LEAK';exception when insufficient_privilege then null;end;
end $$;

-- Manager sees hidden rows unchanged, then revokes the collector without changing its base membership.
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;d jsonb;grant_data jsonb;begin
 d:=(public.aqari_read_state_v267(w)->'payload');
 if (select count(*) from public.aqari_rent_payments where workspace_id=w and reference='STAFF-SCOPE-RECEIPT-B' and amount=30)<>1 or not exists(select 1 from jsonb_array_elements(d->'collections') x where x->>0='STAFF-SCOPE-RECEIPT-B' and x->>2='30') or not exists(select 1 from jsonb_array_elements(d->'rentReceiptsV267') x where x->>'id'='STAFF-SCOPE-RECEIPT-B') or d#>>'{staffScopePrivateFixtureV267,marker}'<>'owner-only-scope-fixture' then raise exception 'SCOPE_HIDDEN_ROWS_OVERWRITTEN';end if;
 grant_data:=jsonb_build_object('user_id','76400000-0000-4000-8000-000000000002','operational_role','collector','property_ids','[]'::jsonb,'is_active',false,'revision',1,'reason','إيقاف تكليف المحصل في اختبار العزل');
 if public.aqari_staff_access(w,'save',grant_data)->>'revision'<>'2' then raise exception 'SCOPE_REVOCATION_REVISION_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_staff_access(w,'list')->'assignments') x where x->>'user_id'=grant_data->>'user_id' and x->>'is_active'='false' and x->'property_ids'='[]'::jsonb and x->>'revision'='2') then raise exception 'SCOPE_REVOCATION_READBACK_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','76400000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.scope.workspace')::uuid;begin
 if private.aqari_can_property(w,current_setting('aqari.test.scope.property_a')::uuid,'collections','write') or exists(select 1 from public.aqari_properties where workspace_id=w) or exists(select 1 from public.aqari_rent_payments where workspace_id=w) then raise exception 'SCOPE_REVOKED_ACCESS_STILL_ACTIVE';end if;
 begin perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id',auth.uid(),'operational_role','collector','property_ids',jsonb_build_array(current_setting('aqari.test.scope.property_a')::uuid),'is_active',true,'revision',2,'reason','محاولة إعادة منح ذاتية'));raise exception 'SCOPE_REVOKED_USER_SELF_RESTORE';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare original jsonb;current_data jsonb;entry record;row_value jsonb;begin
 select payload into strict original from pg_temp.aqari_staff_scope_baseline;
 select private.aqari_unwrap(payload) into strict current_data from public.aqari_app_state where workspace_id=current_setting('aqari.test.scope.workspace')::uuid;
 for entry in select * from jsonb_each(original) loop
  if entry.key=any(array['properties','tenants','tenantProfilesV267','leases','contractsV202','tenantDirectoryV202','collections','rentLedgerV202','rentReceiptsV267']) then
   for row_value in select value from jsonb_array_elements(entry.value) loop
    if (select count(*) from jsonb_array_elements(current_data->entry.key) x where x=row_value)<(select count(*) from jsonb_array_elements(entry.value) x where x=row_value) then raise exception 'SCOPE_EXISTING_ROW_LOST:%',entry.key;end if;
   end loop;
  elsif current_data->entry.key is distinct from entry.value then raise exception 'SCOPE_EXISTING_PRIVATE_KEY_CHANGED:%',entry.key;end if;
 end loop;
 if not exists(select 1 from public.aqari_memberships where workspace_id=current_setting('aqari.test.scope.workspace')::uuid and user_id='76400000-0000-4000-8000-000000000002' and role='accountant' and is_active) then raise exception 'SCOPE_REVOCATION_CHANGED_BASE_MEMBERSHIP';end if;
end $$;
rollback;
select 'PASS: explicit property assignment, role ceilings, manager-only grant/audit/CAS, normalized and bulk isolation, no default access, partner separation, unknown and legacy financial key denial, foreign collection rejection, scoped collection save/readback with hidden and pre-existing rows preserved, read-only viewer, immediate revocation. Synthetic fixtures rolled back; no real account or device claim.' as result;
