-- Staging only: tenant identity derives from a saved tenant email and verified Auth account.
create or replace function private.aqari_owns_tenant(w uuid,t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.aqari_portal_accounts a join auth.users u on u.id=a.user_id join public.aqari_tenants p on p.id=a.tenant_id where a.user_id=auth.uid() and a.workspace_id=w and a.tenant_id=t and a.is_active and p.is_active and u.email_confirmed_at is not null and lower(u.email)=lower(p.email))
$$;
revoke all on function private.aqari_owns_tenant(uuid,uuid) from public,anon;
grant execute on function private.aqari_owns_tenant(uuid,uuid) to authenticated;
create function private.aqari_writer(w uuid) returns boolean language sql stable security invoker set search_path='' as $$ select exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active and role in ('general_manager','property_manager','accountant')) $$;
revoke all on function private.aqari_writer(uuid) from public,anon;
grant execute on function private.aqari_writer(uuid) to authenticated;
alter policy docs_staff_insert on public.aqari_documents with check(private.aqari_writer(workspace_id) and created_by=auth.uid() and status='draft' and storage_path like workspace_id::text||'/%');
alter policy docs_staff_finalize on public.aqari_documents using(private.aqari_writer(workspace_id) and status='draft') with check(private.aqari_writer(workspace_id) and status in ('uploaded','cancelled'));
alter policy v267_document_upload on storage.objects with check(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d where d.storage_path=name and d.storage_bucket=bucket_id and d.status='draft' and private.aqari_writer(d.workspace_id)));
create or replace function private.aqari_handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare allowed private.aqari_allowed_users%rowtype;w uuid;t public.aqari_tenants%rowtype;
begin
 select * into allowed from private.aqari_allowed_users where email=lower(btrim(coalesce(new.email,''))) and is_active;
 if found then
  select id into w from public.aqari_workspaces where slug=allowed.workspace_slug;
  if w is null then raise exception 'WORKSPACE_NOT_CONFIGURED';end if;
  insert into public.aqari_profiles(user_id,display_name) values(new.id,allowed.display_name);
  insert into public.aqari_memberships(workspace_id,user_id,role,is_active) values(w,new.id,allowed.role,true);
 else
  if (select count(*) from public.aqari_tenants where lower(email)=lower(new.email) and is_active)<>1 then raise exception 'EMAIL_NOT_AUTHORIZED' using errcode='28000';end if;
  select * into t from public.aqari_tenants where lower(email)=lower(new.email) and is_active;
  insert into public.aqari_profiles(user_id,display_name) values(new.id,t.full_name);
  insert into public.aqari_portal_accounts(user_id,workspace_id,tenant_id) values(new.id,t.workspace_id,t.id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_handle_new_user() from public,anon,authenticated;
create policy tenant_document on public.aqari_documents for select to authenticated using(status='uploaded' and document_type='tenant_attachment' and exists(select 1 from public.aqari_tenants t where t.workspace_id=aqari_documents.workspace_id and t.external_ref=aqari_documents.entity_ref and private.aqari_owns_tenant(t.workspace_id,t.id)));
create policy tenant_document_download on storage.objects for select to authenticated using(bucket_id='aqari-documents' and exists(select 1 from public.aqari_documents d join public.aqari_tenants t on t.workspace_id=d.workspace_id and t.external_ref=d.entity_ref where d.storage_path=name and d.storage_bucket=bucket_id and d.status='uploaded' and d.document_type='tenant_attachment' and private.aqari_owns_tenant(t.workspace_id,t.id)));
create table public.aqari_maintenance_requests(id uuid primary key default gen_random_uuid(),request_no bigint generated always as identity unique,workspace_id uuid not null,lease_id uuid not null,tenant_id uuid not null,description text not null check(length(btrim(description)) between 5 and 3000),status text not null default 'received' check(status in ('received','assigned','in_progress','completed','cancelled')),cost numeric(15,3) not null default 0 check(cost>=0),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id));
alter table public.aqari_maintenance_requests enable row level security;
revoke all on public.aqari_maintenance_requests from public,anon,authenticated;
grant select,insert on public.aqari_maintenance_requests to authenticated;
grant update(status,cost) on public.aqari_maintenance_requests to authenticated;
grant usage on sequence public.aqari_maintenance_requests_request_no_seq to authenticated;
create policy maintenance_read on public.aqari_maintenance_requests for select to authenticated using(private.aqari_staff(workspace_id) or private.aqari_owns_tenant(workspace_id,tenant_id));
create policy maintenance_insert on public.aqari_maintenance_requests for insert to authenticated with check(created_by=auth.uid() and status='received' and cost=0 and exists(select 1 from public.aqari_leases l where l.workspace_id=aqari_maintenance_requests.workspace_id and l.id=lease_id and l.tenant_id=aqari_maintenance_requests.tenant_id and l.status='signed' and current_date between l.start_date and l.end_date and (private.aqari_writer(l.workspace_id) or private.aqari_owns_tenant(l.workspace_id,l.tenant_id))));
create policy maintenance_update on public.aqari_maintenance_requests for update to authenticated using(private.aqari_writer(workspace_id)) with check(private.aqari_writer(workspace_id));
create function public.aqari_tenant_portal_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.aqari_portal_accounts%rowtype;
begin
 select * into a from public.aqari_portal_accounts where user_id=auth.uid() and is_active;
 if not found or not private.aqari_owns_tenant(a.workspace_id,a.tenant_id) then raise exception 'TENANT_ACCESS_DENIED' using errcode='42501';end if;
 return jsonb_build_object('account',to_jsonb(a),'tenant',(select to_jsonb(t) from public.aqari_tenants t where t.id=a.tenant_id),'leases',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.aqari_leases l where l.tenant_id=a.tenant_id),'payments',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.aqari_rent_payments p join public.aqari_leases l on l.id=p.lease_id where l.tenant_id=a.tenant_id),'maintenance',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from public.aqari_maintenance_requests m where m.tenant_id=a.tenant_id));
end $$;
revoke all on function public.aqari_tenant_portal_snapshot() from public,anon;
grant execute on function public.aqari_tenant_portal_snapshot() to authenticated;
