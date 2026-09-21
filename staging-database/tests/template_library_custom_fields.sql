-- Isolated PostgreSQL fixture only. No hosted data or credentials are used.
begin;
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare
 w uuid:='79910000-0000-4000-8000-000000000001';
 fields jsonb:='[{"key":"custom_a1","label":"اسم جهة العمل / Employer name","type":"text","required":true},{"key":"custom_a2","label":"عدد المفاتيح / Keys count","type":"number","required":false},{"key":"custom_a3","label":"تاريخ التسليم / Handover date","type":"date","required":true},{"key":"custom_a4","label":"قيمة التأمين / Deposit amount","type":"money","required":false}]';
 req jsonb;r jsonb;published jsonb;context jsonb;bad jsonb;history jsonb;
begin
 req:=jsonb_build_object('id','79910000-0000-4000-8000-000000000301','kind','apartment_handover','kind_label','استلام الوحدة / Handover','title','Synthetic custom fields','fields',fields,
  'clauses','[{"title":"بيانات إضافية / Additional details","text":"{{custom_a1}} {{custom_a2}} {{custom_a3}} {{custom_a4}}"}]'::jsonb,'revision',0,'request_id',gen_random_uuid());
 r:=public.aqari_rental_templates(w,'save_draft',req);
 if r#>'{record,fields}'<>fields then raise exception 'UNICODE_FIELD_ROUNDTRIP_FAILED';end if;
 context:=public.aqari_rental_templates(w,'context');
 if not exists(select 1 from jsonb_array_elements(context->'drafts')d where d->>'id'=req->>'id' and d->'fields'=fields) then raise exception 'CUSTOM_FIELDS_CONTEXT_FAILED';end if;
 -- A display-label edit preserves the independently generated token key.
 fields:=jsonb_set(fields,'{0,label}','"جهة العمل الحالية / Current employer"');
 r:=public.aqari_rental_templates(w,'save_draft',(r->'record')||jsonb_build_object('fields',fields,'request_id',gen_random_uuid()));
 if r#>'{record,fields}'<>fields or r#>>'{record,fields,0,key}'<>'custom_a1' or r#>>'{record,revision}'<>'2' then raise exception 'LABEL_EDIT_CHANGED_KEY_OR_SCHEMA';end if;
 history:=public.aqari_rental_templates(w,'history',jsonb_build_object('id',req->>'id'));
 if jsonb_array_length(history->'revisions')<>2 then raise exception 'CUSTOM_FIELD_HISTORY_MISSING';end if;
 published:=public.aqari_rental_templates(w,'publish',(r->'record')||jsonb_build_object('id',gen_random_uuid(),'source_draft_id',r#>>'{record,id}','expected_version',0,'reason','Synthetic custom field roundtrip','approved',true));
 if published#>'{record,fields}'<>fields then raise exception 'PUBLISHED_CUSTOM_FIELDS_CHANGED';end if;
 -- Labels count characters, not UTF-8 bytes: exactly100 Arabic letters are valid.
 bad:=req||jsonb_build_object('id',gen_random_uuid(),'request_id',gen_random_uuid(),'fields',jsonb_set(fields,'{0,label}',to_jsonb(repeat('ع',100))));
 r:=public.aqari_rental_templates(w,'save_draft',bad);
 if length(r#>>'{record,fields,0,label}')<>100 then raise exception 'UNICODE_LABEL_BOUNDARY_FAILED';end if;
 bad:=bad||jsonb_build_object('id',gen_random_uuid(),'request_id',gen_random_uuid(),'fields',jsonb_set(fields,'{0,label}',to_jsonb(repeat('ع',101))));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'OVERLONG_LABEL_ACCEPTED';exception when invalid_parameter_value then null;end;
 bad:=bad||jsonb_build_object('fields',jsonb_set(fields,'{0,key}','"اسم_العمل"'));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'UNICODE_KEY_ACCEPTED';exception when invalid_parameter_value then null;end;
 bad:=bad||jsonb_build_object('fields',jsonb_set(fields,'{0,type}','"email"'));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'UNSUPPORTED_FIELD_TYPE_ACCEPTED';exception when invalid_parameter_value then null;end;
 bad:=bad||jsonb_build_object('fields',jsonb_set(fields,'{0,required}','"true"'));
 begin perform public.aqari_rental_templates(w,'save_draft',bad);raise exception 'NONBOOLEAN_REQUIRED_ACCEPTED';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select 'PASS: Unicode Arabic/English custom labels, four field types, boolean required, save/context/publish snapshots, stable key after label edit, history, 100-character label boundary.' result;
rollback;
