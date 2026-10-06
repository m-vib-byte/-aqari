-- Executes the complete entries/aggregation query from the installed statement.
-- Synthetic CTE rows only: no auth bypass, new accounts or business data writes.
begin;
do $test$
declare definition text;query text;q text;f record;actual record;
begin
 definition:=pg_get_functiondef('private.aqari_official_statement(uuid,uuid,date,date)'::regprocedure);
 query:='with entries as ('||split_part(split_part(definition,'with entries as (',2),';',1);
 if position('into opening,charges,payments,credits from entries' in query)=0 then raise exception 'STATEMENT_QUERY_CHANGED';end if;
 query:=replace(query,'into opening,charges,payments,credits from entries','from entries');
 query:=replace(query,'l.snapshot','''{}''::jsonb');
 query:=replace(query,'l.start_date','date ''2025-09-01''');
 query:=replace(query,'l.monthly_rent','90::numeric');
 query:=replace(query,'finish','date ''2025-09-30''');
 query:=replace(query,'from_date','date ''2025-09-01''');
 query:=replace(query,'to_date','date ''2025-09-30''');
 query:=regexp_replace(query,'\mw\M','1','g');
 query:=regexp_replace(query,'\mlid\M','1','g');
 query:=replace(query,'public.aqari_rent_payments','fixture_payments');
 query:=replace(query,'private.aqari_receipt_cancellations','fixture_cancellations');
 query:=replace(query,'private.aqari_tenant_adjustments','fixture_adjustments');
 query:=replace(query,'private.aqari_tenant_ledger_entries','fixture_ledger');
 query:=replace(query,'private.aqari_credit_allocations','fixture_allocations');
 query:=replace(query,'private.aqari_commercial_collection_reversals','fixture_reversals');
 query:=replace(query,'private.aqari_commercial_collections','fixture_commercial');
 for f in select * from (values
  ('paid',0::numeric,90::numeric,50::numeric,0::numeric),
  ('cancelled',0,90,0,0),('pending',0,90,0,0),('future',0,90,0,0),
  ('other_workspace',0,90,0,0),('other_lease',0,90,0,0),
  ('credit_adjustment',0,90,0,12),('debit_adjustment',0,102,0,0),
  ('ledger_credit',0,90,0,12),('ledger_debit',0,102,0,0),
  ('cancellation_ledger',0,90,0,0),('allocated_credit',0,90,0,12),
  ('commercial',0,90,50,0),('commercial_reversal',0,110,50,0),
  ('opening_payment',-50,90,0,0)
 ) x(name,opening,charges,payments,credits) loop
  q:=format($fixtures$
   with fixture_payments(id,workspace_id,lease_id,paid_at,amount,status) as (
    select 1,case when %1$L='other_workspace' then 2 else 1 end,
     case when %1$L='other_lease' then 2 else 1 end,
     case when %1$L='future' then date '2025-10-01' when %1$L='opening_payment' then date '2025-08-31' else date '2025-09-10' end,
     50::numeric,case when %1$L='pending' then 'pending' else 'paid' end
    where %1$L in ('paid','cancelled','pending','future','other_workspace','other_lease','opening_payment')
   ), fixture_cancellations(workspace_id,payment_id) as (select 1,1 where %1$L='cancelled'),
   fixture_adjustments(workspace_id,lease_id,occurred_on,direction,amount) as (
    select 1,1,date '2025-09-10',case when %1$L='debit_adjustment' then 'debit' else 'credit' end,12::numeric
    where %1$L in ('credit_adjustment','debit_adjustment')
   ), fixture_ledger(id,workspace_id,lease_id,occurred_on,direction,amount,kind) as (
    select 1,1,case when %1$L='allocated_credit' then null::integer else 1 end,date '2025-09-10',
     case when %1$L in ('ledger_debit','cancellation_ledger') then 'debit' else 'credit' end,12::numeric,
     case when %1$L='cancellation_ledger' then 'receipt_cancellation' else 'adjustment' end
    where %1$L in ('ledger_credit','ledger_debit','cancellation_ledger','allocated_credit')
   ), fixture_allocations(workspace_id,lease_id,credit_entry_id,period,amount) as (
    select 1,1,1,date '2025-09-10',12::numeric where %1$L='allocated_credit'
   ), fixture_commercial(id,workspace_id,lease_id,occurred_on,amount) as (
    select 1,1,1,date '2025-09-10',50::numeric where %1$L in ('commercial','commercial_reversal')
   ), fixture_reversals(workspace_id,collection_id,occurred_on,amount) as (
    select 1,1,date '2025-09-11',20::numeric where %1$L='commercial_reversal'
   ), result(opening,charges,payments,credits) as (%2$s) select * from result
  $fixtures$,f.name,query);
  execute q into actual;
  if (actual.opening,actual.charges,actual.payments,actual.credits) is distinct from (f.opening,f.charges,f.payments,f.credits) then
   raise exception 'STATEMENT_LEDGER_FAILED:% actual=% expected=%',f.name,row_to_json(actual),row_to_json(f);
  end if;
 end loop;
end $test$;
select '15 installed statement ledger fixtures passed' as result;
rollback;
