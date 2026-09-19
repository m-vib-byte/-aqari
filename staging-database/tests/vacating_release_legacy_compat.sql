-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Local-memory acceptance using commercial-vacating-existing.sql synthetic history.
-- The hosted legacy guard fixture must be installed before the compatibility SQL.
begin;
select set_config('request.jwt.claim.sub','76570000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('compat.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$declare w uuid:=current_setting('compat.w')::uuid;begin
 begin
  insert into private.aqari_vacating_release_authorizations values(w,'76570000-0000-4000-8000-000000000401',pg_current_xact_id()::text,pg_backend_pid(),auth.uid(),3,'2026-08-31','forged','{}');
  raise exception 'CLIENT_RELEASE_AUTHORIZATION_FORGED';
 exception when insufficient_privilege then null;end;
 perform public.aqari_commercial_sales(w,'reverse','{"id":"76570000-0000-4000-8000-000000000701","sale_id":"76570000-0000-4000-8000-000000000601","month":"2026-08","occurred_on":"2026-08-31","reason":"تصحيح التقرير الاصطناعي قبل اختبار توافق الإخلاء"}');
end $$;
reset role;
-- Even a direct table update with a valid existing clearance is refused. A
-- client-settable session value cannot substitute for the revoked private table.
select set_config('aqari.vacating_release_authorized','true',true);
do $$declare w uuid:=current_setting('compat.w')::uuid;begin
 begin
  update public.aqari_leases set status='expired',vacated_on='2026-08-31' where workspace_id=w and id='76570000-0000-4000-8000-000000000401';
  raise exception 'DIRECT_UPDATE_BYPASSED_RELEASE';
 exception when check_violation then if sqlerrm<>'VACATING_ISSUE_REQUIRED' then raise;end if;end;
 if exists(select 1 from private.aqari_vacating_release_authorizations) then raise exception 'UNEXPECTED_RELEASE_PERMIT';end if;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('compat.w')::uuid;r jsonb;begin
 begin perform public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',2);raise exception 'STALE_CLEARANCE_RELEASED';exception when serialization_failure then if sqlerrm<>'VACATING_REVISION_CONFLICT' then raise;end if;end;
 r:=public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',3);
 if r#>>'{settlement,status}'<>'released' or r#>>'{lease,vacated_on}'<>'2026-08-31' then raise exception 'COMPAT_ACTUAL_RELEASE_FAILED';end if;
 r:=public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',3);
 if r#>>'{lease,vacated_on}'<>'2026-08-31' then raise exception 'COMPAT_RELEASE_RETRY_FAILED';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('compat.w')::uuid;original jsonb;begin
 if exists(select 1 from private.aqari_vacating_release_authorizations) then raise exception 'RELEASE_AUTHORIZATION_NOT_CLEANED';end if;
 select snapshot into original from public.aqari_leases where workspace_id=w and id='76570000-0000-4000-8000-000000000401';
 if original<>'{}'::jsonb or not exists(select 1 from private.aqari_vacating_settlements s where s.workspace_id=w and s.lease_id='76570000-0000-4000-8000-000000000401' and s.release_snapshot#>'{contract_row,snapshot}'=original) then raise exception 'CONTRACT_SNAPSHOT_NOT_PRESERVED';end if;
 begin update public.aqari_leases set monthly_rent=1 where workspace_id=w and id='76570000-0000-4000-8000-000000000401';raise exception 'RELEASED_RENT_CHANGED';exception when check_violation then if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;end;
 begin update public.aqari_leases set vacated_on='2026-08-30' where workspace_id=w and id='76570000-0000-4000-8000-000000000401';raise exception 'RELEASED_DATE_CHANGED';exception when check_violation then if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;end;
 begin update public.aqari_leases set snapshot='{"rent":1}' where workspace_id=w and id='76570000-0000-4000-8000-000000000401';raise exception 'RELEASED_SNAPSHOT_CHANGED';exception when check_violation then if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;end;
 update public.aqari_leases set snapshot=original||'{"status":"expired","vacatedOn":"2026-08-31","changeReason":"vacating-clearance-release"}'::jsonb where workspace_id=w and id='76570000-0000-4000-8000-000000000401';
 if (select snapshot from public.aqari_leases where workspace_id=w and id='76570000-0000-4000-8000-000000000401') is distinct from original then raise exception 'BENIGN_PROJECTION_REPLACED_SNAPSHOT';end if;
end $$;
rollback;

-- Exercise the actual app-state projection, including INSERT ... ON CONFLICT
-- lease triggers, using the independent state-RPC readiness history fixture.
begin;
select set_config('request.jwt.claim.sub','76620000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$declare w uuid:='76620000-0000-4000-8000-000000000900';state jsonb;d jsonb;c jsonb;r jsonb;receipt jsonb;row_data jsonb;period date;doc record;lid uuid;begin
 state:=public.aqari_read_state_v267(w);d:=state->'payload';c:=d#>'{contractsV202,0}';
 if c->>'id'<>'readiness-projection-c' or c->>'status'<>'signed' then raise exception 'COMPAT_STATE_CONTRACT_FIXTURE_REQUIRED';end if;
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref=c->>'id';
 perform set_config('compat.state.lease',lid::text,true);
 perform set_config('compat.state.contract',c::text,true);
 for period in select generate_series(date_trunc('month',(c->>'start_date')::date),date_trunc('month',current_date),interval '1 month')::date loop
  row_data:=jsonb_build_array('COMPAT-RENT-'||period::text,c->>'tenant',100,'مدفوع',c->>'property',current_date::text,c->>'unit',c->>'accountant',to_char(period,'YYYY-MM'),'نقدي');
  r:=jsonb_build_object('receiptNo',row_data->>0,'contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',100,'due',100,'period',to_char(period,'YYYY-MM'),'paidAt',current_date::text,'status','مدفوع','method','نقدي','transactionNo','','accountant',c->>'accountant');
  receipt:=jsonb_build_object('id',row_data->>0,'detailsVersion',2,'template','rent-voucher-v267-1','record',row_data,'contract',c,'accountant',c->>'accountant','transactionNo','');
  d:=d||jsonb_build_object('collections',coalesce(d->'collections','[]')||jsonb_build_array(row_data),'rentLedgerV202',coalesce(d->'rentLedgerV202','[]')||jsonb_build_array(r),'rentReceiptsV267',coalesce(d->'rentReceiptsV267','[]')||jsonb_build_array(receipt));
 end loop;
 perform public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 perform set_config('compat.state.receipts',(d->'rentReceiptsV267')::text,true);
 r:=public.aqari_vacating_settlement(w,'save',jsonb_build_object('lease_id',lid,'vacate_date',current_date::text,'keys_returned',true,'inspection_completed',true,'meters_recorded',true,'damage_amount','0.000','damage_notes','','charges_resolved',true,'charges_reference','محضر فحص الصفحة الاصطناعية','revision',0));
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id',lid,'revision',(r#>>'{settlement,revision}')::bigint));
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id',lid,'revision',(r#>>'{settlement,revision}')::bigint,'exception_reason',''));
 perform set_config('compat.state.revision',r#>>'{settlement,revision}',true);
 select * into doc from public.aqari_reserve_document(w,'mobile_scan','lease',c->>'id','محضر تسليم اختبار توافق الصفحة','compat-state.pdf','application/pdf','{"document_category":"vacating_inspection","purpose":"vacating_handover"}');
 perform set_config('compat.state.document',doc.document_id::text,true);
 perform set_config('compat.state.path',doc.storage_path,true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',current_setting('compat.state.path'),'{"size":12,"mimetype":"application/pdf"}');
set local role authenticated;
select public.aqari_finalize_document(current_setting('compat.state.document')::uuid,12,'application/pdf',repeat('c',64));
do $$declare w uuid:='76620000-0000-4000-8000-000000000900';lid uuid:=current_setting('compat.state.lease')::uuid;r jsonb;state jsonb;d jsonb;expected jsonb;begin
 r:=public.aqari_vacating_release(w,lid,current_setting('compat.state.revision')::bigint);
 if r#>>'{settlement,status}'<>'released' or r#>>'{lease,vacated_on}'<>current_date::text then raise exception 'APP_STATE_RELEASE_FAILED';end if;
 state:=public.aqari_read_state_v267(w);d:=state->'payload';
 expected:=current_setting('compat.state.contract')::jsonb||jsonb_build_object('status','expired','vacatedOn',current_date,'changeReason','vacating-clearance-release');
 if d#>'{contractsV202,0}' is distinct from expected then raise exception 'APP_STATE_RELEASE_MARKERS_MISSING';end if;
 if d->'rentReceiptsV267' is distinct from current_setting('compat.state.receipts')::jsonb then raise exception 'APP_STATE_RELEASE_CHANGED_RECEIPTS';end if;
 -- A subsequent ordinary page save must remain usable after release, without
 -- replacing the canonical contract snapshot with its presentation markers.
 r:=public.aqari_save_state_v267(w,d,(state->>'revision')::bigint);
 if r->'payload' is distinct from d then raise exception 'RELEASED_STATE_REPLAY_CHANGED_PAYLOAD';end if;
 state:=public.aqari_read_state_v267(w);
 begin
  perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202,0,end_date}',to_jsonb(((expected->>'end_date')::date+1)::text)),(state->>'revision')::bigint);
  raise exception 'RELEASED_STATE_CONTRACT_MUTATED';
 exception when check_violation then if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;end;
 if public.aqari_read_state_v267(w) is distinct from state then raise exception 'REJECTED_STATE_EDIT_CHANGED_REVISION';end if;
end $$;
reset role;
do $$declare w uuid:='76620000-0000-4000-8000-000000000900';lid uuid:=current_setting('compat.state.lease')::uuid;original jsonb:=current_setting('compat.state.contract')::jsonb;begin
 if (select snapshot from public.aqari_leases where workspace_id=w and id=lid) is distinct from original
  or (select release_snapshot#>'{contract_row,snapshot}' from private.aqari_vacating_settlements where workspace_id=w and lease_id=lid) is distinct from original then raise exception 'APP_STATE_RELEASE_LOST_ORIGINAL_CONTRACT';end if;
 if exists(select 1 from private.aqari_vacating_release_authorizations) then raise exception 'APP_STATE_RELEASE_PERMIT_NOT_CLEANED';end if;
end $$;
rollback;
select 'PASS: hosted issued history and modern release coexist; private permit/GUC/direct/stale attacks denied; real app-state contract release and replay preserve original contract plus receipts; substantive later state edits fail atomically';
