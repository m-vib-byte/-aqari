-- IN-MEMORY UPGRADE ACCEPTANCE ONLY. Requires the explicitly local fixture
-- commercial-vacating-existing.sql before the guard migration. No hosted use.
begin;
select set_config('request.jwt.claim.sub','76570000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
select set_config('aqari.test.commercial.legacy.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;detail text;r jsonb;begin
 r:=public.aqari_vacating_settlement(w,'get','{"lease_id":"76570000-0000-4000-8000-000000000401"}');
 if r#>>'{settlement,status}'<>'cleared' then raise exception 'LEGACY_CLEARANCE_FIXTURE_REQUIRED';end if;
 begin
  perform public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',3);
  raise exception 'LEGACY_CLEARED_COMMERCIAL_DEBT_RELEASED';
 exception when check_violation then
  get stacked diagnostics detail=pg_exception_detail;
  if detail<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;
 end;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;detail text;begin
 if not exists(select 1 from public.aqari_leases where workspace_id=w and id='76570000-0000-4000-8000-000000000401' and status='signed' and vacated_on is null) then raise exception 'FAILED_COMMERCIAL_RELEASE_MUTATED_LEASE';end if;
 if not exists(select 1 from private.aqari_vacating_settlements where workspace_id=w and lease_id='76570000-0000-4000-8000-000000000401' and status='cleared' and revision=3 and released_at is null) then raise exception 'FAILED_COMMERCIAL_RELEASE_MUTATED_CLEARANCE';end if;
 begin
  -- Test-only malformed credit has the same amount, but no archived reversal
  -- source. The raised exception rolls this subtransaction back completely.
  insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
   values('76570000-0000-4000-8000-000000000990',w,'76570000-0000-4000-8000-000000000401','commercial_sales','credit',41.667,'2026-08-31','commercial_sales_reversal','76570000-0000-4000-8000-000000000991','مصدر عكس غير مطابق للاختبار',auth.uid());
  perform public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',3);
  raise exception 'UNLINKED_CREDIT_RELEASED_UNIT';
 exception when check_violation then
  get stacked diagnostics detail=pg_exception_detail;
  if detail<>'COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED' then raise;end if;
 end;
 if exists(select 1 from private.aqari_tenant_adjustments where id='76570000-0000-4000-8000-000000000990') then raise exception 'MALFORMED_CREDIT_NOT_ROLLED_BACK';end if;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;r jsonb;begin
 perform public.aqari_commercial_sales(w,'reverse','{"id":"76570000-0000-4000-8000-000000000701","sale_id":"76570000-0000-4000-8000-000000000601","month":"2026-08","occurred_on":"2026-08-31","reason":"إلغاء التقرير الاصطناعي الخاطئ مع حفظ أصله"}');
 r:=public.aqari_vacating_release(w,'76570000-0000-4000-8000-000000000401',3);
 if r#>>'{settlement,status}'<>'released' or r#>>'{lease,vacated_on}'<>'2026-08-31' then raise exception 'LEGACY_REVERSED_COMMERCIAL_RELEASE_FAILED';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;begin
 if (select count(*) from private.aqari_commercial_sales where workspace_id=w)<>1 or (select count(*) from private.aqari_commercial_sales_reversals where workspace_id=w)<>1 then raise exception 'LEGACY_COMMERCIAL_HISTORY_NOT_PRESERVED';end if;
 if (select sum(case direction when 'debit' then amount else -amount end) from private.aqari_tenant_adjustments where workspace_id=w and kind='commercial_sales')<>0 then raise exception 'LEGACY_COMMERCIAL_PHANTOM_DEBT';end if;
end $$;
rollback;
select 'PASS: pre-upgrade cleared lease cannot release with commercial debt; wrong-source credit rejected; failed release preserves lease/clearance; exact reversal allows release with original history preserved';
