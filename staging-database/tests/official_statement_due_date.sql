-- Read-only fixtures execute the charge SELECT extracted from the installed function.
-- No users, JWTs, business rows, document numbers or persistent test objects.
begin;
do $test$
declare definition text;charge_query text;q text;c jsonb;f record;opening numeric;charges numeric;
base jsonb:='{"rentalTermsVersion":1,"rent":90,"contractRent":100,"start_date":"2025-09-01","end_date":"2026-12-31","freeMonthApproved":false,"rentAdjustments":[],"rentEntitlement":{"version":1,"startDate":"2025-09-20","firstPeriodPolicy":"daily_prorated","manualFirstPeriodAmount":null}}';
begin
 definition:=pg_get_functiondef('private.aqari_official_statement(uuid,uuid,date,date)'::regprocedure);
 charge_query:=split_part(split_part(definition,'with entries as (',2),'union all select p.paid_at',1);
 if charge_query='' then raise exception 'STATEMENT_TEST_SOURCE_CHANGED';end if;
 for f in select * from (values
  ('before_due','2025-09-01','2025-09-19','daily_prorated',false,false,0::numeric,0::numeric),
  ('on_due','2025-09-01','2025-09-20','daily_prorated',false,false,0,33),
  ('due_as_start','2025-09-20','2025-09-30','daily_prorated',false,false,0,33),
  ('next_month','2025-10-01','2025-10-31','daily_prorated',false,false,33,90),
  ('manual_first','2025-09-01','2025-09-20','manual_first_period',false,false,0,17.125),
  ('full_first','2025-09-01','2025-09-20','full_month',false,false,0,90),
  ('free_first','2025-09-01','2025-09-20','daily_prorated',true,false,0,0),
  ('legacy','2025-09-01','2025-09-19','daily_prorated',false,true,0,90)
 ) as x(name,from_date,to_date,policy,free,legacy,expected_opening,expected_charges) loop
  c:=jsonb_set(base,'{rentEntitlement,firstPeriodPolicy}',to_jsonb(f.policy));
  if f.policy='manual_first_period' then c:=jsonb_set(c,'{rentEntitlement,manualFirstPeriodAmount}','17.125');end if;
  if f.free then c:=c||'{"freeMonthApproved":true,"freeMonthPeriod":"2025-09"}';end if;
  if f.legacy then c:=c-'rentEntitlement';end if;
  q:=replace(charge_query,'l.snapshot',format('%L::jsonb',c));
  q:=replace(q,'l.start_date','date ''2025-09-01''');
  q:=replace(q,'l.monthly_rent','90::numeric');
  q:=replace(q,'finish',format('%L::date',f.to_date));
  execute format('select coalesce(sum(amount) filter(where on_date<%L::date),0),coalesce(sum(amount) filter(where on_date between %L::date and %L::date),0) from (%s) entries',f.from_date,f.from_date,f.to_date,q) into opening,charges;
  if opening<>f.expected_opening or charges<>f.expected_charges then
   raise exception 'STATEMENT_DATE_CASE_FAILED:% opening=% charges=% expected_opening=% expected_charges=%',f.name,opening,charges,f.expected_opening,f.expected_charges;
  end if;
 end loop;
end $test$;
select '8 statement charge/date fixtures passed' as result;
rollback;
