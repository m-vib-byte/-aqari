-- AQARI V267 G12-22 petty-cash close-cycle acceptance.
-- Synthetic identities only. Run on isolated Preview/Staging after petty-cash-close-cycle.sql.
-- Every business write is rolled back; Production is out of scope.
begin;
set local statement_timeout='20s';
set local lock_timeout='3s';

insert into public.aqari_workspaces(id,slug,name)
values ('76770000-0000-4000-8000-000000000099','petty-close-hosted-fixture','اختبار إقفال عهدة مؤقت — يتراجع بالكامل');
insert into public.aqari_app_state(workspace_id,payload)
values ('76770000-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values ('petty-close-manager@example.invalid','مدير اختبار إقفال العهدة','general_manager','petty-close-hosted-fixture');
insert into auth.users(id,email,email_confirmed_at)
values ('76770000-0000-4000-8000-000000000001','petty-close-manager@example.invalid',now());

select set_config('request.jwt.claim.sub','76770000-0000-4000-8000-000000000001',true);
select set_config(
 'request.jwt.claims',
 jsonb_build_object(
  'aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint))
 )::text,
 true
);
select set_config('petty.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);

set local role authenticated;
do $$
declare
 w uuid:=current_setting('petty.w')::uuid;
 fund_id uuid:='76770000-0000-4000-8000-000000000010';
 r jsonb;
begin
 r:=public.aqari_operations_register(w,'petty_cash','create',jsonb_build_object(
  'id',fund_id,'name','عهدة دورة الإقفال','custodian_id',auth.uid(),'ceiling','100.000'
 ));
 if r->>'status'<>'open' or (r->>'balance')::numeric<>0 then raise exception 'PETTY_CREATE_READBACK'; end if;

 r:=public.aqari_operations_register(w,'petty_cash','entry',jsonb_build_object(
  'id',fund_id,'entry_id','76770000-0000-4000-8000-000000000011','kind','fund','amount','100.000','reason','تمويل اختبار دورة الإقفال'
 ));
 if (r->>'balance')::numeric<>100 or (r->>'revision')::int<>2 then raise exception 'PETTY_FUND_READBACK'; end if;

 begin
  perform public.aqari_petty_cash_close(w,fund_id,2,'رفض الإقفال مع رصيد قائم');
  raise exception 'NONZERO_BALANCE_CLOSED';
 exception when check_violation then
  if sqlerrm<>'PETTY_CASH_BALANCE_NOT_ZERO' then raise; end if;
 end;

 r:=public.aqari_operations_register(w,'petty_cash','entry',jsonb_build_object(
  'id',fund_id,'entry_id','76770000-0000-4000-8000-000000000012','kind','settle','amount','100.000','reason','إعادة كامل المتبقي قبل الإقفال'
 ));
 if (r->>'balance')::numeric<>0 or (r->>'revision')::int<>3 then raise exception 'PETTY_SETTLEMENT_READBACK'; end if;

 r:=public.aqari_petty_cash_close(w,fund_id,3,'إقفال العهدة بعد تصفير الرصيد والتسوية');
 if r->>'status'<>'closed' or (r->>'balance')::numeric<>0 or (r->>'revision')::int<>4 then raise exception 'PETTY_CLOSE_READBACK'; end if;
 if r->>'closed_by'<>auth.uid()::text or nullif(r->>'closed_at','') is null or r->>'close_reason'<>'إقفال العهدة بعد تصفير الرصيد والتسوية' then raise exception 'PETTY_CLOSE_METADATA'; end if;
 r:=public.aqari_operations_register(w,'overview','list','{}');
 if not exists(select 1 from jsonb_array_elements(r->'audit') a where a->>'domain'='petty_cash' and a->>'entity_id'=fund_id::text and a->>'action'='close' and a->>'reason'='إقفال العهدة بعد تصفير الرصيد والتسوية') then raise exception 'PETTY_CLOSE_AUDIT_MISSING'; end if;

 begin
  perform public.aqari_operations_register(w,'petty_cash','entry',jsonb_build_object(
   'id',fund_id,'entry_id','76770000-0000-4000-8000-000000000013','kind','fund','amount','1.000','reason','يجب رفض الحركة بعد الإقفال'
  ));
  raise exception 'CLOSED_FUND_ACCEPTED_ENTRY';
 exception when check_violation then
  if sqlerrm<>'PETTY_CASH_FUND_NOT_OPEN' then raise; end if;
 end;
end $$;
reset role;

-- Simulate a legacy incomplete spend row: invoice approval exists but its document
-- evidence is missing. New close guard must fail closed instead of hiding the gap.
insert into private.aqari_petty_cash_funds(id,workspace_id,custodian_id,name,ceiling,balance,status,revision)
values ('76770000-0000-4000-8000-000000000020',current_setting('petty.w')::uuid,'76770000-0000-4000-8000-000000000001','عهدة دليل ناقص',50,0,'open',1);
insert into private.aqari_petty_cash_entries(id,workspace_id,fund_id,kind,amount,balance_after,invoice_id,approved_by,approved_at,document_id,actor_id,snapshot)
values ('76770000-0000-4000-8000-000000000021',current_setting('petty.w')::uuid,'76770000-0000-4000-8000-000000000020','spend',1,0,'INV-LEGACY-1','76770000-0000-4000-8000-000000000001',now(),null,'76770000-0000-4000-8000-000000000001','{}');

set local role authenticated;
do $$begin
 begin
  perform public.aqari_petty_cash_close(current_setting('petty.w')::uuid,'76770000-0000-4000-8000-000000000020',1,'رفض إقفال مصروف بلا مستند');
  raise exception 'INCOMPLETE_SPEND_FUND_CLOSED';
 exception when check_violation then
  if sqlerrm<>'PETTY_CASH_SPEND_EVIDENCE_INCOMPLETE' then raise; end if;
 end;
end $$;
reset role;

rollback;
select count(*)::int as fixture_workspaces_remaining
from public.aqari_workspaces
where id='76770000-0000-4000-8000-000000000099';
select 'PASS: ceiling-funded cash settled to zero; nonzero close rejected; audited closure metadata persisted; post-close entries rejected; incomplete spend evidence blocks closure; transaction rolled back';
