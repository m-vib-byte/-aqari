-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- A separate synthetic workspace, password-free identities, no external delivery.
-- Safe to run after the migration in local or verified isolated hosted PostgreSQL.
begin;
set local statement_timeout='25s';set local lock_timeout='3s';
insert into public.aqari_workspaces(id,slug,name) values('9ca10000-0000-4000-8000-000000000001','aqari-circular-acceptance','اختبار تعاميم مؤقت'),('9ca10000-0000-4000-8000-000000000002','aqari-circular-foreign','مساحة رفض مؤقتة');
insert into public.aqari_app_state(workspace_id,payload) values('9ca10000-0000-4000-8000-000000000001','{}'),('9ca10000-0000-4000-8000-000000000002','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('circular-manager@example.invalid','مدير اختبار','general_manager','aqari-circular-acceptance'),
 ('circular-staff@example.invalid','موظف مستهدف','accountant','aqari-circular-acceptance'),
 ('circular-other@example.invalid','موظف غير مستهدف','viewer','aqari-circular-acceptance'),
 ('circular-foreign@example.invalid','حساب مساحة أخرى','general_manager','aqari-circular-foreign');
insert into auth.users(id,email,email_confirmed_at) values
 ('9ca10000-0000-4000-8000-000000000011','circular-manager@example.invalid',now()),('9ca10000-0000-4000-8000-000000000012','circular-staff@example.invalid',now()),('9ca10000-0000-4000-8000-000000000013','circular-other@example.invalid',now()),('9ca10000-0000-4000-8000-000000000014','circular-foreign@example.invalid',now());
select set_config('circular.w','9ca10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000011',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:=current_setting('circular.w')::uuid;r jsonb;again jsonb;draft jsonb:='{"id":"9ca10000-0000-4000-8000-000000000021","revision":0,"title":"تعميم اختبار","body":"تعليمات محفوظة للاختبار","recipient_ids":["9ca10000-0000-4000-8000-000000000012"]}';begin
 if public.aqari_workspace_access(w)#>>'{features,staff_circulars}' is distinct from 'true' then raise exception 'CIRCULAR_FEATURE_MISSING';end if;
 if not (public.aqari_staff_circulars(w,'list')->>'manager')::boolean then raise exception 'MANAGER_DISCOVERY_FAILED';end if;
 r:=public.aqari_staff_circulars(w,'save',draft);again:=public.aqari_staff_circulars(w,'save',draft);
 if r is distinct from again or r->>'revision'<>'1' or r->>'status'<>'draft' then raise exception 'DRAFT_RETRY_FAILED';end if;
 if public.aqari_staff_circulars(w,'list')#>>'{notices,0,body}'<>'تعليمات محفوظة للاختبار' then raise exception 'DRAFT_READBACK_FAILED';end if;
 begin perform public.aqari_staff_circulars(w,'save',draft||'{"body":"تغيير بإصدار قديم"}');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_staff_circulars(w,'save',draft||'{"id":"9ca10000-0000-4000-8000-000000000022","recipient_ids":["9ca10000-0000-4000-8000-000000000014"]}');raise exception 'FOREIGN_RECIPIENT_ACCEPTED';exception when check_violation then if sqlerrm<>'INVALID_CIRCULAR_RECIPIENTS' then raise;end if;end;
 begin perform public.aqari_staff_circulars(w,'save',draft||'{"id":"9ca10000-0000-4000-8000-000000000022","recipient_ids":[]}');raise exception 'EMPTY_RECIPIENTS_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_staff_circulars(w,'save',draft||'{"id":"9ca10000-0000-4000-8000-000000000022","recipient_ids":["9ca10000-0000-4000-8000-000000000012","9ca10000-0000-4000-8000-000000000012"]}');raise exception 'DUPLICATE_RECIPIENT_ACCEPTED';exception when check_violation then null;end;
end$$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin begin perform public.aqari_staff_circulars(current_setting('circular.w')::uuid,'publish','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}');raise exception 'MFA_BYPASSED';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000012',true);
do $$declare w uuid:=current_setting('circular.w')::uuid;r jsonb;begin
 r:=public.aqari_staff_circulars(w,'list');if jsonb_array_length(r->'notices')<>0 or jsonb_array_length(r->'staff')<>0 then raise exception 'DRAFT_OR_DIRECTORY_LEAK';end if;
 begin perform public.aqari_staff_circulars(w,'publish','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}');raise exception 'STAFF_PUBLISHED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}');raise exception 'DRAFT_ACK_ACCEPTED';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000011',true);select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
do $$declare w uuid:=current_setting('circular.w')::uuid;r jsonb;begin
 r:=public.aqari_staff_circulars(w,'publish','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}');
 if r->>'revision'<>'2' or r->>'status'<>'published' or r is distinct from public.aqari_staff_circulars(w,'publish','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}') then raise exception 'PUBLISH_RETRY_FAILED';end if;
 begin perform public.aqari_staff_circulars(w,'save','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2,"title":"تغيير","body":"تغيير النص المنشور","recipient_ids":["9ca10000-0000-4000-8000-000000000012"]}');raise exception 'PUBLISHED_CHANGED';exception when check_violation then if sqlerrm<>'PUBLISHED_CIRCULAR_IMMUTABLE' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000013',true);
do $$declare w uuid:=current_setting('circular.w')::uuid;begin
 if jsonb_array_length(public.aqari_staff_circulars(w,'list')->'notices')<>0 then raise exception 'UNTARGETED_LEAK';end if;
 begin perform public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2}');raise exception 'UNTARGETED_ACK';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000014',true);
do $$begin begin perform public.aqari_staff_circulars(current_setting('circular.w')::uuid,'list');raise exception 'FOREIGN_WORKSPACE_READ';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000012',true);
do $$declare w uuid:=current_setting('circular.w')::uuid;r jsonb;a jsonb;begin
 r:=public.aqari_staff_circulars(w,'list');if jsonb_array_length(r->'notices')<>1 or r#>>'{notices,0,body}'<>'تعليمات محفوظة للاختبار' or (r#>'{notices,0}')?'recipient_ids' or (r#>>'{notices,0,acknowledged_at}') is not null then raise exception 'STAFF_READBACK_OR_PRIVACY_FAILED';end if;
 begin perform public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":1}');raise exception 'STALE_ACK';exception when serialization_failure then null;end;
 begin perform public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2,"user_id":"9ca10000-0000-4000-8000-000000000013"}');raise exception 'FORGED_ACK_ACTOR';exception when invalid_parameter_value then null;end;
 a:=public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2}');
 if a->>'acknowledged_at' is null or a is distinct from public.aqari_staff_circulars(w,'ack','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2}') or public.aqari_staff_circulars(w,'list')#>>'{notices,0,acknowledged_at}' is distinct from a->>'acknowledged_at' then raise exception 'ACK_RETRY_READBACK_FAILED';end if;
 begin perform public.aqari_staff_circulars(w,'history','{"id":"9ca10000-0000-4000-8000-000000000021"}');raise exception 'RECIPIENT_LIST_LEAK';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_staff_circulars;raise exception 'DIRECT_TABLE_READ';exception when insufficient_privilege then null;end;
end$$;
reset role;
update public.aqari_memberships set is_active=false where workspace_id=current_setting('circular.w')::uuid and user_id='9ca10000-0000-4000-8000-000000000012';
set local role authenticated;
do $$begin begin perform public.aqari_staff_circulars(current_setting('circular.w')::uuid,'list');raise exception 'REVOKED_MEMBER_READ';exception when insufficient_privilege then null;end;end$$;
reset role;
do $$begin
 begin delete from private.aqari_staff_circular_acknowledgements where circular_id='9ca10000-0000-4000-8000-000000000021';raise exception 'ACK_DELETE_ACCEPTED';exception when check_violation then null;end;
 begin update private.aqari_staff_circular_versions set actor_name='تغيير' where circular_id='9ca10000-0000-4000-8000-000000000021';raise exception 'AUDIT_UPDATE_ACCEPTED';exception when check_violation then null;end;
 begin delete from private.aqari_staff_circular_recipients where circular_id='9ca10000-0000-4000-8000-000000000021';raise exception 'RECIPIENT_DELETE_ACCEPTED';exception when check_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','9ca10000-0000-4000-8000-000000000011',true);
set local role authenticated;
do $$declare w uuid:=current_setting('circular.w')::uuid;h jsonb;r jsonb;begin
 h:=public.aqari_staff_circulars(w,'history','{"id":"9ca10000-0000-4000-8000-000000000021"}');
 if jsonb_array_length(h->'versions')<>2 or h#>>'{recipients,0,user_name}'<>'موظف مستهدف' or h#>>'{recipients,0,acknowledged_at}' is null then raise exception 'MANAGER_HISTORY_FAILED';end if;
 begin perform public.aqari_staff_circulars(w,'archive','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2,"reason":""}');raise exception 'ARCHIVE_REASON_MISSING';exception when check_violation then null;end;
 r:=public.aqari_staff_circulars(w,'archive','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2,"reason":"انتهاء تعليمات الاختبار"}');
 if r->>'status'<>'archived' or r->>'body'<>'تعليمات محفوظة للاختبار' or r is distinct from public.aqari_staff_circulars(w,'archive','{"id":"9ca10000-0000-4000-8000-000000000021","revision":2,"reason":"انتهاء تعليمات الاختبار"}') then raise exception 'ARCHIVE_RETRY_FAILED';end if;
 if public.aqari_staff_circulars(w,'list')#>>'{notices,0,ack_count}'<>'1' then raise exception 'ARCHIVED_ACK_LOST';end if;
end$$;
reset role;
set local role anon;
do $$begin begin perform public.aqari_staff_circulars(current_setting('circular.w')::uuid,'list');raise exception 'ANONYMOUS_READ';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
select 'PASS: staff circular save/publish/read/explicit acknowledgement/retry/archive; immutable history; recipient/workspace/MFA/revocation/anonymous guards; all fixtures rolled back';
