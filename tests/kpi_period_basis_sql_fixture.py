# Generate read-only fixtures from the exact candidate KPI query. Run from repository root.
from pathlib import Path
s=Path('staging-database/sql/kpi-period-basis.sql').read_text();query=s[s.index(' with periods as ('):s.index(' select coalesce(sum(e.amount)')].strip().removesuffix(';').replace('into period_expected,period_paid from matched','from matched');query=query.replace('coalesce(sum(due_amount),0),coalesce(sum(paid_amount),0)','coalesce(sum(due_amount),0) expected,coalesce(sum(paid_amount),0) paid');query=query.replace('public.aqari_leases','fixture_leases').replace('public.aqari_rent_payments','fixture_payments').replace('private.aqari_receipt_cancellations','fixture_cancellations');w="'00000000-0000-0000-0000-000000000001'::uuid"
cases=[('single_full','2026-01-01','2026-01-31',350,[(1,350,'2026-01-01','2026-01-02','paid')],False,[],350,350),('two_full','2026-01-01','2026-02-28',350,[(1,350,'2026-01-01','2026-01-02','paid'),(2,350,'2026-02-01','2026-02-02','paid')],False,[],700,700),('partial','2026-01-01','2026-02-28',350,[(1,350,'2026-01-01','2026-01-02','paid'),(2,175,'2026-02-01','2026-02-02','partial')],False,[],700,525),('free_month','2026-01-01','2026-02-28',350,[(1,350,'2026-02-01','2026-02-02','paid')],True,[],350,350),('cancelled','2026-01-01','2026-02-28',350,[(1,350,'2026-01-01','2026-01-02','paid'),(2,350,'2026-02-01','2026-02-02','paid')],False,[2],700,350),('future_payment','2026-01-01','2026-01-31',350,[(1,350,'2026-01-01','2026-02-02','paid')],False,[],350,0),('other_month','2026-02-01','2026-02-28',350,[(1,350,'2026-01-01','2026-02-02','paid')],False,[],350,0),('zero_due','2026-01-01','2026-01-31',350,[(1,0,'2026-01-01','2026-01-02','paid')],True,[],0,0),('due_date_filter','2026-01-15','2026-02-28',350,[(1,350,'2026-01-01','2026-01-20','paid'),(2,350,'2026-02-01','2026-02-02','paid')],False,[],350,350)]
parts=[]
for name,start,end,rent,payments,free,cancel,exp,paid in cases:
 snapshot='{"rentalTermsVersion":"1","rent":350,"freeMonthApproved":'+str(free).lower()+',"freeMonthPeriod":"2026-01"}'
 rows=','.join(f"({i},{w},1,{a}::numeric,date '{period}',date '{date}','{status}')" for i,a,period,date,status in payments)
 cancelrows=','.join(f'({w},{i})' for i in cancel) or f'({w},-1)'
 ctes=f"fixture_leases as (select 1 id,{w} workspace_id,date '2026-01-01' start_date,date '2026-12-31' end_date,'signed' status,{rent}::numeric monthly_rent,'{snapshot}'::jsonb snapshot),fixture_payments(id,workspace_id,lease_id,amount,period,paid_at,status) as (values {rows}),fixture_cancellations(workspace_id,payment_id) as (values {cancelrows}),"
 q=query.replace('with periods as (','with '+ctes+'periods as (').replace('from_date',f"date '{start}'").replace('to_date',f"date '{end}'")
 import re
 q=re.sub(r'\bw\b',w,q)
 parts.append(f"select '{name}' as test, expected,paid,case when expected=0 then null else round(paid/expected*100,2) end rate, expected={exp} and paid={paid} as passed from ({q}) result")
print('\nunion all\n'.join(parts)+';')
