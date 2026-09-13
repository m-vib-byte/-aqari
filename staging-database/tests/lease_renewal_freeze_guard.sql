-- Pre-entitlement historical-shape acceptance: apply after renewal guards BEFORE rent-entitlement-start.sql.
-- Synthetic identities only, existing public RPCs, no DDL/grants; complete rollback.
-- This is permission/transaction acceptance, not real authentication or two-session concurrency.
begin;
insert into public.aqari_workspaces(id,slug,name) values('76840000-0000-4000-8000-000000000001','aqari-renewal-acceptance','Synthetic renewal acceptance');
insert into public.aqari_app_state(workspace_id,payload) values('76840000-0000-4000-8000-000000000001','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('renewal-manager@example.invalid','مدير تجديد اصطناعي','general_manager','aqari-renewal-acceptance'),
 ('renewal-staff@example.invalid','موظف تجديد اصطناعي','property_manager','aqari-renewal-acceptance');
insert into auth.users(id,email,email_confirmed_at) values
 ('76840000-0000-4000-8000-000000000002','renewal-manager@example.invalid',now()),
 ('76840000-0000-4000-8000-000000000003','renewal-staff@example.invalid',now());
select set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='76840000-0000-4000-8000-000000000001';s jsonb;d jsonb;t jsonb;r jsonb;c jsonb;candidate jsonb;prop uuid;lid uuid;nextid uuid;ctx jsonb;binding jsonb;
 q jsonb;other jsonb;source_before jsonb;rent_before jsonb;deposits_before jsonb;original_end date:=current_date+30; i integer;event integer:=200;entry jsonb;
 frozen_message text:='لا يمكن تمديد العقد أو تفعيل عقد لاحق؛ تجميد التجديد ما زال قائمًا في سجل الشيكات.';
begin
 r:=(public.aqari_rental_templates(w,'publish',jsonb_build_object('id','76840000-0000-4000-8000-000000000010','kind','apartment','title','قالب اختبار تجديد',
  'clauses',jsonb_build_array(jsonb_build_object('title','اختبار فقط','text','نص اصطناعي لا يستخدم في عقد فعلي.')),'expected_version',0,'source_draft_id',null,'reason','اعتماد اصطناعي للتحقق من التجديد','approved',true)))->'record';
 t:='{"id":"renewal-tenant","nameAr":"مستأجر تجديد اصطناعي","nameEn":"Synthetic Renewal Tenant","civilId":"768400000001","passportNo":"RENEWAL-TEST","email":"renewal-tenant@example.invalid","phone":"76840001","nationality":"اختبار","attachments":[]}'::jsonb;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=jsonb_set(d,'{properties}',jsonb_build_array(jsonb_build_array('عقار اختبار التجديد')));
 d:=jsonb_set(d,'{tenantProfilesV267}',jsonb_build_array(t));
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 select id into strict prop from public.aqari_properties where workspace_id=w and name='عقار اختبار التجديد';
 for i in 0..2 loop
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',('76840000-0000-4000-8000-'||lpad((100+i)::text,12,'0'))::uuid,'property_id',prop,'unit_no','RENEW-'||i,'expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','فحص اصطناعي لوحدة التجديد','reason','اجتازت الوحدة فحص الاختبار'));
 end loop;
 c:=jsonb_build_object('id','freeze-original','contract_no','FREEZE-ORIGINAL','source','v267-cloud','detailsVersion',2,'rentalTermsVersion',1,
  'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار اختبار التجديد','unit','RENEW-0','floor','الأول',
  'start_date',current_date::text,'end_date',original_end::text,'writtenOn',(now() at time zone 'Asia/Kuwait')::date::text,
  'status','draft','contractRent',100,'rent',90,'discount',10,'deposit',50,'advance',5,'cleaningFee',2,
  'accountant','محاسب اختبار','contractReceived','لم يستلم','receivedAt','','depositReceivedOn','','evictionNotice','لم يُبلّغ',
  'freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,'clauses',r->'clauses','contractTemplate',r);
 d:=s->'payload';d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c,
  c||jsonb_build_object('id','renew-original','contract_no','RENEW-ORIGINAL','unit','RENEW-1'),
  c||jsonb_build_object('id','prior-unlinked-draft','contract_no','PRIOR-UNLINKED','start_date',(original_end+1)::text,'end_date',(original_end+31)::text)));
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76840000-0000-4000-8000-000000000003','operational_role','property_manager','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','إسناد اصطناعي لاختبار دورة التجديد'));
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref='freeze-original';
 -- Two independently frozen cheques. Status text never replaces the durable flag.
 for i in 0..1 loop
  q:=public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id',('76840000-0000-4000-8000-'||lpad((110+i)::text,12,'0'))::uuid,'lease_id',lid,'kind','postdated','cheque_no','FREEZE-'||i,'bank_name','بنك اصطناعي','amount',10,'due_on',current_date::text));
  foreach entry in array array['{"state":"deposited"}'::jsonb,'{"state":"returned"}'::jsonb] loop
   event:=event+1;q:=public.aqari_operations_register(w,'cheques','transition',entry||jsonb_build_object('id',q->>'id','revision',(q->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'bank_reference','BANK-SYNTHETIC','reason','انتقال اصطناعي لاختبار التجميد'));
  end loop;
  if q->>'renewal_frozen'<>'true' then raise exception 'RETURN_DID_NOT_FREEZE';end if;
  if i=0 then other:=q;end if;
 end loop;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||jsonb_build_object('end_date',(original_end+1)::text,'changeReason','تمديد اصطناعي مرفوض'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'FROZEN_EXTENSION_ALLOWED';exception when check_violation then if sqlerrm<>frozen_message then raise;end if;end;

 candidate:=jsonb_set(candidate,'{contractsV202,0,status}','"cancelled"');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'CANCEL_EXTENSION_BYPASS';exception when check_violation then if sqlerrm<>frozen_message then raise;end if;end;
 -- A later unlinked draft saved before the cheque return cannot progress afterward.
 candidate:=jsonb_set(d,'{contractsV202,2}',(d#>'{contractsV202,2}')||'{"status":"ready","changeReason":"محاولة تفعيل مسودة لاحقة"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'UNLINKED_PROGRESS_BYPASS';exception when check_violation then if sqlerrm<>frozen_message then raise;end if;end;
 -- A new ID/number without a renewalSource is still the same frozen tenant/unit.
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||jsonb_build_object('id','renumber-bypass','contract_no','RENUMBER-BYPASS','start_date',(original_end+32)::text,'end_date',(original_end+62)::text)));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'RENUMBER_BYPASS';exception when check_violation then if sqlerrm<>'لا يمكن إنشاء عقد جديد لنفس المستأجر والوحدة قبل معالجة تجميد التجديد القائم في سجل الشيكات.' then raise;end if;end;
 -- Unchanged projection, shortening, cancellation remain usable while frozen.
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 d:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||jsonb_build_object('end_date',(original_end-1)::text,'changeReason','تقليل مدة المسودة للاختبار'));
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 d:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||'{"status":"cancelled","changeReason":"إلغاء مسودة موثق للاختبار"}');
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 d:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||'{"status":"draft","changeReason":"إعادة مسودة للمراجعة"}');
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 -- Settling one cheque cannot unlock the other; redeposit retains its freeze.
 event:=event+1;q:=public.aqari_operations_register(w,'cheques','transition',jsonb_build_object('id',q->>'id','revision',(q->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'state','settled','reason','تسوية الشيك الثاني اصطناعيًا'));
 event:=event+1;other:=public.aqari_operations_register(w,'cheques','transition',jsonb_build_object('id',other->>'id','revision',(other->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'state','redeposited','bank_reference','BANK-REDEPOSIT','reason','إعادة إيداع لا ترفع التجميد'));
 if q->>'renewal_frozen'<>'false' or other->>'renewal_frozen'<>'true' then raise exception 'FROZEN_FLAG_STATE_CONFUSED';end if;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||jsonb_build_object('end_date',original_end::text,'changeReason','تمديد بعد تسوية شيك واحد'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'ONE_CHEQUE_UNLOCKED_ALL';exception when check_violation then if sqlerrm<>frozen_message then raise;end if;end;
 event:=event+1;other:=public.aqari_operations_register(w,'cheques','transition',jsonb_build_object('id',other->>'id','revision',(other->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'state','cleared','bank_reference','BANK-CLEARED','reason','تحصيل الشيك المتبقي اصطناعيًا'));
 if other->>'renewal_frozen'<>'false' then raise exception 'CLEAR_DID_NOT_RELEASE';end if;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,0}',(d#>'{contractsV202,0}')||jsonb_build_object('end_date',original_end::text,'changeReason','تمديد بعد رفع كل تجميد'));
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);

end $$;
reset role;
select 'PASS: historical contract durable multi-cheque freeze, new-number and preexisting draft bypass denied, noop/shortening/cancellation preserved and legitimate settlement releases freeze.' as result;
rollback;
