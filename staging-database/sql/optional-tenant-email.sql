-- V267 Staging only. Updated requirement G03-04: tenant email is optional.
-- Patch only the reviewed validation rules; preserve identity, snapshots, RLS,
-- existing grants, signed-document requirements and tenant-portal ownership.
begin;
do $migration$
declare
 definition text:=pg_get_functiondef('private.aqari_validate_rental_details()'::regprocedure);
 required_fields text:=$anchor$array['nameAr','nameEn','email','nationality','civilId','passportNo','phone']$anchor$;
 email_format text:=$anchor$or p->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'$anchor$;
 optional_email text:=$replacement$or (p ? 'email' and p->'email' <> 'null'::jsonb and
   (jsonb_typeof(p->'email') is distinct from 'string' or length(p->>'email')>300 or
    (nullif(btrim(p->>'email'),'') is not null and btrim(p->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')))$replacement$;
begin
 if (length(definition)-length(replace(definition,required_fields,'')))/length(required_fields)<>1
  or (length(definition)-length(replace(definition,email_format,'')))/length(email_format)<>1 then
  raise exception 'RENTAL_EMAIL_VALIDATION_ANCHOR_CHANGED';
 end if;
 definition:=replace(definition,required_fields,$replacement$array['nameAr','nameEn','nationality','civilId','passportNo','phone']$replacement$);
 execute replace(definition,email_format,optional_email);
end $migration$;
commit;
