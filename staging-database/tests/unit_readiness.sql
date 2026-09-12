-- Local synthetic acceptance after unit-readiness-existing.sql and unit-readiness.sql.
-- The existing fixture predates the migration; no trigger or check is disabled.
begin;
do $$declare w uuid:=current_setting('aqari.test.readiness.workspace')::uuid;begin
 -- A new tenancy must fail atomically when readiness has never been recorded.
 begin
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values('76620000-0000-4000-8000-000000000402',w,'readiness-new','76620000-0000-4000-8000-000000000301','76620000-0000-4000-8000-000000000201','READINESS-NEW','2026-01-01','2026-12-31',100,50,'draft','{}');
  raise exception 'UNREVIEWED_UNIT_WAS_LEASED';
 exception when check_violation then if sqlerrm<>'UNIT_NOT_READY' then raise;end if;end;
 if exists(select 1 from public.aqari_leases where id='76620000-0000-4000-8000-000000000402') then raise exception 'PARTIAL_LEASE_REMAINS';end if;
 -- An unrelated financial save reprojects the old lease using an UPSERT.
 insert into public.aqari_leases select * from public.aqari_leases where id='76620000-0000-4000-8000-000000000401'
 on conflict(id) do update set snapshot=excluded.snapshot;
 if (select snapshot->>'source' from public.aqari_leases where id='76620000-0000-4000-8000-000000000401')<>'preserved' then raise exception 'EXISTING_LEASE_CHANGED';end if;
 begin update public.aqari_leases set end_date='2026-12-31' where id='76620000-0000-4000-8000-000000000401';raise exception 'UNREVIEWED_EXTENSION_ACCEPTED';exception when check_violation then if sqlerrm<>'UNIT_NOT_READY' then raise;end if;end;
end$$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.readiness.workspace')::uuid;d jsonb;r jsonb;begin
 d:='{"id":"76620000-0000-4000-8000-000000000501","property_id":"76620000-0000-4000-8000-000000000101","unit_no":"١٠١","expected_revision":0,"state":"ready","inspected_on":"2026-01-01","source_ref":"محضر فحص اصطناعي","reason":"اجتازت الوحدة الفحص"}';
 if public.aqari_workspace_access(w)#>'{features,unit_readiness}' is distinct from 'true'::jsonb then raise exception 'READINESS_NOT_DISCOVERED';end if;
 r:=public.aqari_unit_readiness_register(w,'record',d);
 if r->>'unit_id'<>'76620000-0000-4000-8000-000000000201' or r->>'state'<>'ready' or (r->>'revision')::integer<>1 then raise exception 'READINESS_READBACK_FAILED';end if;
 if public.aqari_unit_readiness_register(w,'record',d) is distinct from r then raise exception 'READINESS_RETRY_CHANGED';end if;
 begin perform public.aqari_unit_readiness_register(w,'record',d||'{"reason":"محتوى مختلف لنفس المعرف"}');raise exception 'CHANGED_RETRY_ACCEPTED';exception when unique_violation then null;end;
 begin perform public.aqari_unit_readiness_register(w,'record',d||'{"id":"76620000-0000-4000-8000-000000000502"}');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_unit_readiness_register(w,'record',d||'{"inspected_on":"2099-01-01"}');raise exception 'FUTURE_REVIEW_ACCEPTED';exception when check_violation then null;end;
 begin perform 1 from private.aqari_unit_readiness;raise exception 'PRIVATE_READINESS_TABLE_EXPOSED';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values('76620000-0000-4000-8000-000000000402',current_setting('aqari.test.readiness.workspace')::uuid,'readiness-new','76620000-0000-4000-8000-000000000301','76620000-0000-4000-8000-000000000201','READINESS-NEW','2026-01-01','2026-12-31',100,50,'draft','{}');
do $$begin
 begin insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
  values('76620000-0000-4000-8000-000000000403',current_setting('aqari.test.readiness.workspace')::uuid,'readiness-overlap','76620000-0000-4000-8000-000000000301','76620000-0000-4000-8000-000000000201','READINESS-OVERLAP','2026-02-01','2026-03-31',100,50,'draft','{}');
  raise exception 'EXISTING_OVERLAP_GUARD_LOST';exception when exclusion_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.readiness.workspace')::uuid;d jsonb;rows jsonb;begin
 rows:=public.aqari_unit_readiness_register(w,'list');
 if jsonb_array_length(rows->'properties')<>1 or jsonb_array_length(rows->'units')<>1 or jsonb_array_length(rows->'history')<>1 then raise exception 'READINESS_PROPERTY_SCOPE_FAILED';end if;
 d:='{"id":"76620000-0000-4000-8000-000000000502","property_id":"76620000-0000-4000-8000-000000000101","unit_no":"101","expected_revision":1,"state":"not_ready","inspected_on":"2026-01-02","source_ref":"محضر صيانة اصطناعي","reason":"أعمال صيانة تحتاج استكمال"}';
 perform public.aqari_unit_readiness_register(w,'record',d);
 begin perform public.aqari_unit_readiness_register(w,'record',d||'{"property_id":"76620000-0000-4000-8000-000000000102"}');raise exception 'FOREIGN_PROPERTY_WRITE_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_unit_readiness_register(w,'record',d||'{"unit_no":"999","expected_revision":0}');raise exception 'MAINTENANCE_CREATED_UNIT';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 begin update public.aqari_leases set status='ready' where id='76620000-0000-4000-8000-000000000402';raise exception 'UNREADY_DRAFT_PROGRESSED';exception when check_violation then if sqlerrm<>'UNIT_NOT_READY' then raise;end if;end;
 update public.aqari_leases set status='cancelled' where id='76620000-0000-4000-8000-000000000402';
 begin update public.aqari_leases set status='signed' where id='76620000-0000-4000-8000-000000000402';raise exception 'UNREADY_LEASE_REACTIVATED';exception when check_violation then if sqlerrm<>'UNIT_NOT_READY' then raise;end if;end;
 begin update private.aqari_unit_readiness set state='ready' where id='76620000-0000-4000-8000-000000000502';raise exception 'READINESS_HISTORY_REWRITTEN';exception when check_violation then null;end;
 begin delete from private.aqari_unit_readiness where id='76620000-0000-4000-8000-000000000502';raise exception 'READINESS_HISTORY_DELETED';exception when check_violation then null;end;
 if (select count(*) from private.aqari_unit_readiness)<>2 then raise exception 'READINESS_AUDIT_HISTORY_LOST';end if;
 if has_function_privilege('anon','public.aqari_unit_readiness_register(uuid,text,jsonb)','execute') then raise exception 'ANON_READINESS_ACCESS';end if;
end$$;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_unit_readiness_register(current_setting('aqari.test.readiness.workspace')::uuid,'record','{"id":"76620000-0000-4000-8000-000000000503","property_id":"76620000-0000-4000-8000-000000000101"}');raise exception 'VIEWER_MARKED_READY';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
do $$begin
 begin perform public.aqari_unit_readiness_register(current_setting('aqari.test.readiness.workspace')::uuid,'record','{"id":"76620000-0000-4000-8000-000000000503","property_id":"76620000-0000-4000-8000-000000000101"}');raise exception 'MANAGER_BYPASSED_MFA';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
end$$;
reset role;
rollback;
select 'PASS: readiness, new lease denial, unchanged legacy UPSERT, extensions, progression, overlap, property scope, immutable history, retry and MFA';
