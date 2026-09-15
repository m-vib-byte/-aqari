-- Preview/Staging only. Preserve all historical payments; validate only newly inserted rows
-- through the existing AFTER INSERT guard.
create or replace function private.aqari_payment_method_reference_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
 ref text:=new.record->>'transactionNo';
 provider text:=new.record->>'paymentProvider';
begin
 if new.payment_method is null or new.payment_method not in
  ('كي نت','KNET','knet','تحويل بنكي','bank','نقدي','cash','شيك','cheque','أخرى','other') then
  raise check_violation using message='اختر طريقة دفع صحيحة قبل إصدار الوصل.';
 end if;
 if jsonb_typeof(new.record->'transactionNo') is distinct from 'string'
  or length(btrim(ref)) not between 1 and 150 or length(ref)>150
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

 -- Provider/bank rules apply to new rows only. Historical rows stay byte-for-byte unchanged.
 if new.payment_method in ('كي نت','KNET','knet') then
  if jsonb_typeof(new.record->'paymentProvider') is distinct from 'string'
   or provider is distinct from 'KNET' then
   raise check_violation using message='يجب حفظ مزود KNET باسم KNET.';
  end if;
 elsif new.payment_method in ('نقدي','cash') then
  if new.record ? 'paymentProvider' and coalesce(btrim(provider),'')<>'' then
   raise check_violation using message='الدفع النقدي لا يستخدم بنكاً أو مزود دفع.';
  end if;
 else
  if jsonb_typeof(new.record->'paymentProvider') is distinct from 'string'
   or length(btrim(provider)) not between 2 and 120 or length(provider)>120
   or provider !~ U&'[^\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]'
   or provider ~ '[[:cntrl:]]' or provider ~ U&'[\00AD\061C\180E\200B-\200F\2028-\202E\2060-\206F\FEFF]'
   or lower(btrim(provider)) in ('—','-','–','n/a','na','none','null','undefined','غير مسجل','لا يوجد') then
   raise check_violation using message='أدخل اسم البنك أو مزوّد الدفع من 2 إلى 120 حرفاً.';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.aqari_payment_method_reference_guard() from public,anon,authenticated;
