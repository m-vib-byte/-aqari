-- Review candidate only; not an automatic migration. No business-row updates.
begin;
set local lock_timeout='5s';
do $guard$ begin
 if md5(pg_get_functiondef('private.aqari_commercial_sales_register(uuid,text,jsonb)'::regprocedure)) <> 'cb97e85ab6de0e476adf67eec893292e'
 or md5(pg_get_functiondef('public.aqari_compliance_register(uuid,text,text,jsonb)'::regprocedure)) <> 'fb8f84a603c96de86d81318cee93bc95' then
  raise exception 'COMMERCIAL_SALES_FUNCTION_CHANGED';
 end if;
end $guard$;
-- AQARI V267 Staging: persist and enforce the commercial percentage-rent basis.
alter table private.aqari_commercial_terms add column if not exists sales_rent_basis text not null default 'additional_to_base_rent';
do $$begin if not exists(select 1 from pg_constraint where conname='aqari_commercial_terms_sales_rent_basis_check' and conrelid='private.aqari_commercial_terms'::regclass) then alter table private.aqari_commercial_terms add constraint aqari_commercial_terms_sales_rent_basis_check check(sales_rent_basis in ('additional_to_base_rent','greater_of_base_or_percentage')); end if; end $$;

do $patch$
declare definition text:=pg_get_functiondef('public.aqari_compliance_register(uuid,text,text,jsonb)'::regprocedure);old text;new text;
begin
 old:='   or coalesce((d->>''cam_amount'')::numeric,-1)<0'||E'\n'||'   or length(btrim(coalesce(d->>''compliance_reference'','''')))<5';new:='   or coalesce((d->>''cam_amount'')::numeric,-1)<0'||E'\n'||'   or coalesce(d->>''sales_rent_basis'','''') not in (''additional_to_base_rent'',''greater_of_base_or_percentage'')'||E'\n'||'   or length(btrim(coalesce(d->>''compliance_reference'','''')))<5';if position(old in definition)=0 then raise exception 'COMMERCIAL_TERMS_VALIDATION_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,cam_amount,permitted_activity,license_no,license_expires_on,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)';new:='insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,cam_amount,sales_rent_basis,permitted_activity,license_no,license_expires_on,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)';if position(old in definition)=0 then raise exception 'COMMERCIAL_TERMS_INSERT_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='values(ident,w,(d->>''grace_days'')::integer,(d->>''sales_percentage'')::numeric,(d->>''cam_amount'')::numeric,btrim(d->>''permitted_activity''),btrim(d->>''license_no''),nullif(d->>''license_expires_on'','''')::date,actor,now(),btrim(d->>''compliance_reference''))';new:='values(ident,w,(d->>''grace_days'')::integer,(d->>''sales_percentage'')::numeric,(d->>''cam_amount'')::numeric,d->>''sales_rent_basis'',btrim(d->>''permitted_activity''),btrim(d->>''license_no''),nullif(d->>''license_expires_on'','''')::date,actor,now(),btrim(d->>''compliance_reference''))';if position(old in definition)=0 then raise exception 'COMMERCIAL_TERMS_VALUES_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='on conflict(lease_id) do update set grace_days=excluded.grace_days,sales_percentage=excluded.sales_percentage,cam_amount=excluded.cam_amount,permitted_activity=excluded.permitted_activity';new:='on conflict(lease_id) do update set grace_days=excluded.grace_days,sales_percentage=excluded.sales_percentage,cam_amount=excluded.cam_amount,sales_rent_basis=excluded.sales_rent_basis,permitted_activity=excluded.permitted_activity';if position(old in definition)=0 then raise exception 'COMMERCIAL_TERMS_UPDATE_ANCHOR_CHANGED';end if;execute replace(definition,old,new);
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_commercial_sales_register(uuid,text,jsonb)'::regprocedure);old text;new text;
begin
 old:='''property_name'',p.name,''sales_percentage'',t.sales_percentage,''terms_revision'',t.revision';new:='''property_name'',p.name,''sales_percentage'',t.sales_percentage,''sales_rent_basis'',t.sales_rent_basis,''base_rent_due'',private.aqari_reminder_due(q.snapshot,q.monthly_rent,mon),''terms_revision'',t.revision';if position(old in definition)=0 then raise exception 'COMMERCIAL_SALES_LIST_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='   or d->>''calculation_basis'' is distinct from ''additional_to_base_rent''';new:='   or coalesce(d->>''calculation_basis'','''') not in (''additional_to_base_rent'',''greater_of_base_or_percentage'')';if position(old in definition)=0 then raise exception 'COMMERCIAL_SALES_VALIDATION_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='  if terms.revision<>(d->>''terms_revision'')::integer then raise serialization_failure using message=''SALES_TERMS_REVISION_CONFLICT'';end if;';new:=old||E'\n'||'  if terms.sales_rent_basis is distinct from d->>''calculation_basis'' then raise serialization_failure using message=''SALES_TERMS_BASIS_CONFLICT'';end if;';if position(old in definition)=0 then raise exception 'COMMERCIAL_SALES_TERMS_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='  amount:=round(sales*terms.sales_percentage/100,3);';new:='  amount:=case when terms.sales_rent_basis=''greater_of_base_or_percentage'' then greatest(round(sales*terms.sales_percentage/100,3)-private.aqari_reminder_due(l.snapshot,l.monthly_rent,mon),0) else round(sales*terms.sales_percentage/100,3) end;';if position(old in definition)=0 then raise exception 'COMMERCIAL_SALES_AMOUNT_ANCHOR_CHANGED';end if;definition:=replace(definition,old,new);
 old:='values(ident,w,lid,mon,first_day,last_day,sales,terms.sales_percentage,amount,terms.revision,''additional_to_base_rent'',document_row.id';new:='values(ident,w,lid,mon,first_day,last_day,sales,terms.sales_percentage,amount,terms.revision,terms.sales_rent_basis,document_row.id';if position(old in definition)=0 then raise exception 'COMMERCIAL_SALES_INSERT_ANCHOR_CHANGED';end if;execute replace(definition,old,new);
end $patch$;

-- Align the table with the two already approved contract calculation bases.
-- The scoped RPC continues to enforce terms revision, approved basis, MFA,
-- property access, source-document verification and immutable financial entries.
do $$declare existing text;begin
 select pg_get_constraintdef(oid) into existing from pg_constraint
 where conrelid='private.aqari_commercial_sales'::regclass and conname='aqari_commercial_sales_calculation_basis_check';
 if existing = 'CHECK ((calculation_basis = ''additional_to_base_rent''::text))' then
  alter table private.aqari_commercial_sales drop constraint aqari_commercial_sales_calculation_basis_check;
  alter table private.aqari_commercial_sales add constraint aqari_commercial_sales_calculation_basis_check
   check(calculation_basis in ('additional_to_base_rent','greater_of_base_or_percentage'));
 elsif existing is null or existing <> 'CHECK ((calculation_basis = ANY (ARRAY[''additional_to_base_rent''::text, ''greater_of_base_or_percentage''::text])))' then
  raise exception 'COMMERCIAL_BASIS_CONSTRAINT_CHANGED';
 end if;
end $$;

commit;
