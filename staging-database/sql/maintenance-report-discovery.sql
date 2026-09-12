-- Preserve the current discovery implementation and add only the new report flag.
begin;
do $$
declare definition text;anchor text:='''maintenance_plans'',';addition text;
begin
 definition:=pg_get_functiondef('public.aqari_workspace_access(uuid)'::regprocedure);
 if strpos(definition,'''maintenance_report'',')>0 then
  if strpos(definition,'public.aqari_maintenance_status_report(uuid,date,date)')=0 then
   raise exception 'MAINTENANCE_REPORT_DISCOVERY_CONFLICT';
  end if;
  return;
 end if;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'WORKSPACE_DISCOVERY_ANCHOR_CHANGED';
 end if;
 addition:='''maintenance_report'',private.aqari_can(p_workspace_id,''maintenance'',''read'') and private.aqari_can(p_workspace_id,''reports'',''read'') and to_regprocedure(''public.aqari_maintenance_status_report(uuid,date,date)'') is not null,'||chr(10)||'   '||anchor;
 execute replace(definition,anchor,addition);
end $$;
commit;
