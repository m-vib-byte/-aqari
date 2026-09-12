-- AQARI V267: fail closed before any petty-cash spend writes when the required
-- invoice reference is missing or malformed. This keeps the existing operations
-- implementation intact and only hardens its public entry boundary.
create or replace function public.aqari_operations_register(
  p_workspace_id uuid,
  p_domain text,
  p_action text,
  p_data jsonb default '{}'
) returns jsonb
language plpgsql
set search_path=''
as $$
declare
  invoice_ref text;
begin
  if p_domain='petty_cash' and p_action='entry' and coalesce(p_data->>'kind','')='spend' then
    invoice_ref:=btrim(coalesce(p_data->>'invoice_id',''));
    if length(invoice_ref) not between 2 and 160 or invoice_ref ~ '[[:cntrl:]]' then
      raise invalid_parameter_value using message='PETTY_CASH_INVOICE_REQUIRED';
    end if;
  end if;
  return private.aqari_operations_request_link(p_workspace_id,p_domain,p_action,p_data);
end $$;
