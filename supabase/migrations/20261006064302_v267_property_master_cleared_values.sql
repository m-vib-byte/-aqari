-- Review candidate. Apply after property-master-file.sql or property-batch-a2-core.sql.
-- Preserve current function fields and privileges. Never update business rows.
begin;
do $patch$
declare
 body text:=pg_get_functiondef('private.aqari_property_master_snapshot(uuid,uuid)'::regprocedure);
 old_type text:=$old$coalesce(nullif(m.property_type,''),x.metadata->>'propertyType','')$old$;
 new_type text:=$new$case when m.property_id is not null then coalesce(m.property_type,'') else coalesce(x.metadata->>'propertyType','') end$new$;
 old_income text:=$old$coalesce(m.stated_income,nullif(x.metadata->>'propertyMonthlyIncome','')::numeric)$old$;
 new_income text:=$new$case when m.property_id is not null then m.stated_income else nullif(x.metadata->>'propertyMonthlyIncome','')::numeric end$new$;
begin
 if (strpos(body,old_type)=0 and strpos(body,new_type)=0)
  or (strpos(body,old_income)=0 and strpos(body,new_income)=0) then
  raise exception 'PROPERTY_MASTER_CLEAR_FIX_ANCHOR_CHANGED';
 end if;
 body:=replace(replace(body,old_type,new_type),old_income,new_income);
 if strpos(body,old_type)>0 or strpos(body,old_income)>0 then
  raise exception 'PROPERTY_MASTER_CLEAR_FIX_INCOMPLETE';
 end if;
 execute body;
end $patch$;
commit;
