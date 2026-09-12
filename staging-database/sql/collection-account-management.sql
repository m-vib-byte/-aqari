-- Additive account editing/archive upgrade after final-gap-readback-hardening.sql.
-- Preserves monetary records; apply only to an independently verified isolated target.
begin;
alter table private.aqari_collection_accounts
 add column if not exists revision integer not null default 1,
 add column if not exists updated_by uuid,
 add column if not exists updated_at timestamptz;
create table if not exists private.aqari_collection_account_audit(
 operation_id uuid primary key,workspace_id uuid not null,account_id uuid not null,
 action text not null check(action in('edit','archive')),request jsonb not null,
 actor_id uuid not null,actor_name text not null,reason text not null,
 before_value jsonb not null,after_value jsonb not null,recorded_at timestamptz not null default now(),
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
create index if not exists aqari_collection_account_audit_read on private.aqari_collection_account_audit(workspace_id,account_id,recorded_at desc);
-- Separate immutable metadata preserves historical display without updating a posting.
create table if not exists private.aqari_collection_posting_accounts(
 posting_id uuid primary key references private.aqari_collection_postings(id),workspace_id uuid not null,account_id uuid not null,
 snapshot jsonb not null,captured_at timestamptz not null default now(),captured_on_post boolean not null,
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
alter table private.aqari_collection_account_audit enable row level security;
alter table private.aqari_collection_posting_accounts enable row level security;
revoke all on private.aqari_collection_account_audit,private.aqari_collection_posting_accounts from public,anon,authenticated;
drop trigger if exists aqari_collection_account_audit_immutable on private.aqari_collection_account_audit;
create trigger aqari_collection_account_audit_immutable before update or delete on private.aqari_collection_account_audit for each row execute function private.aqari_reject_immutable_change();
drop trigger if exists aqari_collection_posting_accounts_immutable on private.aqari_collection_posting_accounts;
create trigger aqari_collection_posting_accounts_immutable before update or delete on private.aqari_collection_posting_accounts for each row execute function private.aqari_reject_immutable_change();
insert into private.aqari_collection_posting_accounts(posting_id,workspace_id,account_id,snapshot,captured_on_post)
 select p.id,p.workspace_id,p.account_id,jsonb_build_object('id',a.id,'property_id',a.property_id,'kind',a.kind,'name',a.name,'masked_reference',a.masked_reference,'currency',a.currency,'revision',a.revision),false
 from private.aqari_collection_postings p join private.aqari_collection_accounts a on a.workspace_id=p.workspace_id and a.id=p.account_id
 on conflict(posting_id) do nothing;
create or replace function private.aqari_collection_account_posting_guard()returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare a private.aqari_collection_accounts;
begin
 -- Same workspace row lock as final-gap post_payment / financial_open, before account rows.
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into a from private.aqari_collection_accounts where workspace_id=new.workspace_id and id=new.account_id for update;
 if not found or a.status<>'active' then raise exception 'ACCOUNT_ARCHIVED_OR_UNAVAILABLE' using errcode='23514';end if;
 insert into private.aqari_collection_posting_accounts(posting_id,workspace_id,account_id,snapshot,captured_on_post)
 values(new.id,new.workspace_id,new.account_id,jsonb_build_object('id',a.id,'property_id',a.property_id,'kind',a.kind,'name',a.name,'masked_reference',a.masked_reference,'currency',a.currency,'revision',a.revision),true);
 return new;
end $$;
revoke all on function private.aqari_collection_account_posting_guard() from public,anon,authenticated;
drop trigger if exists aqari_collection_account_posting_guard on private.aqari_collection_postings;
create trigger aqari_collection_account_posting_guard after insert on private.aqari_collection_postings for each row execute function private.aqari_collection_account_posting_guard();
create or replace function private.aqari_collection_account_manage(w uuid,action text,d jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a private.aqari_collection_accounts;event private.aqari_collection_account_audit;ident uuid;op uuid;request jsonb;before_row jsonb;actor text;reason text;expected integer;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>6000 then raise invalid_parameter_value using message='INVALID_ACCOUNT_REQUEST';end if;
 if action not in('list','read','edit','archive') then raise invalid_parameter_value using message='INVALID_ACCOUNT_ACTION';end if;
 if action='list' then return jsonb_build_object('accounts',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by' order by x.name,x.id),'[]') from private.aqari_collection_accounts x where x.workspace_id=w),
  'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by x.name),'[]')from public.aqari_properties x where x.workspace_id=w),
  'posting_accounts',(select coalesce(jsonb_agg(jsonb_build_object('posting_id',x.posting_id,'snapshot',x.snapshot,'captured_on_post',x.captured_on_post)),'[]')from private.aqari_collection_posting_accounts x where x.workspace_id=w));end if;
 ident:=nullif(d->>'id','')::uuid;op:=nullif(d->>'operation_id','')::uuid;
 if action in('edit','archive') then
  perform private.aqari_require_sensitive_aal2(w);
  perform 1 from public.aqari_app_state where workspace_id=w for update;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if action='read' then select * into a from private.aqari_collection_accounts x where x.workspace_id=w and x.id=ident;
 else select * into a from private.aqari_collection_accounts x where x.workspace_id=w and x.id=ident for update;end if;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='read' then
  return jsonb_build_object('account',to_jsonb(a)-'created_by','events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc,x.operation_id),'[]')from(select * from private.aqari_collection_account_audit x where x.workspace_id=w and x.account_id=ident and (op is null or x.operation_id=op) order by x.recorded_at desc,x.operation_id limit 25)x));
 end if;
 reason:=btrim(coalesce(d->>'reason',''));expected:=(d->>'revision')::integer;
 if op is null or expected is null or expected<1 or length(reason) not between 3 and 1000 then raise check_violation using message='ACCOUNT_REVISION_AND_REASON_REQUIRED';end if;
 if exists(select 1 from jsonb_object_keys(d)k where k not in('id','operation_id','revision','reason','name','masked_reference')) then raise check_violation using message='ACCOUNT_IDENTITY_IMMUTABLE';end if;
 request:=jsonb_build_object('id',ident,'operation_id',op,'revision',expected,'reason',reason,'action',action);
 if action='edit' then
  if length(btrim(coalesce(d->>'name',''))) not between 2 and 160 or length(btrim(coalesce(d->>'masked_reference',''))) not between 1 and 80
   or length(regexp_replace(translate(d->>'masked_reference','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g'))>4 then raise check_violation using message='ACCOUNT_NAME_OR_MASKED_REFERENCE_REQUIRED';end if;
  request:=request||jsonb_build_object('name',btrim(d->>'name'),'masked_reference',btrim(d->>'masked_reference'));
 elsif d?'name' or d?'masked_reference' then raise check_violation using message='ARCHIVE_CANNOT_EDIT_ACCOUNT';end if;
 select * into event from private.aqari_collection_account_audit x where x.workspace_id=w and x.operation_id=op;
 if found then
  if event.request is distinct from request or event.actor_id is distinct from auth.uid() then raise unique_violation using message='ACCOUNT_OPERATION_CONFLICT';end if;
  return jsonb_build_object('account',to_jsonb(a)-'created_by','operation_id',event.operation_id,'replayed',true);
 end if;
 if a.revision is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
 if a.status<>'active' then raise check_violation using message='ACCOUNT_ARCHIVED';end if;
 before_row:=to_jsonb(a);select coalesce(nullif(display_name,''),auth.uid()::text)into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 if action='edit' then
  if a.name=request->>'name' and a.masked_reference=request->>'masked_reference' then raise check_violation using message='ACCOUNT_UNCHANGED';end if;
  update private.aqari_collection_accounts x set name=request->>'name',masked_reference=request->>'masked_reference',revision=x.revision+1,updated_by=auth.uid(),updated_at=now() where x.id=ident and x.workspace_id=w returning * into a;
 else
  update private.aqari_collection_accounts x set status='archived',revision=x.revision+1,updated_by=auth.uid(),updated_at=now() where x.id=ident and x.workspace_id=w returning * into a;
 end if;
 insert into private.aqari_collection_account_audit(operation_id,workspace_id,account_id,action,request,actor_id,actor_name,reason,before_value,after_value)
 values(op,w,ident,action,request,auth.uid(),actor,reason,before_row,to_jsonb(a));
 return jsonb_build_object('account',to_jsonb(a)-'created_by','operation_id',op,'replayed',false);
end $$;
revoke all on function private.aqari_collection_account_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_collection_account_manage(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_collection_account_manage(p_workspace_id uuid,p_action text,p_data jsonb default '{}')returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.aqari_collection_account_manage(p_workspace_id,p_action,p_data) $$;
revoke all on function public.aqari_collection_account_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_collection_account_manage(uuid,text,jsonb) to authenticated;
commit;
