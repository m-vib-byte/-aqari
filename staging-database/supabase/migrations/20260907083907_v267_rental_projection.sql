-- TARGET: djkpkkgoibruaezdrchb ONLY. No production migration or data import.
create extension if not exists btree_gist with schema extensions;
create function private.aqari_staff(w uuid) returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active) $$;
grant usage on schema private to authenticated;
revoke all on function private.aqari_staff(uuid) from public,anon;
grant execute on function private.aqari_staff(uuid) to authenticated;
create table public.aqari_properties(id uuid primary key,workspace_id uuid not null references public.aqari_workspaces,external_ref text not null,name text not null,metadata jsonb not null,unique(workspace_id,external_ref),unique(workspace_id,id));
create table public.aqari_tenants(id uuid primary key,workspace_id uuid not null references public.aqari_workspaces,external_ref text not null,full_name text not null,civil_id text not null check(civil_id ~ '^\d{12}$'),phone text not null,email text,profile jsonb not null,is_active boolean not null default true,unique(workspace_id,external_ref),unique(workspace_id,civil_id),unique(workspace_id,phone),unique(workspace_id,id));
create unique index aqari_tenant_email_unique on public.aqari_tenants(workspace_id,lower(email)) where nullif(email,'') is not null;
create table public.aqari_units(id uuid primary key,workspace_id uuid not null,property_id uuid not null,unit_no text not null,foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),unique(workspace_id,property_id,unit_no),unique(workspace_id,id));
create table public.aqari_leases(id uuid primary key,workspace_id uuid not null,external_ref text not null,tenant_id uuid not null,unit_id uuid not null,contract_no text not null,start_date date not null,end_date date not null,monthly_rent numeric(15,3) not null check(monthly_rent>0),deposit numeric(15,3) not null check(deposit>=0),status text not null check(status in ('draft','ready','approved','signing','signed','cancelled','expired')),snapshot jsonb not null,check(end_date>=start_date),foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id),foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),unique(workspace_id,external_ref),unique(workspace_id,contract_no),unique(workspace_id,id),exclude using gist(workspace_id with =,unit_id with =,daterange(start_date,end_date,'[]') with &&) where(status <> 'cancelled'));
create table public.aqari_rent_payments(id uuid primary key,workspace_id uuid not null,lease_id uuid not null,reference text not null,amount numeric(15,3) not null check(amount>0),period date not null,paid_at date not null,status text not null,payment_method text not null,record jsonb not null,receipt jsonb not null,created_at timestamptz not null default now(),foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),unique(workspace_id,reference));
create table public.aqari_portal_accounts(user_id uuid primary key references auth.users,workspace_id uuid not null,tenant_id uuid not null,is_active boolean not null default true,foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id),unique(workspace_id,tenant_id));
create table public.aqari_notification_outbox(id uuid primary key default gen_random_uuid(),workspace_id uuid not null,lease_id uuid not null,period date not null,kind text not null check(kind in ('rent_reminder','payment_thanks')),channel text not null check(channel in ('email','whatsapp')),status text not null default 'awaiting_configuration' check(status in ('awaiting_configuration','queued','sending','sent','failed','cancelled')),scheduled_at timestamptz not null default now(),idempotency_key text not null,foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),unique(workspace_id,idempotency_key));
create table public.aqari_operation_audit(id bigint generated always as identity primary key,workspace_id uuid not null references public.aqari_workspaces,user_id uuid not null,action text not null,revision bigint not null,created_at timestamptz not null default now());
alter table public.aqari_portal_accounts enable row level security;
create policy portal_self on public.aqari_portal_accounts for select to authenticated using(user_id=(select auth.uid()) and is_active);
revoke all on public.aqari_portal_accounts from public,anon,authenticated;
grant select on public.aqari_portal_accounts to authenticated;
create function private.aqari_owns_tenant(w uuid,t uuid) returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.aqari_portal_accounts where user_id=auth.uid() and workspace_id=w and tenant_id=t and is_active) $$;
revoke all on function private.aqari_owns_tenant(uuid,uuid) from public,anon;
grant execute on function private.aqari_owns_tenant(uuid,uuid) to authenticated;
do $$ declare t text; begin foreach t in array array['aqari_properties','aqari_units','aqari_tenants','aqari_leases','aqari_rent_payments','aqari_notification_outbox','aqari_operation_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy staff_read on public.%I for select to authenticated using(private.aqari_staff(workspace_id))',t);
 end loop;end $$;
create policy tenant_self on public.aqari_tenants for select to authenticated using(private.aqari_owns_tenant(workspace_id,id));
create policy tenant_lease on public.aqari_leases for select to authenticated using(private.aqari_owns_tenant(workspace_id,tenant_id));
create policy tenant_payment on public.aqari_rent_payments for select to authenticated using(exists(select 1 from public.aqari_leases l where l.id=lease_id and private.aqari_owns_tenant(l.workspace_id,l.tenant_id)));

-- One transaction: compatibility state and operational tables either both save or neither saves.
create function private.aqari_v267_project_state() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb;old_d jsonb;r jsonb;c jsonb;p jsonb;row_data jsonb;receipt_data jsonb;role_name text;prop_id uuid;tenant_ref uuid;unit_ref uuid;lease_ref uuid;payment_ref uuid;rent_value numeric;paid_sum numeric;key_name text;source_ref text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501';end if;
 select role::text into role_name from public.aqari_memberships where workspace_id=new.workspace_id and user_id=auth.uid() and is_active;
 if role_name is null or role_name not in ('general_manager','property_manager','accountant') then raise exception 'WRITE_DENIED' using errcode='42501';end if;
 d:=case when new.payload->>'format'='aqari-cloud-state-v1' then new.payload#>'{snapshot,values,aqari_v30}' when new.payload->>'schema'='aqari-local-snapshot-v1' then new.payload#>'{values,aqari_v30}' else new.payload end;
 old_d:=case when old.payload->>'format'='aqari-cloud-state-v1' then old.payload#>'{snapshot,values,aqari_v30}' when old.payload->>'schema'='aqari-local-snapshot-v1' then old.payload#>'{values,aqari_v30}' else old.payload end;
 if jsonb_typeof(d)<>'object' then raise exception 'INVALID_STATE';end if;
 foreach key_name in array array['properties','tenantProfilesV267','contractsV202','rentLedgerV202','collections','rentReceiptsV267'] loop
  if jsonb_typeof(coalesce(d->key_name,'[]'))<>'array' then raise exception 'INVALID_ARRAY:%',key_name;end if;
  if role_name='accountant' and key_name in ('properties','tenantProfilesV267','contractsV202') and coalesce(d->key_name,'[]')<>coalesce(old_d->key_name,'[]') then raise exception 'ACCOUNTANT_RESTRICTED' using errcode='42501';end if;
 end loop;
 -- Sensitive historical records remain present; use dedicated cancellation workflows later.
 if exists(select 1 from public.aqari_tenants t where t.workspace_id=new.workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) p where p->>'id'=t.external_ref)) then raise exception 'TENANT_HISTORY_REQUIRED';end if;
 if exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'contractsV202','[]')) c where c->>'id'=l.external_ref)) then raise exception 'LEASE_HISTORY_REQUIRED';end if;
 for r in select value from jsonb_array_elements(coalesce(d->'properties','[]')) loop
  if jsonb_typeof(r)<>'array' or nullif(btrim(r->>0),'') is null then raise exception 'INVALID_PROPERTY';end if;
  prop_id:=md5(new.workspace_id::text||':property:'||btrim(r->>0))::uuid;
  insert into public.aqari_properties values(prop_id,new.workspace_id,btrim(r->>0),btrim(r->>0),r) on conflict(id) do update set metadata=excluded.metadata;
 end loop;
 for p in select value from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) loop
  if nullif(p->>'id','') is null or nullif(p->>'nameAr','') is null or nullif(p->>'nameEn','') is null or nullif(p->>'nationality','') is null or coalesce(p->>'phone','') !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID_PROFILE';end if;
  tenant_ref:=md5(new.workspace_id::text||':tenant:'||(p->>'id'))::uuid;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values(tenant_ref,new.workspace_id,p->>'id',p->>'nameAr',p->>'civilId',p->>'phone',nullif(lower(btrim(p->>'email')),''),p) on conflict(id) do update set full_name=excluded.full_name,civil_id=excluded.civil_id,phone=excluded.phone,email=excluded.email,profile=excluded.profile;
 end loop;
 for c in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  if c->>'source' is distinct from 'v267-cloud' then raise exception 'IMPORTED_CONTRACT_REVIEW_REQUIRED';end if;
  select id into prop_id from public.aqari_properties where workspace_id=new.workspace_id and name=c->>'property';
  select id into tenant_ref from public.aqari_tenants where workspace_id=new.workspace_id and external_ref=c->>'tenantId' and full_name=c->>'tenant';
  if prop_id is null or tenant_ref is null or nullif(c->>'unit','') is null or nullif(c->>'id','') is null then raise exception 'CONTRACT_LINK_REQUIRED';end if;
  unit_ref:=md5(prop_id::text||':unit:'||translate(c->>'unit','٠١٢٣٤٥٦٧٨٩','0123456789'))::uuid;
  insert into public.aqari_units values(unit_ref,new.workspace_id,prop_id,translate(c->>'unit','٠١٢٣٤٥٦٧٨٩','0123456789')) on conflict(id) do nothing;
  lease_ref:=md5(new.workspace_id::text||':lease:'||(c->>'id'))::uuid;
  if exists(select 1 from public.aqari_leases l where l.id=lease_ref and (l.tenant_id<>tenant_ref or l.unit_id<>unit_ref or l.contract_no<>c->>'contract_no')) then raise exception 'LEASE_LINK_IMMUTABLE';end if;
  insert into public.aqari_leases values(lease_ref,new.workspace_id,c->>'id',tenant_ref,unit_ref,c->>'contract_no',(c->>'start_date')::date,(c->>'end_date')::date,(c->>'rent')::numeric,coalesce((c->>'deposit')::numeric,0),c->>'status',c) on conflict(id) do update set start_date=excluded.start_date,end_date=excluded.end_date,monthly_rent=excluded.monthly_rent,deposit=excluded.deposit,status=excluded.status,snapshot=excluded.snapshot;
 end loop;
 -- Missing/changed payment or receipt is forbidden, including direct JSON-state writers.
 for r in select * from jsonb_array_elements(coalesce(old_d->'rentLedgerV202','[]')) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) p where p=r) then raise exception 'PAYMENT_IMMUTABLE';end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(old_d->'rentReceiptsV267','[]')) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(d->'rentReceiptsV267','[]')) p where p=r) then raise exception 'RECEIPT_IMMUTABLE';end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) loop
  source_ref:=nullif(r->>'receiptNo','');
  if source_ref is null or (r->>'paid')::numeric<=0 or (r->>'paid')::numeric<>round((r->>'paid')::numeric,3) then raise exception 'INVALID_PAYMENT';end if;
  if r->>'status' not in ('مدفوع','جزئي','paid','partial') then raise exception 'UNCONFIRMED_PAYMENT';end if;
  if exists(select 1 from public.aqari_rent_payments where workspace_id=new.workspace_id and reference=source_ref) then
   if (select count(*) from jsonb_array_elements(coalesce(d->'collections','[]')) x where x->>0=source_ref)<>1 or not exists(select 1 from public.aqari_rent_payments saved where saved.workspace_id=new.workspace_id and saved.reference=source_ref and saved.record=r and exists(select 1 from jsonb_array_elements(d->'collections') x where x=saved.receipt->'record')) then raise exception 'SAVED_PAYMENT_CHANGED';end if;
   continue;
  end if;
  select l.id,l.monthly_rent into lease_ref,rent_value from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id join public.aqari_units u on u.id=l.unit_id join public.aqari_properties p on p.id=u.property_id where l.workspace_id=new.workspace_id and l.external_ref=r->>'contractId' and l.contract_no=r->>'contractNo' and t.full_name=r->>'tenant' and u.unit_no=r->>'unit' and p.name=r->>'property' and l.status='signed' and to_char(l.start_date,'YYYY-MM')<=r->>'period' and to_char(l.end_date,'YYYY-MM')>=r->>'period';
  if lease_ref is null then raise exception 'ACTIVE_SAVED_CONTRACT_REQUIRED';end if;
  if (select count(*) from jsonb_array_elements(coalesce(d->'collections','[]')) x where x->>0=source_ref)<>1 or (select count(*) from jsonb_array_elements(coalesce(d->'rentLedgerV202','[]')) x where x->>'receiptNo'=source_ref)<>1 or (select count(*) from jsonb_array_elements(coalesce(d->'rentReceiptsV267','[]')) x where x->>'id'=source_ref)<>1 then raise exception 'UNIQUE_RECEIPT_REQUIRED';end if;
  select x into row_data from jsonb_array_elements(d->'collections') x where x->>0=source_ref;
  select x into receipt_data from jsonb_array_elements(d->'rentReceiptsV267') x where x->>'id'=source_ref;
  if (row_data->>2)::numeric<>(r->>'paid')::numeric or row_data->>1<>r->>'tenant' or row_data->>4<>r->>'property' or row_data->>5<>r->>'paidAt' or row_data->>6<>r->>'unit' or row_data->>8<>r->>'period' or receipt_data->'record' is distinct from row_data or receipt_data#>>'{contract,id}' is distinct from r->>'contractId' or receipt_data->>'template' is distinct from 'rent-voucher-v267-1' then raise exception 'RECEIPT_LINK_MISMATCH';end if;
  payment_ref:=md5(new.workspace_id::text||':payment:'||source_ref)::uuid;
  insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values(payment_ref,new.workspace_id,lease_ref,source_ref,(r->>'paid')::numeric,((r->>'period')||'-01')::date,(r->>'paidAt')::date,r->>'status',r->>'method',r,receipt_data) on conflict(id) do nothing;
  select coalesce(sum(amount),0) into paid_sum from public.aqari_rent_payments where workspace_id=new.workspace_id and lease_id=lease_ref and period=((r->>'period')||'-01')::date;
  if paid_sum>rent_value then raise exception 'PAYMENT_EXCEEDS_PERIOD_BALANCE';end if;
  if paid_sum=rent_value then
   update public.aqari_notification_outbox set status='cancelled' where workspace_id=new.workspace_id and lease_id=lease_ref and period=((r->>'period')||'-01')::date and kind='rent_reminder' and status in ('queued','awaiting_configuration');
   insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,idempotency_key) values(new.workspace_id,lease_ref,((r->>'period')||'-01')::date,'payment_thanks','email','thanks:'||lease_ref::text||':'||(r->>'period')) on conflict(workspace_id,idempotency_key) do nothing;
  end if;
 end loop;
 if jsonb_array_length(coalesce(d->'collections','[]'))<>jsonb_array_length(coalesce(d->'rentLedgerV202','[]')) then raise exception 'UNLINKED_COLLECTION';end if;
 insert into public.aqari_operation_audit(workspace_id,user_id,action,revision) values(new.workspace_id,auth.uid(),'saved_and_projected',new.revision);
 return new;
end $$;
revoke all on function private.aqari_v267_project_state() from public,anon,authenticated;
create trigger aqari_v267_project_state after update of payload on public.aqari_app_state for each row execute function private.aqari_v267_project_state();
