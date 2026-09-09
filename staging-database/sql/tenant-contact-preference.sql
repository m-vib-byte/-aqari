-- V267 Staging only. Persist the tenant's preferred contact method and make automated queues honor it.
-- Legacy tenants without a preference retain the reviewed current behavior: rent reminders may use both email and WhatsApp,
-- while the single payment-thanks message prefers email, then WhatsApp.
begin;
create or replace function private.aqari_contact_channel_allowed(profile jsonb, channel text) returns boolean
language sql immutable set search_path='' as $$
 select case lower(coalesce(nullif(btrim(profile->>'preferredContact'),''),'both'))
  when 'both' then channel in ('email','whatsapp')
  when 'email' then channel='email'
  when 'whatsapp' then channel='whatsapp'
  when 'phone' then false
  when 'none' then false
  else false end
$$;
revoke all on function private.aqari_contact_channel_allowed(jsonb,text) from public,anon,authenticated;

create or replace function private.aqari_preferred_delivery_channel(profile jsonb,email text,phone text) returns text
language sql immutable set search_path='' as $$
 select case lower(coalesce(nullif(btrim(profile->>'preferredContact'),''),'both'))
  when 'email' then case when nullif(btrim(email),'') is not null then 'email' end
  when 'whatsapp' then case when nullif(btrim(phone),'') is not null then 'whatsapp' end
  when 'both' then case when nullif(btrim(email),'') is not null then 'email' when nullif(btrim(phone),'') is not null then 'whatsapp' end
  else null end
$$;
revoke all on function private.aqari_preferred_delivery_channel(jsonb,text,text) from public,anon,authenticated;

-- Patch the imported-tenant editor from its reviewed current definition. Support both the original source definition
-- and the already-hardened Staging definition that includes passportNo; fail closed if either anchor drifts.
do $patch$
declare definition text:=pg_get_functiondef('private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text)'::regprocedure);
 old_allow text; new_allow text; validation_anchor text; directory_anchor text;
begin
 if position('preferredContact' in definition)=0 then
  if position('''passportNo''' in definition)>0 then
   old_allow:='(''nameAr'',''nameEn'',''civilId'',''passportNo'',''phone'',''email'',''nationality'',''address'')';
  else
   old_allow:='(''nameAr'',''nameEn'',''civilId'',''phone'',''email'',''nationality'',''address'')';
  end if;
  new_allow:='(''nameAr'',''nameEn'',''civilId'',''passportNo'',''phone'',''email'',''nationality'',''address'',''preferredContact'')';
  if (length(definition)-length(replace(definition,old_allow,'')))/length(old_allow)<>1 then raise exception 'TENANT_CONTACT_ALLOWLIST_ANCHOR_CHANGED';end if;
  definition:=replace(definition,old_allow,new_allow);
  validation_anchor:=' if coalesce(next_profile->>''email'','''')<>'''' and next_profile->>''email'' !~ ''^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'' then raise exception ''راجع البريد الإلكتروني.'';end if;';
  if (length(definition)-length(replace(definition,validation_anchor,'')))/length(validation_anchor)<>1 then raise exception 'TENANT_CONTACT_VALIDATION_ANCHOR_CHANGED';end if;
  definition:=replace(definition,validation_anchor,validation_anchor||E'\n if lower(coalesce(nullif(btrim(next_profile->>''preferredContact''),''''),''both'')) not in (''both'',''email'',''whatsapp'',''phone'',''none'') then raise exception ''اختر وسيلة تواصل مفضلة صحيحة.'';end if;\n next_profile:=jsonb_set(next_profile,''{preferredContact}'',to_jsonb(lower(coalesce(nullif(btrim(next_profile->>''preferredContact''),''''),''both''))));');
  directory_anchor:='''nationality'',next_profile->>''nationality'')';
  if (length(definition)-length(replace(definition,directory_anchor,'')))/length(directory_anchor)<>1 then raise exception 'TENANT_CONTACT_DIRECTORY_ANCHOR_CHANGED';end if;
  definition:=replace(definition,directory_anchor,'''nationality'',next_profile->>''nationality'',''preferredContact'',next_profile->>''preferredContact'')');
  execute definition;
 end if;
end $patch$;

-- Existing reminder rows are cancelled when the tenant changes to a channel that is no longer allowed.
do $patch$
declare definition text:=pg_get_functiondef('private.aqari_reconcile_reminder_queue(uuid)'::regprocedure);
 anchor text:='  and ((o.channel=''email'' and nullif(btrim(t.email),'''') is not null) or (o.channel=''whatsapp'' and nullif(btrim(t.phone),'''') is not null))';
begin
 if position('aqari_contact_channel_allowed' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'REMINDER_RECONCILE_CONTACT_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,anchor||E'\n  and private.aqari_contact_channel_allowed(t.profile,o.channel)');
 end if;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_v267_prepare_reminders(uuid,date,integer)'::regprocedure);
 anchor text:=' and ((ch.channel=''email'' and nullif(btrim(t.email),'''') is not null) or (ch.channel=''whatsapp'' and nullif(btrim(t.phone),'''') is not null))';
begin
 if position('aqari_contact_channel_allowed' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'REMINDER_PREPARE_CONTACT_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,anchor||E'\n and private.aqari_contact_channel_allowed(t.profile,ch.channel)');
 end if;
end $patch$;

-- Payment thanks remain one message per payment period, but choose the tenant's allowed automated channel.
do $patch$
declare definition text:=pg_get_functiondef('private.aqari_v267_project_state()'::regprocedure);
 anchor text:='   insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,idempotency_key) values(new.workspace_id,lease_ref,((r->>''period'')||''-01'')::date,''payment_thanks'',''email'',''thanks:''||lease_ref::text||'':''||(r->>''period'')) on conflict(workspace_id,idempotency_key) do nothing;';
 replacement text:=E'   insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,idempotency_key)\n   select new.workspace_id,lease_ref,((r->>''period'')||''-01'')::date,''payment_thanks'',chosen.channel,''thanks:''||lease_ref::text||'':''||(r->>''period'')\n   from public.aqari_leases thanks_lease join public.aqari_tenants thanks_tenant on thanks_tenant.workspace_id=thanks_lease.workspace_id and thanks_tenant.id=thanks_lease.tenant_id\n   cross join lateral (select private.aqari_preferred_delivery_channel(thanks_tenant.profile,thanks_tenant.email,thanks_tenant.phone) channel) chosen\n   where thanks_lease.workspace_id=new.workspace_id and thanks_lease.id=lease_ref and chosen.channel is not null\n   on conflict(workspace_id,idempotency_key) do nothing;';
begin
 if position('aqari_preferred_delivery_channel' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'PAYMENT_THANKS_CONTACT_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,replacement);
 end if;
end $patch$;
commit;
