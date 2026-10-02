-- Isolated candidate: location/automatic reference/channels only.
-- Preserves existing master function guards, owner normalization and audit logic.
-- Exact anchors fail closed if the deployed definition has changed. Apply once.
begin;
alter table private.aqari_property_master add column if not exists location_url text not null default '';
alter table private.aqari_property_master add column if not exists property_automatic_ref text not null default '';
create unique index if not exists aqari_property_master_automatic_ref_uq
 on private.aqari_property_master(workspace_id,lower(btrim(property_automatic_ref))) where btrim(property_automatic_ref)<>'';
do $patch$
declare s text; a text; b text; pair text[];
begin
 s:=pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure);
 foreach pair slice 1 in array array[
  array[$a$'whatsapp','assets')$a$,$b$'whatsapp','assets','locationUrl','propertyAutomaticRef')$b$],
  array[$a$income numeric; rev bigint;$a$,$b$income numeric; rev bigint; location_value text; automatic_value text;$b$],
  array[$a$ select coalesce(nullif(display_name,''),auth.uid()::text) into actor$a$,$b$ location_value:=case when p_data?'locationUrl' then btrim(coalesce(p_data->>'locationUrl','')) else coalesce(old_row.location_url,'') end;
 automatic_value:=case when p_data?'propertyAutomaticRef' then btrim(coalesce(p_data->>'propertyAutomaticRef','')) else coalesce(old_row.property_automatic_ref,'') end;
 if length(location_value)>2000 or length(automatic_value)>200 then raise invalid_parameter_value using message='PROPERTY_EXTENDED_FIELD_INVALID';end if;
 if location_value<>'' and location_value !~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$' then raise invalid_parameter_value using message='PROPERTY_LOCATION_URL_INVALID';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor$b$],
  array[$a$contact_whatsapp,assets,revision,$a$,$b$contact_whatsapp,assets,location_url,property_automatic_ref,revision,$b$],
  array[$a$coalesce(p_data->'assets','{}'::jsonb),rev+1$a$,$b$coalesce(p_data->'assets','{}'::jsonb),location_value,automatic_value,rev+1$b$],
  array[$a$assets=excluded.assets,revision=$a$,$b$assets=excluded.assets,location_url=excluded.location_url,property_automatic_ref=excluded.property_automatic_ref,revision=$b$]
 ] loop
  a:=pair[1];b:=pair[2];
  if (length(s)-length(replace(s,a,'')))/length(a)<>1 then raise exception 'LOCATION_MASTER_ANCHOR_MISMATCH';end if;
  s:=replace(s,a,b);
 end loop;
 execute s;
 s:=pg_get_functiondef('private.aqari_property_master_snapshot(uuid,uuid)'::regprocedure);
 a:=$a$'revision',coalesce(m.revision,0)$a$;
 b:=$b$'locationUrl',coalesce(m.location_url,''),'propertyAutomaticRef',coalesce(m.property_automatic_ref,''),'revision',coalesce(m.revision,0)$b$;
 if (length(s)-length(replace(s,a,'')))/length(a)<>1 then raise exception 'LOCATION_SNAPSHOT_ANCHOR_MISMATCH';end if;
 execute replace(s,a,b);
end $patch$;
alter table private.aqari_property_channels drop constraint if exists aqari_property_channels_kind_check;
alter table private.aqari_property_channels add constraint aqari_property_channels_kind_check
 check(kind in('website','instagram','tiktok','snapchat','x','facebook','youtube','whatsapp','email','phone','other'));
alter table private.aqari_property_channels drop constraint if exists aqari_property_channels_public_url_check;
alter table private.aqari_property_channels add constraint aqari_property_channels_public_url_check
 check(public_url ~ '^(https://|mailto:|tel:)');
alter table private.aqari_property_channels add column if not exists display_label text not null default '';
alter table private.aqari_property_channels add column if not exists sort_order integer not null default 100 check(sort_order between 0 and 10000);
alter table private.aqari_property_channels add column if not exists revision bigint not null default 1 check(revision>0);
alter table private.aqari_property_channels add column if not exists updated_by uuid;
alter table private.aqari_property_channels add column if not exists updated_at timestamptz not null default now();
update private.aqari_property_channels set updated_by=created_by where updated_by is null;
alter table private.aqari_property_channels alter column updated_by set not null;

create or replace function private.aqari_property_channel_no_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise check_violation using message='PROPERTY_CHANNEL_DELETE_FORBIDDEN';end $$;
revoke all on function private.aqari_property_channel_no_delete() from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_channel_no_delete on private.aqari_property_channels;
create trigger aqari_property_channel_no_delete before delete on private.aqari_property_channels
 for each row execute function private.aqari_property_channel_no_delete();

create or replace function public.aqari_property_channel_settings(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);prop uuid;ident uuid;expected bigint;why text;actor text;manager boolean;before_row jsonb;after_row jsonb;kind_value text;url_value text;label_value text;reference_value text;status_value text;visible_value boolean;sort_value integer;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 prop:=nullif(d->>'propertyId','')::uuid;
 if prop is null or not private.aqari_can_property(w,prop,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can_property(w,prop,'properties','write');
 if p_action='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'propertyId',prop,'manager',manager,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'url',c.public_url,'label',c.display_label,'managementReference',case when manager then c.management_reference else '' end,'tenantVisible',c.tenant_visible,'status',c.status,'sortOrder',c.sort_order,'revision',c.revision) order by c.sort_order,c.kind,c.created_at) from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and (manager or (c.tenant_visible and c.status='active'))),'[]'::jsonb));
 end if;
 if p_action<>'save' or not manager then raise insufficient_privilege using message='PROPERTY_CHANNEL_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());expected:=coalesce((d->>'revision')::bigint,0);why:=btrim(coalesce(d->>'reason',''));
 kind_value:=lower(btrim(coalesce(d->>'kind','')));url_value:=btrim(coalesce(d->>'url',''));label_value:=btrim(coalesce(d->>'label',''));reference_value:=btrim(coalesce(d->>'managementReference',''));status_value:=coalesce(nullif(d->>'status',''),'active');visible_value:=coalesce((d->>'tenantVisible')::boolean,false);sort_value:=coalesce((d->>'sortOrder')::integer,100);
 if length(why) not between 3 and 1000 or kind_value not in('website','instagram','tiktok','snapchat','x','facebook','youtube','whatsapp','email','phone','other') or length(label_value)>200 or length(reference_value)>1000 or status_value not in('active','hidden','archived') or sort_value not between 0 and 10000 then raise invalid_parameter_value using message='PROPERTY_CHANNEL_INVALID';end if;
 if kind_value='email' and url_value !~ '^mailto:[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';
 elsif kind_value='phone' and url_value !~ '^tel:[+]?[0-9]{8,15}$' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';
 elsif kind_value not in('email','phone') and url_value !~ '^https://' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';end if;
 if status_value<>'active' then visible_value:=false;end if;
 select to_jsonb(c) into before_row from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and c.id=ident for update;
 if before_row is null then
  if expected<>0 then raise serialization_failure using message='PROPERTY_CHANNEL_REVISION_CONFLICT';end if;
  insert into private.aqari_property_channels(id,workspace_id,property_id,kind,public_url,management_reference,tenant_visible,status,display_label,sort_order,revision,created_by,updated_by,updated_at)
  values(ident,w,prop,kind_value,url_value,reference_value,visible_value,status_value,label_value,sort_value,1,auth.uid(),auth.uid(),now());
 else
  if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='PROPERTY_CHANNEL_REVISION_CONFLICT';end if;
  update private.aqari_property_channels set kind=kind_value,public_url=url_value,management_reference=reference_value,tenant_visible=visible_value,status=status_value,display_label=label_value,sort_order=sort_value,revision=expected+1,updated_by=auth.uid(),updated_at=now()
   where workspace_id=w and property_id=prop and id=ident;
 end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 select to_jsonb(c) into after_row from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and c.id=ident;
 insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,prop,'property_channel',ident::text,'save',auth.uid(),actor,why,before_row,after_row);
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
end $$;
revoke all on function public.aqari_property_channel_settings(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_channel_settings(uuid,text,jsonb) to authenticated;


commit;
