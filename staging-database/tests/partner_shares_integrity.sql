-- Run with fixtures/partner-shares-existing.sql before installing the guard.
-- All changes below roll back; the runner itself connects only to local memory.
begin;
select set_config('request.jwt.claim.sub','76530000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
create function pg_temp.shares_next(before_state jsonb,owners jsonb,event_id text)
returns jsonb language sql as $$
 select jsonb_build_object('version',coalesce((before_state->>'version')::bigint,0)+1,'enabled',true,'owners',owners,
  'events',coalesce(before_state->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',event_id,'type','owners',
   'actor',auth.uid()::text,'at','2026-09-12T00:00:00Z','before',coalesce(before_state->'owners','[]'::jsonb),'after',owners)))
$$;
set local role authenticated;
do $$declare w uuid:='76530000-0000-4000-8000-000000000091';r jsonb;v bigint;begin
 r:=public.aqari_read_state_v267(w);v:=(r->>'revision')::bigint;
 update public.aqari_app_state set payload='{"properties":[],"audit":[{"action":"synthetic unrelated update"}]}' where workspace_id=w and revision=v;
 r:=public.aqari_read_state_v267(w);v:=(r->>'revision')::bigint;
 if r#>>'{payload,audit,0,action}'<>'synthetic unrelated update' or r->'payload'?'propertySharesV267' then raise exception 'NONPARTNER_MANAGER_SAVE_BLOCKED';end if;
 perform public.aqari_save_state_v267(w,(r->'payload')||'{"notifications":[]}',v);
end $$;
do $$
declare w uuid:='76530000-0000-4000-8000-000000000090';before_row jsonb;after_row jsonb;d jsonb;v bigint;
 owners jsonb;bad jsonb;n jsonb;prior jsonb;i integer;amount integer;changed integer;event jsonb;
begin
 before_row:=public.aqari_read_state_v267(w);d:=before_row->'payload';v:=(before_row->>'revision')::bigint;
 if d is distinct from current_setting('shares.original')::jsonb or v<>current_setting('shares.original_revision')::bigint then
  raise exception 'INSTALL_REWROTE_LEGACY_SHARES';
 end if;
 -- Both the manager's direct table write and the explicit RPC must reject 99.99/100.01.
 foreach amount in array array[9999,10001] loop
  owners:=jsonb_build_array(jsonb_build_object('id','new-owner','name','مالك اختبار','role','مالك','bps',amount));
  bad:=jsonb_set(d,array['propertySharesV267','new-property'],pg_temp.shares_next(null,owners,'invalid-'||amount),true);
  begin
   update public.aqari_app_state set payload=bad where workspace_id=w and revision=v;
   raise exception 'INVALID_SHARES_ACCEPTED_DIRECT:%',amount;
  exception when check_violation then null;end;
  begin
   perform public.aqari_save_state_v267(w,bad,v);
   raise exception 'INVALID_SHARES_ACCEPTED_RPC:%',amount;
  exception when check_violation then null;end;
  if public.aqari_read_state_v267(w) is distinct from before_row then raise exception 'DENIED_SHARES_CHANGED_SOURCE_OR_REVISION';end if;
 end loop;
 -- Exact 80.88/16/3.12 percent survives as integer basis points with no rounding.
 owners:='[{"id":"owner-a","name":"مالك أول","role":"مالك","bps":8088},{"id":"owner-b","name":"مالك ثان","role":"وارث","bps":1600},{"id":"owner-c","name":"مالك ثالث","role":"وارث","bps":312}]';
 n:=pg_temp.shares_next(null,owners,'new-owners');
 d:=jsonb_set(d,array['propertySharesV267','new-property'],n,true);
 update public.aqari_app_state set payload=d where workspace_id=w and revision=v;
 after_row:=public.aqari_read_state_v267(w);
 if after_row#>'{payload,propertySharesV267,new-property,owners}' is distinct from owners then raise exception 'SHARE_PRECISION_LOST';end if;
 if after_row#>'{payload,propertySharesV267,legacy-incomplete}' is distinct from before_row#>'{payload,propertySharesV267,legacy-incomplete}'
  or after_row#>'{payload,propertySharesV267,legacy-opaque}' is distinct from before_row#>'{payload,propertySharesV267,legacy-opaque}' then raise exception 'LEGACY_SHARES_CHANGED';end if;
 -- Two clients read revision v; the second must lose without overwriting the first.
 update public.aqari_app_state set payload=d where workspace_id=w and revision=v;get diagnostics changed=row_count;
 if changed<>0 then raise exception 'STALE_TABLE_WRITE_ACCEPTED';end if;
 begin perform public.aqari_save_state_v267(w,d,v);raise exception 'STALE_RPC_ACCEPTED';exception when serialization_failure then null;end;
 -- The property version also rejects an unconditioned stale manager request.
 v:=(after_row->>'revision')::bigint;
 prior:=n;n:=pg_temp.shares_next(prior,'[{"id":"owner-a","name":"مالك أول","role":"مالك","bps":10000}]','revised-owners');
 d:=jsonb_set(d,array['propertySharesV267','new-property'],n);
 perform public.aqari_save_state_v267(w,d,v);
 before_row:=public.aqari_read_state_v267(w);v:=(before_row->>'revision')::bigint;
 bad:=jsonb_set(d,array['propertySharesV267','new-property'],pg_temp.shares_next(prior,owners,'stale-event'));
 begin update public.aqari_app_state set payload=bad where workspace_id=w;raise exception 'STALE_PROPERTY_VERSION_ACCEPTED';exception when serialization_failure then null;end;
 if public.aqari_read_state_v267(w) is distinct from before_row then raise exception 'STALE_SAVE_OVERWROTE_PARTNERS';end if;
 -- Deletion and historical event replacement are rejected, preserving ownership evidence.
 begin update public.aqari_app_state set payload=d-'propertySharesV267' where workspace_id=w;raise exception 'ENTIRE_SHARE_HISTORY_DELETED';exception when check_violation then null;end;
 foreach bad in array array[jsonb_set(d,'{propertySharesV267}','null'),jsonb_set(d,'{propertySharesV267}',(d->'propertySharesV267')-'new-property'),
  jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,owners,'third-event')||'{"events":[]}'::jsonb)] loop
  begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'SHARE_HISTORY_DELETED';exception when check_violation then null;end;
 end loop;
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,owners,'third-event'));
 bad:=jsonb_set(bad,'{propertySharesV267,new-property,events,0,after,0,bps}','1');
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'HISTORIC_OWNER_SHARE_CHANGED';exception when check_violation then null;end;
 -- Duplicate ids, fractional basis points, wrong identity and changed snapshots fail.
 foreach owners in array array[
  '[{"id":"same","name":"أ","role":"مالك","bps":5000},{"id":"same","name":"ب","role":"وارث","bps":5000}]'::jsonb,
  '[{"id":"a","name":"أ","role":"مالك","bps":9999.5},{"id":"b","name":"ب","role":"وارث","bps":0.5}]',
  '[{"id":"a","name":"أ","role":"مالك","bps":"10000"}]',
  '[{"id":"a","name":"أ","role":"مالك","bps":0}]',
  '[{"id":"a","name":"أ","role":"مالك","bps":-1}]'] loop
  bad:=jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,owners,'invalid-owners'));
  begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'INVALID_OWNER_FIELDS_ACCEPTED';exception when check_violation then null;end;
 end loop;
 owners:=n->'owners';
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,owners,'false-actor'));
 bad:=jsonb_set(bad,'{propertySharesV267,new-property,events,2,actor}','"76530000-0000-4000-8000-000000000002"');
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'FALSE_SHARE_ACTOR_ACCEPTED';exception when check_violation then null;end;
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,owners,'bad-before'));
 bad:=jsonb_set(bad,'{propertySharesV267,new-property,events,2,before}','[]');
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'FALSE_BEFORE_SNAPSHOT_ACCEPTED';exception when check_violation then null;end;
 -- An existing incomplete record can be disabled unchanged, then explicitly corrected.
 prior:=d#>'{propertySharesV267,legacy-incomplete}';
 event:=jsonb_build_object('id','stop-legacy','type','disable','actor',auth.uid()::text,'at','2026-09-12T00:00:00Z');
 n:=prior||jsonb_build_object('version',2,'enabled',false,'events',(prior->'events')||jsonb_build_array(event));
 d:=jsonb_set(d,'{propertySharesV267,legacy-incomplete}',n);
 perform public.aqari_save_state_v267(w,d,v);before_row:=public.aqari_read_state_v267(w);v:=(before_row->>'revision')::bigint;
 if before_row#>'{payload,propertySharesV267,legacy-incomplete,owners}' is distinct from prior->'owners' then raise exception 'DISABLE_REWROTE_INCOMPLETE_OWNERS';end if;
 bad:=jsonb_set(d,'{propertySharesV267,legacy-incomplete}',pg_temp.shares_next(n,'[{"id":"legacy-owner","name":"مالك أصلي","role":"وارث","bps":5000}]','still-incomplete'));
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'INCOMPLETE_CHANGE_ACCEPTED';exception when check_violation then null;end;
 n:=pg_temp.shares_next(n,'[{"id":"legacy-owner","name":"مالك أصلي","role":"وارث","bps":10000}]','correct-legacy');
 d:=jsonb_set(d,'{propertySharesV267,legacy-incomplete}',n);
 perform public.aqari_save_state_v267(w,d,v);before_row:=public.aqari_read_state_v267(w);
 if before_row#>>'{payload,propertySharesV267,legacy-incomplete,events,0,after,0,bps}'<>'4000'
  or before_row#>>'{payload,propertySharesV267,legacy-incomplete,events,2,before,0,bps}'<>'4000'
  or before_row#>>'{payload,propertySharesV267,legacy-incomplete,owners,0,bps}'<>'10000' then raise exception 'LEGACY_CORRECTION_LOST_SOURCE';end if;
 -- Existing distribution saves keep their ownership snapshot; this test does
 -- not claim an authoritative server validation of the financial source amounts.
 v:=(before_row->>'revision')::bigint;n:=d#>'{propertySharesV267,new-property}';
 event:=jsonb_build_object('id','existing-distribution','type','distribution','actor',auth.uid()::text,'at','2026-09-12T00:00:00Z',
  'basis','{"income":1000,"expenses":0,"due":0}'::jsonb,'rows',jsonb_build_array((n->'owners'->0)||'{"income":1000,"expenses":0,"net":1000,"receivable":0}'::jsonb));
 prior:=n||jsonb_build_object('version',(n->>'version')::integer+1,'events',(n->'events')||jsonb_build_array(event));
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',prior);
 bad:=jsonb_set(bad,'{propertySharesV267,new-property,events,2,rows,0,bps}','9999');
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'DISTRIBUTION_SHARE_TOTAL_BYPASS';exception when check_violation then null;end;
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',prior);
 bad:=jsonb_set(bad,'{propertySharesV267,new-property,events,2,rows,0,id}','"different-owner"');
 begin perform public.aqari_save_state_v267(w,bad,v);raise exception 'DISTRIBUTION_OWNER_SUBSTITUTION';exception when check_violation then null;end;
 d:=jsonb_set(d,'{propertySharesV267,new-property}',prior);
 perform public.aqari_save_state_v267(w,d,v);before_row:=public.aqari_read_state_v267(w);
 -- Both supported snapshot wrappers pass through the same trigger.
 v:=(before_row->>'revision')::bigint;n:=d#>'{propertySharesV267,new-property}';
 n:=pg_temp.shares_next(n,n->'owners','wrapped-owners');d:=jsonb_set(d,'{propertySharesV267,new-property}',n);
 update public.aqari_app_state set payload=jsonb_build_object('format','aqari-cloud-state-v1','snapshot',jsonb_build_object('values',jsonb_build_object('aqari_v30',d))) where workspace_id=w and revision=v;
 if public.aqari_read_state_v267(w)->'payload' is distinct from d then raise exception 'CLOUD_WRAPPER_SHARES_FAILED';end if;
 before_row:=public.aqari_read_state_v267(w);v:=(before_row->>'revision')::bigint;
 bad:=jsonb_set(d,'{propertySharesV267,new-property}',pg_temp.shares_next(n,'[{"id":"a","name":"أ","role":"مالك","bps":9999}]','wrapped-invalid'));
 begin update public.aqari_app_state set payload=jsonb_build_object('schema','aqari-local-snapshot-v1','values',jsonb_build_object('aqari_v30',bad)) where workspace_id=w and revision=v;
  raise exception 'LOCAL_WRAPPER_BYPASSED_SHARE_GUARD';exception when check_violation then null;end;
end $$;

-- Existing role ceilings are retained. Never report a newly invented role bypass.
do $$declare uid text;w uuid:='76530000-0000-4000-8000-000000000090';v bigint;changed integer;begin
 v:=(public.aqari_read_state_v267(w)->>'revision')::bigint;
 foreach uid in array array['76530000-0000-4000-8000-000000000002','76530000-0000-4000-8000-000000000003','76530000-0000-4000-8000-000000000004'] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  begin perform public.aqari_save_state_v267(w,'{"propertySharesV267":{}}',v);raise exception 'NONMANAGER_SHARE_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
  update public.aqari_app_state set payload='{"propertySharesV267":{}}' where workspace_id=w;
  get diagnostics changed=row_count;if changed<>0 then raise exception 'NONMANAGER_DIRECT_SHARE_WRITE_ALLOWED';end if;
 end loop;
end $$;
select set_config('request.jwt.claim.sub','76530000-0000-4000-8000-000000000001',true);
do $$begin
 begin perform public.aqari_save_state_v267('70000000-0000-4000-8000-000000000001','{"propertySharesV267":{}}',1);raise exception 'FOREIGN_WORKSPACE_SHARE_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','private.aqari_validate_partner_owners(jsonb)','execute')
  or has_function_privilege('authenticated','private.aqari_guard_partner_shares()','execute') then raise exception 'PARTNER_HELPERS_EXPOSED';end if;
end $$;
rollback;
select 'PASS: ownership total on both save paths, integer precision, stale-client conflicts, immutable history, legacy preservation/correction, wrappers, actor binding and role/workspace isolation';
