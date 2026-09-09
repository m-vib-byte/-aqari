-- V267 isolated Staging only. Tenant property notices; no external message delivery.
begin;
create table private.aqari_property_notices(
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,
 kind text not null check(kind in ('notice','guidance','circular')),
 title text not null check(length(btrim(title)) between 1 and 200),
 body text not null check(length(btrim(body)) between 1 and 10000),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 revision integer not null default 1 check(revision>0),
 published_at timestamptz,expires_at timestamptz,
 created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(status<>'published' or published_at is not null)
);
create index aqari_notices_feed on private.aqari_property_notices(workspace_id,property_id,status,published_at desc);
create table private.aqari_property_notice_versions(
 notice_id uuid not null references private.aqari_property_notices(id),revision integer not null,
 action text not null check(action in ('save','publish','archive')),actor_id uuid not null,actor_name text not null,
 recorded_at timestamptz not null default now(),reason text not null default '',before_snapshot jsonb,after_snapshot jsonb not null,
 primary key(notice_id,revision)
);
create table private.aqari_property_notice_acknowledgements(
 notice_id uuid not null,notice_revision integer not null,user_id uuid not null,tenant_id uuid not null,
 user_name text not null,acknowledged_at timestamptz not null default now(),
 primary key(notice_id,notice_revision,user_id),
 foreign key(notice_id,notice_revision) references private.aqari_property_notice_versions(notice_id,revision)
);
alter table private.aqari_property_notices enable row level security;
alter table private.aqari_property_notice_versions enable row level security;
alter table private.aqari_property_notice_acknowledgements enable row level security;
revoke all on private.aqari_property_notices,private.aqari_property_notice_versions,private.aqari_property_notice_acknowledgements from public,anon,authenticated;

create function private.aqari_can_read_property_notice(w uuid,p uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.aqari_portal_accounts a
  join public.aqari_leases l on l.workspace_id=a.workspace_id and l.tenant_id=a.tenant_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where a.user_id=auth.uid() and a.workspace_id=w and a.is_active
   and private.aqari_owns_tenant(w,a.tenant_id) and u.property_id=p and l.status='signed'
   and (now() at time zone 'Asia/Kuwait')::date between l.start_date and l.end_date
 )
$$;
revoke all on function private.aqari_can_read_property_notice(uuid,uuid) from public,anon,authenticated;

-- Private tables stay inaccessible. This single guarded RPC is the API boundary.
create function public.aqari_property_notices(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.aqari_property_notices%rowtype; previous jsonb; result jsonb; notice_id uuid;
 expected integer; who text; recipient public.aqari_portal_accounts%rowtype; at_time timestamptz;
 expiration timestamptz; allowed_keys text[]; why text:='';prop uuid;
begin
 if auth.uid() is null or p_workspace_id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action is null or p_action not in ('list','save','publish','archive','history','feed','ack') then raise exception 'عملية التعاميم غير صالحة.';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'بيانات التعميم غير صالحة.';end if;
 allowed_keys:=case when p_action='save' then array['id','revision','property_id','kind','title','body','expires_at']
  when p_action='archive' then array['id','revision','reason'] when p_action in ('publish','ack') then array['id','revision']
  when p_action='history' then array['id'] else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed_keys)) then raise exception 'حقول التعميم غير مسموحة.';end if;

 if p_action in ('feed','ack') then
  select * into recipient from public.aqari_portal_accounts a where a.user_id=auth.uid() and a.workspace_id=p_workspace_id and a.is_active;
  if not found or not private.aqari_owns_tenant(p_workspace_id,recipient.tenant_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if p_action='feed' then
   return coalesce((select jsonb_agg(q.item order by q.published_at desc,q.id) from (
    select x.id,x.published_at,jsonb_build_object('id',x.id,'property_id',x.property_id,'property_name',p.name,
     'kind',x.kind,'title',x.title,'body',x.body,'status',x.status,'revision',x.revision,
     'published_at',x.published_at,'expires_at',x.expires_at,'acknowledged_at',a.acknowledged_at) item
    from private.aqari_property_notices x join public.aqari_properties p on p.workspace_id=x.workspace_id and p.id=x.property_id
    left join private.aqari_property_notice_acknowledgements a on a.notice_id=x.id and a.notice_revision=x.revision and a.user_id=auth.uid()
    where x.workspace_id=p_workspace_id and x.status='published' and x.published_at<=now()
     and (x.expires_at is null or x.expires_at>now()) and private.aqari_can_read_property_notice(x.workspace_id,x.property_id)
    order by x.published_at desc,x.id limit 50
   ) q),'[]');
  end if;
  notice_id:=nullif(p_data->>'id','')::uuid;expected:=nullif(p_data->>'revision','')::integer;
  select * into n from private.aqari_property_notices x where x.workspace_id=p_workspace_id and x.id=notice_id for share;
  if not found or n.status<>'published' or n.published_at>now() or (n.expires_at is not null and n.expires_at<=now())
    or not private.aqari_can_read_property_notice(n.workspace_id,n.property_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if expected is distinct from n.revision then raise serialization_failure using message='REVISION_CONFLICT';end if;
  select full_name into who from public.aqari_tenants where id=recipient.tenant_id and workspace_id=p_workspace_id;
  insert into private.aqari_property_notice_acknowledgements(notice_id,notice_revision,user_id,tenant_id,user_name)
   values(n.id,n.revision,auth.uid(),recipient.tenant_id,who) on conflict on constraint aqari_property_notice_acknowledgements_pkey do nothing;
  select acknowledged_at into at_time from private.aqari_property_notice_acknowledgements a where a.notice_id=n.id and a.notice_revision=n.revision and a.user_id=auth.uid();
  return jsonb_build_object('acknowledged_at',at_time);
 end if;

 if not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'notifications',case when p_action in ('list','history') then 'read' else 'write' end)
 then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='list' then
  return jsonb_build_object('manager',true,
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=p_workspace_id),
   'notices',(select coalesce(jsonb_agg(q.item order by q.updated_at desc,q.id),'[]') from (
    select x.id,x.updated_at,to_jsonb(x)||jsonb_build_object('ack_count',(select count(*) from private.aqari_property_notice_acknowledgements a where a.notice_id=x.id)) item
    from private.aqari_property_notices x where x.workspace_id=p_workspace_id order by x.updated_at desc,x.id limit 100
   ) q));
 end if;
 notice_id:=nullif(p_data->>'id','')::uuid;
 if notice_id is null then raise exception 'رقم التعميم مطلوب.';end if;
 select * into n from private.aqari_property_notices x where x.workspace_id=p_workspace_id and x.id=notice_id for update;
 if p_action='history' then
  if n.id is null then raise exception 'التعميم غير موجود.';end if;
  return jsonb_build_object('versions',(select coalesce(jsonb_agg(to_jsonb(v) order by v.revision desc),'[]') from private.aqari_property_notice_versions v where v.notice_id=n.id),
   'acknowledgements',(select coalesce(jsonb_agg(jsonb_build_object('notice_revision',a.notice_revision,'user_name',a.user_name,'acknowledged_at',a.acknowledged_at) order by a.acknowledged_at desc),'[]') from private.aqari_property_notice_acknowledgements a where a.notice_id=n.id));
 end if;
 expected:=nullif(p_data->>'revision','')::integer;
 if expected is distinct from coalesce(n.revision,0) then raise serialization_failure using message='REVISION_CONFLICT';end if;
 previous:=case when n.id is null then null else to_jsonb(n) end;
 select display_name into who from public.aqari_profiles where user_id=auth.uid();who:=coalesce(nullif(who,''),auth.uid()::text);
 if p_action='save' then
  if n.id is not null and n.status<>'draft' then raise exception 'لا يمكن تعديل النسخة المنشورة؛ أنشئ مسودة جديدة واحفظ الأصل.';end if;
  if jsonb_typeof(p_data->'title') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string'
    or length(btrim(p_data->>'title')) not between 1 and 200 or length(btrim(p_data->>'body')) not between 1 and 10000
    or coalesce(p_data->>'kind','') not in ('notice','guidance','circular') then raise exception 'أكمل عنوان التعميم ونصه ونوعه.';end if;
  prop:=nullif(p_data->>'property_id','')::uuid;
  if not exists(select 1 from public.aqari_properties where id=prop and workspace_id=p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  expiration:=nullif(p_data->>'expires_at','')::timestamptz;
  if n.id is null then
   insert into private.aqari_property_notices(id,workspace_id,property_id,kind,title,body,expires_at,created_by)
   values(notice_id,p_workspace_id,prop,p_data->>'kind',btrim(p_data->>'title'),btrim(p_data->>'body'),expiration,auth.uid()) returning * into n;
  else
   update private.aqari_property_notices set property_id=prop,kind=p_data->>'kind',title=btrim(p_data->>'title'),body=btrim(p_data->>'body'),expires_at=expiration,revision=revision+1,updated_at=now() where id=n.id returning * into n;
  end if;
 elsif p_action='publish' then
  if n.id is null or n.status<>'draft' then raise exception 'النشر متاح للمسودة المحفوظة فقط.';end if;
  if n.expires_at is not null and n.expires_at<=now() then raise exception 'راجع موعد انتهاء عرض التعميم قبل نشره.';end if;
  update private.aqari_property_notices set status='published',published_at=now(),revision=revision+1,updated_at=now() where id=n.id returning * into n;
 else
  if n.id is null or n.status='archived' then raise exception 'التعميم غير موجود أو مؤرشف.';end if;
  why:=btrim(coalesce(p_data->>'reason',''));
  if length(why) not between 3 and 500 then raise exception 'سبب الأرشفة مطلوب لحفظ السجل.';end if;
  update private.aqari_property_notices set status='archived',revision=revision+1,updated_at=now() where id=n.id returning * into n;
 end if;
 insert into private.aqari_property_notice_versions(notice_id,revision,action,actor_id,actor_name,reason,before_snapshot,after_snapshot)
 values(n.id,n.revision,p_action,auth.uid(),who,why,previous,to_jsonb(n));
 return to_jsonb(n);
end $$;
revoke all on function public.aqari_property_notices(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_property_notices(uuid,text,jsonb) to authenticated;
commit;
