-- Follow-up for environments that already applied the original Stage C helpers.
create or replace function public.v267_stage_c_backup_snapshot()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare catalog jsonb; item jsonb; page jsonb; pages jsonb:='[]'::jsonb;
 expected bigint; exported integer; page_count integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 catalog:=public.v267_stage_c_backup_catalog();
 for item in select value from jsonb_array_elements(catalog->'tables')
 loop
  expected:=coalesce((item->>'rows')::bigint,0);
  exported:=0;
  while exported<expected loop
   page:=public.v267_stage_c_backup_table(item->>'schema',item->>'table',exported,1000);
   page_count:=jsonb_array_length(page->'rows');
   if page_count=0 or exported::bigint+page_count>expected then
    raise exception 'BACKUP_ROW_COUNT_MISMATCH';
   end if;
   pages:=pages||jsonb_build_array(
    page||jsonb_build_object('fingerprint_md5',md5((page->'rows')::text))
   );
   exported:=exported+page_count;
  end loop;
 end loop;
 return jsonb_build_object('catalog',catalog,'pages',pages);
end $$;

revoke all on function public.v267_stage_c_backup_snapshot() from public,anon,authenticated;
grant execute on function public.v267_stage_c_backup_snapshot() to service_role;
