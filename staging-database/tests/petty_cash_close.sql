-- Isolated PostgreSQL acceptance only. Every synthetic row rolls back.
begin;

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('petty-close-manager@example.invalid','مدير اختبار إقفال العهدة','general_manager','aqari-v267-staging'),
 ('petty-close-accountant@example.invalid','محاسب اختبار إقفال العهدة','accountant','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76930000-0000-4000-8000-000000000001','petty-close-manager@example.invalid',now()),
 ('76930000-0000-4000-8000-000000000002','petty-close-accountant@example.invalid',now());

select set_config('petty.close.workspace',(
 select workspace_id::text from public.aqari_memberships
 where user_id='76930000-0000-4000-8000-000000000001' and is_active
),true);
select set_config('request.jwt.claim.sub','76930000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
set local role authenticated;

do $$
declare
 w uuid:=current_setting('petty.close.workspace')::uuid;
 closed_row jsonb;
 listed jsonb;
begin
 perform public.aqari_operations_register(w,'petty_cash','create',jsonb_build_object(
  'id','76930000-0000-4000-8000-000000000101','name','عهدة إقفال صفرية','custodian_id','76930000-0000-4000-8000-000000000001','ceiling','100.000'
 ));
 closed_row:=public.aqari_petty_cash_close(w,'76930000-0000-4000-8000-000000000101',1,'إقفال عهدة مصفاة بالكامل');
 if closed_row->>'status'<>'closed' or closed_row->>'revision'<>'2' or (closed_row->>'balance')::numeric<>0 then
  raise exception 'ZERO_BALANCE_CLOSE_READBACK_MISMATCH';
 end if;
 listed:=public.aqari_operations_register(w,'petty_cash','list');
 if not exists(select 1 from jsonb_array_elements(listed->'funds') f where f->>'id'='76930000-0000-4000-8000-000000000101' and f->>'status'='closed' and f->>'revision'='2') then
  raise exception 'CLOSED_FUND_NOT_READ_BACK';
 end if;
 begin
  perform public.aqari_operations_register(w,'petty_cash','entry',jsonb_build_object(
   'id','76930000-0000-4000-8000-000000000101','entry_id','76930000-0000-4000-8000-000000000201','kind','fund','amount','1.000','reason','يجب رفض الحركة بعد الإقفال'
  ));
  raise exception 'CLOSED_FUND_ACCEPTED_ENTRY';
 exception when check_violation then
  if sqlerrm<>'PETTY_CASH_FUND_NOT_OPEN' then raise; end if;
 end;

 perform public.aqari_operations_register(w,'petty_cash','create',jsonb_build_object(
  'id','76930000-0000-4000-8000-000000000102','name','عهدة برصيد قائم','custodian_id','76930000-0000-4000-8000-000000000001','ceiling','100.000'
 ));
 perform public.aqari_operations_register(w,'petty_cash','entry',jsonb_build_object(
  'id','76930000-0000-4000-8000-000000000102','entry_id','76930000-0000-4000-8000-000000000202','kind','fund','amount','10.000','reason','تمويل اصطناعي لاختبار الرفض'
 ));
 begin
  perform public.aqari_petty_cash_close(w,'76930000-0000-4000-8000-000000000102',2,'محاولة إقفال مع رصيد قائم');
  raise exception 'NONZERO_BALANCE_CLOSE_ACCEPTED';
 exception when check_violation then
  if sqlerrm<>'PETTY_CASH_BALANCE_NOT_ZERO' then raise; end if;
 end;

 perform public.aqari_operations_register(w,'petty_cash','create',jsonb_build_object(
  'id','76930000-0000-4000-8000-000000000103','name','عهدة تعارض إصدار','custodian_id','76930000-0000-4000-8000-000000000001','ceiling','50.000'
 ));
 begin
  perform public.aqari_petty_cash_close(w,'76930000-0000-4000-8000-000000000103',9,'محاولة إصدار قديم');
  raise exception 'REVISION_CONFLICT_NOT_ENFORCED';
 exception when serialization_failure then
  if sqlerrm<>'REVISION_CONFLICT' then raise; end if;
 end;
end $$;

select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$
declare w uuid:=current_setting('petty.close.workspace')::uuid;begin
 begin
  perform public.aqari_petty_cash_close(w,'76930000-0000-4000-8000-000000000103',1,'محاولة بلا تحقق ثنائي');
  raise exception 'MFA_BYPASSED';
 exception when insufficient_privilege then
  if sqlerrm<>'MFA_REQUIRED' then raise; end if;
 end;
end $$;

select set_config('request.jwt.claim.sub','76930000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
do $$
declare w uuid:=current_setting('petty.close.workspace')::uuid;begin
 begin
  perform public.aqari_petty_cash_close(w,'76930000-0000-4000-8000-000000000103',1,'محاولة محاسب غير مخول');
  raise exception 'ACCOUNTANT_CLOSE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $$;

reset role;

do $$
declare w uuid:=current_setting('petty.close.workspace')::uuid;begin
 if not exists(
  select 1 from private.aqari_operations_audit
  where workspace_id=w and entity_id='76930000-0000-4000-8000-000000000101' and domain='petty_cash' and action='close'
   and reason='إقفال عهدة مصفاة بالكامل' and before_value->>'status'='open' and after_value->>'status'='closed'
 ) then raise exception 'CLOSE_AUDIT_MISSING'; end if;
end $$;

rollback;
select 'PASS: petty cash closes only at zero balance with AAL2, finance authority, revision locking, immutable history and audited readback';
