-- Isolated Staging integration/authorization test. ALL synthetic records roll back.
-- Auth identities and projected leases below are SQL fixtures, not real-account/device evidence.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('notice-manager@example.invalid','مدير اختبار التعاميم','general_manager','aqari-v267-staging'),
 ('notice-accountant@example.invalid','محاسب اختبار التعاميم','accountant','aqari-v267-staging');
insert into auth.users(id,email) values
 ('76300000-0000-4000-8000-000000000001','notice-manager@example.invalid'),
 ('76300000-0000-4000-8000-000000000002','notice-accountant@example.invalid');
select set_config('aqari.test.notices_workspace',(select workspace_id::text from public.aqari_memberships where user_id='76300000-0000-4000-8000-000000000001'),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76300000-0000-4000-8000-000000000011',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-p1','عقار تعاميم اختبار ١','{}'),
 ('76300000-0000-4000-8000-000000000012',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-p2','عقار تعاميم اختبار ٢','{}');
insert into public.aqari_units values
 ('76300000-0000-4000-8000-000000000021',current_setting('aqari.test.notices_workspace')::uuid,'76300000-0000-4000-8000-000000000011','TEST-1'),
 ('76300000-0000-4000-8000-000000000022',current_setting('aqari.test.notices_workspace')::uuid,'76300000-0000-4000-8000-000000000012','TEST-2');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values
 ('76300000-0000-4000-8000-000000000031',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-t1','مستأجر تعاميم اختبار ١','763000000001','76300001','notice-tenant-1@example.invalid','{}'),
 ('76300000-0000-4000-8000-000000000032',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-t2','مستأجر تعاميم اختبار ٢','763000000002','76300002','notice-tenant-2@example.invalid','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('76300000-0000-4000-8000-000000000041',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-l1','76300000-0000-4000-8000-000000000031','76300000-0000-4000-8000-000000000021','NOTICE-TEST-1',current_date-30,current_date+30,100,0,'signed','{}'),
 ('76300000-0000-4000-8000-000000000042',current_setting('aqari.test.notices_workspace')::uuid,'notice-test-l2','76300000-0000-4000-8000-000000000032','76300000-0000-4000-8000-000000000022','NOTICE-TEST-2',current_date-30,current_date+30,100,0,'signed','{}');
insert into auth.users(id,email,email_confirmed_at) values
 ('76300000-0000-4000-8000-000000000051','notice-tenant-1@example.invalid',now()),
 ('76300000-0000-4000-8000-000000000052','notice-tenant-2@example.invalid',null);
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.notices_workspace')::uuid;n jsonb;d jsonb;begin
 d:='{"id":"76300000-0000-4000-8000-000000000061","revision":0,"property_id":"76300000-0000-4000-8000-000000000011","kind":"guidance","title":"ترشيد استهلاك المياه — اختبار","body":"نص تجريبي لن يصل إلى مستأجر حقيقي"}';
 n:=public.aqari_property_notices(w,'save',d);
 if n->>'revision'<>'1' or n->>'status'<>'draft' then raise exception 'DRAFT_SAVE_FAILED';end if;
 begin perform public.aqari_property_notices(w,'save',d||'{"id":"76300000-0000-4000-8000-000000000069","body":""}');raise exception 'EMPTY_BODY_ACCEPTED';exception when raise_exception then if sqlerrm='EMPTY_BODY_ACCEPTED' then raise;end if;end;
 begin perform public.aqari_property_notices(w,'save',d);raise exception 'STALE_SAVE_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_property_notices(w,'save',d||'{"id":"76300000-0000-4000-8000-000000000069","property_id":"76300000-0000-4000-8000-000000000099"}');raise exception 'UNKNOWN_PROPERTY_ALLOWED';exception when insufficient_privilege then null;end;
 n:=public.aqari_property_notices(w,'publish',jsonb_build_object('id',n->>'id','revision',1));
 if n->>'revision'<>'2' or n->>'status'<>'published' or n->>'published_at' is null then raise exception 'PUBLISH_READBACK_FAILED';end if;
 begin perform public.aqari_property_notices(w,'save',d||'{"revision":2,"body":"Attempted replacement"}');raise exception 'PUBLISHED_TEXT_CHANGED';exception when raise_exception then if sqlerrm='PUBLISHED_TEXT_CHANGED' then raise;end if;end;
 perform public.aqari_property_notices(w,'save',d||'{"id":"76300000-0000-4000-8000-000000000062","property_id":"76300000-0000-4000-8000-000000000012","kind":"notice","title":"عقار آخر"}');
 perform public.aqari_property_notices(w,'publish','{"id":"76300000-0000-4000-8000-000000000062","revision":1}');
 perform public.aqari_property_notices(w,'save',d||'{"id":"76300000-0000-4000-8000-000000000063","title":"مسودة غير منشورة"}');
 perform public.aqari_property_notices(w,'save',d||jsonb_build_object('id','76300000-0000-4000-8000-000000000064','expires_at',now()-interval '1 day'));
 begin perform public.aqari_property_notices(w,'publish','{"id":"76300000-0000-4000-8000-000000000064","revision":1}');raise exception 'EXPIRED_PUBLISH_ALLOWED';exception when raise_exception then if sqlerrm='EXPIRED_PUBLISH_ALLOWED' then raise;end if;end;
 if public.aqari_property_notices(w,'list')->>'manager'<>'true' then raise exception 'MANAGER_LIST_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000002',true);
do $$ declare w uuid:=current_setting('aqari.test.notices_workspace')::uuid;begin
 begin perform public.aqari_property_notices(w,'list');raise exception 'ACCOUNTANT_MANAGER_ACCESS';exception when insufficient_privilege then null;end;
 begin perform public.aqari_property_notices(w,'publish','{"id":"76300000-0000-4000-8000-000000000063","revision":1}');raise exception 'ACCOUNTANT_PUBLISH_ACCESS';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_property_notices;raise exception 'RAW_TABLE_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000052',true);
do $$ begin
 begin perform public.aqari_property_notices(current_setting('aqari.test.notices_workspace')::uuid,'feed');raise exception 'UNVERIFIED_TENANT_ACCESS';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000051',true);
do $$ declare w uuid:=current_setting('aqari.test.notices_workspace')::uuid;feed jsonb;a jsonb;b jsonb;begin
 feed:=public.aqari_property_notices(w,'feed');
 if jsonb_array_length(feed)<>1 or feed#>>'{0,id}'<>'76300000-0000-4000-8000-000000000061' then raise exception 'PROPERTY_DRAFT_ISOLATION_FAILED';end if;
 if feed#>>'{0,acknowledged_at}' is not null or feed#>'{0,created_by}' is not null then raise exception 'AUTO_ACK_OR_ACTOR_LEAK';end if;
 begin perform public.aqari_property_notices(w,'ack','{"id":"76300000-0000-4000-8000-000000000062","revision":2}');raise exception 'CROSS_PROPERTY_ACK';exception when insufficient_privilege then null;end;
 begin perform public.aqari_property_notices(w,'ack','{"id":"76300000-0000-4000-8000-000000000061","revision":1}');raise exception 'STALE_ACK';exception when serialization_failure then null;end;
 a:=public.aqari_property_notices(w,'ack','{"id":"76300000-0000-4000-8000-000000000061","revision":2}');
 b:=public.aqari_property_notices(w,'ack','{"id":"76300000-0000-4000-8000-000000000061","revision":2}');
 if a->>'acknowledged_at' is null or a<>b or public.aqari_property_notices(w,'feed')#>>'{0,acknowledged_at}'<>a->>'acknowledged_at' then raise exception 'ACK_READBACK_OR_REPLAY';end if;
 begin perform public.aqari_property_notices(w,'history','{"id":"76300000-0000-4000-8000-000000000061"}');raise exception 'TENANT_HISTORY_LEAK';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.aqari_leases set status='expired' where id='76300000-0000-4000-8000-000000000041';
set local role authenticated;
do $$ begin if public.aqari_property_notices(current_setting('aqari.test.notices_workspace')::uuid,'feed')<>'[]'::jsonb then raise exception 'FORMER_LEASE_FEED_LEAK';end if;end $$;
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.notices_workspace')::uuid;history jsonb;begin
 begin perform public.aqari_property_notices(w,'archive','{"id":"76300000-0000-4000-8000-000000000061","revision":2,"reason":""}');raise exception 'UNDOCUMENTED_ARCHIVE';exception when raise_exception then if sqlerrm='UNDOCUMENTED_ARCHIVE' then raise;end if;end;
 perform public.aqari_property_notices(w,'archive','{"id":"76300000-0000-4000-8000-000000000061","revision":2,"reason":"انتهاء الاختبار والتراجع عن جميع البيانات"}');
 history:=public.aqari_property_notices(w,'history','{"id":"76300000-0000-4000-8000-000000000061"}');
 if jsonb_array_length(history->'versions')<>3 or jsonb_array_length(history->'acknowledgements')<>1 or history#>>'{versions,1,after_snapshot,body}'<>'نص تجريبي لن يصل إلى مستأجر حقيقي' then raise exception 'HISTORY_OR_ACK_NOT_RETAINED';end if;
 if history#>>'{versions,0,actor_name}'<>'مدير اختبار التعاميم' or history#>>'{acknowledgements,0,user_name}'<>'مستأجر تعاميم اختبار ١' then raise exception 'ACTOR_IDENTITY_NOT_FROM_DATABASE';end if;
end $$;
select set_config('request.jwt.claim.sub','76300000-0000-4000-8000-000000000099',true);
do $$ begin
 begin perform public.aqari_property_notices(current_setting('aqari.test.notices_workspace')::uuid,'list');raise exception 'OUTSIDER_ACCESS';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: draft/publish/readback, required fields, stale-write rejection, immutable published text, property and role isolation, verified-tenant gate, explicit versioned acknowledgement and idempotency, expired lease denial, documented archive and preserved actor/history; all fixtures rolled back' result;
