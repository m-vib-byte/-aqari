alter table public.aqari_utility_entries add constraint utility_payment_evidence_required_values
 check(payment_document_id is null or (payment_method is not null and amount_paid is not null));
