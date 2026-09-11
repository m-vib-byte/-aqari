-- Isolated test database only. All records/users/storage metadata are rolled back.
-- Metadata fixtures verify DB guards; they are not actual invoice/signature uploads.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('finance-gate-manager@example.invalid','مدير اختبار مالي','general_manager','aqari-v267-staging'),
 ('finance-gate-accountant@example.invalid','محاسب اختبار مالي','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f2672200-0000-4000-8000-000000000001','finance-gate-manager@example.invalid',now()),
 ('f2672200-0000-4000-8000-000000000002','finance-gate-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','f2672200-0000-4000-8000-000000000001',true);
-- The finance test exercises privileged writes; model an MFA-authenticated manager
-- explicitly rather than weakening the production AAL2 guard.
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('finance.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
-- Test-only metadata fixture; it does not replace a Storage upload or test Storage RLS.
create function pg_temp.finance_invoice_fixture(p text) returns void language sql security definer set search_path='' as $$
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',p,'{"size":100,"mimetype":"image/jpeg"}');
$$;
grant execute on function pg_temp.finance_invoice_fixture(text) to authenticated;
set local role authenticated;
do $$
declare w uuid; s jsonb;d jsonb;r jsonb;e jsonb;doc record;prop uuid;other uuid;
begin
 w:=current_setting('finance.test.workspace')::uuid;
 if public.aqari_workspace_access(w)#>>'{features,financial_register}' is distinct from 'true' then raise exception 'FINANCIAL_TOOL_NOT_DISCOVERABLE';end if;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["اختبار مالي أ"],["اختبار مالي ب"]]'::jsonb);
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 select id into strict prop from public.aqari_properties where workspace_id=w and name='اختبار مالي أ';
 select id into strict other from public.aqari_properties where workspace_id=w and name='اختبار مالي ب';
 perform set_config('finance.test.property',prop::text,true);perform set_config('finance.test.other',other::text,true);
 e:=jsonb_build_object('id','f2672200-0000-4000-8000-000000000010','revision',0,'property_id',prop,'expense_date','2026-05-12','category','صيانة','payee','مورد اختبار','amount','25.125','method','bank','reference','TEST-ONLY-FIN-1','description','مصروف اصطناعي متراجع عنه','document_id',null);
 r:=public.aqari_financial_register(w,'save',e);
 if r->>'state'<>'draft' or r->>'revision'<>'1' or (r->>'amount')::numeric<>25.125 then raise exception 'DRAFT_SAVE_FAILED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_financial_register(w,'list','{"month":"2026-05"}')->'expenses')x where x->>'id'=r->>'id' and (x->>'amount')::numeric=25.125) then raise exception 'DRAFT_REREAD_FAILED';end if;
 begin perform public.aqari_financial_register(w,'save',e);raise exception 'STALE_SAVE_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_financial_register(w,'approve',jsonb_build_object('id',r->>'id','revision',1,'reason','اختبار مستند مفقود'));raise exception 'MISSING_DOCUMENT_APPROVED';
 exception when raise_exception then if sqlerrm<>'اربط فاتورة مرفوعة ومؤكد حفظها قبل اعتماد المصروف.' then raise;end if;end;
 begin perform public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"اختبار مسودة معلقة"}');raise exception 'DRAFT_MONTH_CLOSED';
 exception when raise_exception then if sqlerrm<>'توجد مصروفات مسودة في الشهر؛ اعتمدها أو ألغها قبل الإقفال.' then raise;end if;end;
 begin perform public.aqari_financial_register(w,'save',e||jsonb_build_object('id','f2672200-0000-4000-8000-000000000011','amount','25.1234'));raise exception 'OVERPRECISION_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'أدخل مبلغاً صحيحاً بثلاث منازل عشرية كحد أقصى.' then raise;end if;end;
 begin perform public.aqari_financial_register(w,'save',e||jsonb_build_object('id','f2672200-0000-4000-8000-000000000011','reference',''));raise exception 'EMPTY_BANK_REFERENCE_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'رقم مرجع التحويل أو الشيك مطلوب.' then raise;end if;end;
 select * into doc from public.aqari_reserve_document(w,'property_document','property','اختبار مالي أ','فاتورة اختبار','test.jpg','image/jpeg','{"fixture":"rollback-only"}');
 perform pg_temp.finance_invoice_fixture(doc.storage_path);
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 perform set_config('finance.test.invoice',doc.document_id::text,true);
 e:=e||jsonb_build_object('revision',1,'document_id',doc.document_id);r:=public.aqari_financial_register(w,'save',e);
 if r->>'revision'<>'2' then raise exception 'DOCUMENT_LINK_FAILED';end if;
 begin perform public.aqari_financial_register(w,'save',e||jsonb_build_object('id','f2672200-0000-4000-8000-000000000011','revision',0,'property_id',other));raise exception 'WRONG_PROPERTY_DOCUMENT_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'اختر مستنداً محفوظاً للعقار نفسه.' then raise;end if;end;
 r:=public.aqari_financial_register(w,'approve',jsonb_build_object('id',r->>'id','revision',2,'reason','اعتماد فاتورة الاختبار'));
 if r->>'voucher_no' !~ '^EX-\d{8}-\d{8}$' or r->>'approved_by_name'<>'مدير اختبار مالي' or r->>'state'<>'approved' then raise exception 'APPROVAL_PROOF_MISSING';end if;
 perform set_config('finance.test.approved',r::text,true);
 begin perform public.aqari_financial_register(w,'save',e||'{"revision":3,"amount":"30"}');raise exception 'APPROVED_EDIT_ALLOWED';
 exception when raise_exception then if sqlerrm<>'المصروف المعتمد أو الملغى لا يقبل التعديل.' then raise;end if;end;
 if (public.aqari_financial_register(w,'list','{"month":"2026-05"}')#>>'{summary,approved_expenses}')::numeric<>25.125 then raise exception 'APPROVED_SUMMARY_WRONG';end if;
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','f2672200-0000-4000-8000-000000000002','operational_role','accountant','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','نطاق اختبار مالي بعقار واحد'));
end $$;
select set_config('request.jwt.claim.sub','f2672200-0000-4000-8000-000000000002',true);
do $$
declare w uuid:=current_setting('finance.test.workspace')::uuid; prop uuid:=current_setting('finance.test.property')::uuid;r jsonb;
begin
 if not private.aqari_can_property(w,prop,'finance','write') then raise exception 'ACCOUNTANT_PROPERTY_FINANCE_REQUIRED';end if;
 if private.aqari_manager(w) then raise exception 'ACCOUNTANT_BECAME_MANAGER';end if;
 r:=public.aqari_financial_register(w,'list','{"month":"2026-05"}');
 if jsonb_array_length(r->'properties')<>1 or r#>>'{properties,0,id}'<>prop::text then raise exception 'ACCOUNTANT_PROPERTY_SCOPE_LEAK';end if;
 if jsonb_array_length(r->'expenses')<>1 or r#>>'{expenses,0,id}'<>'f2672200-0000-4000-8000-000000000010' then raise exception 'ACCOUNTANT_EXPENSE_SCOPE_LEAK';end if;
 begin perform public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"محاولة إقفال غير مخولة"}');raise exception 'ACCOUNTANT_CLOSED_PERIOD';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2672200-0000-4000-8000-000000000001',true);
do $$
declare w uuid:=current_setting('finance.test.workspace')::uuid;r jsonb;approved jsonb:=current_setting('finance.test.approved')::jsonb;
begin
 r:=public.aqari_financial_register(w,'cancel',jsonb_build_object('id',approved->>'id','revision',(approved->>'revision')::bigint,'reason','إلغاء اصطناعي موثق للاختبار'));
 if r->>'state'<>'cancelled' or r->>'cancelled_by_name'<>'مدير اختبار مالي' or length(coalesce(r->>'cancel_reason',''))<3 then raise exception 'CANCEL_PROOF_MISSING';end if;
 if (public.aqari_financial_register(w,'list','{"month":"2026-05"}')#>>'{summary,approved_expenses}')::numeric<>0 then raise exception 'CANCEL_SUMMARY_NOT_REVERSED';end if;
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"إقفال اختبار مالي متراجع عنه"}');
 begin perform public.aqari_financial_register(w,'save',jsonb_build_object('id','f2672200-0000-4000-8000-000000000012','revision',0,'property_id',current_setting('finance.test.property')::uuid,'expense_date','2026-05-13','category','اختبار','payee','اختبار','amount','1','method','cash','reference','','description','','document_id',null));raise exception 'CLOSED_PERIOD_WRITE_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise;end if;end;
 if not exists(select 1 from jsonb_array_elements(public.aqari_financial_register(w,'list','{"month":"2026-05"}')->'history')x where x->>'action'='period_closed' and x->>'actor_name'='مدير اختبار مالي') then raise exception 'PERIOD_CLOSE_AUDIT_MISSING';end if;
end $$;
rollback;
select 'PASS: financial register draft/readback/document approval, accountant property scope, audited cancellation and period close all preserve AAL2 enforcement; fixtures rolled back.' as result;
