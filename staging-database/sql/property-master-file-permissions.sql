-- AQARI V267: permission-scoped Complete Property File overlay.
-- Apply after property-master-file.sql. The property shell is readable with property access,
-- but each sensitive section is populated only when its own section permission is active.
begin;
create or replace function public.aqari_property_full_file(p_workspace_id uuid,p_property_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;month_start date;year_start date;
 can_contracts boolean;can_collections boolean;can_finance boolean;can_employees boolean;can_maintenance boolean;can_documents boolean;can_notifications boolean;
 month_income numeric;year_income numeric;month_expenses numeric;year_expenses numeric;units jsonb;contracts jsonb;collections jsonb;expenses jsonb;docs jsonb;audit_rows jsonb;channels jsonb;notices jsonb;
 arrears_amount numeric;arrears_count bigint;employee_count bigint;payroll_count bigint;payroll_paid numeric;maintenance_count bigint;utility_month numeric;utility_year numeric;
begin
 if p_as_of is null or not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 month_start:=date_trunc('month',p_as_of)::date;year_start:=date_trunc('year',p_as_of)::date;
 can_contracts:=private.aqari_can(p_workspace_id,'contracts','read');
 can_collections:=private.aqari_can(p_workspace_id,'collections','read');
 can_finance:=private.aqari_can(p_workspace_id,'finance','read');
 can_employees:=private.aqari_can(p_workspace_id,'employees','read');
 can_maintenance:=private.aqari_can(p_workspace_id,'maintenance','read');
 can_documents:=private.aqari_can(p_workspace_id,'documents','read');
 can_notifications:=private.aqari_can(p_workspace_id,'notifications','read');

 select coalesce(jsonb_agg(private.aqari_unit_master_snapshot(p_workspace_id,u.id) order by u.unit_no),'[]'::jsonb) into units
 from public.aqari_units u where u.workspace_id=p_workspace_id and u.property_id=p_property_id;

 contracts:=null;arrears_amount:=null;arrears_count:=null;
 if can_contracts then
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contractNo',l.contract_no,'unitId',l.unit_id,'tenantId',l.tenant_id,'status',l.status,'startDate',l.start_date,'endDate',l.end_date,'monthlyRent',l.monthly_rent) order by l.start_date desc nulls last,l.contract_no) filter(where l.id is not null),'[]'::jsonb)
   into contracts from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   where l.workspace_id=p_workspace_id and u.property_id=p_property_id;
 end if;
 if can_contracts and can_collections then
  select coalesce(sum(greatest(d.balance,0)),0),count(*) filter(where d.balance>0) into arrears_amount,arrears_count
   from private.aqari_rent_due_periods d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   where d.workspace_id=p_workspace_id and u.property_id=p_property_id and d.period<=date_trunc('month',p_as_of)::date and d.balance>0;
 end if;

 collections:=null;month_income:=null;year_income:=null;
 if can_collections then
  select coalesce(sum(case when r.paid_at between month_start and p_as_of and c.payment_id is null then r.amount else 0 end),0),
         coalesce(sum(case when r.paid_at between year_start and p_as_of and c.payment_id is null then r.amount else 0 end),0),
         coalesce(jsonb_agg(jsonb_build_object('id',r.id,'reference',r.reference,'amount',r.amount,'paidAt',r.paid_at,'period',r.period,'status',case when c.payment_id is null then r.status else 'cancelled' end,'method',r.payment_method,'leaseId',r.lease_id) order by r.paid_at desc,r.created_at desc) filter(where r.id is not null),'[]'::jsonb)
   into month_income,year_income,collections
   from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   left join private.aqari_receipt_cancellations c on c.workspace_id=r.workspace_id and c.payment_id=r.id
   where r.workspace_id=p_workspace_id and u.property_id=p_property_id;
 end if;

 expenses:=null;month_expenses:=null;year_expenses:=null;utility_month:=null;utility_year:=null;
 if can_finance then
  select coalesce(sum(case when e.state='approved' and e.expense_date between month_start and p_as_of then e.amount else 0 end),0),
         coalesce(sum(case when e.state='approved' and e.expense_date between year_start and p_as_of then e.amount else 0 end),0),
         coalesce(jsonb_agg(jsonb_build_object('id',e.id,'date',e.expense_date,'category',e.category,'payee',e.payee,'amount',e.amount,'method',e.method,'reference',e.reference,'state',e.state,'voucherNo',e.voucher_no) order by e.expense_date desc,e.created_at desc) filter(where e.id is not null),'[]'::jsonb)
   into month_expenses,year_expenses,expenses from private.aqari_financial_expenses e where e.workspace_id=p_workspace_id and e.property_id=p_property_id;
  select coalesce(sum(amount_paid) filter(where payment_date between month_start and p_as_of),0),coalesce(sum(amount_paid) filter(where payment_date between year_start and p_as_of),0)
   into utility_month,utility_year from public.aqari_utility_entries where workspace_id=p_workspace_id and property_id=p_property_id and amount_paid is not null;
 end if;

 employee_count:=null;payroll_count:=null;payroll_paid:=null;
 if can_employees then
  select count(*) into employee_count from private.aqari_hr_employees h where h.workspace_id=p_workspace_id and p_property_id=any(h.property_ids) and h.status<>'inactive';
  select count(*),coalesce(sum(coalesce(pay.net,pay.basic+pay.allowances+pay.overtime+pay.reward+pay.housing+pay.indemnity+pay.holidays-pay.deductions-pay.advance_repayment-pay.loan_payment-pay.late-pay.absence)) filter(where pay.state='paid'),0)
   into payroll_count,payroll_paid from private.aqari_hr_payroll pay join private.aqari_hr_employees h on h.workspace_id=pay.workspace_id and h.id=pay.employee_id
   where pay.workspace_id=p_workspace_id and p_property_id=any(h.property_ids) and pay.month between year_start and date_trunc('month',p_as_of)::date;
 end if;

 maintenance_count:=null;if can_maintenance then select count(*) into maintenance_count from private.aqari_work_orders o where o.workspace_id=p_workspace_id and o.property_id=p_property_id and o.status<>'cancelled';end if;
 docs:=null;if can_documents then select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'no',d.document_no,'type',d.document_type,'title',d.title,'status',d.status,'uploadedAt',d.uploaded_at) order by d.created_at desc) filter(where d.id is not null),'[]'::jsonb) into docs from public.aqari_documents d join public.aqari_properties x on x.workspace_id=d.workspace_id and x.id=p_property_id where d.workspace_id=p_workspace_id and d.status<>'cancelled' and d.entity_ref in(p_property_id::text,x.external_ref);end if;
 channels:=null;notices:=null;if can_notifications then
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'publicUrl',c.public_url,'managementReference',c.management_reference,'tenantVisible',c.tenant_visible,'status',c.status) order by c.created_at) filter(where c.id is not null),'[]'::jsonb) into channels from private.aqari_property_channels c where c.workspace_id=p_workspace_id and c.property_id=p_property_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'title',n.title,'status',n.status,'publishedAt',n.published_at,'expiresAt',n.expires_at) order by n.created_at desc) filter(where n.id is not null),'[]'::jsonb) into notices from private.aqari_property_notices n where n.workspace_id=p_workspace_id and n.property_id=p_property_id;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entityType',a.entity_type,'unitId',a.unit_id,'action',a.action,'reason',a.reason,'actor',a.actor_name,'at',a.created_at) order by a.created_at desc) filter(where a.id is not null),'[]'::jsonb) into audit_rows from private.aqari_property_master_audit a where a.workspace_id=p_workspace_id and a.property_id=p_property_id;

 return jsonb_build_object(
  'workspace_id',p_workspace_id,'user_id',auth.uid(),'asOf',p_as_of,'property',p,'units',units,'contracts',contracts,'collections',collections,'expenses',expenses,'documents',docs,'audit',audit_rows,'channels',channels,'notices',notices,
  'permissions',jsonb_build_object('contracts',can_contracts,'collections',can_collections,'finance',can_finance,'employees',can_employees,'maintenance',can_maintenance,'documents',can_documents,'notifications',can_notifications),
  'summary',jsonb_build_object('units',jsonb_array_length(units),'contracts',case when contracts is null then null else jsonb_array_length(contracts) end,'arrearsCount',arrears_count,'arrearsAmount',arrears_amount,'employees',employee_count,'maintenance',maintenance_count),
  'finance',case when can_collections and can_finance then jsonb_build_object(
    'month',jsonb_build_object('income',month_income,'expenses',month_expenses,'net',month_income-month_expenses),
    'year',jsonb_build_object('income',year_income,'expenses',year_expenses,'net',year_income-year_expenses),
    'basis','actual non-cancelled rent payments minus approved property-linked financial expenses',
    'utilityPaidMonth',utility_month,'utilityPaidYear',utility_year,'utilityIncludedInNet',false,
    'linkedPayrollRows',payroll_count,'linkedPayrollPaid',payroll_paid,'payrollIncludedInNet',false,
    'payrollNote','Payroll is displayed only when employee permission exists and is not netted until an authoritative property allocation exists; this prevents double counting employees linked to multiple properties.'
   ) else null end
 );
end $$;
revoke all on function public.aqari_property_full_file(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_full_file(uuid,uuid,date) to authenticated;
commit;
