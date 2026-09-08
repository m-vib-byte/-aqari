-- Nullable fields are permitted only for server-imported, unreviewed source records.
alter table public.aqari_tenants add column import_source jsonb;
alter table public.aqari_tenants alter column full_name drop not null;
alter table public.aqari_tenants alter column civil_id drop not null;
alter table public.aqari_tenants alter column phone drop not null;
alter table public.aqari_tenants add constraint tenant_required_or_import check(import_source is not null or (full_name is not null and civil_id is not null and phone is not null));
alter table public.aqari_leases add column import_source jsonb;
alter table public.aqari_leases alter column start_date drop not null;
alter table public.aqari_leases alter column end_date drop not null;
alter table public.aqari_leases alter column deposit drop not null;
alter table public.aqari_leases add constraint lease_required_or_import check((start_date is not null and end_date is not null and deposit is not null) or (import_source is not null and status='draft'));

create table public.aqari_statement_links(
 workspace_id uuid not null, property_id uuid not null, period date not null, unit_no text not null,
 tenant_id uuid not null, lease_id uuid not null, source_sha256 text not null,
 linked_by uuid not null references auth.users, linked_at timestamptz not null default now(),
 primary key(workspace_id,property_id,period,unit_no),
 foreign key(workspace_id,property_id,period) references public.aqari_property_statements(workspace_id,property_id,period),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
);
alter table public.aqari_statement_links enable row level security;
revoke all on public.aqari_statement_links from public,anon,authenticated;
grant select on public.aqari_statement_links to authenticated;
create policy statement_link_read on public.aqari_statement_links for select to authenticated using(private.aqari_can(workspace_id,'tenants','read') and private.aqari_can(workspace_id,'contracts','read') and private.aqari_can(workspace_id,'properties','read'));

create function private.aqari_source_date(v text) returns date language plpgsql immutable security invoker set search_path='' as $$
declare bits text[];begin
 if v is null or v !~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then return null;end if;
 bits:=string_to_array(v,'/');return make_date(bits[3]::integer,bits[2]::integer,bits[1]::integer);
 exception when datetime_field_overflow then return null;
end $$;
revoke all on function private.aqari_source_date(text) from public,anon,authenticated;

create function public.aqari_link_property_statement(p_workspace_id uuid,p_property_id uuid,p_period date,p_source_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare st public.aqari_property_statements%rowtype; saved public.aqari_app_state%rowtype; d jsonb; r jsonb; prof jsonb; con jsonb; prov jsonb;
 t_id uuid;l_id uuid;u_id uuid;profile_ref text;contract_ref text;identity_key text;raw_phone text;valid_phone text;valid_civil text;display_name text;start_on date;end_on date;linked integer:=0;new_profiles integer:=0;new_leases integer:=0;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'tenants','write') or not private.aqari_can(p_workspace_id,'contracts','write') or not private.aqari_can(p_workspace_id,'properties','write') then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
 select * into strict st from public.aqari_property_statements where workspace_id=p_workspace_id and property_id=p_property_id and period=p_period;
 if st.source_sha256 is distinct from p_source_sha256 or st.content->>'property_key'<>'shaikhah-tower' then raise exception 'SOURCE_MISMATCH';end if;
 select * into strict saved from public.aqari_app_state where workspace_id=p_workspace_id for update;
 d:=private.aqari_unwrap(saved.payload);
 if not exists(select 1 from jsonb_array_elements(coalesce(d->'properties','[]')) x where x->>0=st.content->>'property_name') then
  d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||jsonb_build_array(jsonb_build_array(st.content->>'property_name','غير مدون',jsonb_array_length(st.content->'rows'),st.content#>'{summary,printed_totals,rent_kd}')));
 end if;
 for r in select value from jsonb_array_elements(st.content->'rows') loop
  if exists(select 1 from public.aqari_statement_links where workspace_id=p_workspace_id and property_id=p_property_id and period=p_period and unit_no=r->>'unit') then linked:=linked+1;continue;end if;
  select id into strict u_id from public.aqari_units where workspace_id=p_workspace_id and property_id=p_property_id and unit_no=r->>'unit';
  raw_phone:=nullif(r->>'phone_raw',''); valid_phone:=case when raw_phone ~ '^[+]?[0-9]{8,15}$' then raw_phone else null end;
  valid_civil:=case when r->>'civil_id_raw' ~ '^[0-9]{12}$' then r->>'civil_id_raw' else null end;
  identity_key:=md5(coalesce(r->>'civil_id_raw','')||':'||coalesce(raw_phone,'')||':'||coalesce(r->>'name_en_raw',''));
  profile_ref:='source:'||p_property_id::text||':tenant:'||identity_key;
  t_id:=md5(p_workspace_id::text||':tenant:'||profile_ref)::uuid;
  display_name:=nullif(r->>'name_en_raw','');
  prov:=jsonb_build_object('property_id',p_property_id,'period',p_period,'source_sha256',st.source_sha256,'contact_page',r->'contact_source_page','financial_page',r->'financial_source_page','linked_by',auth.uid());
  if not exists(select 1 from public.aqari_tenants where workspace_id=p_workspace_id and id=t_id) then
   if exists(select 1 from public.aqari_tenants where workspace_id=p_workspace_id and ((valid_civil is not null and civil_id=valid_civil) or (valid_phone is not null and phone=valid_phone))) then raise exception 'TENANT_IDENTITY_REVIEW_REQUIRED';end if;
   prof:=jsonb_build_object('id',profile_ref,'nameAr','','nameEn',coalesce(display_name,''),'civilId',coalesce(valid_civil,''),'phone',coalesce(valid_phone,''),'email','','nationality',coalesce(r->>'nationality_raw',''),'address','','attachments','[]'::jsonb,'source','statement-import','importStatus','source_saved','sourceValues',r,'sourceReference',prov);
   insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile,import_source) values(t_id,p_workspace_id,profile_ref,display_name,valid_civil,valid_phone,null,prof,prov);
   d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(prof));
   d:=jsonb_set(d,'{tenants}',coalesce(d->'tenants','[]')||jsonb_build_array(jsonb_build_array(coalesce(display_name,''),st.content->>'property_name',raw_phone,'ملف مصدر محفوظ',profile_ref)));
   new_profiles:=new_profiles+1;
  else select profile into prof from public.aqari_tenants where workspace_id=p_workspace_id and id=t_id;end if;
  contract_ref:='source:'||p_property_id::text||':lease:'||(r->>'contract_no_raw');
  l_id:=md5(p_workspace_id::text||':lease:'||contract_ref)::uuid;
  start_on:=private.aqari_source_date(r->>'contract_start_raw');end_on:=private.aqari_source_date(r->>'contract_end_raw');
  if (r->'pending') ? 'contract_dates' or end_on<start_on then start_on:=null;end_on:=null;end if;
  con:=jsonb_build_object('id',contract_ref,'source','statement-import','contract_no',r->>'contract_no_raw','tenantId',profile_ref,'tenant',coalesce(display_name,''),'tenantProfile',prof,'property',st.content->>'property_name','unit',r->>'unit','rent',r->'contract_rent_kd','currentRent',r->'current_rent_kd','deposit',null,'status','draft','start_date',start_on,'end_date',end_on,'clauses','[]'::jsonb,'sourceReference',prov,'sourceValues',r,'pending',r->'pending','importStatus','source_saved');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,import_source) values(l_id,p_workspace_id,contract_ref,t_id,u_id,r->>'contract_no_raw',start_on,end_on,(r->>'contract_rent_kd')::numeric,null,'draft',con,prov);
  d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(con));
  d:=jsonb_set(d,'{leases}',coalesce(d->'leases','[]')||jsonb_build_array(jsonb_build_array(coalesce(display_name,''),r->>'unit',r->'contract_rent_kd',end_on,contract_ref)));
  d:=jsonb_set(d,'{tenantDirectoryV202}',coalesce(d->'tenantDirectoryV202','[]')||jsonb_build_array(jsonb_build_object('property',st.content->>'property_name','unit',r->>'unit','tenant',coalesce(display_name,''),'contractNo',r->>'contract_no_raw','phone',valid_phone,'civilId',valid_civil,'nationality',r->>'nationality_raw','email','','source','statement-import','verified',false,'tenantProfileId',profile_ref)));
  insert into public.aqari_statement_links(workspace_id,property_id,period,unit_no,tenant_id,lease_id,source_sha256,linked_by) values(p_workspace_id,p_property_id,p_period,r->>'unit',t_id,l_id,st.source_sha256,auth.uid());
  linked:=linked+1;new_leases:=new_leases+1;
 end loop;
 if new_profiles>0 or new_leases>0 then
  update public.aqari_app_state set payload=case when saved.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(saved.payload,'{snapshot,values,aqari_v30}',d) when saved.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(saved.payload,'{values,aqari_v30}',d) else d end,revision=saved.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=p_workspace_id;
  insert into public.aqari_operation_audit(workspace_id,user_id,action,revision) values(p_workspace_id,auth.uid(),'source_statement_linked:'||p_property_id::text||':'||p_period::text,saved.revision+1);
 end if;
 return jsonb_build_object('linked_rows',linked,'new_tenants',new_profiles,'new_leases',new_leases,'posted_payments',0);
end $$;
revoke all on function public.aqari_link_property_statement(uuid,uuid,date,text) from public,anon;
grant execute on function public.aqari_link_property_statement(uuid,uuid,date,text) to authenticated;

CREATE OR REPLACE FUNCTION private.aqari_v267_project_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d jsonb;old_d jsonb;r jsonb;v_contract jsonb;v_profile jsonb;row_data jsonb;receipt_data jsonb;role_name text;prop_id uuid;tenant_ref uuid;unit_ref uuid;lease_ref uuid;payment_ref uuid;rent_value numeric;paid_sum numeric;key_name text;source_ref text;
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
 if exists(select 1 from public.aqari_tenants t where t.workspace_id=new.workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) profile_item where profile_item->>'id'=t.external_ref)) then raise exception 'TENANT_HISTORY_REQUIRED';end if;
 if exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'contractsV202','[]')) contract_item where contract_item->>'id'=l.external_ref)) then raise exception 'LEASE_HISTORY_REQUIRED';end if;
 for r in select value from jsonb_array_elements(coalesce(d->'properties','[]')) loop
  if jsonb_typeof(r)<>'array' or nullif(btrim(r->>0),'') is null then raise exception 'INVALID_PROPERTY';end if;
  prop_id:=md5(new.workspace_id::text||':property:'||btrim(r->>0))::uuid;
  insert into public.aqari_properties values(prop_id,new.workspace_id,btrim(r->>0),btrim(r->>0),r) on conflict(id) do update set metadata=excluded.metadata;
 end loop;
 for v_profile in select value from jsonb_array_elements(coalesce(d->'tenantProfilesV267','[]')) loop
  if exists(select 1 from public.aqari_tenants t where t.workspace_id=new.workspace_id and t.external_ref=v_profile->>'id' and t.import_source is not null) then
   if not exists(select 1 from public.aqari_tenants t where t.workspace_id=new.workspace_id and t.external_ref=v_profile->>'id' and t.profile=v_profile) then raise exception 'SOURCE_PROFILE_REVIEW_REQUIRED';end if;
   continue;
  end if;
  if nullif(v_profile->>'id','') is null or nullif(v_profile->>'nameAr','') is null or nullif(v_profile->>'nameEn','') is null or nullif(v_profile->>'nationality','') is null or coalesce(v_profile->>'phone','') !~ '^\+?[0-9]{8,15}$' then raise exception 'INVALID_PROFILE';end if;
  tenant_ref:=md5(new.workspace_id::text||':tenant:'||(v_profile->>'id'))::uuid;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values(tenant_ref,new.workspace_id,v_profile->>'id',v_profile->>'nameAr',v_profile->>'civilId',v_profile->>'phone',nullif(lower(btrim(v_profile->>'email')),''),v_profile) on conflict(id) do update set full_name=excluded.full_name,civil_id=excluded.civil_id,phone=excluded.phone,email=excluded.email,profile=excluded.profile;
 end loop;
 for v_contract in select value from jsonb_array_elements(coalesce(d->'contractsV202','[]')) loop
  if exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.external_ref=v_contract->>'id' and l.import_source is not null) then
   if not exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.external_ref=v_contract->>'id' and l.snapshot=v_contract) then raise exception 'SOURCE_CONTRACT_REVIEW_REQUIRED';end if;
   continue;
  end if;
  if v_contract->>'source' is distinct from 'v267-cloud' then raise exception 'IMPORTED_CONTRACT_REVIEW_REQUIRED';end if;
  select id into prop_id from public.aqari_properties where workspace_id=new.workspace_id and name=v_contract->>'property';
  select id into tenant_ref from public.aqari_tenants where workspace_id=new.workspace_id and external_ref=v_contract->>'tenantId' and full_name=v_contract->>'tenant';
  if prop_id is null or tenant_ref is null or nullif(v_contract->>'unit','') is null or nullif(v_contract->>'id','') is null then raise exception 'CONTRACT_LINK_REQUIRED';end if;
  unit_ref:=md5(prop_id::text||':unit:'||translate(v_contract->>'unit','٠١٢٣٤٥٦٧٨٩','0123456789'))::uuid;
  insert into public.aqari_units values(unit_ref,new.workspace_id,prop_id,translate(v_contract->>'unit','٠١٢٣٤٥٦٧٨٩','0123456789')) on conflict(id) do nothing;
  lease_ref:=md5(new.workspace_id::text||':lease:'||(v_contract->>'id'))::uuid;
  if exists(select 1 from public.aqari_leases l where l.id=lease_ref and (l.tenant_id<>tenant_ref or l.unit_id<>unit_ref or l.contract_no<>v_contract->>'contract_no')) then raise exception 'LEASE_LINK_IMMUTABLE';end if;
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values(lease_ref,new.workspace_id,v_contract->>'id',tenant_ref,unit_ref,v_contract->>'contract_no',(v_contract->>'start_date')::date,(v_contract->>'end_date')::date,(v_contract->>'rent')::numeric,coalesce((v_contract->>'deposit')::numeric,0),v_contract->>'status',v_contract) on conflict(id) do update set start_date=excluded.start_date,end_date=excluded.end_date,monthly_rent=excluded.monthly_rent,deposit=excluded.deposit,status=excluded.status,snapshot=excluded.snapshot;
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
  select snapshot into v_contract from public.aqari_leases where workspace_id=new.workspace_id and id=lease_ref;
  if jsonb_typeof(row_data) is distinct from 'array' or jsonb_array_length(row_data)<>10
   or row_data->>3 is distinct from r->>'status' or row_data->>9 is distinct from r->>'method'
   or receipt_data#>>'{contract,status}' is distinct from 'signed'
   or receipt_data#>>'{contract,contract_no}' is distinct from r->>'contractNo'
   or receipt_data#>>'{contract,tenant}' is distinct from r->>'tenant'
   or receipt_data#>>'{contract,property}' is distinct from r->>'property'
   or receipt_data#>>'{contract,unit}' is distinct from r->>'unit'
   or receipt_data#>>'{contract,start_date}' is distinct from v_contract->>'start_date'
   or receipt_data#>>'{contract,end_date}' is distinct from v_contract->>'end_date'
   then raise exception 'RECEIPT_SNAPSHOT_INVALID';end if;
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
end $function$

