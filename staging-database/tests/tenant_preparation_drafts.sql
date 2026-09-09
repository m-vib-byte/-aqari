begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('draft-verify@example.invalid','Synthetic draft manager','general_manager','aqari-v267-staging');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('draft-accountant@example.invalid','Synthetic draft accountant','accountant','aqari-v267-staging');
insert into auth.users(id,email) values ('d7d7d7d7-2222-4222-8222-222222222222','draft-accountant@example.invalid');
insert into auth.users(id,email) values ('d7d7d7d7-1111-4111-8111-111111111111','draft-verify@example.invalid');
select set_config('request.jwt.claim.sub','d7d7d7d7-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$ declare w uuid; s jsonb; d jsonb; result jsonb; p jsonb; begin
select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
s:=public.aqari_read_state_v267(w);p:=s->'payload';
d:=case when p->>'format'='aqari-cloud-state-v1' then p#>'{snapshot,values,aqari_v30}' when p->>'schema'='aqari-local-snapshot-v1' then p#>'{values,aqari_v30}' else p end;
result:=public.aqari_save_state_v267(w,jsonb_set(d,'{tenantPreparationDraftsV267}','[{"id":"synthetic-draft","nameAr":"مسودة اختبار","phone":"55"}]'),(s->>'revision')::bigint);
p:=public.aqari_read_state_v267(w)->'payload';
p:=case when p->>'format'='aqari-cloud-state-v1' then p#>'{snapshot,values,aqari_v30}' when p->>'schema'='aqari-local-snapshot-v1' then p#>'{values,aqari_v30}' else p end;
if p#>>'{tenantPreparationDraftsV267,0,id}' is distinct from 'synthetic-draft' then raise exception 'DRAFT_READBACK_FAILED'; end if;
if p->'tenantProfilesV267' is distinct from d->'tenantProfilesV267' then raise exception 'PROFILE_CHANGED';end if;
end $$;
select set_config('request.jwt.claim.sub','d7d7d7d7-2222-4222-8222-222222222222',true);
do $$ declare w uuid; s jsonb; begin
select workspace_id into w from public.aqari_memberships where user_id=auth.uid();
s:=public.aqari_read_state_v267(w);
if (s->'payload')::text like '%synthetic-draft%' then raise exception 'DRAFT_LEAK';end if;
begin perform public.aqari_save_state_v267(w,(s->'payload')||'{"tenantPreparationDraftsV267":[]}'::jsonb,(s->>'revision')::bigint);raise exception 'DRAFT_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role; rollback;
