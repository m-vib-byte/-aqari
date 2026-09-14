import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/commercial-investment-template-draft-support.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../staging-database/supabase/migrations/20260914173000_v267_commercial_investment_template_draft_support.sql',import.meta.url),'utf8');

test('commercial/investment draft support is mirrored exactly into the additive Preview migration',()=>{
 assert.equal(migration,sql);
});

test('append-only draft taxonomy accepts commercial investment while preserving non-contract draft kinds',()=>{
 assert.match(sql,/template_key in \('house','apartment','shop','commercial_investment','vacating_undertaking','unit_handover'\)/);
 assert.match(sql,/Draft wording taxonomy includes commercial_investment/);
});

test('manager template context exposes all four rental contract draft kinds',()=>{
 assert.match(sql,/q\.template_key in\('apartment','house','shop','commercial_investment'\)/);
 assert.match(sql,/jsonb_build_object\('id',q\.id,'kind',q\.template_key,'revision',q\.revision,'title',q\.title,'body',q\.body\)/);
});

test('commercial investment publication remains explicit manager/MFA work and source-draft bound',()=>{
 assert.match(sql,/k not in\('apartment','house','shop','commercial_investment'\)/);
 assert.match(sql,/if not manager then raise insufficient_privilege/);
 assert.match(sql,/perform private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(sql,/q\.workspace_id=w and q\.id=source_id and q\.template_key=k and q\.status='draft'/);
});

test('draft support does not fabricate a system-source legal template',()=>{
 assert.doesNotMatch(sql,/insert into private\.aqari_system_rental_template_versions/i);
 assert.match(sql,/without fabricating an approved legal template/i);
});
