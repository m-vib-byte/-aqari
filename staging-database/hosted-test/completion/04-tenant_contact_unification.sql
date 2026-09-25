-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/tenant_contact_unification.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000004 / hosted-completion-tenant-contact-unification
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic SQL acceptance only. No external send and every fixture rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000004',true);

insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000004','hosted-completion-tenant-contact-unification','مساحة اختبار التواصل المعزولة');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000004','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('contact-unified-manager@example.invalid','مدير اختبار التواصل','general_manager','hosted-completion-tenant-contact-unification'),
 ('contact-unified-accountant@example.invalid','محاسب اختبار التواصل','accountant','hosted-completion-tenant-contact-unification');
insert into auth.users(id,email) values
 ('c0710000-0000-4000-8000-000000000001','contact-unified-manager@example.invalid'),
 ('c0710000-0000-4000-8000-000000000002','contact-unified-accountant@example.invalid');
select set_config('request.jwt.claim.sub','c0710000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('contact.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 values('c0710000-0000-4000-8000-000000000010',current_setting('contact.w')::uuid,'contact-property','عقار تواصل اصطناعي','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('c0710000-0000-4000-8000-000000000011',current_setting('contact.w')::uuid,'c0710000-0000-4000-8000-000000000010','CONTACT-1'),
 ('c0710000-0000-4000-8000-000000000012',current_setting('contact.w')::uuid,'c0710000-0000-4000-8000-000000000010','CONTACT-2');
do $$declare w uuid:=current_setting('contact.w')::uuid;p jsonb:='{"id":"CONTACT-IMPORTED","nameAr":"مستأجر تواصل اصطناعي","nameEn":"Synthetic Contact Tenant","civilId":"971000000001","phone":"+96557100001","email":"contact-unified-tenant@example.invalid","nationality":"Test","preferredContact":"both","sourceValues":{"fixture":true},"sourceReference":{"page":"synthetic"}}';begin
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source)
  values('c0710000-0000-4000-8000-000000000020',w,p->>'id',p->>'nameAr',p->>'civilId',p->>'phone',p->>'email',p,'{"fixture":true}');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source)
  values('c0710000-0000-4000-8000-000000000021',w,'CONTACT-OTHER','مستأجر آخر','971000000002','+96557100002','contact-other@example.invalid','{"id":"CONTACT-OTHER"}','{"fixture":true}');
end$$;
do $$declare unit record;begin
 for unit in select * from public.aqari_units where workspace_id=current_setting('contact.w')::uuid loop
  perform public.aqari_unit_readiness_register(unit.workspace_id,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',unit.property_id,'unit_no',unit.unit_no,'expected_revision',0,'state','ready','inspected_on',current_date,'source_ref','Synthetic hosted contact readiness','reason','Unit inspected before the synthetic lease'));
 end loop;
end$$;
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source) values
 ('c0710000-0000-4000-8000-000000000030',current_setting('contact.w')::uuid,'CONTACT-LEASE','c0710000-0000-4000-8000-000000000020','c0710000-0000-4000-8000-000000000011','CONTACT-LEASE','2026-01-01','2026-12-31',100,0,'signed','{"id":"CONTACT-LEASE","sourceReference":"keep-contract-original"}','{"fixture":true}'),
 ('c0710000-0000-4000-8000-000000000031',current_setting('contact.w')::uuid,'CONTACT-OTHER-LEASE','c0710000-0000-4000-8000-000000000021','c0710000-0000-4000-8000-000000000012','CONTACT-OTHER-LEASE','2026-01-01','2026-12-31',100,0,'signed','{"id":"CONTACT-OTHER-LEASE"}','{"fixture":true}');
update public.aqari_app_state s set payload=jsonb_build_object(
 'tenantProfilesV267',(select jsonb_agg(profile order by id) from public.aqari_tenants where workspace_id=s.workspace_id),
 'contractsV202',(select jsonb_agg(snapshot order by id) from public.aqari_leases where workspace_id=s.workspace_id)) where s.workspace_id=current_setting('contact.w')::uuid and workspace_id=current_setting('hosted.test.workspace')::uuid;
insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,idempotency_key) values
 (current_setting('contact.w')::uuid,'c0710000-0000-4000-8000-000000000030','2026-08-01','payment_thanks','email','queued','CONTACT-thanks-email'),
 (current_setting('contact.w')::uuid,'c0710000-0000-4000-8000-000000000030','2026-08-01','payment_thanks','whatsapp','queued','CONTACT-thanks-whatsapp'),
 (current_setting('contact.w')::uuid,'c0710000-0000-4000-8000-000000000030','2026-07-01','payment_thanks','email','sent','CONTACT-sent-email');
set local role authenticated;
do $$declare w uuid:=current_setting('contact.w')::uuid;r jsonb;s jsonb;v bigint;begin
 perform public.aqari_prepare_rent_reminders(w,'2026-08-28',5);
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and kind='rent_reminder' and status='awaiting_configuration')<>4 then raise exception 'LEGACY_BOTH_CHANGED';end if;
 s:=public.aqari_imported_tenant_read(w,'CONTACT-IMPORTED');v:=(s->>'revision')::bigint;
 r:=public.aqari_final_gap_register(w,'preference','{"tenant_id":"c0710000-0000-4000-8000-000000000020","preferred_channel":"whatsapp"}');
 if not exists(select 1 from jsonb_array_elements(r->'preferences')x where x->>'tenant_id'='c0710000-0000-4000-8000-000000000020' and x->>'preferred_channel'='whatsapp' and x->>'consent_at' is null) then raise exception 'CANONICAL_PREFERENCE_OR_CONSENT_FAILED';end if;
 s:=public.aqari_imported_tenant_read(w,'CONTACT-IMPORTED');
 if s#>>'{profile,preferredContact}'<>'whatsapp' or (s->>'revision')::bigint<=v or s#>>'{profile,sourceReference,page}'<>'synthetic' then raise exception 'REGISTER_TO_EDITOR_READBACK_FAILED';end if;
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and channel='email' and status in ('queued','awaiting_configuration')) then raise exception 'DISALLOWED_PENDING_EMAIL_SURVIVED';end if;
 if not exists(select 1 from public.aqari_notification_outbox where idempotency_key='CONTACT-thanks-whatsapp' and status='queued') or
  not exists(select 1 from public.aqari_notification_outbox where idempotency_key='CONTACT-sent-email' and status='sent') then raise exception 'ALLOWED_OR_DELIVERED_HISTORY_CHANGED';end if;
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000031' and status='awaiting_configuration')<>2 then raise exception 'OTHER_TENANT_QUEUE_CHANGED';end if;
 begin perform public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"email"}',v,'old editor revision');raise exception 'STALE_EDITOR_ACCEPTED';exception when serialization_failure then null;end;
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"email"}',(s->>'revision')::bigint,'اختبار تغيير قناة التواصل');
 r:=public.aqari_final_gap_register(w,'list');
 if s#>>'{profile,preferredContact}'<>'email' or not exists(select 1 from jsonb_array_elements(r->'preferences')x where x->>'tenant_id'='c0710000-0000-4000-8000-000000000020' and x->>'preferred_channel'='email') then raise exception 'EDITOR_TO_REGISTER_READBACK_FAILED';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-08-30',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and channel='whatsapp' and status in ('queued','awaiting_configuration')) then raise exception 'DISALLOWED_WHATSAPP_SURVIVED';end if;
 if not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and channel='email' and kind='rent_reminder' and status='awaiting_configuration') then raise exception 'PREFERRED_EMAIL_NOT_PREPARED';end if;
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"sms"}',(s->>'revision')::bigint,'اختبار الرسائل النصية دون تبديل القناة');
 if s#>>'{profile,preferredContact}'<>'sms' then raise exception 'SMS_EDITOR_READBACK_FAILED';end if;
 perform public.aqari_prepare_rent_reminders(w,'2026-09-01',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and status in ('queued','awaiting_configuration')) then raise exception 'SMS_SILENTLY_FELL_BACK_TO_RENT_CHANNEL';end if;
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"push"}',(s->>'revision')::bigint,'اختبار إشعار التطبيق');
 if s#>>'{profile,preferredContact}'<>'push' then raise exception 'PUSH_EDITOR_READBACK_FAILED';end if;
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"phone"}',(s->>'revision')::bigint,'اتصال هاتفي يدوي');
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"none"}',(s->>'revision')::bigint,'لا رسائل آلية');
 r:=public.aqari_final_gap_register(w,'list');
 if not exists(select 1 from jsonb_array_elements(r->'preferences')x where x->>'tenant_id'='c0710000-0000-4000-8000-000000000020' and x->>'preferred_channel'='none') then raise exception 'MANUAL_OR_NONE_MEANING_LOST';end if;
 s:=public.aqari_imported_tenant_save(w,'CONTACT-IMPORTED','{"preferredContact":"both"}',(s->>'revision')::bigint,'القناتان وفق التفضيل');
 perform public.aqari_prepare_rent_reminders(w,'2026-09-03',5);
 if (select count(*) from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and kind='rent_reminder' and status='awaiting_configuration')<>2 then raise exception 'BOTH_NOT_RESTORED_FOR_NEW_WINDOW';end if;
 if (select snapshot->>'sourceReference' from public.aqari_leases where workspace_id=w and id='c0710000-0000-4000-8000-000000000030')<>'keep-contract-original' then raise exception 'HISTORICAL_CONTRACT_CHANGED';end if;
 begin perform public.aqari_final_gap_register(w,'preference','{"tenant_id":"c0710000-0000-4000-8000-000000000020","preferred_channel":"carrier-pigeon"}');raise exception 'INVALID_CONTACT_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_final_gap_register(w,'preference','{"tenant_id":"c0710000-0000-4000-8000-000000009999","preferred_channel":"email"}');raise exception 'FOREIGN_TENANT_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_record_contact_preference(w,'c0710000-0000-4000-8000-000000000020','email','financial_register');raise exception 'PRIVATE_WRITER_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_effective_contact_profile(w,'c0710000-0000-4000-8000-000000000020','{}');raise exception 'PRIVATE_READER_EXPOSED';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare w uuid:=current_setting('contact.w')::uuid;before_count bigint;begin
 select count(*) into before_count from private.aqari_contact_preference_audit where workspace_id=w and tenant_id='c0710000-0000-4000-8000-000000000020';
 if before_count<>7 then raise exception 'AUDIT_CHANGE_COUNT:%',before_count;end if;
 if not exists(select 1 from private.aqari_contact_preference_audit where source_route='financial_register' and after_snapshot->>'consent_at' is null) or
  not exists(select 1 from private.aqari_contact_preference_audit where source_route='imported_editor' and after_snapshot->>'preferred_channel'='none') then raise exception 'AUDIT_ROUTE_OR_CONSENT_FAILED';end if;
 begin delete from private.aqari_contact_preference_audit where workspace_id=w and workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'AUDIT_DELETED';exception when check_violation then null;end;
 perform private.aqari_record_contact_preference(w,'c0710000-0000-4000-8000-000000000020','both','financial_register');
 if (select count(*) from private.aqari_contact_preference_audit where workspace_id=w and tenant_id='c0710000-0000-4000-8000-000000000020')<>before_count then raise exception 'IDENTICAL_RETRY_DUPLICATED_AUDIT';end if;
 -- Simulate a stale legacy projection and missing phone. Canonical choice remains authoritative.
 perform private.aqari_record_contact_preference(w,'c0710000-0000-4000-8000-000000000020','whatsapp','financial_register');
 update public.aqari_tenants set profile=profile||'{"preferredContact":"email"}',phone=null where workspace_id=w and id='c0710000-0000-4000-8000-000000000020' and workspace_id=current_setting('hosted.test.workspace')::uuid;
 perform public.aqari_prepare_rent_reminders(w,'2026-09-05',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id='c0710000-0000-4000-8000-000000000030' and status in ('queued','awaiting_configuration')) then raise exception 'MISSING_PHONE_CREATED_MESSAGE';end if;
 if private.aqari_preferred_delivery_channel(private.aqari_effective_contact_profile(w,'c0710000-0000-4000-8000-000000000020','{"preferredContact":"email"}'),'email@example.invalid',null) is not null then raise exception 'THANKS_FELL_BACK_TO_EMAIL';end if;
 -- A legacy timestamp cannot be reused as consent for a newly selected channel.
 update private.aqari_tenant_preferences set consent_at='2026-01-01T00:00:00Z' where workspace_id=w and tenant_id='c0710000-0000-4000-8000-000000000020' and workspace_id=current_setting('hosted.test.workspace')::uuid;
 perform private.aqari_record_contact_preference(w,'c0710000-0000-4000-8000-000000000020','none','financial_register');
 if exists(select 1 from private.aqari_tenant_preferences where workspace_id=w and tenant_id='c0710000-0000-4000-8000-000000000020' and consent_at is not null) or
  not exists(select 1 from private.aqari_contact_preference_audit where workspace_id=w and tenant_id='c0710000-0000-4000-8000-000000000020' and (before_snapshot#>>'{recorded_preference,consent_at}')::timestamptz='2026-01-01T00:00:00Z'::timestamptz and after_snapshot->>'preferred_channel'='none') then raise exception 'LEGACY_CONSENT_REUSED_OR_LOST';end if;
end$$;
select set_config('request.jwt.claim.sub','c0710000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_final_gap_register(current_setting('contact.w')::uuid,'preference','{"tenant_id":"c0710000-0000-4000-8000-000000000020","preferred_channel":"email"}');raise exception 'ACCOUNTANT_PREFERENCE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform count(*) from private.aqari_contact_preference_audit;raise exception 'AUDIT_DIRECT_READ_ALLOWED';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: unified register/editor/readback, seven preference meanings, pending cancellation, sent-history retention, other-tenant isolation, canonical precedence, missing contact, immutable audit, no fabricated consent, stale revision and permission rejection; synthetic data rolled back';
