-- Import only visually reviewed unit identifiers; do not infer occupancy, contracts or payments.
-- The original PDF remains private. Page 26's printed period discrepancy is preserved in provenance.
do $import$
declare
 w constant uuid := '47a4a884-eb5c-4551-8754-2f51dee518f8';
 p_id constant uuid := '5f8b114b-aace-1d8b-532f-874d8288c503';
 source_manifest jsonb := '{"source_sha256":"a9154753fa24136b460f10870bf30a399b791761f072b5a6626f5cf8168e8b61","filename":"Dhahawi-August-2026-Original.pdf","unit_count":118,"scope":"unit_numbers_only","occupancy_verified":false,"financial_posting":false,"pages":[{"page":2,"period_raw":"08/2026","units":["Gf1","Gf2","B3","Gf3","Gf4","Gf5","Gf6","Gf7","Gf8","Gf9"]},{"page":4,"period_raw":"08/2026","units":["101","102","103","104","105","106","107","108"]},{"page":6,"period_raw":"08/2026","units":["201","202","203","204","205","206","207","208"]},{"page":8,"period_raw":"08/2026","units":["301","302","303","304","305","306","307","308"]},{"page":10,"period_raw":"08/2026","units":["401","402","403","404","405","406","407","408"]},{"page":12,"period_raw":"08/2026","units":["501","502","503","504","505","506","507","508"]},{"page":14,"period_raw":"08/2026","units":["601","602","603","604","605","606","607","608"]},{"page":16,"period_raw":"08/2026","units":["701","702","703","704","705","706","707","708"]},{"page":18,"period_raw":"08/2026","units":["801","802","803","804","805","806","807","808"]},{"page":20,"period_raw":"08/2026","units":["901","902","903","904","905","906","907","908"]},{"page":22,"period_raw":"08/2026","units":["1001","1002","1003","1004","1005","1006","1007","1008","1009"]},{"page":24,"period_raw":"08/2026","units":["1101","1102","1103","1104","1105","1106","1107","1108","1109"]},{"page":26,"period_raw":"08/2025","units":["1201","1202","1203","1204","1205","1206","1207","1208","1209"]},{"page":28,"period_raw":"08/2026","units":["1301","1302","1303","1304","1305","1306","1307","1308","1309"]}]}'::jsonb;
 unit_numbers text[];
begin
 perform pg_advisory_xact_lock(hashtextextended(w::text,0));
 perform 1 from public.aqari_properties where workspace_id=w and id=p_id
 and external_ref='source:dhahawi-tower' and metadata->>'source_only'='true' for update;
 if not found then raise exception 'Source property changed'; end if;
 perform 1 from public.aqari_property_statements where workspace_id=w and property_id=p_id
 and period='2026-08-01' and source_sha256=source_manifest->>'source_sha256' for update;
 if not found then raise exception 'Source statement changed'; end if;
 select array_agg(u) into unit_numbers from jsonb_array_elements(source_manifest->'pages') pg
 cross join lateral jsonb_array_elements_text(pg->'units') u;
 if cardinality(unit_numbers)<>118 or (select count(distinct x) from unnest(unit_numbers) x)<>118
 or exists(select 1 from unnest(unit_numbers) x where x !~ '^[A-Za-z0-9.]{1,20}$')
 then raise exception 'Invalid source unit identifiers'; end if;
 if exists(select 1 from public.aqari_units where workspace_id=w and property_id=p_id and not(unit_no=any(unit_numbers)))
 then raise exception 'Unexpected existing units require review'; end if;
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 select md5(p_id::text||':unit:'||u)::uuid,w,p_id,u from unnest(unit_numbers) u
 on conflict(workspace_id,property_id,unit_no) do nothing;
 if (select count(*) from public.aqari_units where workspace_id=w and property_id=p_id)<>118
 or exists(select 1 from unnest(unit_numbers) x where not exists(select 1 from public.aqari_units u where u.workspace_id=w and u.property_id=p_id and u.unit_no=x))
 then raise exception 'Unit import verification failed'; end if;
 update public.aqari_properties set metadata=metadata||jsonb_build_object('unit_import',source_manifest)
 where workspace_id=w and id=p_id and metadata->'unit_import' is distinct from source_manifest;
end
$import$;
