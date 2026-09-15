-- AQARI V267 isolated trial: extend authoritative document-category validation for property visual assets.
-- Additive and idempotent. Existing private storage, reserve/finalize flow and immutable originals are preserved.
begin;

create or replace function private.aqari_document_category_valid(category text,entity text,kind text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce((case category
  when 'owner_identity' then entity='property'
  when 'landlord_identity' then entity in ('property','lease')
  when 'tenant_identity' then entity in ('tenant','lease')
  when 'company_registration' then entity in ('property','tenant','lease')
  when 'power_of_attorney' then entity in ('property','tenant','lease')
  when 'title_deed' then entity='property'
  when 'site_plan' then entity='property'
  when 'property_logo' then entity='property'
  when 'property_photo' then entity='property'
  when 'property_other' then entity='property'
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
  when 'damage_invoice' then entity='lease'
  else false end)
  and kind=case category when 'signed_lease' then 'signed_contract' else 'supporting_document' end,false)
$$;
revoke all on function private.aqari_document_category_valid(text,text,text) from public,anon,authenticated;

commit;
