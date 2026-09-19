-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Local upgrade acceptance only: the fixture must exist before the report migration.
begin;
do $$begin
 if not exists(select 1 from private.aqari_tenant_ledger_entries e where e.id='7f6b2000-0000-4000-8000-000000000020' and e.kind='opening_debit' and e.direction='credit' and e.amount=999.125) then raise exception 'LEGACY_FIXTURE_MISSING_OR_REWRITTEN';end if;
end $$;
select set_config('request.jwt.claim.sub','7f6b2000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$begin
 begin perform public.aqari_opening_balance_statement('7f6b2000-0000-4000-8000-000000000099');raise exception 'LEGACY_CONTRADICTION_SILENTLY_TOTALLED';exception when check_violation then if sqlerrm<>'OPENING_ENTRY_DIRECTION_CONFLICT' then raise;end if;end;
 begin perform public.aqari_opening_balance_statement('7f6b2000-0000-4000-8000-000000000099','7f6b2000-0000-4000-8000-000000000012');raise exception 'TENANT_CONTRADICTION_SILENTLY_TOTALLED';exception when check_violation then if sqlerrm<>'OPENING_ENTRY_DIRECTION_CONFLICT' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: pre-upgrade contradictory ledger retained unchanged; workspace and tenant reports reject misleading totals';
