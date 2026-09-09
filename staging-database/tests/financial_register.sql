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
 r:=public.aqari_financial_register(w,'list','{"month":"2026-05"}');
 if public.aqari_workspace_access(w)#>>'{features,staff_access}' is distinct from 'false' then raise exception 'ACCOUNTANT_STAFF_TOOL_EXPOSED';end if;
 if jsonb_array_length(r->'properties')<>1 or r#>>'{properties,0,id}'<>prop::text then raise exception 'FINANCE_PROPERTY_LIST_LEAK';end if;
 begin perform public.aqari_financial_register(w,'approve','{"id":"f2672200-0000-4000-8000-000000000010","revision":3,"reason":"غير مخول"}');raise exception 'ACCOUNTANT_APPROVED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_financial_register(w,'cancel','{"id":"f2672200-0000-4000-8000-000000000010","revision":3,"reason":"غير مخول"}');raise exception 'ACCOUNTANT_CANCELLED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"غير مخول"}');raise exception 'ACCOUNTANT_CLOSED';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.aqari_financial_expenses;raise exception 'PRIVATE_TABLE_ACCESS';exception when insufficient_privilege then null;end;
 r:=public.aqari_financial_register(w,'save',jsonb_build_object('id','f2672200-0000-4000-8000-000000000020','revision',0,'property_id',prop,'expense_date','2026-06-10','category','خدمات','payee','اختبار محاسب','amount','9.001','method','cash','reference','','description','','document_id',null));
 if r->>'state'<>'draft' then raise exception 'ACCOUNTANT_DRAFT_DENIED';end if;
 begin perform public.aqari_financial_register(w,'save',jsonb_build_object('id','f2672200-0000-4000-8000-000000000021','revision',0,'property_id',current_setting('finance.test.other'),'expense_date','2026-06-10','category','خدمات','payee','غير مخول','amount','9','method','cash'));raise exception 'OUTSIDE_PROPERTY_WRITE';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2672200-0000-4000-8000-000000000001',true);
-- Even a future privileged caller cannot smuggle changed content through cancellation.
reset role;
do $$
begin
 begin update private.aqari_financial_expenses set state='cancelled',amount=99,cancelled_by=auth.uid(),cancelled_by_name='test',cancelled_at=now(),cancel_reason='اختبار تغيير مبلغ' where id='f2672200-0000-4000-8000-000000000010';raise exception 'CANCEL_CHANGED_APPROVED_AMOUNT';
 exception when raise_exception then if sqlerrm<>'المصروف المعتمد ثابت؛ التصحيح بإلغاء موثق ثم سجل جديد.' then raise;end if;end;
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('finance.test.workspace')::uuid;prop uuid:=current_setting('finance.test.property')::uuid;r jsonb;e jsonb;
begin
 r:=public.aqari_financial_register(w,'cancel','{"id":"f2672200-0000-4000-8000-000000000010","revision":3,"reason":"إلغاء اختبار موثق"}');
 if r->>'state'<>'cancelled' or r->>'amount' is distinct from current_setting('finance.test.approved')::jsonb->>'amount' or r->>'voucher_no' is distinct from current_setting('finance.test.approved')::jsonb->>'voucher_no' or r->>'cancelled_by_name'<>'مدير اختبار مالي' then raise exception 'CANCEL_LOST_ORIGINAL';end if;
 if (public.aqari_financial_register(w,'list','{"month":"2026-05"}')#>>'{summary,approved_expenses}')::numeric<>0 then raise exception 'CANCEL_NOT_EXCLUDED';end if;
 if jsonb_array_length(public.aqari_financial_register(w,'list','{"month":"2026-05"}')->'history')<>4 then raise exception 'EXPENSE_AUDIT_MISSING';end if;
 r:=public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"إقفال الاختبار الشهري"}');
 if r#>>'{period,month}'<>'2026-05-01' or r#>>'{period,closed_by_name}'<>'مدير اختبار مالي' or r#>>'{period,snapshot,legacy_finance_reconciled}'<>'false' then raise exception 'CLOSURE_PROOF_WRONG';end if;
 if public.aqari_financial_register(w,'close_period','{"month":"2026-05","reason":"تكرار اختبار الإقفال"}')#>>'{period,closed_at}' is distinct from r#>>'{period,closed_at}' then raise exception 'DUPLICATE_CLOSE_CHANGED_ORIGINAL';end if;
 e:=jsonb_build_object('id','f2672200-0000-4000-8000-000000000030','revision',0,'property_id',prop,'expense_date','2026-05-15','category','صيانة','payee','اختبار مقفل','amount','1','method','cash');
 begin perform public.aqari_financial_register(w,'save',e);raise exception 'CLOSED_NEW_EXPENSE';exception when raise_exception then if sqlerrm<>'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise;end if;end;
 begin perform public.aqari_financial_register(w,'save',e||'{"id":"f2672200-0000-4000-8000-000000000020","revision":1}');raise exception 'OPEN_TO_CLOSED_MOVE';exception when raise_exception then if sqlerrm<>'الفترة المالية مقفلة؛ لا يمكن تسجيل أو تغيير عملية فيها.' then raise;end if;end;
 e:=public.aqari_read_state_v267(w);
 begin perform public.aqari_save_state_v267(w,jsonb_set(e->'payload','{expenses}',jsonb_build_array(jsonb_build_array('اختبار مالي أ','صيانة',99,'test'))),(e->>'revision')::bigint);raise exception 'LEGACY_EXPENSE_BYPASS';exception when raise_exception then if sqlerrm<>'استخدم سجل المصروفات المعتمدة؛ محفوظات المصروفات السابقة لا تُعدّل.' then raise;end if;end;
 begin perform public.aqari_save_state_v267(w,(e->'payload')||'{"journalEntries":[{"amount":1}]}',(e->>'revision')::bigint);raise exception 'CLOSED_LEGACY_LEDGER_BYPASS';exception when raise_exception then if sqlerrm<>'توجد فترة مقفلة؛ لا يمكن تغيير دفتر قديم غير مرتبط بتاريخ قيد معتمد.' then raise;end if;end;
 -- A save with no financial change still succeeds after closure.
 perform public.aqari_save_state_v267(w,e->'payload',(e->>'revision')::bigint);
end $$;
select set_config('request.jwt.claim.sub','f2672200-0000-4000-8000-000000000002',true);
do $$ declare r jsonb;begin
 r:=public.aqari_financial_register(current_setting('finance.test.workspace')::uuid,'list','{"month":"2026-05"}');
 if r->'period' ? 'snapshot' or r->'period' ? 'reason' then raise exception 'CLOSURE_GLOBAL_DATA_LEAK';end if;
end $$;
reset role;
rollback;
select 'PASS: persisted exact KWD expenses, readback and revisions, document/property guards, manager approval and immutable original cancellation, audit attribution, accountant isolation, private-table denial, closed-period and legacy-state protection, idempotent close; all fixtures rolled back' result;
