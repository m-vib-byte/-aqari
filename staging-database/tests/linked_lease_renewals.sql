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
  'freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,'clauses',r->'clauses','contractTemplate',r,
  'rentEntitlement',jsonb_build_object('version',1,'startDate',current_date::text,'firstPeriodPolicy','full_month','manualFirstPeriodAmount',null));
 d:=s->'payload';d:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c,
  c||jsonb_build_object('id','renew-original','contract_no','RENEW-ORIGINAL','unit','RENEW-1'),
  c||jsonb_build_object('id','prior-unlinked-draft','contract_no','PRIOR-UNLINKED','start_date',(original_end+1)::text,'end_date',(original_end+31)::text,'rentEntitlement',jsonb_build_object('version',1,'startDate',(original_end+1)::text,'firstPeriodPolicy','full_month','manualFirstPeriodAmount',null))));
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76840000-0000-4000-8000-000000000003','operational_role','property_manager','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','إسناد اصطناعي لاختبار دورة التجديد'));
 ctx:=public.aqari_lease_renewal_context(w,'freeze-original');
 if ctx->>'can_prepare'<>'false' then raise exception 'DRAFT_SOURCE_ACCEPTED';end if;
 begin perform public.aqari_lease_renewal_context('70000000-0000-4000-8000-000000000001','freeze-original');raise exception 'CROSS_WORKSPACE_CONTEXT';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_lease_renewals;raise exception 'PRIVATE_LINK_READ_ALLOWED';exception when insufficient_privilege then null;end;
 -- Full linked path on another unit: original draft -> approved, successor draft -> ready -> approved.
 d:=s->'payload';d:=jsonb_set(d,'{contractsV202,1}',(d#>'{contractsV202,1}')||'{"status":"approved","changeReason":"اعتماد أصل التجديد للاختبار"}');
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);source_before:=s#>'{payload,contractsV202,1}';rent_before:=s#>'{payload,rentLedgerV202}';deposits_before:=s#>'{payload,rentReceiptsV267}';
 ctx:=public.aqari_lease_renewal_context(w,'renew-original');binding:=ctx->'source';
 if ctx->>'can_prepare'<>'true' or ctx->>'suggestedStart'<>(original_end+1)::text or length(binding->>'snapshot_sha256')<>64 then raise exception 'APPROVED_SOURCE_CONTEXT';end if;
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000003',true);
 if (public.aqari_lease_renewal_context(w,'renew-original'))->>'can_prepare'<>'true' then raise exception 'SCOPED_STAFF_RENEWAL_CONTEXT';end if;
 c:=c||jsonb_build_object('id','linked-renewal','contract_no','RENEW-SUCCESSOR','unit','RENEW-1','start_date',(original_end+1)::text,'end_date',(original_end+31)::text,'contractRent',120,'discount',0,'rent',120,'deposit',0,'advance',0,'cleaningFee',0,'renewalSource',binding,'rentEntitlement',jsonb_build_object('version',1,'startDate',(original_end+1)::text,'firstPeriodPolicy','full_month','manualFirstPeriodAmount',null));
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||jsonb_build_object('start_date',original_end::text)));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'RENEWAL_OVERLAP';exception when exclusion_violation then null;when raise_exception then if sqlerrm<>'بداية التجديد يجب أن تكون بعد نهاية العقد السابق دون تداخل.' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||'{"contract_no":"RENEW-ORIGINAL"}'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'REUSED_CONTRACT_NUMBER';exception when unique_violation then null;when raise_exception then if sqlerrm='REUSED_CONTRACT_NUMBER' then raise;end if;end;
 -- Final-state verification rejects successor-first payloads whose source changes later in the same projection.
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000002',true);
 candidate:=jsonb_set(d,'{contractsV202}',jsonb_build_array(c)||jsonb_set(d->'contractsV202','{1}',(d#>'{contractsV202,1}')||'{"evictionNotice":"تم التبليغ","changeReason":"تغيير مصدر بعد إسقاط الخلف في نفس الطلب"}'));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'SUCCESSOR_FIRST_STALE_SOURCE';exception when raise_exception then if sqlerrm<>'تغير أصل التجديد داخل عملية الحفظ. راجع الأصل والخلف واحفظهما من بيانات متوافقة.' then raise;end if;end;
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000003',true);
 s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);d:=s->'payload';
 if s#>'{payload,contractsV202,1}'<>source_before or s#>'{payload,rentLedgerV202}' is distinct from rent_before or s#>'{payload,rentReceiptsV267}' is distinct from deposits_before then raise exception 'RENEWAL_MOVED_ORIGINAL_FINANCE';end if;
 if (public.aqari_lease_renewal_context(w,'renew-original'))->>'can_prepare'<>'false' then raise exception 'SECOND_RENEWAL_CONTEXT_ALLOWED';end if;
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c||jsonb_build_object('id','duplicate-renewal','contract_no','DUPLICATE-RENEWAL','start_date',(original_end+32)::text,'end_date',(original_end+62)::text,'rentEntitlement',jsonb_build_object('version',1,'startDate',(original_end+32)::text,'firstPeriodPolicy','full_month','manualFirstPeriodAmount',null))));
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'SECOND_RENEWAL_SAVE_ALLOWED';exception when raise_exception then if sqlerrm<>'يوجد عقد تجديد غير ملغى مرتبط بهذا الأصل.' then raise;end if;end;

 candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')-'renewalSource'||'{"changeReason":"محاولة إزالة رابط الأصل"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'LINK_REMOVAL';exception when raise_exception then if sqlerrm<>'هوية عقد التجديد ورابطه بالأصل ثابتان.' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"status":"approved","changeReason":"محاولة اعتماد موظف"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'STAFF_APPROVED_RENEWAL';exception when insufficient_privilege then null;end;
 -- New source freeze after draft creation blocks progression, while a no-op remains safe.
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000002',true);
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref='renew-original';
 q:=public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id','76840000-0000-4000-8000-000000000120','lease_id',lid,'kind','postdated','cheque_no','SOURCE-FREEZE','bank_name','بنك اصطناعي','amount',15,'due_on',current_date::text));
 foreach entry in array array['{"state":"deposited"}'::jsonb,'{"state":"returned"}'::jsonb] loop
  event:=event+1;q:=public.aqari_operations_register(w,'cheques','transition',entry||jsonb_build_object('id',q->>'id','revision',(q->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'bank_reference','BANK-SYNTHETIC','reason','تجميد بعد إنشاء مسودة الخلف'));
 end loop;
 s:=public.aqari_read_state_v267(w);d:=s->'payload';s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"status":"ready","changeReason":"متابعة خلف أثناء التجميد"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'FROZEN_SUCCESSOR_PROGRESS';exception when check_violation then if sqlerrm<>frozen_message then raise;end if;end;
 -- Different unit is not subject to this source freeze.
 candidate:=jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array((c-'renewalSource')||'{"id":"unrelated-unit","contract_no":"UNRELATED-UNIT","unit":"RENEW-2"}'));
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 event:=event+1;q:=public.aqari_operations_register(w,'cheques','transition',jsonb_build_object('id',q->>'id','revision',(q->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'state','settled','reason','تسوية تجميد أصل الخلف'));
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000003',true);
 s:=public.aqari_read_state_v267(w);d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"status":"ready","changeReason":"جاهز لاعتماد شروط جديدة"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000002',true);
 s:=public.aqari_read_state_v267(w);d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"status":"approved","changeReason":"اعتماد شروط الخلف المستقلة"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 if s#>>'{payload,contractsV202,3,status}'<>'approved' or s#>'{payload,contractsV202,1}'<>source_before then raise exception 'FULL_RENEWAL_APPROVAL_WITHOUT_VACATING';end if;
 -- Create a new cycle on the just-approved successor, then stale its source snapshot.
 ctx:=public.aqari_lease_renewal_context(w,'linked-renewal');binding:=ctx->'source';
 c:=c||jsonb_build_object('id','stale-renewal','contract_no','STALE-RENEWAL','renewalSource',binding,'start_date',(original_end+32)::text,'end_date',(original_end+62)::text,'rentEntitlement',jsonb_build_object('version',1,'startDate',(original_end+32)::text,'firstPeriodPolicy','full_month','manualFirstPeriodAmount',null));
 d:=s->'payload';s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);d:=s->'payload';
 d:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"evictionNotice":"تم التبليغ","changeReason":"تحديث إشعار موثق يغير نسخة الأصل"}');
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,5}',(d#>'{contractsV202,5}')||'{"status":"ready","changeReason":"محاولة متابعة نسخة قديمة"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'STALE_SOURCE_ACCEPTED';exception when raise_exception then if sqlerrm<>'تغيرت بيانات العقد السابق. راجعها وأنشئ مسودة تجديد من النسخة الحالية.' then raise;end if;end;
 candidate:=jsonb_set(d,'{contractsV202,5}',(d#>'{contractsV202,5}')||'{"status":"cancelled","changeReason":"إلغاء مسودة بسبب تغير مصدرها"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,5}',(d#>'{contractsV202,5}')||'{"status":"draft","changeReason":"محاولة إعادة تجديد ملغى"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'CANCELLED_RENEWAL_REACTIVATED';exception when raise_exception then if sqlerrm<>'التجديد الملغى محفوظ للتدقيق؛ أنشئ عقد تجديد جديدًا من الأصل.' then raise;end if;end;
 ctx:=public.aqari_lease_renewal_context(w,'linked-renewal');
 if ctx->>'can_prepare'<>'true' or ctx->'source'=binding then raise exception 'STALE_CANCELLATION_RECOVERY_BLOCKED';end if;
 d:=s->'payload';c:=c||jsonb_build_object('id','fresh-renewal','contract_no','FRESH-RENEWAL','renewalSource',ctx->'source');
 s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);
 -- An approved/signing but unsigned successor can be cancelled only by GM/AAL2 with no commitment.
 d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,6}',(d#>'{contractsV202,6}')||'{"status":"approved","changeReason":"اعتماد خلف لاختبار استرجاع التعارض"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,6}',(d#>'{contractsV202,6}')||'{"status":"signing","changeReason":"تجهيز توقيع دون توقيع محفوظ"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,3}',(d#>'{contractsV202,3}')||'{"evictionNotice":"غير محدد","changeReason":"تحديث جديد على مصدر خلف معتمد"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,6}',(d#>'{contractsV202,6}')||'{"status":"cancelled","changeReason":"إلغاء خلف غير موقع تغير مصدره"}');
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000003',true);
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'STAFF_CANCELLED_APPROVED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','76840000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'AAL1_CANCELLED_APPROVED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 select id into nextid from public.aqari_leases where workspace_id=w and external_ref='fresh-renewal';
 begin perform public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id','76840000-0000-4000-8000-000000000122','lease_id',nextid,'kind','guarantee','cheque_no','CANCELLED-NEW-DEBT','bank_name','بنك اصطناعي','amount',5,'due_on',current_date::text));raise exception 'CANCELLED_RENEWAL_NEW_COMMITMENT';exception when raise_exception then if sqlerrm<>'التجديد ملغى؛ لا يمكن إنشاء التزام أو توقيع جديد عليه.' then raise;end if;end;
 ctx:=public.aqari_lease_renewal_context(w,'linked-renewal');
 if ctx->>'can_prepare'<>'true' then raise exception 'SIGNING_STALE_CANCEL_RECOVERY';end if;
 d:=s->'payload';c:=c||jsonb_build_object('id','committed-renewal','contract_no','COMMITTED-RENEWAL','renewalSource',ctx->'source');
 s:=public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',(d->'contractsV202')||jsonb_build_array(c)),(s->>'revision')::bigint);d:=s->'payload';
 candidate:=jsonb_set(d,'{contractsV202,7}',(d#>'{contractsV202,7}')||'{"status":"approved","changeReason":"اعتماد خلف لاختبار التزام مستقل"}');
 s:=public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);
 select id into nextid from public.aqari_leases where workspace_id=w and external_ref='committed-renewal';
 other:=public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id','76840000-0000-4000-8000-000000000123','lease_id',nextid,'kind','guarantee','cheque_no','COMMITTED-SUCCESSOR','bank_name','بنك اصطناعي','amount',5,'due_on',current_date::text));
 s:=public.aqari_read_state_v267(w);d:=s->'payload';candidate:=jsonb_set(d,'{contractsV202,7}',(d#>'{contractsV202,7}')||'{"status":"cancelled","changeReason":"محاولة إلغاء خلف عليه التزام"}');
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'COMMITTED_RENEWAL_CANCELLED';exception when raise_exception then if sqlerrm<>'يوجد توقيع أو سجل مالي على التجديد؛ استخدم مسار الإنهاء والتسوية مع حفظ الالتزامات.' then raise;end if;end;
 event:=event+1;other:=public.aqari_operations_register(w,'cheques','transition',jsonb_build_object('id',other->>'id','revision',(other->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'state','cancelled','reason','إلغاء شيك لا يمحو تاريخه'));
 s:=public.aqari_read_state_v267(w);
 begin perform public.aqari_save_state_v267(w,candidate,(s->>'revision')::bigint);raise exception 'CANCELLED_FINANCE_ERASED_HISTORY';exception when raise_exception then if sqlerrm<>'يوجد توقيع أو سجل مالي على التجديد؛ استخدم مسار الإنهاء والتسوية مع حفظ الالتزامات.' then raise;end if;end;
 -- A returned -> cancelled cheque retains the freeze: no inferred administrative unlock.
 q:=public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id','76840000-0000-4000-8000-000000000121','lease_id',lid,'kind','postdated','cheque_no','CANCEL-FROZEN','bank_name','بنك اصطناعي','amount',5,'due_on',current_date::text));
 foreach entry in array array['{"state":"deposited"}'::jsonb,'{"state":"returned"}'::jsonb,'{"state":"cancelled"}'::jsonb] loop
  event:=event+1;q:=public.aqari_operations_register(w,'cheques','transition',entry||jsonb_build_object('id',q->>'id','revision',(q->>'revision')::integer,'event_id',('76840000-0000-4000-8000-'||lpad(event::text,12,'0'))::uuid,'bank_reference','BANK-SYNTHETIC','reason','إلغاء الشيك ليس رفعًا لتجميد التجديد'));
 end loop;
 if q->>'renewal_frozen'<>'true' or (public.aqari_lease_renewal_context(w,'renew-original'))->>'can_prepare'<>'false' then raise exception 'CANCELLED_CHEQUE_UNFROZE';end if;
end $$;
reset role;
do $$declare w uuid:='76840000-0000-4000-8000-000000000001';begin
 if (select count(*) from private.aqari_lease_renewals where workspace_id=w)<>4 then raise exception 'IMMUTABLE_RENEWAL_HISTORY_COUNT';end if;
 if exists(select 1 from public.aqari_leases where workspace_id=w and vacated_on is not null) then raise exception 'RENEWAL_FAKED_VACATING';end if;
 if exists(select 1 from private.aqari_deposit_entries where workspace_id=w) or exists(select 1 from public.aqari_rent_payments where workspace_id=w) then raise exception 'RENEWAL_CREATED_FINANCIAL_TRANSFER';end if;
 if (select count(*) from private.aqari_tenant_adjustments where workspace_id=w)<>2 then raise exception 'CHEQUE_DEBT_HISTORY_CHANGED';end if;
 if not exists(select 1 from private.aqari_contract_versions where workspace_id=w and contract_ref='stale-renewal' and after_snapshot->>'status'='cancelled') then raise exception 'CANCELLATION_NOT_AUDITED';end if;
 begin update private.aqari_lease_renewals set source_snapshot='{}' where workspace_id=w;raise exception 'OWNER_CHANGED_LINK';exception when raise_exception then if sqlerrm='OWNER_CHANGED_LINK' then raise;end if;end;
 begin delete from private.aqari_lease_renewals where workspace_id=w;raise exception 'OWNER_DELETED_LINK';exception when raise_exception then if sqlerrm='OWNER_DELETED_LINK' then raise;end if;end;
end $$;
select 'PASS: scoped linked draft -> ready -> GM approved without vacating; independent new amounts; stale cancel/recreate; original and audit retained.' as result;
rollback;
