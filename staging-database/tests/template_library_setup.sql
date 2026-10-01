-- Local PGlite fixture only. Synthetic content, no hosted connection.
do $setup$
begin
 if to_regprocedure('extensions.gen_random_uuid()') is null then
  execute 'create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select gen_random_uuid()$$';
 end if;
end
$setup$;
