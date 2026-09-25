-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/vendor_optional_identity.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000009 / hosted-completion-vendor-optional-identity
-- Run this entire file as one query; never extract setup statements.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated PostgreSQL tests only; all synthetic vendors and accounts roll back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000009',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000009','hosted-completion-vendor-optional-identity','Synthetic rollback acceptance: vendor_optional_identity');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000009','{}');

insert into public.aqari_workspaces(id,slug,name)values('76920000-0000-4000-8000-000000000099','vendor-identity-other','Other vendor identity test');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values
 ('vendor-identity-manager@example.invalid','مدير اختبار المورد','general_manager','hosted-completion-vendor-optional-identity'),
 ('vendor-identity-other@example.invalid','مدير مساحة أخرى','general_manager','vendor-identity-other'),
 ('vendor-identity-accountant@example.invalid','محاسب اختبار المورد','accountant','hosted-completion-vendor-optional-identity');
insert into auth.users(id,email,email_confirmed_at)values
 ('76920000-0000-4000-8000-000000000001','vendor-identity-manager@example.invalid',now()),
 ('76920000-0000-4000-8000-000000000002','vendor-identity-other@example.invalid',now()),
 ('76920000-0000-4000-8000-000000000003','vendor-identity-accountant@example.invalid',now());
select set_config('vendor.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76920000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76920000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);

set local role authenticated;
do $$declare w uuid:=current_setting('vendor.test.workspace')::uuid;a jsonb;b jsonb;r jsonb;s jsonb;begin
 a:=public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(1))::uuid,'revision',0,'name','مورد اصطناعي '||(1),'license_no',(''),'status','active')));
 b:=public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(2))::uuid,'revision',0,'name','مورد اصطناعي '||(2),'license_no',(''),'status','active')));
 if a->>'id'=b->>'id' or a->>'civil_or_license_no'<>'' or b->>'civil_or_license_no'<>'' then raise exception 'BLANK_IDENTITIES_MERGED';end if;
 perform public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(3))::uuid,'revision',0,'name','مورد اصطناعي '||(3),'license_no',('   '),'status','active')));
 r:=public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(4))::uuid,'revision',0,'name','مورد اصطناعي '||(4),'license_no',('LIC-SYNTHETIC-001'),'status','active')));
 begin perform public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(5))::uuid,'revision',0,'name','مورد اصطناعي '||(5),'license_no',('LIC-SYNTHETIC-001'),'status','active')));raise exception 'DUPLICATE_NUMBER_ACCEPTED';exception when unique_violation then null;end;
 begin perform public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(5))::uuid,'revision',0,'name','مورد اصطناعي '||(5),'license_no',(' LIC-SYNTHETIC-001 '),'status','active')));raise exception 'WHITESPACE_DUPLICATE_ACCEPTED';exception when unique_violation then null;end;
 begin perform public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(1))::uuid,'revision',0,'name','مورد اصطناعي '||(1),'license_no',('LIC-SYNTHETIC-001'),'status','active'))||'{"revision":1}');raise exception 'UPDATE_DUPLICATE_ACCEPTED';exception when unique_violation then null;end;
 r:=public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(4))::uuid,'revision',0,'name','مورد اصطناعي '||(4),'license_no',('LIC-SYNTHETIC-001'),'status','active'))||'{"revision":1,"phone":"50000001"}');
 if r->>'id'<>'76920000-0000-4000-8000-000000000104' or r->>'civil_or_license_no'<>'LIC-SYNTHETIC-001' or r->>'revision'<>'2' then raise exception 'EXISTING_NUMBER_OR_UUID_CHANGED';end if;
 s:=public.aqari_operations_register(w,'vendors','list');
 if (select count(*) from jsonb_array_elements(s->'items')v where v->>'civil_or_license_no'='')<>3 then raise exception 'BLANK_VENDORS_NOT_READ_BACK';end if;
 if not exists(select 1 from jsonb_array_elements(s->'items')v where v->>'id'=a->>'id' and v->>'revision'='1' and v->>'civil_or_license_no'='') then raise exception 'FAILED_UPDATE_CHANGED_VENDOR';end if;
 begin perform public.aqari_operations_register('76920000-0000-4000-8000-000000000099','vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(6))::uuid,'revision',0,'name','مورد اصطناعي '||(6),'license_no',('LIC-SYNTHETIC-001'),'status','active')));raise exception 'FOREIGN_WORKSPACE_WRITE';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_vendors;raise exception 'DIRECT_VENDOR_READ';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76920000-0000-4000-8000-000000000002',true);
do $$declare w uuid:='76920000-0000-4000-8000-000000000099';r jsonb;s jsonb;begin
 r:=public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(6))::uuid,'revision',0,'name','مورد اصطناعي '||(6),'license_no',('LIC-SYNTHETIC-001'),'status','active')));
 if r->>'civil_or_license_no'<>'LIC-SYNTHETIC-001' then raise exception 'SAME_NUMBER_IN_SEPARATE_WORKSPACE_FAILED';end if;
 s:=public.aqari_operations_register(w,'vendors','list');if jsonb_array_length(s->'items')<>1 then raise exception 'FOREIGN_VENDOR_LIST_LEAK';end if;
 begin perform public.aqari_operations_register(w,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(1))::uuid,'revision',0,'name','مورد اصطناعي '||(1),'license_no',(''),'status','active')));raise exception 'UUID_REUSED_ACROSS_WORKSPACES';exception when unique_violation then null;end;
 begin perform public.aqari_operations_register(current_setting('vendor.test.workspace')::uuid,'vendors','list');raise exception 'FOREIGN_WORKSPACE_READ';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76920000-0000-4000-8000-000000000003',true);
do $$begin
 begin perform public.aqari_operations_register(current_setting('vendor.test.workspace')::uuid,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(7))::uuid,'revision',0,'name','مورد اصطناعي '||(7),'license_no',(''),'status','active')));raise exception 'ACCOUNTANT_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76920000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin
 begin perform public.aqari_operations_register(current_setting('vendor.test.workspace')::uuid,'vendors','save',(jsonb_build_object('id',('76920000-0000-4000-8000-00000000010'||(7))::uuid,'revision',0,'name','مورد اصطناعي '||(7),'license_no',(''),'status','active')));raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: multiple optional vendor identities, supplied-number uniqueness, stable UUID, workspace separation, revision and role/MFA protection';
