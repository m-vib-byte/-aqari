-- Candidate: preserve the existing global scope, split it by document kind.
-- No reset by year/property/workspace; no rewrite of issued numbers or reservations.
-- Applying this requires the matching UI that accepts both legacy and typed numbers.
begin;
create table if not exists private.aqari_official_kind_counters (
 kind text primary key,
 last_value bigint not null check(last_value>0)
);
alter table private.aqari_official_kind_counters enable row level security;
revoke all on private.aqari_official_kind_counters from public,anon,authenticated;
create or replace function private.aqari_next_official_kind_number(p_kind text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare serial bigint;
begin
 if p_kind is null or p_kind !~ '^[a-z][a-z_]{1,63}$' or private.aqari_official_template(p_kind) is null then
  raise exception 'INVALID_DOCUMENT_KIND' using errcode='22023';
 end if;
 insert into private.aqari_official_kind_counters(kind,last_value) values(p_kind,1)
 on conflict(kind) do update set last_value=private.aqari_official_kind_counters.last_value+1
 returning last_value into serial;
 return 'AQ-'||upper(p_kind)||'-'||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(serial::text,greatest(8,length(serial::text)),'0');
end $$;
revoke all on function private.aqari_next_official_kind_number(text) from public,anon,authenticated;
create or replace function public.aqari_official_document_number(p_workspace_id uuid,p_request_id uuid,p_kind text,p_entity_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;r private.aqari_official_number_reservations;t text;
begin
 if auth.uid() is null or not private.aqari_official_document_access(w,true) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 t:=case when p_kind in ('payment_voucher','expense_approval','daily_collection') then 'property' when p_kind='work_order' then 'work_order' else 'lease' end;
 if private.aqari_official_template(p_kind) is null or not private.aqari_official_entity_scope(w,t,p_entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 perform 1 from public.aqari_workspaces where id=w for update;
 select * into r from private.aqari_official_number_reservations where id=p_request_id;
 if found then
  if r.workspace_id<>w or r.actor_id<>auth.uid() or r.kind<>p_kind or r.entity_id<>p_entity_id then raise exception 'DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 else
  insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
   values(p_request_id,w,private.aqari_next_official_kind_number(p_kind),p_kind,p_entity_id,auth.uid()) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'workspace_id',r.workspace_id,'document_no',r.document_no,'kind',r.kind,'entity_id',r.entity_id);
end $$;
commit;
