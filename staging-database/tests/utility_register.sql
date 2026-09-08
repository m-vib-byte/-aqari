begin;
select set_config('request.jwt.claims','{"sub":"2178d9cd-8b80-46ed-acd2-fb08ae120b70","role":"authenticated"}',true);
set local role authenticated;
do $$
declare m public.aqari_utility_meters%rowtype;e uuid:=gen_random_uuid();n integer;
begin
 select * into strict m from public.aqari_utility_meters where source_key='electricity-210329030156138';
 insert into public.aqari_utility_entries(id,workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,amount_paid,payment_status,source_ref) values(e,m.workspace_id,m.property_id,m.id,'bill','ROLLBACK-ONLY-TEST','2026-09-01',20,5,'partial','اختبار قاعدة بيانات مع تراجع كامل');
 select count(*) into n from public.aqari_utility_entries where id=e and amount_due=20 and amount_paid=5 and recorded_by=auth.uid();if n<>1 then raise exception 'SAVE_READ_FAILED';end if;
 begin
  insert into public.aqari_utility_entries(workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,source_ref) values(m.workspace_id,m.property_id,m.id,'bill','ROLLBACK-ONLY-TEST','2026-09-01',20,'duplicate test');
  raise exception 'DUPLICATE_ACCEPTED';
 exception when unique_violation then null;end;
 begin
  update public.aqari_utility_entries set amount_due=99 where id=e;raise exception 'UPDATE_ACCEPTED';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.aqari_utility_entries(workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,amount_paid,payment_status,source_ref) values(m.workspace_id,m.property_id,m.id,'bill','BAD-STATE','2026-09-01',20,5,'paid','invalid status test');raise exception 'INVALID_PAID_ACCEPTED';
 exception when check_violation then null;end;
 begin
  insert into public.aqari_utility_entries(workspace_id,property_id,meter_id,entry_type,invoice_no,bill_period,amount_due,amount_paid,source_ref,payment_document_id,payment_date,payment_method)
  values(m.workspace_id,m.property_id,m.id,'bill','UNVERIFIED-PROOF','2026-09-01',20,5,'proof mismatch',gen_random_uuid(),'2026-09-08','knet');raise exception 'UNVERIFIED_PROOF_ACCEPTED';
 exception when check_violation then null;end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$begin if exists(select 1 from public.aqari_utility_meters) or exists(select 1 from public.aqari_utility_entries) then raise exception 'OUTSIDER_READ';end if;end $$;
reset role;
rollback;
select 'PASS: RLS, save/reread, duplicate invoice rejection, immutable history, invalid paid status; test bill rolled back' as result;
