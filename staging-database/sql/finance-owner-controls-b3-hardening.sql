-- B3 hardening after finance-owner-controls-b3.sql and presentation-custom-fields-b3.sql.
begin;

create or replace function private.aqari_property_custom_value_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare f record;s text;n numeric;dt date;
begin
 select field_type,options,property_ids,is_active into f from private.aqari_property_custom_fields where workspace_id=new.workspace_id and id=new.field_id;
 if not found or not f.is_active or not(new.property_id=any(f.property_ids)) or new.value is null then raise check_violation using message='CUSTOM_FIELD_VALUE_SCOPE_INVALID';end if;
 if f.field_type='boolean' then if jsonb_typeof(new.value)<>'boolean' then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='text' then if jsonb_typeof(new.value)<>'string' or length(new.value#>>'{}')>5000 then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='money' then s:=new.value#>>'{}';if jsonb_typeof(new.value) not in('number','string') or coalesce(s,'')!~'^\d{1,12}(\.\d{1,3})?$' then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='percentage' then s:=new.value#>>'{}';if jsonb_typeof(new.value) not in('number','string') or coalesce(s,'')!~'^\d{1,3}(\.\d{1,3})?$' then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;n:=s::numeric;if n<0 or n>100 then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='date' then s:=new.value#>>'{}';if jsonb_typeof(new.value)<>'string' or coalesce(s,'')!~'^20[0-9]{2}-[0-1][0-9]-[0-3][0-9]$' then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;begin dt:=s::date;exception when others then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end;if to_char(dt,'YYYY-MM-DD')<>s then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='select' then if jsonb_typeof(new.value)<>'string' or not exists(select 1 from jsonb_array_elements_text(f.options)x where x=new.value#>>'{}') then raise check_violation using message='CUSTOM_FIELD_VALUE_INVALID';end if;
 elsif f.field_type='document' then s:=new.value#>>'{}';if jsonb_typeof(new.value)<>'string' or coalesce(s,'')!~'^[0-9a-fA-F-]{36}$' or not exists(select 1 from public.aqari_documents d join public.aqari_properties p on p.workspace_id=d.workspace_id and p.id=new.property_id where d.workspace_id=new.workspace_id and d.id=s::uuid and d.entity_type='property' and d.status='uploaded' and d.entity_ref in(new.property_id::text,p.external_ref)) then raise check_violation using message='CUSTOM_FIELD_DOCUMENT_INVALID';end if;
 else raise check_violation using message='CUSTOM_FIELD_TYPE_INVALID';end if;
 return new;
end $$;
revoke all on function private.aqari_property_custom_value_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_custom_value_guard on private.aqari_property_custom_values;
create trigger aqari_property_custom_value_guard before insert or update on private.aqari_property_custom_values for each row execute function private.aqari_property_custom_value_guard();

create or replace function public.aqari_property_owner_statement(p_workspace_id uuid,p_property_id uuid,p_as_of date default (now() at time zone 'Asia/Kuwait')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;owners jsonb;f jsonb;result jsonb;mi jsonb;me jsonb;yi jsonb;ye jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;owners:=coalesce(p->'owners','[]'::jsonb);if jsonb_array_length(owners)>0 then perform private.aqari_validate_partner_owners(owners);end if;f:=public.aqari_property_financial_summary(p_workspace_id,p_property_id,p_as_of);
 if jsonb_array_length(owners)=0 then result:='[]'::jsonb;else
  mi:=private.aqari_partner_allocate(round((f#>>'{month,income}')::numeric*1000)::bigint,owners,'{}'::jsonb);me:=private.aqari_partner_allocate(round((f#>>'{month,expenses}')::numeric*1000)::bigint,owners,'{}'::jsonb);yi:=private.aqari_partner_allocate(round((f#>>'{year,income}')::numeric*1000)::bigint,owners,'{}'::jsonb);ye:=private.aqari_partner_allocate(round((f#>>'{year,expenses}')::numeric*1000)::bigint,owners,'{}'::jsonb);
  select jsonb_agg(jsonb_build_object('id',o->>'id','name',o->>'name','role',o->>'role','bps',(o->>'bps')::int,
   'month',jsonb_build_object('incomeFils',im.amount::text,'expenseFils',em.amount::text,'netFils',(im.amount-em.amount)::text),
   'year',jsonb_build_object('incomeFils',iy.amount::text,'expenseFils',ey.amount::text,'netFils',(iy.amount-ey.amount)::text)) order by o->>'name',o->>'id') into result
  from jsonb_array_elements(owners)o
  cross join lateral(select (x->>'amount_fils')::bigint amount from jsonb_array_elements(mi)x where x->>'owner_id'=o->>'id')im
  cross join lateral(select (x->>'amount_fils')::bigint amount from jsonb_array_elements(me)x where x->>'owner_id'=o->>'id')em
  cross join lateral(select (x->>'amount_fils')::bigint amount from jsonb_array_elements(yi)x where x->>'owner_id'=o->>'id')iy
  cross join lateral(select (x->>'amount_fils')::bigint amount from jsonb_array_elements(ye)x where x->>'owner_id'=o->>'id')ey;
 end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'asOf',p_as_of,'owners',coalesce(result,'[]'::jsonb),'totals',f,'distributionStatus','calculated_only','autoPayment',false,'note','الحصص محسوبة للعرض فقط. اعتماد وصرف الأرباح عملية منفصلة ولا ينشأ عنها تحويل مالي تلقائي.');
end $$;
revoke all on function public.aqari_property_owner_statement(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_owner_statement(uuid,uuid,date) to authenticated;

commit;
