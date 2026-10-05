-- REVIEW ONLY. Separate prerequisite discovered against the Production catalog.
-- No business row update; retain legacy inactive accounts and permit the archive RPC.
begin;
set local lock_timeout='5s';
do $guard$
declare actual text;
begin
 select pg_get_constraintdef(oid) into actual from pg_constraint
 where conrelid='private.aqari_collection_accounts'::regclass
 and conname='aqari_collection_accounts_status_check' and contype='c';
 if actual is distinct from 'CHECK ((status = ANY (ARRAY[''active''::text, ''inactive''::text])))' then
  raise exception 'COLLECTION_ACCOUNT_STATUS_SCHEMA_CHANGED';
 end if;
end $guard$;
alter table private.aqari_collection_accounts drop constraint aqari_collection_accounts_status_check;
alter table private.aqari_collection_accounts add constraint aqari_collection_accounts_status_check
 check (status in ('active','inactive','archived'));
commit;
