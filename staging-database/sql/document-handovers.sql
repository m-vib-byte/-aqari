-- V267 isolated preview. Append-only handover records; no file replacement or sending.
create table if not exists private.aqari_document_handovers (
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 document_id uuid not null references public.aqari_documents(id),
 evidence_document_id uuid not null references public.aqari_documents(id),
 actor_id uuid not null,
 actor_name text not null,
 recorded_at timestamptz not null default now(),
 details jsonb not null check(jsonb_typeof(details)='object'),
 source_snapshot jsonb not null,
 evidence_snapshot jsonb not null,
 check(document_id<>evidence_document_id)
);
create index if not exists aqari_document_handovers_document on private.aqari_document_handovers(workspace_id,document_id,recorded_at desc,id desc);
create index if not exists aqari_document_handovers_evidence on private.aqari_document_handovers(evidence_document_id);
create table if not exists private.aqari_document_handover_voids (
 id uuid primary key,
 handover_id uuid not null unique references private.aqari_document_handovers(id),
 actor_id uuid not null,
 actor_name text not null,
 recorded_at timestamptz not null default now(),
 reason text not null check(length(btrim(reason)) between 5 and 500)
);
alter table private.aqari_document_handovers enable row level security;
alter table private.aqari_document_handover_voids enable row level security;
revoke all on private.aqari_document_handovers,private.aqari_document_handover_voids from public,anon,authenticated;
-- Access is through the scoped RPC only. Direct writes/reads have no grants or policies.
create or replace function private.aqari_handover_immutable() returns trigger
language plpgsql set search_path='' as $$begin
 raise exception 'HANDOVER_IMMUTABLE' using errcode='42501';
end $$;
revoke all on function private.aqari_handover_immutable() from public,anon,authenticated;
drop trigger if exists aqari_handover_immutable on private.aqari_document_handovers;
create trigger aqari_handover_immutable before update or delete on private.aqari_document_handovers for each row execute function private.aqari_handover_immutable();
drop trigger if exists aqari_handover_void_immutable on private.aqari_document_handover_voids;
create trigger aqari_handover_void_immutable before update or delete on private.aqari_document_handover_voids for each row execute function private.aqari_handover_immutable();

create or replace function private.aqari_document_handover_register(p_workspace_id uuid,p_document_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc public.aqari_documents;proof public.aqari_documents;entry private.aqari_document_handovers;cancelled private.aqari_document_handover_voids;
 actor uuid:=auth.uid();actor_name text;entry_id uuid;proof_id uuid;handover_id uuid;canonical jsonb;handed_at timestamptz;copies int;page int;reason text;result jsonb;
begin
 if actor is null or not exists(select 1 from public.aqari_memberships m where m.workspace_id=p_workspace_id and m.user_id=actor and m.is_active)
  or not coalesce(private.aqari_can(p_workspace_id,'documents','read'),false) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into doc from public.aqari_documents where workspace_id=p_workspace_id and id=p_document_id;
 if not found or not coalesce(private.aqari_document_entity(p_workspace_id,doc.entity_type,doc.entity_ref,'read'),false) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>4096 then raise exception 'INVALID_HANDOVER';end if;
 if p_action='list' then
  if p_data-array['page']<>'{}'::jsonb or coalesce(p_data->>'page','0')!~'^[0-9]{1,5}$' then raise exception 'INVALID_HANDOVER';end if;
  page:=coalesce(p_data->>'page','0')::int;if page>10000 then raise exception 'INVALID_HANDOVER';end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into result from (
   select h.*,to_jsonb(v) as cancellation from private.aqari_document_handovers h left join private.aqari_document_handover_voids v on v.handover_id=h.id
   where h.workspace_id=p_workspace_id and h.document_id=p_document_id order by h.recorded_at desc,h.id desc limit 50 offset page*50
  ) r;
  return jsonb_build_object('entries',result,'can_write',coalesce(private.aqari_can(p_workspace_id,'documents','write') and private.aqari_document_entity(p_workspace_id,doc.entity_type,doc.entity_ref,'write'),false),
   'evidence',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select d.id,d.title,d.document_no from public.aqari_documents d
    where d.workspace_id=p_workspace_id and d.entity_type=doc.entity_type and d.entity_ref=doc.entity_ref and d.id<>doc.id and d.status='uploaded' and d.checksum_sha256 is not null
    order by d.created_at desc,d.id desc limit 50) x));
 end if;
 if not coalesce(private.aqari_can(p_workspace_id,'documents','write') and private.aqari_document_entity(p_workspace_id,doc.entity_type,doc.entity_ref,'write'),false) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_action not in ('record','void') or p_action is null then raise exception 'INVALID_HANDOVER';end if;
 begin entry_id:=(p_data->>'id')::uuid;exception when invalid_text_representation then raise exception 'INVALID_HANDOVER';end;
 if entry_id is null then raise exception 'INVALID_HANDOVER';end if;
 select coalesce(nullif(btrim(display_name),''),actor::text) into actor_name from public.aqari_profiles where user_id=actor;
 actor_name:=coalesce(actor_name,actor::text);
 -- Serialize same-document retries and cancellation; unrelated documents are independent.
 perform pg_advisory_xact_lock(hashtextextended('aqari-handover:'||p_document_id::text,0));
 if p_action='void' then
  if p_data-array['id','handover_id','reason']<>'{}'::jsonb then raise exception 'INVALID_HANDOVER';end if;
  begin handover_id:=(p_data->>'handover_id')::uuid;exception when invalid_text_representation then raise exception 'INVALID_HANDOVER';end;
  reason:=btrim(p_data->>'reason');if reason is null or length(reason) not between 5 and 500 then raise exception 'INVALID_HANDOVER';end if;
  select * into entry from private.aqari_document_handovers where id=handover_id and workspace_id=p_workspace_id and document_id=p_document_id;
  if not found then raise exception 'HANDOVER_NOT_FOUND';end if;
  select v.* into cancelled from private.aqari_document_handover_voids v where v.handover_id=entry.id;
  if found then
   if cancelled.id=entry_id and cancelled.actor_id=actor and cancelled.reason=reason then return to_jsonb(cancelled);end if;
   raise exception 'HANDOVER_ALREADY_VOID';
  end if;
  insert into private.aqari_document_handover_voids(id,handover_id,actor_id,actor_name,reason) values(entry_id,entry.id,actor,actor_name,reason) returning * into cancelled;
  return to_jsonb(cancelled);
 end if;
 if p_data-array['id','evidence_document_id','sender_name','recipient_name','handed_at','copy_kind','copies','method','note']<>'{}'::jsonb then raise exception 'INVALID_HANDOVER';end if;
 if doc.status<>'uploaded' or doc.checksum_sha256 is null then raise exception 'HANDOVER_VERIFIED_DOCUMENT_REQUIRED';end if;
 if coalesce(p_data->>'copies','')!~'^[0-9]{1,2}$' or coalesce(p_data->>'handed_at','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'INVALID_HANDOVER';end if;
 begin proof_id:=(p_data->>'evidence_document_id')::uuid;handed_at:=(p_data->>'handed_at')::timestamptz;copies:=(p_data->>'copies')::int;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_HANDOVER';end;
 if proof_id is null or proof_id=doc.id or not isfinite(handed_at) or handed_at>now()+interval '5 minutes' or copies not between 1 and 99
  or coalesce(p_data->>'copy_kind','') not in ('original','copy') or coalesce(p_data->>'method','') not in ('hand','courier','electronic')
  or length(coalesce(btrim(p_data->>'sender_name'),'')) not between 2 and 180 or length(coalesce(btrim(p_data->>'recipient_name'),'')) not between 2 and 180
  or length(coalesce(p_data->>'note',''))>500 then raise exception 'INVALID_HANDOVER';end if;
 select * into proof from public.aqari_documents where id=proof_id and workspace_id=p_workspace_id and status='uploaded' and checksum_sha256 is not null
  and entity_type=doc.entity_type and entity_ref=doc.entity_ref;
 if not found then raise exception 'HANDOVER_VERIFIED_EVIDENCE_REQUIRED';end if;
 canonical:=jsonb_build_object('sender_name',btrim(p_data->>'sender_name'),'recipient_name',btrim(p_data->>'recipient_name'),'handed_at',handed_at,
  'copy_kind',p_data->>'copy_kind','copies',copies,'method',p_data->>'method','note',btrim(coalesce(p_data->>'note','')));
 select * into entry from private.aqari_document_handovers where id=entry_id;
 if found then
  if entry.workspace_id=p_workspace_id and entry.document_id=doc.id and entry.evidence_document_id=proof_id and entry.actor_id=actor and entry.details=canonical then return to_jsonb(entry);end if;
  raise exception 'HANDOVER_IDEMPOTENCY_CONFLICT';
 end if;
 insert into private.aqari_document_handovers(id,workspace_id,document_id,evidence_document_id,actor_id,actor_name,details,source_snapshot,evidence_snapshot)
 values(entry_id,p_workspace_id,doc.id,proof.id,actor,actor_name,canonical,
  jsonb_build_object('id',doc.id,'document_no',doc.document_no,'title',doc.title,'checksum_sha256',doc.checksum_sha256,'uploaded_at',doc.uploaded_at),
  jsonb_build_object('id',proof.id,'document_no',proof.document_no,'title',proof.title,'checksum_sha256',proof.checksum_sha256,'uploaded_at',proof.uploaded_at)) returning * into entry;
 return to_jsonb(entry);
end $$;
revoke all on function private.aqari_document_handover_register(uuid,uuid,text,jsonb) from public,anon;
grant execute on function private.aqari_document_handover_register(uuid,uuid,text,jsonb) to authenticated;
create or replace function public.aqari_document_handover_register(p_workspace_id uuid,p_document_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.aqari_document_handover_register(p_workspace_id,p_document_id,p_action,p_data)$$;
revoke all on function public.aqari_document_handover_register(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_document_handover_register(uuid,uuid,text,jsonb) to authenticated;
