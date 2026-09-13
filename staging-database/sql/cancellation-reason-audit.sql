-- AQARI V267 Preview/Staging only.
-- G07-03: every cancellation/void must carry a reason, actor and timestamp.
-- Applied and transaction-tested on isolated V267 Preview before this source was committed.

begin;

create table if not exists private.aqari_cancellation_audit(
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.aqari_workspaces(id),
  entity_type text not null check(entity_type in ('lease','rent_payment','document','expense','official_document')),
  entity_id text not null,
  action text not null check(action in ('cancel','void')),
  reason text not null check(length(btrim(reason)) between 3 and 500),
  actor_id uuid not null,
  actor_name text not null,
  recorded_at timestamptz not null default now(),
  before_value jsonb not null,
  after_value jsonb not null,
  unique(workspace_id,entity_type,entity_id,action)
);
alter table private.aqari_cancellation_audit enable row level security;
revoke all on private.aqari_cancellation_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_cancellation_audit_immutable on private.aqari_cancellation_audit;
create trigger aqari_cancellation_audit_immutable before update or delete on private.aqari_cancellation_audit
for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_lease_cancellation_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare why text; actor text;
begin
  if old.status='cancelled' and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'CANCELLED_LEASE_IMMUTABLE' using errcode='23514';
  end if;
  if old.status is distinct from 'cancelled' and new.status='cancelled' then
    why:=btrim(coalesce(new.snapshot->>'changeReason',''));
    if length(why) not between 3 and 500 then raise exception 'CANCELLATION_REASON_REQUIRED' using errcode='23514'; end if;
    if auth.uid() is null then raise insufficient_privilege using message='CANCELLATION_ACTOR_REQUIRED'; end if;
    select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
    actor:=coalesce(actor,auth.uid()::text);
    insert into private.aqari_cancellation_audit(workspace_id,entity_type,entity_id,action,reason,actor_id,actor_name,before_value,after_value)
    values(new.workspace_id,'lease',new.id::text,'cancel',why,auth.uid(),actor,to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end $$;
revoke all on function private.aqari_lease_cancellation_guard() from public,anon,authenticated,service_role;
drop trigger if exists aa_aqari_lease_cancellation_reason on public.aqari_leases;
create trigger aa_aqari_lease_cancellation_reason before update on public.aqari_leases
for each row execute function private.aqari_lease_cancellation_guard();

create or replace function private.aqari_document_cancellation_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from 'cancelled' and new.status='cancelled' then
    if auth.uid() is null or not exists(
      select 1 from private.aqari_cancellation_audit a
      where a.workspace_id=new.workspace_id and a.entity_type='document' and a.entity_id=new.id::text
        and a.action='cancel' and a.actor_id=auth.uid()
    ) then raise exception 'DOCUMENT_CANCELLATION_REASON_REQUIRED' using errcode='23514'; end if;
  end if;
  if old.status='cancelled' and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'CANCELLED_DOCUMENT_IMMUTABLE' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.aqari_document_cancellation_guard() from public,anon,authenticated,service_role;
drop trigger if exists aa_aqari_document_cancellation_reason on public.aqari_documents;
create trigger aa_aqari_document_cancellation_reason before update on public.aqari_documents
for each row execute function private.aqari_document_cancellation_guard();

create or replace function public.aqari_cancel_document(p_document_id uuid,p_reason text)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare target public.aqari_documents%rowtype; why text:=btrim(coalesce(p_reason,'')); actor text; after_snapshot jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  select * into target from public.aqari_documents where id=p_document_id for update;
  if not found or not private.aqari_can(target.workspace_id,'documents','write')
     or not private.aqari_document_entity(target.workspace_id,target.entity_type,target.entity_ref,'write') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  if target.status='cancelled' then return target.id; end if;
  if target.status<>'draft' then raise exception 'DOCUMENT_IMMUTABLE' using errcode='23514'; end if;
  if length(why) not between 3 and 500 then raise exception 'DOCUMENT_CANCELLATION_REASON_REQUIRED' using errcode='23514'; end if;
  select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
  actor:=coalesce(actor,auth.uid()::text);
  after_snapshot:=jsonb_set(to_jsonb(target),'{status}','"cancelled"'::jsonb,false);
  insert into private.aqari_cancellation_audit(workspace_id,entity_type,entity_id,action,reason,actor_id,actor_name,before_value,after_value)
  values(target.workspace_id,'document',target.id::text,'cancel',why,auth.uid(),actor,to_jsonb(target),after_snapshot);
  update public.aqari_documents set status='cancelled' where id=target.id;
  return target.id;
end $$;
revoke all on function public.aqari_cancel_document(uuid,text) from public,anon,service_role;
grant execute on function public.aqari_cancel_document(uuid,text) to authenticated;

create or replace function private.aqari_receipt_cancellation_audit_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.aqari_cancellation_audit(workspace_id,entity_type,entity_id,action,reason,actor_id,actor_name,before_value,after_value)
  values(new.workspace_id,'rent_payment',new.payment_id::text,'cancel',btrim(new.reason),new.approved_by,new.approved_by_name,new.snapshot,jsonb_build_object('cancelled',true,'cancelled_at',new.cancelled_at));
  return new;
end $$;
revoke all on function private.aqari_receipt_cancellation_audit_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aqari_receipt_cancellation_reason_audit on private.aqari_receipt_cancellations;
create trigger aqari_receipt_cancellation_reason_audit after insert on private.aqari_receipt_cancellations
for each row execute function private.aqari_receipt_cancellation_audit_trigger();

create or replace function private.aqari_expense_cancellation_audit_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.state is distinct from 'cancelled' and new.state='cancelled' then
    insert into private.aqari_cancellation_audit(workspace_id,entity_type,entity_id,action,reason,actor_id,actor_name,before_value,after_value)
    values(new.workspace_id,'expense',new.id::text,'cancel',btrim(new.cancel_reason),new.cancelled_by,new.cancelled_by_name,to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end $$;
revoke all on function private.aqari_expense_cancellation_audit_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aqari_expense_cancellation_reason_audit on private.aqari_financial_expenses;
create trigger aqari_expense_cancellation_reason_audit after update on private.aqari_financial_expenses
for each row execute function private.aqari_expense_cancellation_audit_trigger();

create or replace function private.aqari_official_document_void_audit_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is distinct from 'void' and new.status='void' then
    if new.voided_by is null or new.voided_at is null or length(btrim(coalesce(new.void_reason,''))) not between 3 and 500 then
      raise exception 'DOCUMENT_REASON_REQUIRED' using errcode='23514';
    end if;
    insert into private.aqari_cancellation_audit(workspace_id,entity_type,entity_id,action,reason,actor_id,actor_name,before_value,after_value)
    values(new.workspace_id,'official_document',new.id::text,'void',btrim(new.void_reason),new.voided_by,
      coalesce((select nullif(p.display_name,'') from public.aqari_profiles p where p.user_id=new.voided_by),new.voided_by::text),to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end $$;
revoke all on function private.aqari_official_document_void_audit_trigger() from public,anon,authenticated,service_role;
drop trigger if exists aqari_official_document_void_reason_audit on private.aqari_official_document_series;
create trigger aqari_official_document_void_reason_audit after update on private.aqari_official_document_series
for each row execute function private.aqari_official_document_void_audit_trigger();

create or replace function public.aqari_cancellation_history(p_workspace_id uuid,p_entity_type text default null,p_entity_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('entity_type',a.entity_type,'entity_id',a.entity_id,'action',a.action,'reason',a.reason,'actor_name',a.actor_name,'recorded_at',a.recorded_at) order by a.id desc)
    from private.aqari_cancellation_audit a
    where a.workspace_id=p_workspace_id
      and (p_entity_type is null or a.entity_type=p_entity_type)
      and (p_entity_id is null or a.entity_id=p_entity_id)),'[]'::jsonb);
end $$;
revoke all on function public.aqari_cancellation_history(uuid,text,text) from public,anon,service_role;
grant execute on function public.aqari_cancellation_history(uuid,text,text) to authenticated;

commit;
