 -- Within the signed salary fixture's final DO block. Approved manual expense
 -- must block payment, and documented cancellation releases its reference.
 declare invoice record;expense jsonb;begin
 select * into invoice from public.aqari_reserve_document(w,'property_document','property','hr-test-property-a','Synthetic payment reference invoice','test.jpg','image/jpeg','{"fixture":"rollback-only"}');
 perform pg_temp.bridge_invoice_fixture(invoice.storage_path);
 perform public.aqari_finalize_document(invoice.document_id,100,'image/jpeg',repeat('a',64));
 expense:=public.aqari_financial_register(w,'save',jsonb_build_object('id','f2670000-0000-4000-8000-000000000051','revision',0,'property_id','f2670000-0000-4000-8000-000000000011','expense_date',(now() at time zone 'Asia/Kuwait')::date,'category','Synthetic reference test','payee','Synthetic employee','amount','582','method','bank','reference','TEST-REF','document_id',invoice.document_id));
 expense:=public.aqari_financial_register(w,'approve',jsonb_build_object('id',expense->>'id','revision',expense->>'revision','reason','Synthetic approved payment reference'));
 begin
 perform public.aqari_hr(w,'paid',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000021','payroll_id',current_setting('hr.test.payroll'),'revision',5));
 raise exception 'MANUAL_EXPENSE_DUPLICATED_AS_SALARY';
 exception when raise_exception then if sqlerrm<>'مرجع الصرف مستخدم في راتب مصروف أو مصروف معتمد؛ راجع الأصل لتجنب التكرار.' then raise;end if;end;
 r:=public.aqari_hr(w,'get','{"employee_id":"f2670000-0000-4000-8000-000000000021"}');
 if r#>>'{payroll,0,state}'<>'issued' or r#>>'{payroll,0,revision}'<>'5' then raise exception 'FAILED_PAYMENT_CHANGED_PAYROLL';end if;
 perform public.aqari_financial_register(w,'cancel',jsonb_build_object('id',expense->>'id','revision',expense->>'revision','reason','Synthetic cancelled manual duplicate before salary payment'));
 end;
