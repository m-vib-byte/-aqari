-- Synthetic identities and records only. Full transaction rolls back; no DDL or permission changes.
begin;
insert into public.aqari_workspaces(id,slug,name) values('76610000-0000-4000-8000-000000000001','aqari-template-acceptance','Synthetic template acceptance');
insert into public.aqari_app_state(workspace_id,payload) values('76610000-0000-4000-8000-000000000001','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('template-manager@example.invalid','مدير قوالب اصطناعي','general_manager','aqari-template-acceptance'),
 ('template-staff@example.invalid','موظف قوالب اصطناعي','property_manager','aqari-template-acceptance');
insert into auth.users(id,email,email_confirmed_at) values
 ('76610000-0000-4000-8000-000000000002','template-manager@example.invalid',now()),
 ('76610000-0000-4000-8000-000000000003','template-staff@example.invalid',now());
select set_config('request.jwt.claim.sub','76610000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;
do $$
declare w uuid:='76610000-0000-4000-8000-000000000001';ctx jsonb;published jsonb;again jsonb;req jsonb;kind text;idx integer:=10;s jsonb;d jsonb;t jsonb;prop uuid;c jsonb;r jsonb;
begin
 ctx:=public.aqari_rental_templates(w,'context');
 if ctx->'items'<>'[]'::jsonb or ctx->>'can_publish'<>'true' then raise exception 'TEMPLATE_MUST_START_UNPUBLISHED';end if;
 insert into public.aqari_contract_template_drafts(id,workspace_id,template_key,revision,title,body)
 values('76610000-0000-4000-8000-000000000004',w,'apartment',1,'مسودة اصطناعية غير معتمدة','نص اختبار فقط وليس نصًا تعاقديًا للاستخدام.');
 ctx:=public.aqari_rental_templates(w,'context');
 if jsonb_array_length(ctx->'drafts')<>1 or ctx->'items'<>'[]'::jsonb then raise exception 'DRAFT_WAS_TREATED_AS_PUBLISHED';end if;
 foreach kind in array array['apartment','house','shop','commercial_investment'] loop
  idx:=idx+1;
  req:=jsonb_build_object('id',('76610000-0000-4000-8000-'||lpad(idx::text,12,'0'))::uuid,'kind',kind,'title','قالب اصطناعي '||kind,
   'clauses',jsonb_build_array(jsonb_build_object('title','بند اختبار','text','نص اصطناعي لا يستخدم في عقد فعلي.')),
   'expected_version',0,'source_draft_id',case when kind='apartment' then '76610000-0000-4000-8000-000000000004' else null end,'reason','اعتماد اصطناعي للتحقق من النسخ','approved',true);
  published:=public.aqari_rental_templates(w,'publish',req);again:=public.aqari_rental_templates(w,'publish',req);
  if published<>again or published#>>'{record,kind}'<>kind or published#>>'{record,version}'<>'1' then raise exception 'TEMPLATE_PUBLICATION_READBACK';end if;
  if (public.aqari_rental_templates(w,'get',jsonb_build_object('id',req->>'id')))->'record'<>published->'record' then raise exception 'TEMPLATE_GET_MISMATCH';end if;
  begin perform public.aqari_rental_templates(w,'publish',req||'{"title":"تغيير طلب محفوظ"}');raise exception 'TEMPLATE_REQUEST_REUSED';exception when raise_exception then if sqlerrm='TEMPLATE_REQUEST_REUSED' then raise;end if;end;
 end loop;
 -- A publish operation requires actual AAL2, even for the manager.
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_rental_templates(w,'publish',req||'{"id":"76610000-0000-4000-8000-000000000090","expected_version":1}');raise exception 'TEMPLATE_AAL1_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 -- Source drafts cannot be mislabeled as another type or workspace.
 begin perform public.aqari_rental_templates(w,'publish',req||'{"id":"76610000-0000-4000-8000-000000000091","expected_version":1,"source_draft_id":"76610000-0000-4000-8000-000000000004"}');raise exception 'TEMPLATE_SOURCE_TYPE_ALLOWED';exception when raise_exception then if sqlerrm='TEMPLATE_SOURCE_TYPE_ALLOWED' then raise;end if;end;
 begin perform public.aqari_rental_templates(w,'publish',req||'{"id":"76610000-0000-4000-8000-000000000092"}');raise exception 'TEMPLATE_STALE_REVISION_ALLOWED';exception when raise_exception then if sqlerrm='TEMPLATE_STALE_REVISION_ALLOWED' then raise;end if;end;
 begin perform public.aqari_rental_templates(w,'publish',req||'{"id":"76610000-0000-4000-8000-000000000093","expected_version":1,"approved":false}');raise exception 'TEMPLATE_UNCONFIRMED_ALLOWED';exception when invalid_parameter_value then null;end;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 t:='{"id":"template-tenant","nameAr":"مستأجر اختبار قوالب","nameEn":"Synthetic Template Tenant","civilId":"766100000001","passportNo":"TEMPLATE-TEST","email":"template-tenant@example.invalid","phone":"76610001","nationality":"اختبار","attachments":[]}'::jsonb;
 d:=jsonb_set(d,'{properties}',jsonb_build_array(jsonb_build_array('عقار اختبار القوالب')));
 d:=jsonb_set(d,'{tenantProfilesV267}',jsonb_build_array(t));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 r:=(public.aqari_rental_templates(w,'get','{"id":"76610000-0000-4000-8000-000000000011"}'))->'record';
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 select id into strict prop from public.aqari_properties where workspace_id=w and name='عقار اختبار القوالب';
 perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','76610000-0000-4000-8000-000000000100','property_id',prop,'unit_no','TEMPLATE-0','expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','فحص اصطناعي لوحدة اختبار','reason','اجتازت الوحدة فحص الاختبار'));
 perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','76610000-0000-4000-8000-000000000101','property_id',prop,'unit_no','TEMPLATE-1','expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','فحص اصطناعي لوحدة اختبار','reason','اجتازت الوحدة فحص الاختبار'));
 c:=jsonb_build_object('id','template-initial','contract_no','TEMPLATE-INITIAL','source','v267-cloud','detailsVersion',2,'rentalTermsVersion',1,
  'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار اختبار القوالب','unit','TEMPLATE-0','floor','الأول',
  'start_date',current_date::text,'end_date',(current_date+interval '1 year')::date::text,'writtenOn',(now() at time zone 'Asia/Kuwait')::date::text,
  'status','draft','contractRent',100,'rent',90,'discount',10,'deposit',50,'advance',5,'cleaningFee',2,
  'accountant','محاسب اختبار','contractReceived','لم يستلم','receivedAt','','depositReceivedOn','','evictionNotice','لم يُبلّغ',
  'freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,'clauses',r->'clauses','contractTemplate',r);
 perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',jsonb_build_array(c)),(s->>'revision')::bigint);
 select id into strict prop from public.aqari_properties where workspace_id=w and name='عقار اختبار القوالب';
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76610000-0000-4000-8000-000000000003','operational_role','property_manager','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','إسناد عقار اصطناعي لاختبار القوالب'));
end $$;
select set_config('request.jwt.claim.sub','76610000-0000-4000-8000-000000000003',true);
do $$
declare w uuid:='76610000-0000-4000-8000-000000000001';ctx jsonb;s jsonb;d jsonb;t jsonb;c jsonb;candidate jsonb;r jsonb;field_name text;
begin
 ctx:=public.aqari_rental_templates(w,'context');
 if ctx->>'can_publish'<>'false' or jsonb_array_length(ctx->'items')<>4 or ctx->'drafts'<>'[]'::jsonb then raise exception 'STAFF_TEMPLATE_READ_SCOPE';end if;
 begin perform public.aqari_rental_templates(w,'publish','{}');raise exception 'STAFF_TEMPLATE_PUBLISHED';exception when insufficient_privilege then null;end;
 begin insert into public.aqari_contract_template_drafts(id,workspace_id,template_key,revision,title,body) values('76610000-0000-4000-8000-000000000099',w,'house',1,'منع موظف','نص اختبار');raise exception 'STAFF_DRAFT_WRITTEN';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_rental_template_versions;raise exception 'PRIVATE_TEMPLATE_DIRECT_READ';exception when insufficient_privilege then null;end;
 r:=(public.aqari_rental_templates(w,'get','{"id":"76610000-0000-4000-8000-000000000011"}'))->'record';
 s:=public.aqari_read_state_v267(w);d:=s->'payload';t:=d#>'{tenantProfilesV267,0}';
 c:=jsonb_build_object('id','template-contract','contract_no','TEMPLATE-NEW-1','source','v267-cloud','detailsVersion',2,'rentalTermsVersion',1,
  'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار اختبار القوالب','unit','TEMPLATE-1','floor','الأول',
  'start_date',current_date::text,'end_date',(current_date+interval '1 year')::date::text,'writtenOn',(now() at time zone 'Asia/Kuwait')::date::text,
  'status','draft','contractRent',100,'rent',90,'discount',10,'deposit',50,'advance',5,'cleaningFee',2,
  'accountant','محاسب اختبار','contractReceived','لم يستلم','receivedAt','','depositReceivedOn','','evictionNotice','لم يُبلّغ',
  'freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,'clauses',r->'clauses','contractTemplate',r);
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c-'contractTemplate'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'UNTAGGED_CONTRACT_ALLOWED';exception when raise_exception then if sqlerrm<>'اختر نسخة قالب نشرها المدير العام قبل إنشاء العقد.' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||'{"source":"statement-import","import_source":{"fake":true}}'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'FORGED_IMPORT_BYPASS';exception when insufficient_privilege then if sqlerrm<>'STAFF_CURRENT_CONTRACT_REQUIRED' then raise;end if;when raise_exception then if sqlerrm='FORGED_IMPORT_BYPASS' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||'{"clauses":[{"title":"تغيير","text":"نص لم يعتمده المدير"}]}'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'STAFF_CHANGED_TEMPLATE_CLAUSES';exception when raise_exception then if sqlerrm<>'بنود العقد لا تطابق نسخة القالب المنشورة. أعد اختيار القالب دون تعديل نصه.' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(jsonb_set(c,'{contractTemplate,version}','99')));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'FORGED_TEMPLATE_VERSION';exception when raise_exception then if sqlerrm<>'بنود العقد لا تطابق نسخة القالب المنشورة. أعد اختيار القالب دون تعديل نصه.' then raise;end if;end;
 -- A changed profile and its matching snapshot still cannot bypass the mandatory new-contract identity.
 foreach field_name in array array['nameAr','nameEn','civilId','passportNo','email','phone'] loop
  candidate:=jsonb_set(d,array['tenantProfilesV267','0',field_name],'""');
  candidate:=jsonb_set(candidate,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(jsonb_set(c,array['tenantProfile',field_name],'""')));
  begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'MISSING_NEW_CONTRACT_IDENTITY:%',field_name;exception when raise_exception then if sqlerrm like 'MISSING_NEW_CONTRACT_IDENTITY:%' then raise;end if;end;
 end loop;
 s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);
 if s#>'{payload,contractsV202,1,contractTemplate}'<>r or not exists(select 1 from public.aqari_leases where workspace_id=w and external_ref='template-contract' and snapshot->'contractTemplate'=r) then raise exception 'TEMPLATE_CONTRACT_READBACK';end if;
 d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,1}',(d#>'{contractsV202,1}')-'contractTemplate');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'SAVED_BINDING_REMOVED';exception when raise_exception then if sqlerrm<>'نسخة القالب وبنود العقد المحفوظة ثابتة؛ إصدار قالب جديد لا يغير العقود السابقة.' then raise;end if;end;
 -- The ordinary draft -> ready transition is still permitted without changing any original terms.
 candidate:=jsonb_set(d,'{contractsV202,1}',(d#>'{contractsV202,1}')||'{"status":"ready","changeReason":"جاهز لمراجعة المدير"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 if s#>>'{payload,contractsV202,1,status}'<>'ready' then raise exception 'TEMPLATE_DRAFT_TRANSITION_BROKEN';end if;
end $$;
select set_config('request.jwt.claim.sub','76610000-0000-4000-8000-000000000002',true);
do $$
declare w uuid:='76610000-0000-4000-8000-000000000001';s jsonb;before_record jsonb;old_template jsonb;new_template jsonb;
begin
 s:=public.aqari_read_state_v267(w);before_record:=s#>'{payload,contractsV202,1}';old_template:=before_record->'contractTemplate';
 new_template:=(public.aqari_rental_templates(w,'publish',jsonb_build_object('id','76610000-0000-4000-8000-000000000020','kind','apartment','title','قالب اصطناعي معدل','expected_version',1,'clauses',jsonb_build_array(jsonb_build_object('title','بند اختبار جديد','text','إصدار اختبار تالٍ؛ ليس نصًا للاستخدام.')),'reason','تعديل اصطناعي للتحقق من ثبات السابق','approved',true)))->'record';
 if new_template->>'version'<>'2' or (public.aqari_read_state_v267(w))#>'{payload,contractsV202,1}'<>before_record then raise exception 'NEW_TEMPLATE_CHANGED_OLD_CONTRACT';end if;
 if (public.aqari_rental_templates(w,'get',jsonb_build_object('id',old_template->>'id')))->'record'<>old_template then raise exception 'OLD_TEMPLATE_CHANGED';end if;
 begin perform public.aqari_rental_templates('70000000-0000-4000-8000-000000000001','get',jsonb_build_object('id',old_template->>'id'));raise exception 'CROSS_WORKSPACE_TEMPLATE_READ';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin update private.aqari_rental_template_versions set title='Owner cannot silently rewrite a published version' where id='76610000-0000-4000-8000-000000000011';raise exception 'PUBLISHED_VERSION_MUTATED';exception when raise_exception then if sqlerrm='PUBLISHED_VERSION_MUTATED' then raise;end if;end;
 begin delete from private.aqari_rental_template_versions where id='76610000-0000-4000-8000-000000000011';raise exception 'PUBLISHED_VERSION_DELETED';exception when raise_exception then if sqlerrm='PUBLISHED_VERSION_DELETED' then raise;end if;end;
end $$;
select 'PASS: draft is not approval; four published kinds; GM/AAL2 only; staff read and bound contract creation; identity required; untagged/forged/tampered denied; idempotence; prior versions and contracts preserved.' as result;
rollback;
