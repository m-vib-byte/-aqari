-- Synthetic authorization/SQL test, NOT evidence of a real browser login.
-- Only the isolated Staging project. Every fixture and settings change is rolled back.
begin;
-- Restore existing column ACLs when run with the table-only local schema catalog.
grant select(workspace_id,payload,revision,updated_by,updated_at) on public.aqari_app_state to authenticated;
grant insert(workspace_id,payload) on public.aqari_app_state to authenticated;
grant update(payload) on public.aqari_app_state to authenticated;
grant select(workspace_id,user_id,role,is_active,created_at) on public.aqari_memberships to authenticated;
grant select(id,name,slug,created_at) on public.aqari_workspaces to authenticated;
grant select(user_id,display_name,created_at,updated_at) on public.aqari_profiles to authenticated;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('controls-manager@example.invalid','اختبار صلاحيات المدير','general_manager','aqari-v267-staging'),
 ('controls-accountant@example.invalid','اختبار صلاحيات المحاسب','accountant','aqari-v267-staging');
insert into auth.users(id,email) values
 ('66666666-6666-4666-8666-666666666666','controls-manager@example.invalid'),
 ('77777777-7777-4777-8777-777777777777','controls-accountant@example.invalid');
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
set local role authenticated;
do $$ declare w uuid;v bigint;cfg jsonb;snap jsonb;begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
 cfg:='{"sections":{"maintenance":false},"permissions":{"role:accountant":{"collections":{"read":true,"write":true},"partners":{"read":false,"write":false}}},"labels":{"ar":{"home":"الرئيسية"},"en":{"home":"Home"},"hi":{"home":"होम"},"ur":{"home":"ہوم"},"ml":{"home":"ഹോം"}}}'::jsonb;
 v:=public.aqari_save_controls(w,cfg,0,'اختبار ترحيل قابل للرجوع');
 if v<>1 or (public.aqari_control_center(w)#>>'{control,revision}')<>'1' or (select count(*) from public.aqari_control_audit where workspace_id=w and action='controls.update')<>1 then raise exception 'CONTROL_READBACK_AUDIT_FAILED';end if;
 if private.aqari_can(w,'maintenance','write') then raise exception 'DISABLED_SECTION_WRITE';end if;
 begin perform public.aqari_save_controls(w,cfg,0,'اختبار تعارض');raise exception 'STALE_WRITE_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_save_controls(w,jsonb_set(cfg,'{labels,ar,home}','"<script>"'),1,'اختبار حقن');raise exception 'UNSAFE_LABEL_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_LABEL' then raise;end if;end;
 begin perform public.aqari_save_controls(w,jsonb_set(cfg,'{sections,unknown}','true'),1,'اختبار مفتاح');raise exception 'UNKNOWN_KEY_ACCEPTED';exception when raise_exception then if sqlerrm<>'INVALID_SECTION' then raise;end if;end;
 cfg:='[{"id":"controls-private-owner","name":"only manager","role":"مالك","bps":10000}]';
 update public.aqari_app_state set payload=payload||jsonb_build_object('propertySharesV267',jsonb_build_object('private',
  jsonb_build_object('version',1,'enabled',true,'owners',cfg,'events',jsonb_build_array(jsonb_build_object(
   'id','controls-private-event','type','owners','actor',auth.uid()::text,'at','2026-09-12T00:00:00Z','before','[]'::jsonb,'after',cfg))))) where workspace_id=w;
 snap:=public.aqari_startup_snapshot_v266(w,'general_manager',true);
 if snap#>>'{app_state,payload,propertySharesV267,private,owners,0,name}'<>'only manager' then raise exception 'MANAGER_STARTUP_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $$ declare w uuid;snap jsonb;r bigint;begin
 select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
 if (select count(*) from public.aqari_app_state)<>0 or (select count(*) from public.aqari_workspace_controls)<>0 or (select count(*) from public.aqari_control_audit)<>0 then raise exception 'BULK_OR_ADMIN_LEAK';end if;
 snap:=public.aqari_startup_snapshot_v266(w,'accountant',true);
 if snap#>'{app_state,payload,propertySharesV267}' is not null then raise exception 'PARTNER_PAYLOAD_LEAK';end if;
 if snap#>>'{membership,role}'<>'accountant' then raise exception 'ROLE_CHANGED';end if;
 if private.aqari_can(w,'maintenance','write') or private.aqari_can(w,'contracts','write') then raise exception 'ROLE_CEILING_BYPASS';end if;
 r:=(snap#>>'{app_state,revision}')::bigint;
 begin perform public.aqari_save_state_v267(w,'{"propertySharesV267":{}}',r);raise exception 'PARTNER_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_save_controls(w,'{}',0,'محاولة مرفوضة');raise exception 'MANAGER_BYPASS';exception when insufficient_privilege then null;end;
 snap:=public.aqari_save_state_v267(w,(snap#>'{app_state,payload}')||'{"expenses":[["اختبار",1]]}',r);
 if snap#>>'{payload,expenses,0,0}'<>'اختبار' or (public.aqari_read_state_v267(w)#>>'{payload,expenses,0,0}')<>'اختبار' then raise exception 'FILTERED_SAVE_READBACK_FAILED';end if;
 begin perform public.aqari_save_state_v267(w,'{}',r);raise exception 'STALE_PAYLOAD_ACCEPTED';exception when serialization_failure then null;end;
end $$;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
do $$ begin
 if (select count(*) from public.aqari_properties)<>0 or (select count(*) from public.aqari_control_audit)<>0 then raise exception 'OUTSIDER_LEAK';end if;
 begin perform public.aqari_workspace_access('00000000-0000-4000-8000-000000000000');raise exception 'OUTSIDER_RPC_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: control save/readback, audit, five-language labels, stale-write rejection, unsafe label/key rejection, disabled write, manager startup, accountant filtered startup/save/readback, partner privacy, role ceiling, admin RPC denial, outsider isolation. All fixtures rolled back; no browser login tested.' result;
