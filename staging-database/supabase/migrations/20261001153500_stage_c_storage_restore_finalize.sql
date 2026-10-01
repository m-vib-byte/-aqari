-- Isolated Stage C Storage restore helpers.
-- Applies only to the isolated recovery target; browser roles never execute these functions.

create or replace function public.v267_stage_c_restore_storage_record(
  p_run_id uuid,p_bucket text,p_name text,p_bytes bigint,p_sha256 text,p_etag text default null
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 if p_run_id is null
   or p_bucket not in('aqari-documents','aqari-hr-private','aqari-maintenance-private')
   or p_name is null or char_length(p_name)>1024 or p_name like '/%' or p_name like '%..%'
   or p_bytes<0 or p_sha256 !~ '^[0-9a-f]{64}$'
 then raise invalid_parameter_value using message='INVALID_STORAGE_RECORD'; end if;
 if not exists(
   select 1 from stage_c_restore_20261001.runs
   where id=p_run_id and source_project='djkpkkgoibruaezdrchb'
 ) then raise invalid_parameter_value using message='RESTORE_RUN_NOT_FOUND'; end if;
 insert into stage_c_restore_20261001.storage_manifest(run_id,bucket_id,name,bytes,sha256,etag)
 values(p_run_id,p_bucket,p_name,p_bytes,p_sha256,nullif(p_etag,''))
 on conflict(run_id,bucket_id,name) do update
 set bytes=excluded.bytes,sha256=excluded.sha256,etag=excluded.etag;
 return jsonb_build_object('ok',true,'run_id',p_run_id,'bucket',p_bucket,'name',p_name,'bytes',p_bytes,'sha256',p_sha256);
end $$;

create or replace function public.v267_stage_c_restore_storage_summary(p_run_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare c bigint;b bigint;h text;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 select count(*),coalesce(sum(bytes),0),
        md5(coalesce(string_agg(bucket_id||E'\n'||name||E'\n'||bytes::text||E'\n'||sha256,E'\n' order by bucket_id,name),''))
 into c,b,h
 from stage_c_restore_20261001.storage_manifest where run_id=p_run_id;
 return jsonb_build_object('count',c,'bytes',b,'manifest_md5',h);
end $$;

create or replace function public.v267_stage_c_restore_storage_finalize(
  p_run_id uuid,p_expected_count bigint,p_expected_bytes bigint
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare c bigint;b bigint;bad bigint;
begin
 if current_setting('role',true) is distinct from 'service_role' then
  raise insufficient_privilege using message='SERVER_ONLY';
 end if;
 if p_run_id is null or p_expected_count<0 or p_expected_bytes<0 then
  raise invalid_parameter_value using message='INVALID_FINALIZE';
 end if;
 select count(*),coalesce(sum(bytes),0),
        count(*) filter(where sha256 is null or sha256 !~ '^[0-9a-f]{64}$')
 into c,b,bad
 from stage_c_restore_20261001.storage_manifest where run_id=p_run_id;
 if c<>p_expected_count or b<>p_expected_bytes or bad<>0 then
  raise check_violation using message='STORAGE_RESTORE_MISMATCH';
 end if;
 if not exists(
  select 1 from stage_c_restore_20261001.runs
  where id=p_run_id and coalesce((notes->>'database_auth_fingerprints_verified')::boolean,false)=true
 ) then raise check_violation using message='DATABASE_AUTH_NOT_VERIFIED'; end if;
 update stage_c_restore_20261001.runs
 set status='verified',completed_at=now(),
     notes=notes||jsonb_build_object(
       'storage_bytes_restored',true,
       'storage_objects_verified',c,
       'storage_bytes_verified',b,
       'storage_verified_at',now()
     )
 where id=p_run_id;
 return jsonb_build_object('count',c,'bytes',b,'verified',true);
end $$;

revoke all on function public.v267_stage_c_restore_storage_record(uuid,text,text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.v267_stage_c_restore_storage_summary(uuid) from public,anon,authenticated;
revoke all on function public.v267_stage_c_restore_storage_finalize(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.v267_stage_c_restore_storage_record(uuid,text,text,bigint,text,text) to service_role;
grant execute on function public.v267_stage_c_restore_storage_summary(uuid) to service_role;
grant execute on function public.v267_stage_c_restore_storage_finalize(uuid,bigint,bigint) to service_role;
