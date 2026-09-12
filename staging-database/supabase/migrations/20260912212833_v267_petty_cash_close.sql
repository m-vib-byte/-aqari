-- AQARI V267: audited petty-cash close cycle. Staging candidate only until release gate passes.
create or replace function public.aqari_petty_cash_close(
 p_workspace_id uuid,
 p_fund_id uuid,
 p_revision integer,
 p_reason text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 f private.aqari_petty_cash_funds;
 before_row jsonb;
 after_row jsonb;
 actor text;
 why text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if not private.aqari_can(p_workspace_id,'finance','write') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 if p_fund_id is null or p_revision is null or p_revision<1 then
  raise exception 'INVALID_PETTY_CASH_CLOSE' using errcode='22023';
 end if;
 if length(why)<3 then
  raise exception 'PETTY_CASH_CLOSE_REASON_REQUIRED' using errcode='22023';
 end if;

 select * into f
 from private.aqari_petty_cash_funds x
 where x.workspace_id=p_workspace_id and x.id=p_fund_id
 for update;
 if not found then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if f.revision is distinct from p_revision then
  raise serialization_failure using message='REVISION_CONFLICT';
 end if;
 if f.status='closed' then
  raise exception 'PETTY_CASH_ALREADY_CLOSED' using errcode='23514';
 end if;
 if f.status<>'open' then
  raise exception 'PETTY_CASH_FUND_NOT_OPEN' using errcode='23514';
 end if;
 if f.balance<>0 then
  raise exception 'PETTY_CASH_BALANCE_NOT_ZERO' using errcode='23514';
 end if;

 before_row:=to_jsonb(f);
 update private.aqari_petty_cash_funds x
 set status='closed',revision=x.revision+1
 where x.workspace_id=p_workspace_id and x.id=p_fund_id
 returning * into f;
 after_row:=to_jsonb(f);

 select coalesce(nullif(display_name,''),auth.uid()::text)
 into actor
 from public.aqari_profiles
 where user_id=auth.uid();
 actor:=coalesce(actor,auth.uid()::text);

 insert into private.aqari_operations_audit(
  workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value
 ) values(
  p_workspace_id,'petty_cash',p_fund_id,'close',auth.uid(),actor,why,before_row,after_row
 );

 return after_row;
end $$;

revoke all on function public.aqari_petty_cash_close(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.aqari_petty_cash_close(uuid,uuid,integer,text) to authenticated;
