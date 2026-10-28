-- AQARI: read-only authorization smoke for an already-installed candidate.
-- Run ONLY in an approved disposable database after applying the candidate migration.
-- This does not authenticate a real user, test positive grants, or change persisted data.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $assert$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='aqari_rental_document_archive';
 IF definition IS NULL THEN RAISE EXCEPTION 'ARCHIVE_RPC_MISSING'; END IF;
 IF position('not coalesce(private.aqari_can(w,' in definition)=0
 THEN RAISE EXCEPTION 'NULL_SAFE_GUARD_MISSING'; END IF;
 IF position('row.receipt_id is not null' in definition)=0
 THEN RAISE EXCEPTION 'RECEIPT_READ_GUARD_MISSING'; END IF;
 IF position('a.receipt_id is null or private.aqari_can(w,' in definition)=0
 THEN RAISE EXCEPTION 'RECEIPT_LIST_GUARD_MISSING'; END IF;
END $assert$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $deny$ DECLARE action text; message text; BEGIN
 IF auth.uid() IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 THEN RAISE EXCEPTION 'SYNTHETIC_IDENTITY_MISSING'; END IF;
 FOREACH action IN ARRAY ARRAY['list','get'] LOOP
  message := NULL;
  BEGIN
   PERFORM private.aqari_rental_document_archive('22222222-2222-4222-8222-222222222222'::uuid,action,'{}'::jsonb);
   RAISE EXCEPTION 'NONMEMBER_ACCESS_ALLOWED: %',action;
  EXCEPTION WHEN insufficient_privilege THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  END;
  IF message IS DISTINCT FROM 'ACCESS_DENIED'
  THEN RAISE EXCEPTION 'UNEXPECTED_DENIAL: %, %',action,message; END IF;
 END LOOP;
END $deny$;
SELECT 'PASS: nonmember list/get denied; source guards present' AS result;
ROLLBACK;
