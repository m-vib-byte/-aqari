-- Synthetic, local-memory-only state predating partner-shares-integrity.sql.
-- The incomplete shares are deliberate source evidence and must not be rewritten.
-- The catalog stores table ACLs only; restore the original column grants from
-- 20260907083736_v267_isolated_core.sql, not table-wide UPDATE or a test bypass.
grant select(workspace_id,payload,revision,updated_by,updated_at) on public.aqari_app_state to authenticated;
grant insert(workspace_id,payload) on public.aqari_app_state to authenticated;
grant update(payload) on public.aqari_app_state to authenticated;
grant select(workspace_id,user_id,role,is_active,created_at) on public.aqari_memberships to authenticated;
insert into public.aqari_workspaces(id,slug,name) values
 ('76530000-0000-4000-8000-000000000090','partner-shares-fixture','Synthetic ownership preservation');
insert into public.aqari_app_state(workspace_id,payload) values('76530000-0000-4000-8000-000000000090','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('shares-manager@example.invalid','مدير اختبار الحصص','general_manager','partner-shares-fixture'),
 ('shares-accountant@example.invalid','محاسب اختبار الحصص','accountant','partner-shares-fixture'),
 ('shares-viewer@example.invalid','مشاهد اختبار الحصص','viewer','partner-shares-fixture'),
 ('shares-property-manager@example.invalid','مدير عقار اختبار الحصص','property_manager','partner-shares-fixture');
insert into auth.users(id,email,email_confirmed_at) values
 ('76530000-0000-4000-8000-000000000001','shares-manager@example.invalid',now()),
 ('76530000-0000-4000-8000-000000000002','shares-accountant@example.invalid',now()),
 ('76530000-0000-4000-8000-000000000003','shares-viewer@example.invalid',now()),
 ('76530000-0000-4000-8000-000000000004','shares-property-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','76530000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claims','{"aal":"aal2"}',false);
set role authenticated;
update public.aqari_app_state set payload=jsonb_build_object('properties','[]'::jsonb,'propertySharesV267',jsonb_build_object(
 'legacy-incomplete',jsonb_build_object('version',1,'enabled',true,
  'owners','[{"id":"legacy-owner","name":"مالك أصلي","role":"وارث","bps":4000}]'::jsonb,
  'events','[{"id":"legacy-event","type":"owners","actor":"76530000-0000-4000-8000-000000000001","at":"2024-01-01T00:00:00Z","before":[],"after":[{"id":"legacy-owner","name":"مالك أصلي","role":"وارث","bps":4000}]}]'::jsonb),
 'legacy-opaque','{"source":"old incomplete import; retain unchanged"}'::jsonb))
where workspace_id='76530000-0000-4000-8000-000000000090';
select set_config('shares.original',(select payload::text from public.aqari_app_state where workspace_id='76530000-0000-4000-8000-000000000090'),false);
select set_config('shares.original_revision',(select revision::text from public.aqari_app_state where workspace_id='76530000-0000-4000-8000-000000000090'),false);
reset role;
insert into public.aqari_workspaces(id,slug,name) values('76530000-0000-4000-8000-000000000091','partner-shares-empty-fixture','Synthetic workspace without ownership');
insert into public.aqari_memberships(workspace_id,user_id,role,is_active) values
 ('76530000-0000-4000-8000-000000000091','76530000-0000-4000-8000-000000000001','general_manager',true);
insert into public.aqari_app_state(workspace_id,payload) values('76530000-0000-4000-8000-000000000091','{}');
