-- Synthetic records only; all writes roll back. Must run after source/access/template upgrades.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('official-source-manager@example.invalid','مدير نماذج اختبار','general_manager','aqari-v267-staging'),
 ('official-source-accountant@example.invalid','محاسب نماذج اختبار','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('7f680000-0000-4000-8000-000000000001','official-source-manager@example.invalid',now()),
 ('7f680000-0000-4000-8000-000000000002','official-source-accountant@example.invalid',now());
select set_config('aqari.test.official_source.workspace',(select workspace_id::text from public.aqari_memberships where user_id='7f680000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
insert into public.aqari_workspaces(id,slug,name) values('7f680000-0000-4000-8000-000000000099','official-source-foreign-fixture','Foreign isolated fixture');
insert into public.aqari_app_state(workspace_id,payload) values('7f680000-0000-4000-8000-000000000099','{}');
do $$declare n integer;w uuid;p uuid;t uuid;u uuid;l uuid;begin
 for n in 1..3 loop
  w:=case n when 3 then '7f680000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.official_source.workspace')::uuid end;
  p:=('7f680000-0000-4000-8000-00000000010'||n)::uuid;t:=('7f680000-0000-4000-8000-00000000020'||n)::uuid;
  u:=('7f680000-0000-4000-8000-00000000030'||n)::uuid;l:=('7f680000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'DOC-P-'||n,'عقار اختبار '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'10'||n);
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'DOC-T-'||n,'مستأجر اختبار '||n,'76800000000'||n,'7680000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'DOC-L-'||n,t,u,'DOC-L-'||n,'2026-01-01','2026-12-31',100,50,'signed','{}');
  insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
   values(('7f680000-0000-4000-8000-00000000050'||n)::uuid,w,l,'DOC-PAY-'||n,12.345,'2026-09-01','2026-09-05','paid','cash','{}',case n when 1 then '{"accountant":"محصل الاختبار"}'::jsonb else '{"collectorName":"محصل الاختبار"}'::jsonb end);
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by)values
 (current_setting('aqari.test.official_source.workspace')::uuid,'7f680000-0000-4000-8000-000000000002','accountant',array['7f680000-0000-4000-8000-000000000101']::uuid[],true,'7f680000-0000-4000-8000-000000000001');
end $$;
create function pg_temp.document_request(w uuid,l uuid,p uuid,n integer) returns jsonb language plpgsql as $$
declare v jsonb;body text;snapshot jsonb;no text;begin
 no:=public.aqari_official_document_number(w,('7f680000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,'rent_receipt',l)->>'document_no';
 v:=private.aqari_official_source(w,'rent_receipt','lease',l,p)||jsonb_build_object('documentNo',no,'issuedAt','2026-09-12');
 body:='نشهد باستلام مبلغ '||(v->>'amount')||' د.ك من السيد/السيدة '||(v->>'tenantName')||' عن إيجار الوحدة '||(v->>'unitNo')||' في '||(v->>'propertyName')||' عن الفترة '||(v->>'period')||'، بموجب العقد رقم '||(v->>'contractNo')||' وطريقة السداد '||(v->>'paymentMethod')||' والمرجع '||(v->>'paymentReference')||'.';
 snapshot:=jsonb_build_object('kind','rent_receipt','title','وصل إيجار','documentNo',no,'version',1,'issuedAt','2026-09-12','body',body,'payload',v);
 return jsonb_build_object('id',('7f680000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,'version_id',('7f680000-0000-4000-8000-'||lpad((700+n)::text,12,'0'))::uuid,
  'event_id',gen_random_uuid(),'kind','rent_receipt','document_no',no,'entity_type','lease','entity_id',l,'title','وصل إيجار','body',body,'payload',v,'template_version',1,
  'content_sha256',encode(sha256(convert_to(private.aqari_official_canonical(snapshot),'UTF8')),'hex'),'reason','إصدار اختبار من مصدر محفوظ');
end$$;
select set_config('aqari.test.official_source.req1',pg_temp.document_request(current_setting('aqari.test.official_source.workspace')::uuid,'7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000501',1)::text,true);
select set_config('aqari.test.official_source.req2',pg_temp.document_request(current_setting('aqari.test.official_source.workspace')::uuid,'7f680000-0000-4000-8000-000000000402','7f680000-0000-4000-8000-000000000502',2)::text,true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;r jsonb;request jsonb:=current_setting('aqari.test.official_source.req1')::jsonb;mutant jsonb;begin
 r:=public.aqari_official_document_context(w,'rent_receipt');if jsonb_array_length(r->'entities')<>2 then raise exception 'ENTITY_OPTIONS_SCOPE_FAILED';end if;
 r:=public.aqari_official_document_context(w,'rent_receipt','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000501');
 if r#>>'{defaults,amount}'<>'12.345' or r#>>'{defaults,tenantName}'<>'مستأجر اختبار 1' then raise exception 'SOURCE_DEFAULTS_FAILED';end if;
 if r#>>'{defaults,collectorName}' is distinct from 'محصل الاختبار' then raise exception 'SAVED_ACCOUNTANT_NAME_MISSING';end if;
 begin perform public.aqari_official_document_context(w,'rent_receipt','7f680000-0000-4000-8000-000000000403');raise exception 'FOREIGN_ENTITY_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_official_document_context(w,'rent_receipt','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000502');raise exception 'WRONG_PAYMENT_ALLOWED';exception when check_violation then null;end;
 begin perform public.aqari_official_document_register(w,'issue',request||jsonb_build_object('entity_id','7f680000-0000-4000-8000-000000000499'));raise exception 'MISSING_ENTITY_ISSUED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_official_document_register(w,'issue',jsonb_set(request,'{payload,amount}','"999.000"'));raise exception 'FORGED_AMOUNT_ISSUED';exception when check_violation then null;end;
 begin perform public.aqari_official_document_register(w,'issue',request||jsonb_build_object('body','نص رسمي مزور'));raise exception 'FORGED_BODY_ISSUED';exception when check_violation then null;end;
 begin perform public.aqari_official_document_register(w,'issue',request||jsonb_build_object('content_sha256',repeat('a',64)));raise exception 'FORGED_HASH_ISSUED';exception when check_violation then null;end;
 r:=public.aqari_official_document_register(w,'issue',request);
 if r#>>'{version,payload,amount}'<>'12.345' then raise exception 'ISSUED_SOURCE_CHANGED';end if;
 r:=public.aqari_official_document_register(w,'get',jsonb_build_object('id',request->>'id'));
 if jsonb_array_length(r->'versions')<>1 or r#>>'{versions,0,payload,amount}'<>'12.345' then raise exception 'EXACT_READBACK_FAILED';end if;
 r:=public.aqari_official_document_register(w,'issue',request);if r->>'replayed'<>'true' then raise exception 'LOST_REPLY_DUPLICATED';end if;
 perform public.aqari_official_document_register(w,'issue',current_setting('aqari.test.official_source.req2')::jsonb);
 begin perform 1 from private.aqari_official_document_versions;raise exception 'PRIVATE_ARCHIVE_DIRECT_READ';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000002',true);
do $$declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;r jsonb;begin
 r:=public.aqari_official_document_register(w,'list');if jsonb_array_length(r->'items')<>1 then raise exception 'ACCOUNTANT_PROPERTY_ARCHIVE_LEAK';end if;
 r:=public.aqari_official_document_register(w,'get','{"id":"7f680000-0000-4000-8000-000000000602"}');if r<>'{}'::jsonb then raise exception 'ACCOUNTANT_FOREIGN_ARCHIVE_GET';end if;
 begin perform public.aqari_official_document_register(w,'issue',current_setting('aqari.test.official_source.req1')::jsonb);raise exception 'ACCOUNTANT_ISSUE_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Additional saved sources are synthetic metadata/ledger fixtures, not real payments or attachments.
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;a uuid:=auth.uid();begin
 insert into private.aqari_deposit_entries(id,workspace_id,lease_id,kind,voucher_no,amount,on_date,method,reason,actor_id,actor_name,snapshot,balance_after,request_data) values
 ('7f680000-0000-4000-8000-000000000801',w,'7f680000-0000-4000-8000-000000000401','receipt','DEP-TEST-1',50.125,'2026-09-01','cash','استلام تأمين محفوظ',a,'مدير نماذج اختبار','{}',50.125,'{}'),
 ('7f680000-0000-4000-8000-000000000802',w,'7f680000-0000-4000-8000-000000000401','refund','DEP-TEST-2',5.125,'2026-09-02','cash','رد جزء محفوظ',a,'مدير نماذج اختبار','{}',45,'{}');
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by) values
 ('7f680000-0000-4000-8000-000000000803',w,'DOC-INVOICE-FIXTURE','property_document','property','DOC-P-1','فاتورة اصطناعية','test.pdf','application/pdf',w::text||'/7f680000-0000-4000-8000-000000000803.pdf',a);
 insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/7f680000-0000-4000-8000-000000000803.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document('7f680000-0000-4000-8000-000000000803',100,'application/pdf',repeat('a',64));
 insert into private.aqari_financial_expenses(id,workspace_id,property_id,expense_date,category,payee,amount,method,reference,description,document_id,state,voucher_no,created_by,approved_by,approved_by_name,approved_at) values
 ('7f680000-0000-4000-8000-000000000804',w,'7f680000-0000-4000-8000-000000000101','2026-09-03','صيانة','مورد محفوظ',8.125,'cash','INV-TEST-1','إصلاح محفوظ','7f680000-0000-4000-8000-000000000803','approved','EXP-TEST-1',a,a,'مدير نماذج اختبار',now());
 insert into private.aqari_vendors(id,workspace_id,name,created_by)values('7f680000-0000-4000-8000-000000000805',w,'مقاول اختبار',a);
 insert into private.aqari_work_orders(id,workspace_id,property_id,vendor_id,order_no,description,status,approved_amount,approved_by,approved_at,created_by) values
 ('7f680000-0000-4000-8000-000000000806',w,'7f680000-0000-4000-8000-000000000101','7f680000-0000-4000-8000-000000000805','WORK-TEST-1','إصلاح مصعد الاختبار','approved',25.125,a,now(),a);
 insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id) values
 ('7f680000-0000-4000-8000-000000000807',w,'7f680000-0000-4000-8000-000000000401','manual_correction','credit',2.000,'2026-09-03','test','7f680000-0000-4000-8000-000000000807','تسوية دائنة محفوظة',a);
end $$;
create function pg_temp.official_request(k text,t text,i uuid,p uuid,extra jsonb default '{}')returns jsonb language plpgsql as $$
declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;ident uuid:=gen_random_uuid();spec jsonb;v jsonb;b text;s jsonb;key text;no text;begin
 spec:=private.aqari_official_template(k);no:=public.aqari_official_document_number(w,ident,k,i)->>'document_no';
 v:=private.aqari_official_source(w,k,t,i,p,extra)||extra||jsonb_build_object('documentNo',no,'issuedAt','2026-09-12');
 b:=spec->>'body';for key in select jsonb_array_elements_text(spec->'required') loop b:=replace(b,'{{'||key||'}}',v->>key);end loop;
 s:=jsonb_build_object('kind',k,'title',spec->>'title','documentNo',no,'version',(spec->>'version')::integer,'issuedAt',v->>'issuedAt','body',b,'payload',v);
 return jsonb_build_object('id',ident,'version_id',gen_random_uuid(),'event_id',gen_random_uuid(),'kind',k,'document_no',no,'entity_type',t,'entity_id',i,'title',spec->>'title','body',b,'payload',v,'template_version',(spec->>'version')::integer,'content_sha256',encode(sha256(convert_to(private.aqari_official_canonical(s),'UTF8')),'hex'),'reason','اختبار المصدر الرسمي');
end $$;
do $$declare requests jsonb:='[]';k text;i uuid;p uuid;t text;begin
 foreach k in array array['receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval','work_order','tenant_statement','debt_notice','daily_collection','renewal_notice','nonrenewal_notice'] loop
 t:=case when k in ('payment_voucher','expense_approval','daily_collection')then 'property' when k='work_order'then 'work_order'else 'lease'end;
 i:=case t when 'property'then '7f680000-0000-4000-8000-000000000101'::uuid when 'work_order'then '7f680000-0000-4000-8000-000000000806'::uuid else '7f680000-0000-4000-8000-000000000401'::uuid end;
 p:=case k when 'receipt_voucher'then '7f680000-0000-4000-8000-000000000501'::uuid when 'deposit_receipt'then '7f680000-0000-4000-8000-000000000801'::uuid when 'deposit_refund'then '7f680000-0000-4000-8000-000000000802'::uuid when 'payment_voucher'then '7f680000-0000-4000-8000-000000000804'::uuid when 'expense_approval'then '7f680000-0000-4000-8000-000000000804'::uuid else null end;
 requests:=requests||jsonb_build_array(pg_temp.official_request(k,t,i,p,'{"fromDate":"2026-09-01","toDate":"2026-09-12","dueDate":"2026-09-12","graceDeadline":"2026-09-30","collectionDate":"2026-09-05","responseDeadline":"2026-12-15","vacateDate":"2026-12-31"}'));
 end loop;
 perform set_config('aqari.test.official_source.extras',requests::text,true);
 perform set_config('aqari.test.official_source.forged',pg_temp.official_request('rent_receipt','lease','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000501','{"amount":"999.000"}')::text,true);
 perform set_config('aqari.test.official_source.duplicate',pg_temp.official_request('rent_receipt','lease','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000501')::text,true);
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;request jsonb;r jsonb;v jsonb;begin
 for request in select value from jsonb_array_elements(current_setting('aqari.test.official_source.extras')::jsonb)loop
  perform public.aqari_official_document_register(w,'issue',request);
  r:=public.aqari_official_document_register(w,'get',jsonb_build_object('id',request->>'id'));v:=r#>'{versions,0,payload}';
  if v is distinct from request->'payload' then raise exception 'SOURCE_FORM_READBACK: %',request->>'kind';end if;
  if request->>'kind'='tenant_statement' and (v->>'openingBalance'<>'800.000' or v->>'charges'<>'100.000' or v->>'payments'<>'12.345' or v->>'credits'<>'2.000' or v->>'closingBalance'<>'885.655')then raise exception 'STATEMENT_MATH: %',v;end if;
  if request->>'kind'='daily_collection' and (v->>'receiptCount'<>'1' or v->>'totalAmount'<>'12.345')then raise exception 'DAILY_MATH: %',v;end if;
 end loop;
 -- This forged payload has a matching template body and recomputed valid hash.
 begin perform public.aqari_official_document_register(w,'issue',current_setting('aqari.test.official_source.forged')::jsonb);raise exception 'SOURCE_AMOUNT_FORGERY_ALLOWED';exception when check_violation then if sqlerrm<>'DOCUMENT_SOURCE_MISMATCH: amount'then raise;end if;end;
 begin perform public.aqari_official_document_register(w,'issue',current_setting('aqari.test.official_source.duplicate')::jsonb);raise exception 'DUPLICATE_FINANCIAL_SOURCE_ALLOWED';exception when unique_violation then null;end;
 begin perform public.aqari_official_document_context(w,'deposit_receipt','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000802');raise exception 'REFUND_AS_RECEIPT_ALLOWED';exception when check_violation then null;end;
 begin perform public.aqari_official_document_context(w,'expense_approval','7f680000-0000-4000-8000-000000000102','7f680000-0000-4000-8000-000000000804');raise exception 'FOREIGN_PROPERTY_EXPENSE_ALLOWED';exception when check_violation then null;end;
 begin perform public.aqari_official_document_context(w,'clearance','7f680000-0000-4000-8000-000000000401');raise exception 'UNCLEARED_CONTRACT_ALLOWED';exception when check_violation then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_official_document_number(w,gen_random_uuid(),'rent_receipt','7f680000-0000-4000-8000-000000000401');raise exception 'MFA_NUMBER_BYPASS';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
end $$;
reset role;
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot) values(gen_random_uuid(),current_setting('aqari.test.official_source.workspace')::uuid,'7f680000-0000-4000-8000-000000000501','إلغاء لاحق لاختبار المصدر','7f680000-0000-4000-8000-000000000001','مدير اختبار','{}');
select set_config('request.jwt.claim.sub','7f680000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.official_source.workspace')::uuid;r jsonb;begin
 begin perform public.aqari_official_document_context(current_setting('aqari.test.official_source.workspace')::uuid,'rent_receipt','7f680000-0000-4000-8000-000000000401','7f680000-0000-4000-8000-000000000501');raise exception 'CANCELLED_SOURCE_ALLOWED';exception when check_violation then null;end;
 r:=public.aqari_official_document_context(w,'tenant_statement','7f680000-0000-4000-8000-000000000401',null,'{"fromDate":"2026-09-01","toDate":"2026-09-12"}');
 if r#>>'{defaults,payments}'<>'0.000' or r#>>'{defaults,closingBalance}'<>'898.000'then raise exception 'CANCELLED_STATEMENT_MATH: %',r;end if;
 r:=public.aqari_official_document_context(w,'daily_collection','7f680000-0000-4000-8000-000000000101',null,'{"collectionDate":"2026-09-05"}');
 if r#>>'{defaults,receiptCount}'<>'0' or r#>>'{defaults,totalAmount}'<>'0.000'then raise exception 'CANCELLED_DAILY_TOTAL: %',r;end if;
end$$;
reset role;
insert into private.aqari_tenant_ledger_entries(id,workspace_id,tenant_id,lease_id,direction,kind,amount,occurred_on,reason,source_type,source_id,actor_id)values
 (gen_random_uuid(),current_setting('aqari.test.official_source.workspace')::uuid,'7f680000-0000-4000-8000-000000000201','7f680000-0000-4000-8000-000000000401','debit','opening_debit',100,'2026-08-01','رصيد افتتاحي غير مطابق','test','opening',auth.uid());
set local role authenticated;
do $$begin
 begin perform public.aqari_official_document_context(current_setting('aqari.test.official_source.workspace')::uuid,'tenant_statement','7f680000-0000-4000-8000-000000000401',null,'{"fromDate":"2026-09-01","toDate":"2026-09-12"}');raise exception 'OPENING_BALANCE_DOUBLE_COUNT_ALLOWED';exception when check_violation then if sqlerrm<>'DOCUMENT_OPENING_RECONCILIATION_REQUIRED'then raise;end if;end;
end $$;
reset role;rollback;
select 'PASS: source-bound issue, real entity scope, amount/body/hash rejection, replay, archive property isolation and cancelled source rejection';
