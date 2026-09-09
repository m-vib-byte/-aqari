-- Additive document categories; retain existing entity scope, private files and originals.
begin;
create function private.aqari_document_category_valid(category text,entity text,kind text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce((case category
  when 'owner_identity' then entity='property'
  when 'landlord_identity' then entity in ('property','lease')
  when 'tenant_identity' then entity in ('tenant','lease')
  when 'company_registration' then entity in ('property','tenant','lease')
  when 'power_of_attorney' then entity in ('property','tenant','lease')
  when 'title_deed' then entity='property'
  when 'site_plan' then entity='property'
  when 'electricity_service' then entity in ('property','lease')
  when 'water_service' then entity in ('property','lease')
  when 'gas_service' then entity in ('property','lease')
  when 'internet_service' then entity in ('property','lease')
  when 'signed_lease' then entity='lease'
  when 'lease_addendum' then entity='lease'
  when 'payment_receipt' then entity='lease'
  when 'cheque' then entity='lease'
  when 'bank_transfer' then entity='lease'
  when 'exit_inspection' then entity='lease'
  when 'utility_clearance' then entity='lease'
  when 'exit_notice' then entity='lease'
  when 'amicable_settlement' then entity='lease'
  when 'damage_invoice' then entity='lease' else false end)
  and kind=case category when 'signed_lease' then 'signed_contract' else 'supporting_document' end,false)
$$;
revoke all on function private.aqari_document_category_valid(text,text,text) from public,anon,authenticated;
do $patch$
declare s text:=pg_get_functiondef('public.aqari_reserve_document(uuid,text,text,text,text,text,text,jsonb)'::regprocedure);
 anchor text:='(''tenant_attachment'',''signed_contract'',''property_document'',''mobile_scan'')';
 extra text:=' if (p_document_type=''supporting_document'' or p_metadata ? ''category'') and not private.aqari_document_category_valid(p_metadata->>''category'',entity,p_document_type) then raise exception ''INVALID_DOCUMENT_CATEGORY'' using errcode=''22023'';end if;';
begin
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 or strpos(s,' ext:=case p_mime_type')=0 then raise exception 'DOCUMENT_CATEGORY_ANCHOR_CHANGED';end if;
 s:=replace(s,anchor,'(''tenant_attachment'',''signed_contract'',''property_document'',''mobile_scan'',''supporting_document'')');
 s:=replace(s,' ext:=case p_mime_type',extra||chr(10)||' ext:=case p_mime_type');execute s;
end $patch$;
commit;
