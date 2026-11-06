-- V267 client/server document category parity. No row, Storage or permission changes.
begin;
do $guard$
begin
 if md5(pg_get_functiondef('public.aqari_reserve_document(uuid,text,text,text,text,text,text,jsonb)'::regprocedure))<>'9d4568655619b1b872ed530e6e5a5f7c' or to_regprocedure('private.aqari_document_category_valid(text,text,text)') is not null then
 raise exception 'DOCUMENT_RESERVE_BASELINE_CHANGED';end if;
end $guard$;
create function private.aqari_document_category_valid(category text,entity text,kind text) returns boolean language sql immutable security invoker set search_path='' as $category$
 select coalesce((case category
 when 'archived_contract' then entity in ('tenant')
 when 'owner_identity' then entity in ('property')
 when 'landlord_identity' then entity in ('property','lease')
 when 'tenant_identity' then entity in ('tenant','lease')
 when 'company_registration' then entity in ('property','tenant','lease','vendor')
 when 'power_of_attorney' then entity in ('property','tenant','lease')
 when 'title_deed' then entity in ('property')
 when 'site_plan' then entity in ('property')
 when 'floor_plan' then entity in ('property','unit')
 when 'building_license' then entity in ('property')
 when 'fire_certificate' then entity in ('property')
 when 'elevator_certificate' then entity in ('property')
 when 'commercial_license' then entity in ('tenant','lease')
 when 'electricity_service' then entity in ('property','lease')
 when 'water_service' then entity in ('property','lease')
 when 'gas_service' then entity in ('property','lease')
 when 'internet_service' then entity in ('property','lease')
 when 'meter_reading' then entity in ('property','unit','lease')
 when 'signed_lease' then entity in ('lease')
 when 'lease_addendum' then entity in ('lease')
 when 'payment_receipt' then entity in ('lease')
 when 'deposit_receipt' then entity in ('lease')
 when 'deposit_refund' then entity in ('lease')
 when 'cheque' then entity in ('lease')
 when 'bank_transfer' then entity in ('lease')
 when 'payment_gateway_receipt' then entity in ('lease')
 when 'tenant_statement' then entity in ('tenant','lease')
 when 'debt_notice' then entity in ('tenant','lease')
 when 'renewal_notice' then entity in ('tenant','lease')
 when 'nonrenewal_notice' then entity in ('tenant','lease')
 when 'exit_inspection' then entity in ('unit','lease')
 when 'key_handover' then entity in ('unit','lease')
 when 'utility_clearance' then entity in ('lease')
 when 'exit_notice' then entity in ('lease')
 when 'final_settlement' then entity in ('lease')
 when 'clearance' then entity in ('tenant','lease')
 when 'amicable_settlement' then entity in ('lease','legal_case')
 when 'damage_report' then entity in ('unit','lease')
 when 'damage_invoice' then entity in ('lease','work_order')
 when 'vendor_contract' then entity in ('property','vendor')
 when 'work_order' then entity in ('property','work_order')
 when 'work_invoice' then entity in ('property','work_order')
 when 'expense_approval' then entity in ('property','work_order')
 when 'legal_filing' then entity in ('lease','legal_case')
 when 'judgment' then entity in ('lease','legal_case')
 when 'salary_slip' then entity in ('employee')
 when 'daily_collection' then entity in ('property')
 when 'inspection_signature' then entity in ('unit','lease')
 when 'property_logo' then entity in ('property')
 when 'property_main_photo' then entity in ('property')
 when 'property_photo' then entity in ('property')
 when 'property_license' then entity in ('property')
 when 'property_certificate' then entity in ('property')
 when 'property_insurance' then entity in ('property')
 when 'property_other' then entity in ('property')
 else false end) and (kind=case category when 'signed_lease' then 'signed_contract' else 'supporting_document' end or (category='property_other' and entity='property' and kind='property_document')),false)
$category$;
revoke all on function private.aqari_document_category_valid(text,text,text) from public,anon,authenticated,service_role;
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
