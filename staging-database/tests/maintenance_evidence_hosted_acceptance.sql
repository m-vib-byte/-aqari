-- AQARI V267 hosted maintenance-evidence acceptance probe.
-- Run only against the isolated Preview/Staging Supabase project.
-- Uses an existing active owner/general-manager + property for authorization context,
-- creates only transaction-scoped QA rows, exercises the real RPC and triggers,
-- then rolls back completely. Production is out of scope.

begin;

create temp table v267_maintenance_probe_ctx on commit drop as
select m.workspace_id,m.user_id,p.id as property_id,p.external_ref,
       gen_random_uuid() as plan_id,gen_random_uuid() as task_id,
       gen_random_uuid() as object_id,gen_random_uuid() as document_id
from public.aqari_memberships m
join public.aqari_properties p on p.workspace_id=m.workspace_id
where m.is_active and m.role::text in ('owner','general_manager')
order by m.workspace_id,p.id
limit 1;

do $$ begin
 if not exists(select 1 from v267_maintenance_probe_ctx) then raise exception 'NO_MANAGER_PROPERTY_FIXTURE'; end if;
end $$;

select set_config('request.jwt.claim.sub',(select user_id::text from v267_maintenance_probe_ctx),true);
select set_config('request.jwt.claims',(
 select jsonb_build_object(
   'sub',user_id::text,'role','authenticated','aal','aal2',
   'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint))
 )::text from v267_maintenance_probe_ctx
),true);

insert into private.aqari_maintenance_plans(id,workspace_id,property_id,asset_kind,title,frequency_days,next_due_on,created_by)
select plan_id,workspace_id,property_id,'electrical','V267 rollback-only evidence probe',30,
       ((now() at time zone 'Asia/Kuwait')::date-1),user_id
from v267_maintenance_probe_ctx;

insert into private.aqari_property_maintenance_tasks(
 id,workspace_id,plan_id,property_id,due_on,task_no,status,description,assigned_by,assigned_at
)
select task_id,workspace_id,plan_id,property_id,((now() at time zone 'Asia/Kuwait')::date-1),
       'QA-EVIDENCE-ROLLBACK','assigned','rollback-only evidence probe',user_id,statement_timestamp()-interval '2 hours'
from v267_maintenance_probe_ctx;

insert into public.aqari_documents(
 id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,
 storage_bucket,storage_path,status,created_by
)
select document_id,workspace_id,'QA-EVIDENCE-ROLLBACK','maintenance_photo','property',external_ref,
       'QA evidence image','qa-evidence.png','image/png','aqari-documents',
       workspace_id::text||'/'||document_id::text||'.png','draft',user_id
from v267_maintenance_probe_ctx;

insert into storage.objects(id,bucket_id,name,owner,metadata)
select object_id,'aqari-documents',workspace_id::text||'/'||document_id::text||'.png',user_id,
       jsonb_build_object('size',123,'mimetype','image/png')
from v267_maintenance_probe_ctx;

update public.aqari_documents
set status='uploaded',size_bytes=123,checksum_sha256=repeat('a',64)
where id=(select document_id from v267_maintenance_probe_ctx);

-- New-policy tasks must fail closed before before-evidence exists.
do $$
begin
 begin
  update private.aqari_property_maintenance_tasks
    set status='in_progress',started_at=statement_timestamp()-interval '1 hour',revision=revision+1
  where id=(select task_id from v267_maintenance_probe_ctx);
  raise exception 'EXPECTED_BEFORE_EVIDENCE_GUARD_DID_NOT_FIRE';
 exception when check_violation then
  if sqlerrm<>'MAINTENANCE_BEFORE_EVIDENCE_REQUIRED' then raise; end if;
 end;
end $$;

select public.aqari_maintenance_evidence(
 (select workspace_id from v267_maintenance_probe_ctx),(select property_id from v267_maintenance_probe_ctx),'add',
 jsonb_build_object('taskId',(select task_id from v267_maintenance_probe_ctx),'documentId',(select document_id from v267_maintenance_probe_ctx),'stage','before','reason','before repair evidence probe')
);

update private.aqari_property_maintenance_tasks
set status='in_progress',started_at=statement_timestamp()-interval '1 hour',revision=revision+1
where id=(select task_id from v267_maintenance_probe_ctx);

-- Completion must fail closed before after-evidence exists.
do $$
begin
 begin
  update private.aqari_property_maintenance_tasks
    set status='completed',completed_by=(select user_id from v267_maintenance_probe_ctx),completed_at=statement_timestamp(),
        completion_document_id=(select document_id from v267_maintenance_probe_ctx),revision=revision+1
  where id=(select task_id from v267_maintenance_probe_ctx);
  raise exception 'EXPECTED_AFTER_EVIDENCE_GUARD_DID_NOT_FIRE';
 exception when check_violation then
  if sqlerrm<>'MAINTENANCE_AFTER_EVIDENCE_REQUIRED' then raise; end if;
 end;
end $$;

select public.aqari_maintenance_evidence(
 (select workspace_id from v267_maintenance_probe_ctx),(select property_id from v267_maintenance_probe_ctx),'add',
 jsonb_build_object('taskId',(select task_id from v267_maintenance_probe_ctx),'documentId',(select document_id from v267_maintenance_probe_ctx),'stage','after','reason','after repair evidence probe')
);

update private.aqari_property_maintenance_tasks
set status='completed',completed_by=(select user_id from v267_maintenance_probe_ctx),completed_at=statement_timestamp(),
    completion_document_id=(select document_id from v267_maintenance_probe_ctx),revision=revision+1
where id=(select task_id from v267_maintenance_probe_ctx);

do $$
declare ctx jsonb;before_count int;after_count int;audit_count int;
begin
 select public.aqari_maintenance_evidence(
   (select workspace_id from v267_maintenance_probe_ctx),(select property_id from v267_maintenance_probe_ctx),'context','{}'::jsonb
 ) into ctx;
 select count(*) filter(where stage='before'),count(*) filter(where stage='after') into before_count,after_count
 from private.aqari_maintenance_evidence where task_id=(select task_id from v267_maintenance_probe_ctx);
 select count(*) into audit_count from private.aqari_operations_audit
 where entity_id=(select task_id from v267_maintenance_probe_ctx) and action in('evidence_before','evidence_after');
 if before_count<>1 or after_count<>1 then raise exception 'EVIDENCE_COUNTS_INVALID';end if;
 if audit_count<>2 then raise exception 'EVIDENCE_AUDIT_INVALID:%',audit_count;end if;
 if not exists(
  select 1 from jsonb_array_elements(ctx->'tasks') t
  where t->>'id'=(select task_id::text from v267_maintenance_probe_ctx)
    and t->>'status'='completed'
    and (t->>'overdueDays')::int>=1
    and (t->>'responseMinutes')::numeric>=0
    and (t->>'resolutionMinutes')::numeric>=0
 ) then raise exception 'CONTEXT_TIMING_READBACK_INVALID';end if;
 begin
  update private.aqari_maintenance_evidence set note='tampered'
  where task_id=(select task_id from v267_maintenance_probe_ctx);
  raise exception 'EXPECTED_IMMUTABILITY_GUARD_DID_NOT_FIRE';
 exception when check_violation then
  if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;
 end;
end $$;

rollback;

-- These must remain zero so the hosted probe never becomes business data.
select
 (select count(*)::int from private.aqari_property_maintenance_tasks where task_no='QA-EVIDENCE-ROLLBACK') as fixture_tasks_remaining,
 (select count(*)::int from public.aqari_documents where document_no='QA-EVIDENCE-ROLLBACK') as fixture_documents_remaining;
