-- Must run immediately after property-owner-controls.sql.
-- PostgreSQL PL/pgSQL defaults to error on ambiguous column/variable references;
-- rename the local JSON variable so feature saves/copies always write the requested payload.
begin;
do $patch$
declare s text:=pg_get_functiondef('public.aqari_property_controls(uuid,text,jsonb)'::regprocedure);
begin
 if strpos(s,'val jsonb; settings jsonb;')=0
  or strpos(s,'settings:=coalesce(d->''settings'',''{}''::jsonb);')=0
  or strpos(s,'set settings=settings,revision=next_rev')=0
 then raise exception 'PROPERTY_CONTROL_FEATURE_SETTINGS_ANCHOR_CHANGED';end if;
 s:=replace(s,'val jsonb; settings jsonb;','val jsonb; feature_settings jsonb;');
 s:=replace(s,'settings:=coalesce(d->''settings'',''{}''::jsonb);','feature_settings:=coalesce(d->''settings'',''{}''::jsonb);');
 s:=replace(s,'jsonb_typeof(settings)','jsonb_typeof(feature_settings)');
 s:=replace(s,'jsonb_object_keys(settings)','jsonb_object_keys(feature_settings)');
 s:=replace(s,'jsonb_each(settings)','jsonb_each(feature_settings)');
 s:=replace(s,'values(w,prop,settings,next_rev,auth.uid())','values(w,prop,feature_settings,next_rev,auth.uid())');
 s:=replace(s,'set settings=settings,revision=next_rev','set settings=feature_settings,revision=next_rev');
 s:=replace(s,'select s.settings into settings from private.aqari_property_feature_settings','select s.settings into feature_settings from private.aqari_property_feature_settings');
 s:=replace(s,'settings:=coalesce(settings,''{}''::jsonb);','feature_settings:=coalesce(feature_settings,''{}''::jsonb);');
 s:=replace(s,'values(w,row_record.target_id,settings,next_rev,auth.uid())','values(w,row_record.target_id,feature_settings,next_rev,auth.uid())');
 if strpos(s,'settings=settings')>0 or strpos(s,' settings jsonb;')>0 then raise exception 'PROPERTY_CONTROL_FEATURE_SETTINGS_PATCH_INCOMPLETE';end if;
 execute s;
end $patch$;
commit;
