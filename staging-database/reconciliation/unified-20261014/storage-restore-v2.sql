-- REVIEW ONLY. Isolated recovery nlqynpmilcdqztwrrvyu; never Production.
-- New private storage-only proof. Does not modify or reuse the previous successful restore proof.
begin;
set local lock_timeout='5s';
create table private.aqari_storage_restore_runs_v2 (
 id uuid primary key, workspace uuid not null, source_project text not null,
 snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),
 expected_count integer not null check(expected_count between 0 and 5000),
 expected_bytes bigint not null check(expected_bytes between 0 and 67108864),
 status text not null default 'pending' check(status in ('pending','verified')),
 created_at timestamptz not null default now(),verified_at timestamptz,
 unique(workspace,source_project,snapshot_hash)
);
create table private.aqari_storage_restore_objects_v2 (
 run_id uuid references private.aqari_storage_restore_runs_v2(id),bucket text not null,name text not null,
 bytes bigint not null check(bytes between 0 and 67108864),sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz,primary key(run_id,bucket,name)
);
alter table private.aqari_storage_restore_runs_v2 enable row level security;
alter table private.aqari_storage_restore_objects_v2 enable row level security;
revoke all on private.aqari_storage_restore_runs_v2,private.aqari_storage_restore_objects_v2 from public,anon,authenticated,service_role;
create function public.aqari_storage_restore_v2(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d jsonb:=p_data;r private.aqari_storage_restore_runs_v2; o jsonb; n bigint;b bigint;v bigint;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if d->>'sourceProject'<>'ofgmcsmxmdswlovsckqs' or d->>'workspace' is null or d->>'runId' is null then raise exception 'INVALID_SCOPE';end if;
 if p_action='begin' then
  if jsonb_typeof(d->'objects') is distinct from 'array' or jsonb_array_length(d->'objects')>5000 or d->>'snapshotHash' !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_MANIFEST';end if;
  select count(*),coalesce(sum((x->>'bytes')::bigint),0) into n,b from jsonb_array_elements(d->'objects') x;
  if b>67108864 then raise exception 'BACKUP_SIZE_LIMIT';end if;
  insert into private.aqari_storage_restore_runs_v2(id,workspace,source_project,snapshot_hash,expected_count,expected_bytes)
   values((d->>'runId')::uuid,(d->>'workspace')::uuid,d->>'sourceProject',d->>'snapshotHash',n,b) on conflict(id) do nothing;
  select * into strict r from private.aqari_storage_restore_runs_v2 where id=(d->>'runId')::uuid for update;
  if r.workspace<>(d->>'workspace')::uuid or r.source_project<>d->>'sourceProject' or r.snapshot_hash<>d->>'snapshotHash' or r.expected_count<>n or r.expected_bytes<>b then raise exception 'RUN_MISMATCH';end if;
  for o in select value from jsonb_array_elements(d->'objects') loop
   if o->>'bucket' not in ('aqari-documents','aqari-hr-private','aqari-maintenance-private') or o->>'name' is null or left(o->>'name',37)<>d->>'workspace'||'/' or length(o->>'name')>1024 or o->>'name' ~ '(^|/)(\.|\.\.)(/|$)' or o->>'name' ~ '[\\\x00-\x1f]' then raise exception 'INVALID_OBJECT';end if;
   insert into private.aqari_storage_restore_objects_v2(run_id,bucket,name,bytes,sha256) values(r.id,o->>'bucket',o->>'name',(o->>'bytes')::bigint,o->>'sha256') on conflict do nothing;
   if not exists(select 1 from private.aqari_storage_restore_objects_v2 x where x.run_id=r.id and x.bucket=o->>'bucket' and x.name=o->>'name' and x.bytes=(o->>'bytes')::bigint and x.sha256=o->>'sha256') then raise exception 'OBJECT_CONFLICT';end if;
  end loop;
  if (select count(*) from private.aqari_storage_restore_objects_v2 where run_id=r.id)<>n then raise exception 'MANIFEST_MISMATCH';end if;
  return jsonb_build_object('runId',r.id);
 end if;
 select * into strict r from private.aqari_storage_restore_runs_v2 where id=(d->>'runId')::uuid and workspace=(d->>'workspace')::uuid and source_project=d->>'sourceProject' for update;
 if p_action in ('check','record') then
  o:=d->'object';
  if not exists(select 1 from private.aqari_storage_restore_objects_v2 x where x.run_id=r.id and x.bucket=o->>'bucket' and x.name=o->>'name' and x.bytes=(o->>'bytes')::bigint and x.sha256=o->>'sha256') then raise exception 'OBJECT_NOT_IN_SNAPSHOT';end if;
  if p_action='record' then update private.aqari_storage_restore_objects_v2 set verified_at=coalesce(verified_at,now()) where run_id=r.id and bucket=o->>'bucket' and name=o->>'name';end if;
  return jsonb_build_object('ok',true);
 elsif p_action='finalize' then
  select count(*),coalesce(sum(bytes),0),count(verified_at) into n,b,v from private.aqari_storage_restore_objects_v2 where run_id=r.id;
  if n<>r.expected_count or b<>r.expected_bytes or v<>n then raise exception 'RESTORE_INCOMPLETE';end if;
  update private.aqari_storage_restore_runs_v2 set status='verified',verified_at=coalesce(verified_at,now()) where id=r.id;
  return jsonb_build_object('runId',r.id,'snapshotHash',r.snapshot_hash,'count',n,'bytes',b,'verified',true,'scope','storage_only');
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.aqari_storage_restore_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_storage_restore_v2(text,jsonb) to service_role;
commit;
