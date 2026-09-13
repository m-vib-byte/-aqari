-- All identities and records are synthetic; every business write rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name) values('76580000-0000-4000-8000-000000000090','partner-distribution-fixture','Synthetic partner distribution workspace');
insert into public.aqari_app_state(workspace_id,payload) values('76580000-0000-4000-8000-000000000090','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('distribution-manager@example.invalid','مدير اختبار الإقفال','general_manager','partner-distribution-fixture'),('distribution-accountant@example.invalid','محاسب اختبار','accountant','partner-distribution-fixture'),('distribution-other-manager@example.invalid','مدير ثان اصطناعي','general_manager','partner-distribution-fixture');
insert into auth.users(id,email,email_confirmed_at) values ('76580000-0000-4000-8000-000000000001','distribution-manager@example.invalid',now()),('76580000-0000-4000-8000-000000000002','distribution-accountant@example.invalid',now()),('76580000-0000-4000-8000-000000000005','distribution-other-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('pd.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
-- Explicit owner IDs, fractions and roles from the existing source; never an assumed 100% owner.
do $$declare rows jsonb:='[{"id":"a","name":"الشريك أ","role":"مالك","bps":3333},{"id":"b","name":"الشريك ب","role":"وارث","bps":6667}]';begin
 update public.aqari_app_state set payload=jsonb_set(payload,'{propertySharesV267}',jsonb_build_object('pd-shares',jsonb_build_object('version',1,'enabled',true,'owners',rows,'events',jsonb_build_array(jsonb_build_object('id','pd-owners-1','type','owners','actor',auth.uid(),'at',now(),'before','[]'::jsonb,'after',rows))))) where workspace_id=current_setting('pd.w')::uuid;
end$$;
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values ('76580000-0000-4000-8000-000000000010',current_setting('pd.w')::uuid,'pd-property','عقار اختبار الإقفال','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values ('76580000-0000-4000-8000-000000000011',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000010','PD-1');
-- The regression also runs against newer schemas with unit readiness enforced.
-- Satisfy the real readiness RPC with an explicit synthetic inspection; never
-- disable the lease guard or let a setup failure masquerade as the close defect.
do $$begin
 if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
  perform public.aqari_unit_readiness_register(current_setting('pd.w')::uuid,'record',jsonb_build_object(
   'id','76580000-0000-4000-8000-000000000015','property_id','76580000-0000-4000-8000-000000000010','unit_no','PD-1',
   'expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','محضر جاهزية اصطناعي لاختبار الإقفال','reason','وحدة اختبار جاهزة لتكوين عقد الإقفال'));
 end if;
end$$;
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values ('76580000-0000-4000-8000-000000000012',current_setting('pd.w')::uuid,'pd-tenant','مستأجر اختبار','869000000001','86900001','{}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values ('76580000-0000-4000-8000-000000000013',current_setting('pd.w')::uuid,'pd-lease','76580000-0000-4000-8000-000000000012','76580000-0000-4000-8000-000000000011','PD-LEASE','2026-01-01','2026-12-31',100,0,'signed','{}');
-- Authenticated, explicitly synthetic metadata; no uploaded file is claimed here.
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
values('76580000-0000-4000-8000-000000000020',current_setting('pd.w')::uuid,'PD-REVIEW','property_document','property','pd-property','مطابقة مالية اصطناعية','test.pdf','application/pdf',current_setting('pd.w')||'/76580000-0000-4000-8000-000000000020.pdf',auth.uid());
insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',current_setting('pd.w')||'/76580000-0000-4000-8000-000000000020.pdf','{"size":100,"mimetype":"application/pdf"}');
select public.aqari_finalize_document('76580000-0000-4000-8000-000000000020',100,'application/pdf',repeat('a',64));
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('76580000-0000-4000-8000-000000000030',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000013','PD-PAID',100,'2026-01-01','2026-01-02','paid','bank','{}','{}'),
 ('76580000-0000-4000-8000-000000000031',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000013','PD-CANCEL',500,'2026-01-01','2026-01-03','paid','bank','{}','{}'),
 ('76580000-0000-4000-8000-000000000032',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000013','PD-NATIVE',500,'2026-01-01','2026-01-04','cancelled','bank','{}','{}'),
 ('76580000-0000-4000-8000-000000000033',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000013','PD-FRACTION',51.001,'2026-02-01','2026-02-02','جزئي','bank','{}','{}'),
 ('76580000-0000-4000-8000-000000000034',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000013','PD-UNKNOWN',123,'2026-03-01','2026-03-02','pending','bank','{}','{}');
insert into private.aqari_reserve_entries(id,workspace_id,property_id,direction,amount,reason,actor_id,created_at) values
 ('76580000-0000-4000-8000-000000000040',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000010','hold',25,'احتياطي اصطناعي',auth.uid(),'2026-01-02'),
 ('76580000-0000-4000-8000-000000000041',current_setting('pd.w')::uuid,'76580000-0000-4000-8000-000000000010','release',5,'إطلاق اصطناعي',auth.uid(),'2026-01-03');
-- Historical snapshots remain untouched and cannot become distributable implicitly.
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot) values(current_setting('pd.w')::uuid,'2025-12-01',auth.uid(),'مدير اختبار','لقطة قديمة اصطناعية','{"historical":true,"rent_payments":999}');
select public.aqari_manage_partner_access(current_setting('pd.w')::uuid,'pd-partner-a@example.invalid','76580000-0000-4000-8000-000000000010','الشريك أ',true,0,'اختبار وصول حصة أ');
select public.aqari_manage_partner_access(current_setting('pd.w')::uuid,'pd-partner-b@example.invalid','76580000-0000-4000-8000-000000000010','الشريك ب',true,0,'اختبار وصول حصة ب');
insert into auth.users(id,email,email_confirmed_at) values('76580000-0000-4000-8000-000000000003','pd-partner-a@example.invalid',now()),('76580000-0000-4000-8000-000000000004','pd-partner-b@example.invalid',now());
set local role authenticated;
do $$declare w uuid:=current_setting('pd.w')::uuid;e jsonb;v jsonb;a jsonb;r jsonb;request jsonb;post_request jsonb;f jsonb;begin
 perform public.aqari_final_gap_register(w,'cancel_receipt','{"id":"76580000-0000-4000-8000-000000000050","payment_id":"76580000-0000-4000-8000-000000000031","reason":"إلغاء سابق للإقفال"}');
 perform public.aqari_final_gap_register(w,'account','{"id":"76580000-0000-4000-8000-000000000051","property_id":"76580000-0000-4000-8000-000000000010","kind":"bank","name":"مرآة اختبار","masked_reference":"****5151"}');
 perform public.aqari_final_gap_register(w,'post_payment','{"id":"76580000-0000-4000-8000-000000000052","payment_id":"76580000-0000-4000-8000-000000000030","account_id":"76580000-0000-4000-8000-000000000051","reason":"نفس القبض مرآة بلا دخل ثان"}');
 e:=public.aqari_financial_register(w,'save',jsonb_build_object('id','76580000-0000-4000-8000-000000000053','revision',0,'property_id','76580000-0000-4000-8000-000000000010','expense_date','2026-01-05','category','صيانة','payee','مورد اختبار','amount','30','method','cash','reference','','description','مصروف اصطناعي','document_id','76580000-0000-4000-8000-000000000020'));
 perform public.aqari_financial_register(w,'approve',jsonb_build_object('id',e->>'id','revision',1,'reason','اعتماد مصروف اصطناعي موثق'));
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-01","reason":"إقفال مصدر اختبار التوزيع"}');
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-02","reason":"إقفال شهر فلس الكسور"}');
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-03","reason":"إقفال غير مؤكد يبقى للمراجعة"}');
 v:=public.aqari_partner_distribution_register(w,'preview','{"property_id":"76580000-0000-4000-8000-000000000010","month":"2026-01","shares_key":"pd-shares"}');
 if v->>'income_fils'<>'100000' or v->>'expense_fils'<>'30000' or v->>'reserve_fils'<>'20000' or v->>'net_fils'<>'50000' then raise exception 'WRONG_AVAILABLE_NET: %',v;end if;
 f:=public.aqari_partner_distribution_register(w,'list','{"month":"2026-01"}');
 if f#>>'{sources,0,source,source_scope}'<>'posted_confirmed_rent_and_approved_expenses_and_reserve_movements_only' or jsonb_array_length(f#>'{sources,0,source,payments}')<>1 or jsonb_array_length(f#>'{sources,0,source,excluded_payments}')<>2 then raise exception 'SOURCE_EVIDENCE_MISSING: %',f;end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''preview'',%L)',w,'{"property_id":"76580000-0000-4000-8000-000000000010","month":"2025-12","shares_key":"pd-shares"}');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_SOURCE_REVIEW_REQUIRED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''preview'',%L)',w,'{"property_id":"76580000-0000-4000-8000-000000000010","month":"2026-03","shares_key":"pd-shares"}');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_SOURCE_REVIEW_REQUIRED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 request:=jsonb_build_object('id',('76580000-0000-4000-8000-000000000060'),'property_id',(v)->>'property_id','month',(v)->>'month','source_hash',(v)->>'source_hash','shares_key',(v)->>'shares_key','shares_version',(v)->'shares_version','expected_review_revision',(v)->'review_revision',
 'expected_income_fils',(v)->>'income_fils','expected_expense_fils',(v)->>'expense_fils','expected_reserve_fils',(v)->>'reserve_fils','document_id','76580000-0000-4000-8000-000000000020','recipients','{"a":"76580000-0000-4000-8000-000000000003","b":"76580000-0000-4000-8000-000000000004"}'::jsonb,'reason','مطابقة صريحة للأرصدة والحصص في المستند الاصطناعي');
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request-'expected_expense_fils');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_EXPLICIT_RECONCILIATION_REQUIRED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"expected_expense_fils":"0"}');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_EXPLICIT_RECONCILIATION_REQUIRED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"document_id":"76580000-0000-4000-8000-000000000099"}');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_DOCUMENT_UNVERIFIED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"shares_version":2}');pd_expected_code text:='40001';pd_expected_message text:='PARTNER_REVIEW_STALE';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"income_fils":"999999"}');pd_expected_code text:='22023';pd_expected_message text:='INVALID_PARTNER_FIELD';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request);pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 a:=public.aqari_partner_distribution_register(w,'approve_source',request);
 if public.aqari_partner_distribution_register(w,'approve_source',request) is distinct from a then raise exception 'SOURCE_RETRY_CHANGED';end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"reason":"طلب مختلف بنفس المعرف"}');pd_expected_code text:='23514';pd_expected_message text:='PARTNER_RETRY_CONFLICT';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 perform set_config('pd.request',request::text,true);
 -- Two clients opened revision zero. The second must fail, not replace revision one.
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''approve_source'',%L)',w,request||'{"id":"76580000-0000-4000-8000-000000000061"}');pd_expected_code text:='40001';pd_expected_message text:='PARTNER_REVIEW_STALE';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 v:=public.aqari_partner_distribution_register(w,'preview','{"property_id":"76580000-0000-4000-8000-000000000010","month":"2026-01","shares_key":"pd-shares"}');
 request:=jsonb_build_object('id',('76580000-0000-4000-8000-000000000061'),'property_id',(v)->>'property_id','month',(v)->>'month','source_hash',(v)->>'source_hash','shares_key',(v)->>'shares_key','shares_version',(v)->'shares_version','expected_review_revision',(v)->'review_revision',
 'expected_income_fils',(v)->>'income_fils','expected_expense_fils',(v)->>'expense_fils','expected_reserve_fils',(v)->>'reserve_fils','document_id','76580000-0000-4000-8000-000000000020','recipients','{"a":"76580000-0000-4000-8000-000000000003","b":"76580000-0000-4000-8000-000000000004"}'::jsonb,'reason','مطابقة صريحة للأرصدة والحصص في المستند الاصطناعي');
 r:=public.aqari_partner_distribution_register(w,'approve_source',request);
 if r->>'review_revision'<>'2' then raise exception 'APPROVAL_HISTORY_NOT_VERSIONED';end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''post'',%L)',w,jsonb_build_object('id',gen_random_uuid(),'source_id',a->>'id','review_hash',a->>'review_hash','reason','رفض اعتماد قديم'));pd_expected_code text:='40001';pd_expected_message text:='PARTNER_REVIEW_STALE';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 post_request:=jsonb_build_object('id','76580000-0000-4000-8000-000000000070','source_id',r->>'id','review_hash',r->>'review_hash','reason','اعتماد توزيع موثق بلا دفع خارجي');
 a:=public.aqari_partner_distribution_register(w,'post',post_request);
 if a->>'net_fils'<>'50000' or (select sum((x->>'amount_fils')::bigint) from jsonb_array_elements(a->'allocations')x)<>50000 then raise exception 'ALLOCATION_TOTAL_MISMATCH';end if;
 if public.aqari_partner_distribution_register(w,'post',post_request) is distinct from a then raise exception 'DISTRIBUTION_RETRY_CHANGED';end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''post'',%L)',w,post_request||jsonb_build_object('id',gen_random_uuid()));pd_expected_code text:='23514';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 perform set_config('pd.post',post_request::text,true);perform set_config('pd.original',a::text,true);
 -- February has exactly 51.001, and does not deduct January's reserve again.
 v:=public.aqari_partner_distribution_register(w,'preview','{"property_id":"76580000-0000-4000-8000-000000000010","month":"2026-02","shares_key":"pd-shares"}');
 if v->>'net_fils'<>'51001' or v->>'reserve_fils'<>'0' or v#>>'{allocations,0,amount_fils}'<>'16999' or v#>>'{allocations,1,amount_fils}'<>'34002' then raise exception 'FILS_OR_RESERVE_DOUBLE_COUNT: %',v;end if;
 a:=public.aqari_partner_distribution_register(w,'approve_source',jsonb_build_object('id',('76580000-0000-4000-8000-000000000062'),'property_id',(v)->>'property_id','month',(v)->>'month','source_hash',(v)->>'source_hash','shares_key',(v)->>'shares_key','shares_version',(v)->'shares_version','expected_review_revision',(v)->'review_revision',
 'expected_income_fils',(v)->>'income_fils','expected_expense_fils',(v)->>'expense_fils','expected_reserve_fils',(v)->>'reserve_fils','document_id','76580000-0000-4000-8000-000000000020','recipients','{"a":"76580000-0000-4000-8000-000000000003","b":"76580000-0000-4000-8000-000000000004"}'::jsonb,'reason','مطابقة صريحة للأرصدة والحصص في المستند الاصطناعي'));
 perform set_config('pd.february',a::text,true);
end$$;
-- Storage object metadata remains protected by the existing authenticated RLS;
-- no managed-schema trigger or mutation grant is installed for this feature.
do $$begin
 begin delete from storage.objects where bucket_id='aqari-documents' and name=current_setting('pd.w')||'/76580000-0000-4000-8000-000000000020.pdf';if found then raise exception 'UPLOADED_OBJECT_DELETED';end if;exception when insufficient_privilege then null;end;
 begin update storage.objects set metadata='{}' where bucket_id='aqari-documents' and name=current_setting('pd.w')||'/76580000-0000-4000-8000-000000000020.pdf';if found then raise exception 'UPLOADED_OBJECT_OVERWRITTEN';end if;exception when insufficient_privilege then null;end;
end$$;
-- A second authorized manager may review a new source but cannot impersonate a
-- saved request actor; replay identity is part of its immutable evidence.
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000005',true);
do $$begin
 begin perform public.aqari_partner_distribution_register(current_setting('pd.w')::uuid,'approve_source',current_setting('pd.request')::jsonb);raise exception 'OTHER_ACTOR_REPLAYED_APPROVAL';exception when insufficient_privilege then null;end;
 begin perform public.aqari_partner_distribution_register(current_setting('pd.w')::uuid,'post',current_setting('pd.post')::jsonb);raise exception 'OTHER_ACTOR_REPLAYED_DISTRIBUTION';exception when insufficient_privilege then null;end;
 begin perform public.aqari_partner_distribution_register('76530000-0000-4000-8000-000000000090','list','{"month":"2026-01"}');raise exception 'OTHER_WORKSPACE_READ';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);
reset role;
-- Database integrity is checked as owner too, without bypassing production triggers.
do $$declare w uuid:=current_setting('pd.w')::uuid;begin
 declare pd_query text:=format('update private.aqari_partner_distributions set net_fils=1 where workspace_id=%L',w);pd_expected_code text:='23514';pd_expected_message text:='IMMUTABLE_LEDGER_ENTRY';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('delete from private.aqari_partner_period_sources where workspace_id=%L',w);pd_expected_code text:='23514';pd_expected_message text:='IMMUTABLE_LEDGER_ENTRY';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('update private.aqari_financial_periods set snapshot=''{}'' where workspace_id=%L',w);pd_expected_code text:='23514';pd_expected_message text:='IMMUTABLE_LEDGER_ENTRY';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:='update public.aqari_documents set title=''changed'' where id=''76580000-0000-4000-8000-000000000020''';pd_expected_code text:='23514';pd_expected_message text:='PARTNER_DOCUMENT_IMMUTABLE';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;

 declare pd_query text:='update public.aqari_rent_payments set amount=1 where id=''76580000-0000-4000-8000-000000000030''';pd_expected_code text:='P0001';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('insert into private.aqari_receipt_cancellations values(gen_random_uuid(),%L,''76580000-0000-4000-8000-000000000030'',''رفض تغيير المصدر'',auth.uid(),''اختبار'',now(),''{}'')',w);pd_expected_code text:='P0001';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:='update private.aqari_financial_expenses set amount=1 where id=''76580000-0000-4000-8000-000000000053''';pd_expected_code text:='P0001';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 if exists(select 1 from private.aqari_partner_period_sources where workspace_id=w and month='2025-12-01') then raise exception 'LEGACY_BACKFILLED';end if;
 if (select snapshot from private.aqari_financial_periods where workspace_id=w and month='2025-12-01')<>'{"historical":true,"rent_payments":999}'::jsonb then raise exception 'LEGACY_REWRITTEN';end if;
 -- Invalid percentages and negative/sign symmetry exercise the exact allocator.
 declare pd_query text:='select private.aqari_partner_allocate(1,''[{"id":"a","name":"أ","role":"مالك","bps":9999}]'',''{}'')';pd_expected_code text:='23514';pd_expected_message text:='PARTNER_SHARES_MUST_TOTAL_100';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:='select private.aqari_partner_allocate(1,''[{"id":"a","name":"أ","role":"مالك","bps":5000},{"id":"b","name":"ب","role":"مالك","bps":5001}]'',''{}'')';pd_expected_code text:='23514';pd_expected_message text:='PARTNER_SHARES_MUST_TOTAL_100';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 if private.aqari_partner_allocate(1,'[{"id":"b","name":"ب","role":"مالك","bps":5000},{"id":"a","name":"أ","role":"مالك","bps":5000}]','{}')#>>'{0,owner_id}'<>'a' or private.aqari_partner_allocate(-1,'[{"id":"a","name":"أ","role":"مالك","bps":5000},{"id":"b","name":"ب","role":"مالك","bps":5000}]','{}')#>>'{0,amount_fils}'<>'-1' then raise exception 'REMAINDER_NOT_DETERMINISTIC';end if;
end$$;
-- A posting or reversal is dated today, separately from the closed source
-- month. A closed posting month rejects a NEW request. Roll back this artificial
-- close using a nested transaction so the following reversal scenario stays open.
do $$declare w uuid:=current_setting('pd.w')::uuid;a jsonb:=current_setting('pd.february')::jsonb;begin
 begin
  insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)
   values(w,date_trunc('month',now() at time zone 'Asia/Kuwait')::date,auth.uid(),'مدير اصطناعي','إقفال اصطناعي لاختبار تاريخ القيد','{}');
  begin
   perform public.aqari_partner_distribution_register(w,'post',jsonb_build_object('id',gen_random_uuid(),'source_id',a->>'id','review_hash',a->>'review_hash','reason','رفض تاريخ قيد مقفل'));
   raise exception 'CLOSED_POSTING_MONTH_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise;end if;end;
  begin
   perform public.aqari_partner_distribution_register(w,'reverse',jsonb_build_object('id',gen_random_uuid(),'distribution_id','76580000-0000-4000-8000-000000000070','reason','رفض عكس في شهر مقفل'));
   raise exception 'CLOSED_REVERSAL_MONTH_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise;end if;end;
  raise sqlstate 'PD001';
 exception when sqlstate 'PD001' then null;end;
end$$;
-- Partners cannot use manager functions, see other owners, or read other properties.
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$declare r jsonb;begin
 r:=public.aqari_partner_distribution_statement('76580000-0000-4000-8000-000000000010','2026-01-01');
 if r->>'balance_fils'<>'16665' or jsonb_array_length(r->'entries')<>1 or r#>>'{entries,0,owner_id}'<>'a' or r::text like '%الشريك ب%' or r::text like '%source_hash%' then raise exception 'PARTNER_STATEMENT_LEAK: %',r;end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''list'',''{"month":"2026-01"}'')',current_setting('pd.w'));pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:='select public.aqari_partner_distribution_statement(''76580000-0000-4000-8000-000000000099'',''2026-01-01'')';pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:='select * from private.aqari_partner_distributions';pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
end$$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000002',true);
do $$begin declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''list'',''{"month":"2026-01"}'')',current_setting('pd.w'));pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;end$$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);
-- Revocation blocks both a fresh posting and historical partner readback.
select public.aqari_manage_partner_access(current_setting('pd.w')::uuid,'pd-partner-a@example.invalid','76580000-0000-4000-8000-000000000010','الشريك أ',false,1,'تعليق الوصول لاختبار العزل');
do $$declare a jsonb:=current_setting('pd.february')::jsonb;begin
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''post'',%L)',current_setting('pd.w'),jsonb_build_object('id',gen_random_uuid(),'source_id',a->>'id','review_hash',a->>'review_hash','reason','رفض مستفيد معطل'));pd_expected_code text:='23514';pd_expected_message text:='PARTNER_RECIPIENT_ACCESS_REQUIRED';pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
end$$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000003',true);
do $$begin declare pd_query text:='select public.aqari_partner_distribution_statement(''76580000-0000-4000-8000-000000000010'',''2026-01-01'')';pd_expected_code text:='42501';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;end$$;
select set_config('request.jwt.claim.sub','76580000-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('pd.w')::uuid;r jsonb;d jsonb:=jsonb_build_object('id','76580000-0000-4000-8000-000000000080','distribution_id','76580000-0000-4000-8000-000000000070','reason','عكس مستقل موثق بلا تغيير الأصل');begin
 r:=public.aqari_partner_distribution_register(w,'reverse',d);
 if r->>'net_fils'<>'-50000' or r#>>'{allocations,0,amount_fils}'<>'-16665' then raise exception 'REVERSAL_MISMATCH';end if;
 if public.aqari_partner_distribution_register(w,'reverse',d) is distinct from r then raise exception 'REVERSAL_RETRY_CHANGED';end if;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''reverse'',%L)',w,d||jsonb_build_object('id',gen_random_uuid()));pd_expected_code text:='23514';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 declare pd_query text:=format('select public.aqari_partner_distribution_register(%L,''post'',%L)',w,current_setting('pd.post')::jsonb||jsonb_build_object('id',gen_random_uuid()));pd_expected_code text:='23514';pd_expected_message text:=null;pd_rejected boolean:=false;pd_code text;pd_message text;
 begin
  begin execute pd_query;exception when others then get stacked diagnostics pd_code=returned_sqlstate,pd_message=message_text;
   if pd_code<>pd_expected_code or (pd_expected_message is not null and pd_message<>pd_expected_message) then raise exception 'UNEXPECTED_REJECTION: % %',pd_code,pd_message;end if;pd_rejected:=true;
  end;
  if not pd_rejected then raise exception 'UNEXPECTED_ACCEPTANCE: %',pd_query;end if;
 end;
 if not exists(select 1 from jsonb_array_elements(public.aqari_partner_distribution_register(w,'list','{"month":"2026-01"}')->'entries')x where x=current_setting('pd.original')::jsonb) then raise exception 'ORIGINAL_DISTRIBUTION_CHANGED';end if;
end$$;
reset role;
-- Real commercial-allocation compatibility migrations are loaded by the runner.
-- A mixed receipt blocks its own property; another property in the same close
-- retains a distributable rent-only source. All rows are synthetic and rolled back.
do $$declare w uuid:=current_setting('pd.w')::uuid;result jsonb;mixed jsonb;clean jsonb;begin
 if to_regclass('private.aqari_commercial_active_allocations') is null then raise exception 'COMMERCIAL_COMPATIBILITY_FIXTURE_REQUIRED';end if;
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('76580000-0000-4000-8000-000000000110',w,'pd-clean-property','عقار إيجاري سليم','{}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no) values('76580000-0000-4000-8000-000000000111',w,'76580000-0000-4000-8000-000000000110','PD-CLEAN');
 perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id','76580000-0000-4000-8000-000000000110','unit_no','PD-CLEAN','expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','محضر اصطناعي جاهز','reason','جاهزية عقد مصدر سليم'));
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values('76580000-0000-4000-8000-000000000113',w,'pd-clean-lease','76580000-0000-4000-8000-000000000012','76580000-0000-4000-8000-000000000111','PD-CLEAN-LEASE','2026-01-01','2026-12-31',100,0,'signed','{}');
 insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
  ('76580000-0000-4000-8000-000000000130',w,'76580000-0000-4000-8000-000000000013','PD-MIXED',20,'2026-04-01','2026-04-02','paid','bank','{}','{}'),
  ('76580000-0000-4000-8000-000000000131',w,'76580000-0000-4000-8000-000000000113','PD-CLEAN',25,'2026-04-01','2026-04-02','paid','bank','{}','{}');
 insert into private.aqari_commercial_sales(id,workspace_id,lease_id,month,period_start,period_end,gross_sales,sales_percentage,amount,terms_revision,calculation_basis,source_document_id,source_checksum,source_reference,request_data,recorded_by)
 values('76580000-0000-4000-8000-000000000140',w,'76580000-0000-4000-8000-000000000013','2026-04-01','2026-04-01','2026-04-30',100,5,5,1,'additional_to_base_rent','76580000-0000-4000-8000-000000000020',repeat('a',64),'مصدر تجاري اصطناعي','{}',auth.uid());
 insert into private.aqari_commercial_payment_allocations(id,workspace_id,lease_id,sale_id,payment_id,amount,allocated_on,request_data,recorded_by)
 values('76580000-0000-4000-8000-000000000150',w,'76580000-0000-4000-8000-000000000013','76580000-0000-4000-8000-000000000140','76580000-0000-4000-8000-000000000130',5,'2026-04-02','{}',auth.uid());
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-04","reason":"إقفال توافق تخصيص تجاري مع عقار سليم"}');
 result:=public.aqari_partner_distribution_register(w,'list','{"month":"2026-04"}');
 select x into mixed from jsonb_array_elements(result->'sources')x where x->>'property_id'='76580000-0000-4000-8000-000000000010';
 select x into clean from jsonb_array_elements(result->'sources')x where x->>'property_id'='76580000-0000-4000-8000-000000000110';
 if mixed->>'period_matches'<>'false' or mixed#>>'{source,review_reason}'<>'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' or jsonb_array_length(mixed#>'{source,commercial_allocations}')<>1 then raise exception 'MIXED_PAYMENT_WAS_DISTRIBUTABLE: %',mixed;end if;
 if clean->>'period_matches'<>'true' or clean#>>'{source,income_fils}'<>'25000' or jsonb_array_length(clean#>'{source,commercial_allocations}')<>0 then raise exception 'CLEAN_PROPERTY_SOURCE_BLOCKED: %',clean;end if;
 begin perform public.aqari_partner_distribution_register(w,'preview','{"property_id":"76580000-0000-4000-8000-000000000010","month":"2026-04","shares_key":"pd-shares"}');raise exception 'MIXED_SOURCE_PREVIEW_ACCEPTED';exception when check_violation then if sqlerrm<>'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' then raise;end if;end;
 result:=public.aqari_partner_distribution_register(w,'preview','{"property_id":"76580000-0000-4000-8000-000000000110","month":"2026-04","shares_key":"pd-shares"}');
 if result->>'net_fils'<>'25000' then raise exception 'CLEAN_PROPERTY_NET_CHANGED';end if;
end$$;
rollback;
select 'PASS: confirmed source capture/reconciliation; exclusions/mirror; net100-30-20; exact51001fils; immutable/versioned approval; stale/retry/duplicate guards; signed reversal; document/source freeze; manager/AAL2/partner isolation. All synthetic writes rolled back.';
