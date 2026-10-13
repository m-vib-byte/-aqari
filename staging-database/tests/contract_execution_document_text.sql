-- Run after the fixture/package setup in contract_execution_package_hosted.sql,
-- before its ROLLBACK. Executes the installed projector's actual text statements.
-- This validates canonical rendering parity, not the full signing transaction.
do $test$
declare definition text; statements text; number_expression text;
 source jsonb:=current_setting('aqari.execution_package_source')::jsonb;
begin
 select prosrc into definition from pg_proc where oid='private.aqari_project_contract_execution()'::regprocedure;
 statements:=substring(definition from '(clauses:=.*?)template_version:=');
 number_expression:=substring(definition from 'values\(document_id,new.workspace_id,''rental_contract'',(.*?),''lease''');
 if statements is null or number_expression is null then raise exception 'TEST_PROJECTOR_STATEMENTS_NOT_FOUND';end if;
 execute format($sql$
 do $check$
 declare source jsonb:=%L::jsonb; c jsonb:=source->'signed_contract_snapshot';
 settlement_id uuid:=(source->>'settlement_id')::uuid;
 clauses text; title text; body text; payload jsonb; hash text; document_no text;
 begin
 %s
 document_no:=%s;
 if title is distinct from 'عقد إيجار '||(c->>'contract_no') then raise exception 'TEST_TITLE_MISMATCH';end if;
 if document_no is distinct from 'CT-'||(c->>'contract_no') then raise exception 'TEST_DOCUMENT_NUMBER_MISMATCH';end if;
 if hash is distinct from source->>'canonical_content_sha256' then raise exception 'TEST_PACKAGE_CANONICAL_HASH_MISMATCH';end if;
 if source#>>'{tenant_document,body}' is distinct from 'نسخة المستأجر'||E'\n'||body then raise exception 'TEST_TENANT_BODY_MISMATCH';end if;
 if source#>>'{owner_document,body}' is distinct from 'نسخة المالك / الإدارة'||E'\n'||body then raise exception 'TEST_OWNER_BODY_MISMATCH';end if;
 end $check$;
 $sql$,source,statements,number_expression);
end $test$;
select 'PASS: installed projector title, body, document number, canonical SHA256 and package copy parity' result;
