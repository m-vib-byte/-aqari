-- Run only on isolated Preview. All allocator test writes roll back.
begin;
do $test$
declare a text;b text;c text;before_hash text;after_hash text;
begin
 select md5(coalesce(string_agg(document_no,'|' order by id),'')) into before_hash from private.aqari_official_number_reservations;
 a:=private.aqari_next_official_kind_number('rent_receipt');
 b:=private.aqari_next_official_kind_number('payment_voucher');
 c:=private.aqari_next_official_kind_number('rent_receipt');
 if split_part(c,'-',4)::bigint<>split_part(a,'-',4)::bigint+1 then raise exception 'CROSS_KIND_INTERFERENCE';end if;
 if a=b or a!~'^AQ-RENT_RECEIPT-[0-9]{8}-[0-9]{8,}$' or b!~'^AQ-PAYMENT_VOUCHER-[0-9]{8}-[0-9]{8,}$' then raise exception 'INVALID_PREFIX';end if;
 begin perform private.aqari_next_official_kind_number('unknown_kind');raise exception 'INVALID_KIND_ACCEPTED';exception when invalid_parameter_value then null;end;
 select md5(coalesce(string_agg(document_no,'|' order by id),'')) into after_hash from private.aqari_official_number_reservations;
 if before_hash<>after_hash then raise exception 'OLD_RESERVATIONS_CHANGED';end if;
 if has_function_privilege('anon','private.aqari_next_official_kind_number(text)','EXECUTE') or has_function_privilege('authenticated','private.aqari_next_official_kind_number(text)','EXECUTE') then raise exception 'PRIVATE_ALLOCATOR_EXPOSED';end if;
end $test$;
rollback;
