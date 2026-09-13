-- Preview only. Validate newly inserted rent payments without rewriting history.
-- AFTER INSERT also preserves an identical legacy INSERT ... ON CONFLICT DO NOTHING:
-- only an actual new row is validated, and an exception rolls back the transaction.
-- Existing UPDATE/cancellation permissions, period locks and audit guards are unchanged.
begin;
do $preflight$ begin if to_regprocedure('private.aqari_payment_method_reference_guard()') is not null then raise exception 'PAYMENT_GUARD_ALREADY_INSTALLED';end if;end $preflight$;
create or replace function private.aqari_payment_method_reference_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare ref text:=new.record->>'transactionNo';
begin
 if new.payment_method is null or new.payment_method not in
  ('كي نت','KNET','knet','تحويل بنكي','bank','نقدي','cash','شيك','cheque','أخرى','other') then
  raise check_violation using message='اختر طريقة دفع صحيحة قبل إصدار الوصل.';
 end if;
 if jsonb_typeof(new.record->'transactionNo') is distinct from 'string'
  or length(btrim(ref)) not between 1 and 150 or length(ref)>150
  -- PostgreSQL btrim(text) removes ASCII spaces only. A Unicode blank reference
  -- must fail just like the browser's trim(); valid Arabic letters remain allowed.
  or ref !~ U&'[^\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]'
  or ref ~ '[[:cntrl:]]' or ref ~ U&'[\00AD\061C\180E\200B-\200F\2028-\202E\2060-\206F\FEFF]'
  or lower(btrim(ref)) in ('—','-','–','n/a','na','none','null','undefined','غير مسجل','لا يوجد') then
  raise check_violation using message='أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي.';
 end if;
 if jsonb_typeof(new.record->'method') is distinct from 'string'
  or new.record->>'method' is distinct from new.payment_method
  or jsonb_typeof(new.receipt->'transactionNo') is distinct from 'string'
  or new.receipt->>'transactionNo' is distinct from ref
  or new.receipt#>>'{record,9}' is distinct from new.payment_method then
  raise check_violation using message='طريقة الدفع ومرجع الحركة لا يتطابقان مع الوصل المحفوظ.';
 end if;
 return new;
end $$;
revoke all on function private.aqari_payment_method_reference_guard() from public,anon,authenticated;
drop trigger if exists aqari_payment_method_reference_guard on public.aqari_rent_payments;
create trigger aqari_payment_method_reference_guard after insert on public.aqari_rent_payments
 for each row execute function private.aqari_payment_method_reference_guard();
notify pgrst, 'reload schema';
commit;
