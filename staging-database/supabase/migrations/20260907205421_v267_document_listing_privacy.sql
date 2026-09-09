create or replace function private.aqari_can(w uuid,s text,a text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare r text;cfg jsonb;v jsonb;allowed boolean;
begin
 if auth.uid() is null or a not in ('read','write') then return false;end if;
 select role::text into r from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active;
 if r is null then return false;end if;
 if s='administration' then return r='general_manager';end if;
 if not(s=any(private.aqari_section_keys())) then return false;end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=w;
 if r='general_manager' and a='read' then return true;end if;
 if coalesce((cfg#>>array['sections',s])::boolean,true)=false then return false;end if;
 if r='general_manager' then return true;end if;
 if a='read' and s='contracts' and (not private.aqari_can(w,'tenants','read') or not private.aqari_can(w,'properties','read')) then return false;end if;
 if a='read' and s='collections' and not private.aqari_can(w,'contracts','read') then return false;end if;
 allowed:=case when a='read' then s not in ('partners','employees') or (r='accountant' and s='employees')
   when r='property_manager' then s in ('properties','tenants','contracts','maintenance','documents')
   when r='accountant' then s in ('collections','finance','employees','notifications') else false end;
 v:=cfg#>array['permissions','role:'||r,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 v:=cfg#>array['permissions','user:'||auth.uid()::text,s,a];if v is not null then allowed:=(v#>>'{}')::boolean;end if;
 -- Existing immutable role ceilings still apply; a viewer cannot become a writer here.
 if a='write' and (r='viewer' or (r='accountant' and s in ('properties','tenants','contracts','partners'))) then return false;end if;
 return allowed and (a='read' or private.aqari_can(w,s,'read'));
end $$;
create or replace function private.aqari_state_section(k text) returns text language sql immutable set search_path='' as $$
 select case
 when k in ('properties','units','propertyFilesV202','propertyBankAccountsV267') then 'properties'
 when k in ('tenants','tenantProfilesV267') then 'tenants'
 when k in ('leases','contractsV202','contractTemplatesV202','tenantDirectoryV202') then 'contracts'
 when k in ('collections','rentLedgerV202','rentReceiptsV267','depositReceiptsV267','depositRefundsV267') then 'collections'
 when k in ('maintenance','maintenanceContracts','maintenanceRequestsV267') then 'maintenance'
 when k in ('expenses','services','invoices','accounts','bankAccounts','journalEntries','openingBalancesV267') then 'finance'
 when k in ('employees','payroll') then 'employees'
 when k in ('propertySharesV267','propertyPartnersV267','partnerDistributionsV267','partnerAdjustmentsV267','partnerReservesV267') then 'partners'
 when k in ('documents','documentsV267','documentArchiveV267') then 'documents'
 when k in ('notifications','reminders','notificationSettingsV267') then 'notifications'
 else 'administration' end
$$;

-- One scoped query provides authors without exposing the profiles table.
create function public.aqari_document_listing(p_workspace_id uuid,p_entity_type text,p_entity_ref text,p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.aqari_can(p_workspace_id,'documents','read') or not private.aqari_document_entity(p_workspace_id,p_entity_type,p_entity_ref,'read') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>10000 then raise exception 'INVALID_PAGE';end if;
 return (select coalesce(jsonb_agg(to_jsonb(rows)),'[]') from (
  select d.id,d.document_no,d.title,d.entity_type,d.entity_ref,d.status,d.created_by,d.created_at,d.uploaded_at,d.storage_path,d.mime_type,d.size_bytes,p.display_name as author_name
  from public.aqari_documents d left join public.aqari_profiles p on p.user_id=d.created_by
  where d.workspace_id=p_workspace_id and d.entity_type=p_entity_type and d.entity_ref=p_entity_ref
  order by d.created_at desc,d.id desc limit 20 offset p_page*20
 ) rows);
end $$;
revoke all on function public.aqari_document_listing(uuid,text,text,integer) from public,anon;
grant execute on function public.aqari_document_listing(uuid,text,text,integer) to authenticated;
