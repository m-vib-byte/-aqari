-- Isolated V267 upgrade: one recorded contact preference for both editors and queued rent messages.
-- No provider is called. Legacy profile preferences remain a fallback; no consent is invented or backfilled.
begin;

alter table private.aqari_tenant_preferences drop constraint if exists aqari_tenant_preferences_preferred_channel_check;
alter table private.aqari_tenant_preferences add constraint aqari_tenant_preferences_preferred_channel_check
 check(preferred_channel in ('both','email','whatsapp','phone','none','sms','push'));
alter table private.aqari_tenant_preferences alter column consent_at drop not null;

create table if not exists private.aqari_contact_preference_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null,tenant_id uuid not null,actor_id uuid not null,
 source_route text not null check(source_route in ('financial_register','imported_editor')),
 before_snapshot jsonb not null,after_snapshot jsonb not null,
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id)
);
alter table private.aqari_contact_preference_audit enable row level security;
revoke all on private.aqari_contact_preference_audit from public,anon,authenticated;
create index if not exists aqari_contact_preference_audit_tenant on private.aqari_contact_preference_audit(workspace_id,tenant_id,id desc);
create or replace function private.aqari_contact_audit_immutable() returns trigger
 language plpgsql set search_path='' as $$begin raise exception 'CONTACT_AUDIT_IMMUTABLE' using errcode='23514';end$$;
revoke all on function private.aqari_contact_audit_immutable() from public,anon,authenticated;
drop trigger if exists aqari_contact_audit_immutable on private.aqari_contact_preference_audit;
create trigger aqari_contact_audit_immutable before update or delete on private.aqari_contact_preference_audit
 for each row execute function private.aqari_contact_audit_immutable();

-- Internal only: callers already enforce tenant/workspace access. Explicit canonical rows win over legacy copies.
create or replace function private.aqari_effective_contact_profile(w uuid,t uuid,fallback_profile jsonb) returns jsonb
 language sql stable security definer set search_path='' as $$
 select coalesce(fallback_profile,'{}'::jsonb)||coalesce((select jsonb_build_object('preferredContact',p.preferred_channel)
  from private.aqari_tenant_preferences p where p.workspace_id=w and p.tenant_id=t),'{}'::jsonb)
$$;
revoke all on function private.aqari_effective_contact_profile(uuid,uuid,jsonb) from public,anon,authenticated;

-- Cancellation is terminal; sent/sending/failed history is retained and no channel is substituted silently.
create or replace function private.aqari_reconcile_contact_queue(w uuid,t uuid default null) returns integer
 language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.aqari_notification_outbox o set status='cancelled'
 where o.workspace_id=w and o.kind in ('rent_reminder','payment_thanks') and o.status in ('awaiting_configuration','queued')
 and exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=o.lease_id and (t is null or l.tenant_id=t))
 and not exists(select 1 from public.aqari_leases l join public.aqari_tenants q on q.workspace_id=w and q.id=l.tenant_id
  where l.workspace_id=w and l.id=o.lease_id and q.is_active
  and private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,q.id,q.profile),o.channel)
  and ((o.channel='email' and nullif(btrim(q.email),'') is not null) or (o.channel='whatsapp' and nullif(btrim(q.phone),'') is not null)));
 get diagnostics changed=row_count;return changed;
end$$;
revoke all on function private.aqari_reconcile_contact_queue(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_record_contact_preference(w uuid,t uuid,channel text,route text) returns void
 language plpgsql security definer set search_path='' as $$
declare state public.aqari_app_state;tenant public.aqari_tenants;prior private.aqari_tenant_preferences;next_preference private.aqari_tenant_preferences;
 d jsonb;next_data jsonb;next_profile jsonb;before_state jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) or route not in ('financial_register','imported_editor') then
  raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if channel is null or channel not in ('both','email','whatsapp','phone','none','sms','push') then
  raise invalid_parameter_value using message='INVALID_CONTACT_PREFERENCE';end if;
 -- Same order as profile, projection, financial-close and reminder writes.
 select * into state from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 select * into tenant from public.aqari_tenants where workspace_id=w and id=t for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into prior from private.aqari_tenant_preferences where workspace_id=w and tenant_id=t for update;
 before_state:=jsonb_build_object('recorded_preference',case when prior.tenant_id is null then null else to_jsonb(prior) end,
  'legacy_preference',tenant.profile->'preferredContact');
 if prior.tenant_id is null then
  insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,revision,updated_by)
   values(w,t,channel,null,1,auth.uid()) returning * into next_preference;
 elsif prior.preferred_channel is distinct from channel then
  update private.aqari_tenant_preferences set preferred_channel=channel,consent_at=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
   where workspace_id=w and tenant_id=t returning * into next_preference;
 else next_preference:=prior;end if;
 -- An operator's new choice is not recipient consent. Preserve an old timestamp in the immutable before-snapshot only.
 if prior.tenant_id is null or prior.preferred_channel is distinct from channel then
  insert into private.aqari_contact_preference_audit(workspace_id,tenant_id,actor_id,source_route,before_snapshot,after_snapshot)
   values(w,t,auth.uid(),route,before_state,to_jsonb(next_preference));end if;
 next_profile:=coalesce(tenant.profile,'{}'::jsonb)||jsonb_build_object('preferredContact',channel);
 update public.aqari_tenants set profile=next_profile where workspace_id=w and id=t and profile is distinct from next_profile;
 d:=private.aqari_unwrap(state.payload);next_data:=d;
 if jsonb_typeof(d->'tenantProfilesV267')='array' then
  next_data:=jsonb_set(next_data,'{tenantProfilesV267}',coalesce((select jsonb_agg(case when x->>'id'=tenant.external_ref
   then x||jsonb_build_object('preferredContact',channel) else x end order by ord)
   from jsonb_array_elements(d->'tenantProfilesV267') with ordinality a(x,ord)),'[]'::jsonb));end if;
 if jsonb_typeof(d->'tenantDirectoryV202')='array' then
  next_data:=jsonb_set(next_data,'{tenantDirectoryV202}',coalesce((select jsonb_agg(case when x->>'tenantProfileId'=tenant.external_ref
   then x||jsonb_build_object('preferredContact',channel) else x end order by ord)
   from jsonb_array_elements(d->'tenantDirectoryV202') with ordinality a(x,ord)),'[]'::jsonb));end if;
 if next_data is distinct from d then
  update public.aqari_app_state set payload=case when state.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(state.payload,'{snapshot,values,aqari_v30}',next_data)
   when state.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(state.payload,'{values,aqari_v30}',next_data) else next_data end,
   revision=state.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;end if;
 perform private.aqari_reconcile_contact_queue(w,t);
end$$;
revoke all on function private.aqari_record_contact_preference(uuid,uuid,text,text) from public,anon,authenticated;

-- Patch narrow, reviewed anchors so other upgrades (including annual ratings) remain intact.
do $patch$
declare definition text:=pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure);
 anchor text:='if p_action=''preference'' then insert into private.aqari_tenant_preferences values(w,(d->>''tenant_id'')::uuid,d->>''preferred_channel'',now(),1,auth.uid(),now()) on conflict(workspace_id,tenant_id)do update set preferred_channel=excluded.preferred_channel,consent_at=excluded.consent_at,revision=private.aqari_tenant_preferences.revision+1,updated_by=auth.uid(),updated_at=now();end if;';
begin
 if position('aqari_record_contact_preference' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_REGISTER_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,'if p_action=''preference'' then perform private.aqari_record_contact_preference(w,(d->>''tenant_id'')::uuid,d->>''preferred_channel'',''financial_register'');end if;');
 end if;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text)'::regprocedure);
 anchor text:=' return private.aqari_imported_tenant_read(w,ref);';
 channel_anchor text:='(''both'',''email'',''whatsapp'',''phone'',''none'')';
begin
 if position('aqari_record_contact_preference' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 or
   (length(definition)-length(replace(definition,channel_anchor,'')))/length(channel_anchor)<>1 then raise exception 'CONTACT_IMPORTED_SAVE_ANCHOR_CHANGED';end if;
  definition:=replace(definition,channel_anchor,'(''both'',''email'',''whatsapp'',''phone'',''none'',''sms'',''push'')');
  definition:=replace(definition,anchor,E' if patch ? ''preferredContact'' then perform private.aqari_record_contact_preference(w,tenant.id,next_profile->>''preferredContact'',''imported_editor'');end if;\n'||anchor);
  execute definition;
 end if;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_imported_tenant_read(uuid,text)'::regprocedure);
 anchor text:='''profile'',tenant.profile';
begin
 if position('aqari_effective_contact_profile' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_IMPORTED_READ_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,'''profile'',private.aqari_effective_contact_profile(w,tenant.id,tenant.profile)');
 end if;
end $patch$;

do $patch$
declare signature text;definition text;anchor text;replacement text;
begin
 foreach signature in array array['private.aqari_reconcile_reminder_queue(uuid)','private.aqari_v267_prepare_reminders(uuid,date,integer)','private.aqari_v267_project_state()'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('aqari_effective_contact_profile' in definition)>0 then continue;end if;
  if signature='private.aqari_v267_project_state()' then
   anchor:='private.aqari_preferred_delivery_channel(thanks_tenant.profile,thanks_tenant.email,thanks_tenant.phone)';
   replacement:='private.aqari_preferred_delivery_channel(private.aqari_effective_contact_profile(new.workspace_id,thanks_tenant.id,thanks_tenant.profile),thanks_tenant.email,thanks_tenant.phone)';
  else
   anchor:='private.aqari_contact_channel_allowed(t.profile,';
   replacement:='private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),';
  end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_QUEUE_ANCHOR_CHANGED:%',signature;end if;
  definition:=replace(definition,anchor,replacement);
  if signature='private.aqari_reconcile_reminder_queue(uuid)' then
   anchor:=' get diagnostics cancelled=row_count;return cancelled;';
   if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_RECONCILE_ANCHOR_CHANGED';end if;
   definition:=replace(definition,anchor,' get diagnostics cancelled=row_count;return cancelled+private.aqari_reconcile_contact_queue(w,null);');
  end if;
  execute definition;
 end loop;
end $patch$;

-- Reconcile already waiting messages without choosing a new preference, recording consent, or changing delivered history.
do $$declare w uuid;begin for w in select id from public.aqari_workspaces loop perform private.aqari_reconcile_contact_queue(w,null);end loop;end$$;
commit;
