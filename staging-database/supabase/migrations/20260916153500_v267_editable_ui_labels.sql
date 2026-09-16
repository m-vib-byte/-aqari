-- V267 trial UI: expand manager-editable display labels only.
-- Internal section keys, permissions, routes and accounting identifiers remain unchanged.
create or replace function private.aqari_ui_label_keys() returns text[]
language sql immutable set search_path='' as $$
 select private.aqari_section_keys() || array[
  'more','control_center','scan_document',
  'group_finance','group_contracts','group_properties','group_maintenance','group_staff','group_account',
  'rental_contracts','contract_scan','property_statements','maintenance_utilities','data_quality','lease_review','partner_access','employees_payroll','property_notices','staff_circulars','staff_access','financial_register','opening_balances','partner_distributions','commercial_collections','deposit_ledger','vacating_settlement','exit_review','user_guide','compliance_center','kpi_dashboard','maintenance_plans','maintenance_report','security_center','operations_center','final_gap_center','official_documents','integration_center','financial_archive','lease_expiry_report','unit_readiness','original_documents','vacating_review'
 ]::text[]
$$;
revoke all on function private.aqari_ui_label_keys() from public,anon,authenticated;

create or replace function public.aqari_save_controls(p_workspace_id uuid,p_settings jsonb,p_expected_revision bigint,p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare old_row public.aqari_workspace_controls%rowtype;item record;subject record;section record;action record;lang record;label record;new_rev bigint;
begin
 if not private.aqari_manager(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_reason is null or length(btrim(p_reason)) not between 3 and 500 or p_settings is null or jsonb_typeof(p_settings)<>'object' or octet_length(p_settings::text)>65536 then raise exception 'INVALID_CONTROLS';end if;
 if not(p_settings ?& array['sections','permissions','labels']) then raise exception 'INVALID_CONTROLS';end if;
 for item in select * from jsonb_each(p_settings) loop if item.key not in ('sections','permissions','labels') or jsonb_typeof(item.value)<>'object' then raise exception 'INVALID_CONTROLS';end if;end loop;
 for item in select * from jsonb_each(p_settings->'sections') loop
  if not(item.key=any(private.aqari_section_keys())) or jsonb_typeof(item.value)<>'boolean' then raise exception 'INVALID_SECTION';end if;
 end loop;
 for subject in select * from jsonb_each(p_settings->'permissions') loop
  if subject.key not in ('role:property_manager','role:accountant','role:viewer') and not exists(select 1 from public.aqari_memberships where workspace_id=p_workspace_id and 'user:'||user_id::text=subject.key and role<>'general_manager' and is_active) then raise exception 'INVALID_SUBJECT';end if;
  if jsonb_typeof(subject.value)<>'object' then raise exception 'INVALID_PERMISSIONS';end if;
  for section in select * from jsonb_each(subject.value) loop
   if not(section.key=any(private.aqari_section_keys())) or jsonb_typeof(section.value)<>'object' then raise exception 'INVALID_PERMISSIONS';end if;
   for action in select * from jsonb_each(section.value) loop
    if action.key not in ('read','write') or jsonb_typeof(action.value)<>'boolean' then raise exception 'INVALID_PERMISSIONS';end if;
   end loop;
   if section.value->>'write'='true' and section.value->>'read'='false' then raise exception 'WRITE_REQUIRES_READ';end if;
  end loop;
 end loop;
 for lang in select * from jsonb_each(p_settings->'labels') loop
  if lang.key not in ('ar','en','hi','ur','ml') or jsonb_typeof(lang.value)<>'object' then raise exception 'INVALID_LANGUAGE';end if;
  for label in select * from jsonb_each(lang.value) loop
   if not(label.key=any(private.aqari_ui_label_keys())) or jsonb_typeof(label.value)<>'string' or length(btrim(label.value#>>'{}')) not between 1 and 80 or (label.value#>>'{}') ~ '[<>[:cntrl:]]' then raise exception 'INVALID_LABEL';end if;
  end loop;
 end loop;
 perform 1 from public.aqari_workspaces where id=p_workspace_id for update;
 select * into old_row from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 if coalesce(old_row.revision,0) is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 new_rev:=coalesce(old_row.revision,0)+1;
 insert into public.aqari_workspace_controls(workspace_id,settings,revision,updated_by) values(p_workspace_id,p_settings,new_rev,auth.uid())
 on conflict(workspace_id) do update set settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 insert into public.aqari_control_audit(workspace_id,actor_id,action,entity_ref,reason,before_value,after_value) values(p_workspace_id,auth.uid(),'controls.update',p_workspace_id::text,btrim(p_reason),old_row.settings,p_settings);
 return new_rev;
end $$;
revoke all on function public.aqari_save_controls(uuid,jsonb,bigint,text) from public,anon;
grant execute on function public.aqari_save_controls(uuid,jsonb,bigint,text) to authenticated;
