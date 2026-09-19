-- AQARI V267: make KNET settlement variable resolution explicit and qualify receipt reservation columns.
begin;
do $fix$
declare definition text;marker text:='AS $function$'||chr(10)||'declare';
begin
 definition:=pg_get_functiondef('public.aqari_process_knet_webhook(uuid)'::regprocedure);
 if position('where receipt_no=receipt_no and operation_ref=i.id' in definition)>0 then
  definition:=replace(definition,'update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=receipt_no and operation_ref=i.id;','update private.aqari_rent_receipt_serial_reservations r set consumed_at=now() where r.receipt_no=receipt_no and r.operation_ref=i.id;');
 end if;
 if position('#variable_conflict use_variable' in definition)=0 then
  if position(marker in definition)=0 then raise exception 'KNET_SETTLEMENT_FUNCTION_BODY_NOT_FOUND';end if;
  definition:=replace(definition,marker,'AS $function$'||chr(10)||'#variable_conflict use_variable'||chr(10)||'declare');
 end if;
 execute definition;
end $fix$;
commit;