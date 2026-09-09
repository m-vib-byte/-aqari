create or replace function public.aqari_link_property_statement(p_workspace_id uuid,p_property_id uuid,p_period date,p_source_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- The legacy tenant table columns are name / units / rent / status / profile id.
 d:=jsonb_set(d,'{tenants}',
  coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(d->'tenants','[]')) x where not exists(select 1 from public.aqari_tenants t where t.workspace_id=p_workspace_id and t.external_ref=x->>4 and t.import_source->>'property_id'=p_property_id::text)),'[]'::jsonb)
  ||coalesce((select jsonb_agg(row_value) from (select jsonb_build_array(coalesce(t.full_name,''),string_agg(lk.unit_no,' / ' order by lk.unit_no),sum((sr->>'current_rent_kd')::numeric),'ملف مصدر محفوظ',t.external_ref) row_value from public.aqari_statement_links lk join public.aqari_tenants t on t.workspace_id=lk.workspace_id and t.id=lk.tenant_id join lateral jsonb_array_elements(st.content->'rows') sr on sr->>'unit'=lk.unit_no where lk.workspace_id=p_workspace_id and lk.property_id=p_property_id and lk.period=p_period group by t.id,t.full_name,t.external_ref order by min(lk.unit_no)) rows_for_tenants),'[]'::jsonb));
 if new_profiles>0 or new_leases>0 or d is distinct from private.aqari_unwrap(saved.payload) then
  update public.aqari_app_state set payload=case when saved.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(saved.payload,'{snapshot,values,aqari_v30}',d) when saved.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(saved.payload,'{values,aqari_v30}',d) else d end,revision=saved.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=p_workspace_id;
  insert into public.aqari_operation_audit(workspace_id,user_id,action,revision) values(p_workspace_id,auth.uid(),'source_statement_linked:'||p_property_id::text||':'||p_period::text,saved.revision+1);
 end if;
 return jsonb_build_object('linked_rows',linked,'new_tenants',new_profiles,'new_leases',new_leases,'posted_payments',0);
end $$;
revoke all on function public.aqari_link_property_statement(uuid,uuid,date,text) from public,anon;
grant execute on function public.aqari_link_property_statement(uuid,uuid,date,text) to authenticated;


