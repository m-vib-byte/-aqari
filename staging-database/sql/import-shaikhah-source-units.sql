-- Verified source-only units. Does not activate leases, post payments, or approve source contracts.
-- Tested in a rolled-back transaction before applying; 42 distinct units reread, 0 missing.
do $import$
declare st public.aqari_property_statements%rowtype; row_count integer; unit_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('47a4a884-eb5c-4551-8754-2f51dee518f8',0));
 select s.* into strict st from public.aqari_property_statements s
 join public.aqari_properties p on p.workspace_id=s.workspace_id and p.id=s.property_id
 where s.workspace_id='47a4a884-eb5c-4551-8754-2f51dee518f8'
 and s.period='2026-08-01' and s.content->>'property_key'='shaikhah-tower'
 and p.external_ref='source:shaikhah-tower' and p.metadata->>'source_only'='true'
 for update of s,p;
 if st.source_sha256<>'925b092de82ebc50d23b3e98d37008485222256ca6aa23e1e92f0205c04d4b7b' then raise exception 'Source changed'; end if;
 select count(*),count(distinct r->>'unit') into row_count,unit_count from jsonb_array_elements(st.content->'rows') r;
 if row_count<>42 or unit_count<>42 or exists(select 1 from jsonb_array_elements(st.content->'rows') r where coalesce(r->>'unit','') !~ '^[A-Za-z0-9.-]{1,20}$') then raise exception 'Unit list requires review'; end if;
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 select md5(st.property_id::text||':unit:'||(r->>'unit'))::uuid,st.workspace_id,st.property_id,r->>'unit'
 from jsonb_array_elements(st.content->'rows') r
 on conflict(workspace_id,property_id,unit_no) do nothing;
 if (select count(*) from public.aqari_units where workspace_id=st.workspace_id and property_id=st.property_id)<>42 then raise exception 'Unexpected unit count'; end if;
 if exists(select 1 from jsonb_array_elements(st.content->'rows') r where not exists(select 1 from public.aqari_units u where u.workspace_id=st.workspace_id and u.property_id=st.property_id and u.unit_no=r->>'unit')) then raise exception 'Missing source unit'; end if;
 update public.aqari_properties set metadata=metadata||jsonb_build_object('unit_import',jsonb_build_object('source_sha256',st.source_sha256,'period',st.period,'unit_count',42,'method','authorized_source_unit_import'))
 where workspace_id=st.workspace_id and id=st.property_id and metadata->'unit_import' is distinct from jsonb_build_object('source_sha256',st.source_sha256,'period',st.period,'unit_count',42,'method','authorized_source_unit_import');
end
$import$;
