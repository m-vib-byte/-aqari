-- AQARI V267 Staging/support hardening.
-- Preserve the current operations implementation as a private core and fail closed
-- on petty-cash spend before the core can perform any expense or fund write.
begin;

alter function public.aqari_operations_register(uuid,text,text,jsonb) set schema private;
alter function private.aqari_operations_register(uuid,text,text,jsonb) rename to aqari_operations_register_core;
revoke all on function private.aqari_operations_register_core(uuid,text,text,jsonb) from public,anon,authenticated;

create function public.aqari_operations_register(
  p_workspace_id uuid,
  p_domain text,
  p_action text,
  p_data jsonb default '{}'
) returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  invoice_ref text;
begin
  if auth.uid() is null or not private.aqari_manager(p_workspace_id) then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  if p_domain='petty_cash'
     and p_action='entry'
     and coalesce(p_data->>'kind','')='spend' then
    invoice_ref:=btrim(coalesce(p_data->>'invoice_id',''));
    if length(invoice_ref) not between 2 and 160
       or invoice_ref ~ '[[:cntrl:]]' then
      raise invalid_parameter_value using message='PETTY_CASH_INVOICE_REQUIRED';
    end if;
  end if;

  return private.aqari_operations_register_core(
    p_workspace_id,p_domain,p_action,p_data
  );
end $$;

revoke all on function public.aqari_operations_register(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_operations_register(uuid,text,text,jsonb) to authenticated;

commit;
