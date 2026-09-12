-- AQARI V267 — immutable paper/document handoff register.
-- Staging/development only until the release gate is satisfied.

create table if not exists public.aqari_document_handoffs (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 document_id uuid not null references public.aqari_documents(id),
 entity_type text not null,
 entity_ref text not null,
 document_no text not null,
 direction text not null check(direction in ('received','delivered','returned')),
 delivered_by_name text not null check(length(btrim(delivered_by_name)) between 2 and 180),
 received_by_name text not null check(length(btrim(received_by_name)) between 2 and 180),
 handed_at timestamptz not null,
 note text not null default '' check(length(note)<=2000),
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
create index if not exists aqari_document_handoffs_document on public.aqari_document_handoffs(workspace_id,document_id,handed_at desc,id desc);
alter table public.aqari_document_handoffs enable row level security;
revoke all on table public.aqari_document_handoffs from public,anon,authenticated;

create or replace function public.aqari_document_handoff(p_workspace_id uuid,p_document_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.aqari_documents%rowtype; saved_handoff public.aqari_document_handoffs%rowtype; actor uuid:=auth.uid(); dir text; delivered text; received text; at_time timestamptz; memo text;
begin
 if actor is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into d from public.aqari_documents where id=p_document_id and workspace_id=p_workspace_id;
 if d.id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
 if not private.aqari_can(p_workspace_id,'documents','read') or not private.aqari_document_entity(p_workspace_id,d.entity_type,d.entity_ref,'read') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if p_action='list' then
  return (select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
   select hh.id,hh.document_id,hh.document_no,hh.direction,hh.delivered_by_name,hh.received_by_name,hh.handed_at,hh.note,hh.recorded_by,hh.recorded_at,coalesce(p.display_name,'مستخدم محفوظ') recorded_by_name
   from public.aqari_document_handoffs hh left join public.aqari_profiles p on p.user_id=hh.recorded_by
   where hh.workspace_id=p_workspace_id and hh.document_id=p_document_id order by hh.handed_at desc,hh.id desc limit 100
  ) x);
 end if;
 if p_action<>'record' then raise exception 'INVALID_ACTION'; end if;
 if d.status<>'uploaded' then raise exception 'UPLOADED_DOCUMENT_REQUIRED'; end if;
 if not private.aqari_can(p_workspace_id,'documents','write') or not private.aqari_document_entity(p_workspace_id,d.entity_type,d.entity_ref,'write') then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 dir:=coalesce(p_data->>'direction',''); delivered:=btrim(coalesce(p_data->>'delivered_by_name','')); received:=btrim(coalesce(p_data->>'received_by_name','')); memo:=btrim(coalesce(p_data->>'note',''));
 begin at_time:=(p_data->>'handed_at')::timestamptz; exception when others then raise exception 'INVALID_HANDED_AT'; end;
 if dir not in ('received','delivered','returned') then raise exception 'INVALID_DIRECTION'; end if;
 if length(delivered)<2 or length(delivered)>180 then raise exception 'INVALID_DELIVERED_BY'; end if;
 if length(received)<2 or length(received)>180 then raise exception 'INVALID_RECEIVED_BY'; end if;
 if at_time is null or at_time>now()+interval '5 minutes' then raise exception 'INVALID_HANDED_AT'; end if;
 if length(memo)>2000 then raise exception 'NOTE_TOO_LONG'; end if;
 insert into public.aqari_document_handoffs(workspace_id,document_id,entity_type,entity_ref,document_no,direction,delivered_by_name,received_by_name,handed_at,note,recorded_by)
 values(p_workspace_id,d.id,d.entity_type,d.entity_ref,d.document_no,dir,delivered,received,at_time,memo,actor) returning * into saved_handoff;
 return jsonb_build_object('id',saved_handoff.id,'document_id',saved_handoff.document_id,'document_no',saved_handoff.document_no,'direction',saved_handoff.direction,'delivered_by_name',saved_handoff.delivered_by_name,'received_by_name',saved_handoff.received_by_name,'handed_at',saved_handoff.handed_at,'note',saved_handoff.note,'recorded_by',saved_handoff.recorded_by,'recorded_at',saved_handoff.recorded_at);
end $$;
revoke all on function public.aqari_document_handoff(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_document_handoff(uuid,uuid,text,jsonb) to authenticated;
