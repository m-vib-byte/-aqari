alter table public.aqari_utility_entries
 add column payment_document_id uuid references public.aqari_documents(id),
 add column payment_date date,
 add column payment_method text,
 add constraint utility_payment_evidence_complete check(
 (payment_document_id is null and payment_date is null and payment_method is null) or
 (payment_document_id is not null and payment_date is not null and payment_method in ('cash','knet','bank','cheque') and entry_type='bill' and amount_paid>0));
create unique index utility_payment_document_unique on public.aqari_utility_entries(payment_document_id) where payment_document_id is not null;
create function private.aqari_utility_evidence_check() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.payment_document_id is not null and not exists(
 select 1 from public.aqari_documents d
 join public.aqari_properties p on p.workspace_id=d.workspace_id and p.external_ref=d.entity_ref
 where d.id=new.payment_document_id and d.workspace_id=new.workspace_id and p.id=new.property_id
 and d.entity_type='property' and d.status='uploaded' and d.checksum_sha256 is not null
 and d.created_by=auth.uid() and d.metadata->>'utility_entry_id'=new.id::text
 and d.metadata->>'meter_id'=new.meter_id::text
 and d.mime_type in ('application/pdf','image/jpeg','image/png','image/webp')
 ) then raise exception 'PAYMENT_DOCUMENT_NOT_CONFIRMED' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.aqari_utility_evidence_check() from public,anon,authenticated;
create trigger utility_evidence_check before insert on public.aqari_utility_entries
 for each row execute function private.aqari_utility_evidence_check();
