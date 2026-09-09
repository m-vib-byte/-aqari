-- V267 Staging follow-up. Fixes a PL/pgSQL variable/table-alias collision in aqari_vacating_settlement(list).
-- Apply after vacating-settlement.sql. No business records are changed.
do $patch$
declare source text; changed text;
begin
 source:=pg_get_functiondef('public.aqari_vacating_settlement(uuid,text,jsonb)'::regprocedure);
 changed:=replace(source,';l public.aqari_leases;',';lease_record public.aqari_leases;');
 changed:=replace(changed,'select * into l from public.aqari_leases where workspace_id=w and id=lid for update;','select * into lease_record from public.aqari_leases where workspace_id=w and id=lid for update;');
 changed:=replace(changed,$old$if not found or l.status<>'signed' or l.start_date is null or vdate<l.start_date or vdate>(now() at time zone 'Asia/Kuwait')::date then$old$,$new$if not found or lease_record.status<>'signed' or lease_record.start_date is null or vdate<lease_record.start_date or vdate>(now() at time zone 'Asia/Kuwait')::date then$new$);
 if changed=source then raise exception 'VACATING_LIST_ALIAS_PATCH_NOT_APPLIED'; end if;
 execute changed;
end $patch$;
