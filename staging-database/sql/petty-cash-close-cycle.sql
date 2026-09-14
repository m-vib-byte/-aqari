-- AQARI V267 petty-cash close-cycle guard.
-- CODE ONLY: apply only to isolated Preview/Staging after operations-register.sql.
-- Production and historical V266 are explicitly out of scope.
begin;

alter table private.aqari_petty_cash_funds
 add column if not exists closed_by uuid,
 add column if not exists closed_at timestamptz,
 add column if not exists close_reason text not null default '';

create or replace function public.aqari_petty_cash_close(
 p_workspace_id uuid,
 p_fund_id uuid,
 p_revision integer,
 p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;
 fund private.aqari_petty_cash_funds;
 before_row jsonb;
 after_row jsonb;
 actor text;
 why text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null
    or not private.aqari_manager(w)
    or not private.aqari_can(w,'finance','write') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 perform private.aqari_require_sensitive_aal2(w);

 if p_fund_id is null or p_revision is null or p_revision<1 then
  raise exception 'PETTY_CASH_CLOSE_ID_REVISION_REQUIRED' using errcode='22023';
 end if;
 if length(why)<5 then
  raise exception 'PETTY_CASH_CLOSE_REASON_REQUIRED' using errcode='22023';
 end if;

 select * into fund
 from private.aqari_petty_cash_funds f
 where f.workspace_id=w and f.id=p_fund_id
 for update;
 if not found then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if fund.status<>'open' then
  raise exception 'PETTY_CASH_FUND_NOT_OPEN' using errcode='23514';
 end if;
 if fund.revision is distinct from p_revision then
  raise serialization_failure using message='REVISION_CONFLICT';
 end if;
 if fund.balance is distinct from 0::numeric then
  raise exception 'PETTY_CASH_BALANCE_NOT_ZERO' using errcode='23514';
 end if;

 -- A fund cannot be closed while a spend lacks the invoice/document approval
 -- evidence required by G12-22. Legacy incomplete rows therefore fail closed.
 if exists(
  select 1
  from private.aqari_petty_cash_entries e
  where e.workspace_id=w and e.fund_id=fund.id and e.kind='spend'
    and (
      nullif(btrim(coalesce(e.invoice_id,'')),'') is null
      or e.document_id is null
      or e.approved_by is null
      or e.approved_at is null
    )
 ) then
  raise exception 'PETTY_CASH_SPEND_EVIDENCE_INCOMPLETE' using errcode='23514';
 end if;

 before_row:=to_jsonb(fund);
 select coalesce(nullif(display_name,''),auth.uid()::text)
 into actor
 from public.aqari_profiles
 where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 update private.aqari_petty_cash_funds f
 set status='closed',
     revision=f.revision+1,
     closed_by=auth.uid(),
     closed_at=now(),
     close_reason=why
 where f.workspace_id=w and f.id=fund.id
 returning * into fund;
 after_row:=to_jsonb(fund);

 insert into private.aqari_operations_audit(
  workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value
 ) values(
  w,'petty_cash',fund.id,'close',auth.uid(),actor,why,before_row,after_row
 );

 return after_row;
end $$;

revoke all on function public.aqari_petty_cash_close(uuid,uuid,integer,text)
 from public,anon,authenticated;
grant execute on function public.aqari_petty_cash_close(uuid,uuid,integer,text)
 to authenticated;

commit;
