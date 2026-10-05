from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
out=root/'staging-database/reconciliation/commercial-sales-basis'
out.mkdir(parents=True,exist_ok=True)
# Captured from Production on 5 October 2026; fail closed on source drift.
expected={
 'aqari_compliance_register(uuid,text,text,jsonb)':'fb8f84a603c96de86d81318cee93bc95',
 'private.aqari_commercial_sales_register(uuid,text,jsonb)':'cb97e85ab6de0e476adf67eec893292e'
}
sources=['staging-database/supabase/migrations/20260912191240_v267_commercial_sales_rent_basis.sql','staging-database/sql/commercial-sales-basis-constraint.sql']
guard='\n or '.join("md5(pg_get_functiondef('"+('public.' if not s.startswith('private.') else '')+s+"'::regprocedure)) is distinct from '"+h+"'" for s,h in expected.items())
sql="""-- Review candidate only. No existing business-row UPDATE or hosted installation.
begin;
set local lock_timeout='5s';
do $guard$ begin
 if """+guard+"""
 or exists(select 1 from pg_attribute where attrelid='private.aqari_commercial_terms'::regclass and attname='sales_rent_basis' and not attisdropped)
 then raise exception 'COMMERCIAL_SALES_FUNCTION_CHANGED';end if;
end $guard$;
"""+'\n'.join((root/p).read_text() for p in sources)+'\ncommit;\n'
(out/'candidate.sql').write_text(sql)
(out/'manifest.json').write_text(json.dumps({'production_applied':False,'preflight_function_md5':expected,'sources':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in sources],'candidate_sha256':hashlib.sha256(sql.encode()).hexdigest(),'historical_basis':'additional_to_base_rent: the only basis previously implemented; existing financial records are not recalculated'},indent=2)+'\n')
