-- Synthetic local-only acceptance. Always rolls back; never use production records.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('channels-manager@example.invalid','مدير اختبار القنوات','general_manager','aqari-v267-staging'),
 ('channels-viewer@example.invalid','قارئ اختبار القنوات','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76730000-0000-4000-8000-000000000001','channels-manager@example.invalid',now()),
 ('76730000-0000-4000-8000-000000000002','channels-viewer@example.invalid',now());
select set_config('request.jwt.claim.sub','76730000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76730000-0000-4000-8000-000000000101','70000000-0000-4000-8000-000000000001','channels-one','عقار القنوات الأول','{}'),
 ('76730000-0000-4000-8000-000000000102','70000000-0000-4000-8000-000000000001','channels-two','عقار القنوات الثاني','{}');
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by) values
 ('70000000-0000-4000-8000-000000000001','76730000-0000-4000-8000-000000000002','viewer',array['76730000-0000-4000-8000-000000000101']::uuid[],true,'76730000-0000-4000-8000-000000000001');
set local role authenticated;
do $$declare
 w uuid:='70000000-0000-4000-8000-000000000001'; p uuid:='76730000-0000-4000-8000-000000000101';
 c jsonb; saved jsonb; d jsonb; master jsonb;
begin
 d:=jsonb_build_object('propertyId',p,'kind','instagram','url','https://www.instagram.com/example','label','حساب العقار','tenantVisible',true,'reason','اختبار حفظ معزول');
 saved:=public.aqari_property_channel_settings(w,'save',d);
 c:=public.aqari_property_channel_settings(w,'context',jsonb_build_object('propertyId',p));
 if jsonb_array_length(c->'items')<>1 or c#>>'{items,0,id}' is distinct from saved#>>'{record,id}' or c#>>'{items,0,url}' is distinct from d->>'url' then raise exception 'CHANNEL_READBACK_FAILED';end if;
 d:=d||jsonb_build_object('id',saved#>>'{record,id}','revision',1,'label','حساب محدث');
 perform public.aqari_property_channel_settings(w,'save',d);
 begin perform public.aqari_property_channel_settings(w,'save',d);raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_property_channel_settings(w,'save',d||'{"id":null,"revision":0,"url":"javascript:alert(1)"}');raise exception 'UNSAFE_URL_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_property_channel_settings(w,'save',d||'{"id":null,"revision":0,"url":"https://user:secret@example.invalid"}');raise exception 'CREDENTIAL_URL_ACCEPTED';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_property_channel_settings(w,'save',d||'{"revision":2}');raise exception 'AAL1_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 master:=public.aqari_property_master_save(w,p,0,'{"name":"عقار القنوات الأول","status":"active","owners":[],"locationUrl":"https://maps.google.com/?q=Kuwait","propertyAutomaticRef":"LOCAL-CHANNELS-1"}','اختبار موقع معزول');
 if master#>>'{property,locationUrl}' is distinct from 'https://maps.google.com/?q=Kuwait' then raise exception 'LOCATION_SAVE_FAILED';end if;
 master:=public.aqari_property_master_save(w,p,1,'{"name":"عقار القنوات الأول","status":"active","owners":[]}','اختبار عميل قديم');
 if master#>>'{property,locationUrl}' is distinct from 'https://maps.google.com/?q=Kuwait' or master#>>'{property,propertyAutomaticRef}' is distinct from 'LOCAL-CHANNELS-1' then raise exception 'LEGACY_SAVE_LOST_LOCATION';end if;
 perform set_config('request.jwt.claim.sub','76730000-0000-4000-8000-000000000002',true);
 c:=public.aqari_property_channel_settings(w,'context',jsonb_build_object('propertyId',p));
 if (c->>'manager')::boolean or jsonb_array_length(c->'items')<>1 then raise exception 'VIEWER_CONTEXT_INVALID';end if;
 begin perform public.aqari_property_channel_settings(w,'save',d||'{"revision":2}');raise exception 'VIEWER_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_property_channel_settings(w,'context','{"propertyId":"76730000-0000-4000-8000-000000000102"}');raise exception 'OTHER_PROPERTY_READ_ACCEPTED';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
