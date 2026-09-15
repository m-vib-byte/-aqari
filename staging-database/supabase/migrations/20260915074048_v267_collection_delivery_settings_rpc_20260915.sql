-- AQARI V267: authenticated settings/readback for receipt + owner WhatsApp delivery.
create or replace function private.aqari_collection_delivery_settings_snapshot(w uuid,p uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.aqari_collection_delivery_settings%rowtype;master jsonb;owners jsonb;
begin
 master:=private.aqari_property_master_snapshot(w,p);if master is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 select * into s from private.aqari_collection_delivery_settings where workspace_id=w and property_id=p;
 owners:=coalesce(master->'owners','[]'::jsonb);
 return jsonb_build_object('workspace_id',w,'property_id',p,'propertyName',master->>'name','receiptEnabled',coalesce(s.receipt_enabled,true),'ownerWhatsappEnabled',coalesce(s.owner_whatsapp_enabled,false),'ownerIds',coalesce(s.owner_ids,'[]'::jsonb),'revision',coalesce(s.revision,0),'owners',coalesce((select jsonb_agg(jsonb_build_object('id',o->>'id','name',o->>'name','role',o->>'role','bps',(o->>'bps')::int,'whatsapp',coalesce(o->>'whatsapp','')) order by o->>'name',o->>'id') from jsonb_array_elements(owners)o),'[]'::jsonb));
end $$;
revoke all on function private.aqari_collection_delivery_settings_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_collection_delivery_settings(p_workspace_id uuid,p_property_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;p uuid:=p_property_id;d jsonb:=coalesce(p_data,'{}'::jsonb);expected bigint;current_rev bigint:=0;next_rev bigint;receipt_enabled boolean;owner_enabled boolean;owner_ids jsonb;why text;master jsonb;owners jsonb;before_row jsonb;after_row jsonb;actor text;
begin
 if auth.uid() is null or not private.aqari_can_property(w,p,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='context' then return private.aqari_collection_delivery_settings_snapshot(w,p)||jsonb_build_object('user_id',auth.uid(),'canWrite',private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can_property(w,p,'properties','write'));end if;
 if p_action<>'save' or jsonb_typeof(d) is distinct from 'object' or exists(select 1 from jsonb_object_keys(d)k where k not in('expectedRevision','receiptEnabled','ownerWhatsappEnabled','ownerIds','reason')) then raise invalid_parameter_value using message='INVALID_COLLECTION_DELIVERY_SETTINGS';end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'administration','write') or not private.aqari_can_property(w,p,'properties','write') then raise insufficient_privilege using message='COLLECTION_DELIVERY_SETTINGS_WRITE_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 expected:=coalesce((d->>'expectedRevision')::bigint,-1);receipt_enabled:=coalesce((d->>'receiptEnabled')::boolean,true);owner_enabled:=coalesce((d->>'ownerWhatsappEnabled')::boolean,false);owner_ids:=coalesce(d->'ownerIds','[]'::jsonb);why:=btrim(coalesce(d->>'reason',''));
 if expected<0 or jsonb_typeof(owner_ids)<>'array' or octet_length(owner_ids::text)>100000 or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='COLLECTION_DELIVERY_SETTINGS_FIELDS_REQUIRED';end if;
 master:=private.aqari_property_master_snapshot(w,p);owners:=coalesce(master->'owners','[]'::jsonb);
 if exists(select 1 from jsonb_array_elements(owner_ids)x where jsonb_typeof(x)<>'string' or trim(both '"' from x::text) !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') then raise check_violation using message='OWNER_NOTIFICATION_TARGET_INVALID';end if;
 if (select count(*) from jsonb_array_elements_text(owner_ids))<>(select count(distinct value) from jsonb_array_elements_text(owner_ids)) then raise check_violation using message='OWNER_NOTIFICATION_TARGET_DUPLICATE';end if;
 if owner_enabled and jsonb_array_length(owner_ids)=0 then raise check_violation using message='OWNER_NOTIFICATION_TARGET_REQUIRED';end if;
 if exists(select 1 from jsonb_array_elements_text(owner_ids)x(id) where not exists(select 1 from jsonb_array_elements(owners)o where o->>'id'=x.id and nullif(btrim(o->>'whatsapp'),'') is not null)) then raise check_violation using message='OWNER_NOTIFICATION_WHATSAPP_REQUIRED';end if;
 select to_jsonb(s),s.revision into before_row,current_rev from private.aqari_collection_delivery_settings s where s.workspace_id=w and s.property_id=p for update;current_rev:=coalesce(current_rev,0);if current_rev<>expected then raise serialization_failure using message='COLLECTION_DELIVERY_SETTINGS_REVISION_CONFLICT';end if;
 next_rev:=current_rev+1;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_collection_delivery_settings(workspace_id,property_id,receipt_enabled,owner_whatsapp_enabled,owner_ids,revision,updated_by,updated_at) values(w,p,receipt_enabled,owner_enabled,owner_ids,next_rev,auth.uid(),now()) on conflict(workspace_id,property_id) do update set receipt_enabled=excluded.receipt_enabled,owner_whatsapp_enabled=excluded.owner_whatsapp_enabled,owner_ids=excluded.owner_ids,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 select to_jsonb(s) into after_row from private.aqari_collection_delivery_settings s where s.workspace_id=w and s.property_id=p;
 insert into private.aqari_collection_delivery_settings_audit(workspace_id,property_id,reason,before_value,after_value,actor_id,actor_name) values(w,p,why,before_row,after_row,auth.uid(),actor);
 return private.aqari_collection_delivery_settings_snapshot(w,p)||jsonb_build_object('user_id',auth.uid(),'canWrite',true);
end $$;
revoke all on function public.aqari_collection_delivery_settings(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_collection_delivery_settings(uuid,uuid,text,jsonb) to authenticated;
