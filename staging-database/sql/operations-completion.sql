-- AQARI V267 operations completion schema.
-- CODE ONLY: apply later to the isolated staging project after review. Never apply directly to Production.
begin;

create table private.aqari_cheques(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null, cheque_no text not null, bank_name text not null,
 kind text not null check(kind in ('postdated','guarantee')),
 amount numeric(15,3) not null check(amount>0), due_on date not null,
 state text not null default 'scheduled' check(state in ('scheduled','deposited','returned','redeposited','cleared','settled','cancelled')),
 renewal_frozen boolean not null default false, revision integer not null default 1 check(revision>0),
 created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,bank_name,cheque_no)
);
create index aqari_cheques_due on private.aqari_cheques(workspace_id,due_on,state);

create table private.aqari_cheque_events(
 id uuid primary key, workspace_id uuid not null, cheque_id uuid not null,
 from_state text not null, to_state text not null, occurred_at timestamptz not null,
 bank_reference text not null default '', reason text not null default '',
 debt_adjustment numeric(15,3) not null default 0 check(debt_adjustment>=0),
 actor_id uuid not null, actor_name text not null, snapshot jsonb not null,
 unique(workspace_id,id), foreign key(workspace_id,cheque_id) references private.aqari_cheques(workspace_id,id),
 check(to_state not in ('deposited','returned','redeposited','cleared') or length(btrim(bank_reference))>=3)
);

create table private.aqari_vendors(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 name text not null check(length(btrim(name)) between 2 and 200), civil_or_license_no text not null default '',
 phone text not null default '', email text, status text not null default 'active' check(status in ('active','suspended','archived')),
 rating numeric(3,2) check(rating between 0 and 5), rating_basis text not null default '',
 revision integer not null default 1 check(revision>0), created_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,civil_or_license_no)
);

create table private.aqari_vendor_contracts(
 id uuid primary key, workspace_id uuid not null, vendor_id uuid not null, property_id uuid,
 contract_no text not null, starts_on date not null, ends_on date not null,
 service_kind text not null, amount numeric(15,3) not null check(amount>=0),
 status text not null default 'draft' check(status in ('draft','approved','active','expired','cancelled')),
 document_id uuid, approved_by uuid, approved_at timestamptz, revision integer not null default 1,
 foreign key(workspace_id,vendor_id) references private.aqari_vendors(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,contract_no), check(starts_on<=ends_on),
 check(status not in ('approved','active') or (approved_by is not null and approved_at is not null))
);
create index aqari_vendor_contract_expiry on private.aqari_vendor_contracts(workspace_id,ends_on,status);

create table private.aqari_work_orders(
 id uuid primary key, workspace_id uuid not null, property_id uuid not null,
 maintenance_request_id uuid, vendor_id uuid not null, vendor_contract_id uuid,
 order_no text not null, description text not null check(length(btrim(description)) between 3 and 5000),
 status text not null default 'draft' check(status in ('draft','approved','assigned','in_progress','completed','cancelled')),
 approved_amount numeric(15,3) not null check(approved_amount>=0),
 approved_by uuid, approved_at timestamptz, completed_at timestamptz,
 invoice_id text, invoice_amount numeric(15,3), expense_key text,
 revision integer not null default 1, created_by uuid not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,vendor_id) references private.aqari_vendors(workspace_id,id),
 foreign key(workspace_id,vendor_contract_id) references private.aqari_vendor_contracts(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,order_no), unique(workspace_id,expense_key),
 check(status not in ('approved','assigned','in_progress','completed') or (approved_by is not null and approved_at is not null)),
 check(invoice_amount is null or (status='completed' and invoice_id is not null and invoice_amount>0 and invoice_amount<=approved_amount))
);

create table private.aqari_legal_cases(
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null,
 case_no text not null, court text not null, kind text not null,
 status text not null default 'open' check(status in ('open','stayed','judgment','appeal','closed')),
 transactions_frozen boolean not null default true, opened_on date not null, closed_on date,
 summary text not null default '', revision integer not null default 1,
 created_by uuid not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,case_no), check(closed_on is null or closed_on>=opened_on),
 check(status<>'closed' or (closed_on is not null and transactions_frozen=false))
);

create table private.aqari_legal_case_events(
 id uuid primary key, workspace_id uuid not null, case_id uuid not null,
 kind text not null check(kind in ('hearing','filing','judgment','appeal','note','status_change')),
 occurs_at timestamptz not null, title text not null, details text not null default '',
 document_id uuid, actor_id uuid not null, created_at timestamptz not null default now(),
 unique(workspace_id,id), foreign key(workspace_id,case_id) references private.aqari_legal_cases(workspace_id,id)
);
create index aqari_legal_case_calendar on private.aqari_legal_case_events(workspace_id,occurs_at,kind);

create table private.aqari_legal_costs(
 id uuid primary key, workspace_id uuid not null, case_id uuid not null, lease_id uuid not null,
 amount numeric(15,3) not null check(amount>0), occurred_on date not null,
 kind text not null check(kind in ('court_fee','lawyer_fee','expert_fee','execution_fee','other')),
 charge_to_tenant boolean not null default false, legal_basis text not null default '',
 approved_by uuid not null, approved_at timestamptz not null, expense_key text not null,
 actor_id uuid not null, created_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,expense_key),
 foreign key(workspace_id,case_id) references private.aqari_legal_cases(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 check(not charge_to_tenant or length(btrim(legal_basis))>=5)
);

create table private.aqari_petty_cash_funds(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 custodian_id uuid not null, name text not null, ceiling numeric(15,3) not null check(ceiling>0),
 balance numeric(15,3) not null default 0 check(balance>=0 and balance<=ceiling),
 status text not null default 'open' check(status in ('open','suspended','closed')),
 revision integer not null default 1, unique(workspace_id,id), unique(workspace_id,custodian_id,name)
);
create table private.aqari_petty_cash_entries(
 id uuid primary key, workspace_id uuid not null, fund_id uuid not null,
 kind text not null check(kind in ('fund','spend','settle')),
 amount numeric(15,3) not null check(amount>0), balance_after numeric(15,3) not null check(balance_after>=0),
 invoice_id text, property_id uuid, approved_by uuid, approved_at timestamptz,
 actor_id uuid not null, created_at timestamptz not null default now(), snapshot jsonb not null,
 unique(workspace_id,id), foreign key(workspace_id,fund_id) references private.aqari_petty_cash_funds(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(kind<>'spend' or (invoice_id is not null and approved_by is not null and approved_at is not null))
);

create table private.aqari_commercial_terms(
 lease_id uuid primary key, workspace_id uuid not null, grace_days integer not null default 0 check(grace_days between 0 and 366),
 sales_percentage numeric(7,4) not null default 0 check(sales_percentage between 0 and 100),
 cam_amount numeric(15,3) not null default 0 check(cam_amount>=0),
 permitted_activity text not null, license_no text not null, license_expires_on date,
 compliance_reviewed_by uuid, compliance_reviewed_at timestamptz, compliance_reference text not null default '',
 revision integer not null default 1,
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,lease_id),
 check(compliance_reviewed_at is null or (compliance_reviewed_by is not null and length(btrim(compliance_reference))>=5))
);

create table private.aqari_common_charge_allocations(
 id uuid primary key, workspace_id uuid not null, property_id uuid not null,
 invoice_reference text not null, basis text not null check(basis in ('area','consumption')),
 total_amount numeric(15,3) not null check(total_amount>0), allocations jsonb not null check(jsonb_typeof(allocations)='array'),
 approved_by uuid not null, approved_at timestamptz not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,invoice_reference)
);

create table private.aqari_unit_inspections(
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null, unit_id uuid not null,
 kind text not null check(kind in ('move_in','periodic','renewal','move_out')),
 status text not null default 'draft' check(status in ('draft','signed','superseded')),
 inspected_at timestamptz not null, checklist jsonb not null check(jsonb_typeof(checklist)='array'),
 photo_document_ids jsonb not null default '[]' check(jsonb_typeof(photo_document_ids)='array'),
 tenant_signature_document_id uuid, inspector_signature_document_id uuid,
 signed_by uuid, signed_at timestamptz, revision integer not null default 1,
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),
 unique(workspace_id,id), check(status<>'signed' or (signed_by is not null and signed_at is not null))
);

create table private.aqari_tenant_year_ratings(
 workspace_id uuid not null, tenant_id uuid not null, rating_year integer not null check(rating_year between 2000 and 2200),
 stars integer not null check(stars between 0 and 4), rating text not null,
 quarter_evidence jsonb not null check(jsonb_typeof(quarter_evidence)='array'),
 calculated_at timestamptz not null, source_revision text not null,
 primary key(workspace_id,tenant_id,rating_year),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id)
);

create table private.aqari_property_channels(
 id uuid primary key, workspace_id uuid not null, property_id uuid not null,
 kind text not null check(kind in ('website','instagram','x','facebook','youtube','whatsapp','other')),
 public_url text not null check(public_url ~ '^https://'),
 management_reference text not null default '', tenant_visible boolean not null default false,
 status text not null default 'active' check(status in ('active','hidden','archived')),
 created_by uuid not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 unique(workspace_id,id), unique(workspace_id,property_id,kind,public_url),
 check(management_reference !~* '(password|secret|token|كلمة.?المرور)')
);

create table private.aqari_integration_outbox(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 event_type text not null, aggregate_id text not null, schema_version integer not null default 1,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 idempotency_key text not null, status text not null default 'pending' check(status in ('pending','sending','sent','failed','dead_letter')),
 attempts integer not null default 0 check(attempts between 0 and 20), available_at timestamptz not null default now(),
 provider_reference text, last_error text, created_at timestamptz not null default now(), delivered_at timestamptz,
 unique(workspace_id,id), unique(workspace_id,idempotency_key),
 check(not(payload ?| array['password','secret','token','civil_id','civilId']))
);

create table private.aqari_notification_deliveries(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 kind text not null, aggregate_id text not null, recipient_id uuid not null,
 channel text not null check(channel in ('email','whatsapp','sms','push')),
 scheduled_for timestamptz not null, status text not null default 'queued' check(status in ('queued','sending','delivered','read','failed','cancelled')),
 provider_reference text, attempts integer not null default 0 check(attempts between 0 and 20),
 last_error text, delivered_at timestamptz, read_at timestamptz, idempotency_key text not null,
 created_at timestamptz not null default now(), unique(workspace_id,id), unique(workspace_id,idempotency_key),
 check(read_at is null or delivered_at is not null)
);

do $$
declare table_name text;
begin
 foreach table_name in array array[
  'aqari_cheques','aqari_cheque_events','aqari_vendors','aqari_vendor_contracts',
  'aqari_work_orders','aqari_legal_cases','aqari_legal_case_events','aqari_legal_costs','aqari_petty_cash_funds',
  'aqari_petty_cash_entries','aqari_commercial_terms','aqari_common_charge_allocations','aqari_unit_inspections',
  'aqari_tenant_year_ratings','aqari_property_channels','aqari_integration_outbox','aqari_notification_deliveries'
 ] loop
  execute format('alter table private.%I enable row level security',table_name);
  execute format('revoke all on private.%I from public,anon,authenticated',table_name);
 end loop;
end $$;

create function private.aqari_reject_immutable_change() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_LEDGER_ENTRY' using errcode='23514'; end $$;
revoke all on function private.aqari_reject_immutable_change() from public,anon,authenticated;

create trigger aqari_cheque_events_immutable before update or delete on private.aqari_cheque_events
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_legal_costs_immutable before update or delete on private.aqari_legal_costs
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_petty_cash_entries_immutable before update or delete on private.aqari_petty_cash_entries
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_charge_allocations_immutable before update or delete on private.aqari_common_charge_allocations
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_outbox_immutable before delete on private.aqari_integration_outbox
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_delivery_immutable before delete on private.aqari_notification_deliveries
 for each row execute function private.aqari_reject_immutable_change();

create function public.aqari_operations_health(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id)
 then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 return jsonb_build_object(
  'closed_financial_periods',(select count(*) from private.aqari_financial_periods where workspace_id=p_workspace_id),
  'open_cheques',(select count(*) from private.aqari_cheques where workspace_id=p_workspace_id and state not in ('cleared','settled','cancelled')),
  'active_vendor_contracts',(select count(*) from private.aqari_vendor_contracts where workspace_id=p_workspace_id and status='active'),
  'open_work_orders',(select count(*) from private.aqari_work_orders where workspace_id=p_workspace_id and status not in ('completed','cancelled')),
  'open_legal_cases',(select count(*) from private.aqari_legal_cases where workspace_id=p_workspace_id and status<>'closed'),
  'pending_integrations',(select count(*) from private.aqari_integration_outbox where workspace_id=p_workspace_id and status in ('pending','failed')),
  'failed_notifications',(select count(*) from private.aqari_notification_deliveries where workspace_id=p_workspace_id and status='failed')
 );
end $$;
revoke all on function public.aqari_operations_health(uuid) from public,anon,authenticated;
grant execute on function public.aqari_operations_health(uuid) to authenticated;

commit;
