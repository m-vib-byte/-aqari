-- Isolated V267 upgrade. A contractual grace window can span several months.
-- Keep every reviewed balance/contact/permission clause; change only the set of
-- candidate rent periods. Applying this file does not enqueue or send messages.
begin;
do $preflight$ begin
if md5(pg_get_functiondef('private.aqari_v267_prepare_reminders(uuid,date,integer)'::regprocedure)) <> '8c275b709d01b0e85fb7df501e2f7c00'
or md5(pg_get_functiondef('private.aqari_reminder_rent_balance(uuid,uuid,date)'::regprocedure)) <> '4044005b82d0cb7cb563bc236d82b888'
then raise exception 'PREVIEW_REMINDER_SOURCE_CHANGED'; end if;
end $preflight$;
do $upgrade$
declare definition text:=pg_get_functiondef('private.aqari_v267_prepare_reminders(uuid,date,integer)'::regprocedure);
 declaration_anchor text:='declare period_start date;window_start date;window_end date;inserted integer;max_grace integer;';
 window_anchor text:=E' period_start:=date_trunc(''month'',as_of)::date;\n if extract(day from as_of)>=28 then period_start:=(period_start+interval ''1 month'')::date;end if;\n window_start:=(period_start-interval ''1 month'')::date+27;\n select greatest(grace_day,coalesce(max(t.grace_days),grace_day)) into max_grace from private.aqari_commercial_terms t where t.workspace_id=w;\n window_end:=period_start+max_grace-1;\n if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then return 0;end if;';
 return_anchor text:=' get diagnostics inserted=row_count;return inserted;';
 window_replacement text:=E' -- aqari_grace_cross_month_v1: at most fourteen candidate month starts.\n select least(366,greatest(grace_day,coalesce(max(t.grace_days),grace_day))) into max_grace from private.aqari_commercial_terms t where t.workspace_id=w;\n for period_start in\n  select candidate::date from generate_series(\n   date_trunc(''month'',(as_of-(max_grace-1))::timestamp),\n   date_trunc(''month'',as_of::timestamp)+interval ''1 month'',\n   interval ''1 month'') candidate\n loop\n  window_start:=(period_start-interval ''1 month'')::date+27;\n  window_end:=period_start+max_grace-1;\n  if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then continue;end if;';
 anchor text;
begin
 -- These predicates must survive verbatim: no regression to gross receipt sums,
 -- no invented consent/fallback channel, and no change to per-contract grace.
 foreach anchor in array array[
  'private.aqari_reminder_rent_balance(w,l.id,period_start)>0',
  'private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),ch.channel)',
  'as_of<=period_start+private.aqari_effective_grace_days(w,l.id,grace_day)-1',
  'perform private.aqari_reconcile_reminder_queue(w);',
  'on conflict(workspace_id,idempotency_key) do nothing;'
 ] loop
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
   raise exception 'REMINDER_GRACE_REVIEWED_PREDICATE_CHANGED';end if;
 end loop;
 if position('-- aqari_grace_cross_month_v1:' in definition)>0 then
  if position(window_replacement in definition)=0
   or position('total_inserted:=total_inserted+inserted;' in definition)=0 then
   raise exception 'REMINDER_GRACE_UPGRADE_CHANGED';end if;
 else
  foreach anchor in array array[declaration_anchor,window_anchor,return_anchor] loop
   if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'REMINDER_GRACE_WINDOW_ANCHOR_CHANGED';end if;
  end loop;
  definition:=replace(definition,declaration_anchor,declaration_anchor||'total_inserted integer:=0;');
  definition:=replace(definition,window_anchor,window_replacement);
  definition:=replace(definition,return_anchor,E' get diagnostics inserted=row_count;total_inserted:=total_inserted+inserted;\n end loop;\n return total_inserted;');
  execute definition;
 end if;
end $upgrade$;
revoke all on function private.aqari_v267_prepare_reminders(uuid,date,integer) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
