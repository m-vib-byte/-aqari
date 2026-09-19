import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/system-rental-template-source.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/v267/components/rental-templates.js',import.meta.url),'utf8');
const threeKindGuard=readFileSync(new URL('../staging-database/sql/three-contract-types-20260915.sql',import.meta.url),'utf8');

test('system-source rental templates are immutable and do not impersonate manager approval',()=>{
 assert.match(sql,/create table if not exists private\.aqari_system_rental_template_versions/);
 assert.match(sql,/aqari_system_rental_template_immutable/);
 assert.match(sql,/source_document_sha256/);
 assert.match(sql,/لا يمثل اعتماداً قانونياً نهائياً/);
 const start=sql.indexOf('create table if not exists private.aqari_system_rental_template_versions');
 const table=sql.slice(start,sql.indexOf(');',start)+2);
 assert.doesNotMatch(table,/published_by/i);
});

test('context and get expose system-source rows through the existing template contract',()=>{
 assert.match(sql,/aqari_system_rental_template_snapshot/);
 assert.match(sql,/union all[\s\S]*aqari_system_rental_template_snapshot/);
 assert.match(sql,/select \* into sr from private\.aqari_system_rental_template_versions/);
 assert.match(sql,/greatest\([\s\S]*max\(v\.version\)[\s\S]*max\(s\.version\)/);
});

test('new contracts validate exact system-source snapshot and clauses',()=>{
 assert.match(sql,/expected:=null/);
 assert.match(sql,/from private\.aqari_system_rental_template_versions s/);
 assert.match(sql,/c->'contractTemplate' is distinct from expected/);
 assert.match(sql,/c->'clauses' is distinct from expected->'clauses'/);
});

test('isolated apartment trial seed is traceable to the owner-provided source PDF',()=>{
 assert.match(sql,/where w\.slug='aqari-v267-staging'/);
 assert.match(sql,/'apartment',1/);
 assert.match(sql,/نموذج شقة تشغيلي - مرجع برج ضحاوي/);
 assert.match(sql,/عقد ايجار برج ضحاوي\.pdf/);
 assert.match(sql,/e2bf1fd709c2f3850462c870099171216a414ff705dd6858c5886679424dbc29/);
 const clauses=[...sql.matchAll(/\{"title":"\d+\./g)];
 assert.equal(clauses.length,10);
});

test('trial contract creation exposes exactly apartment house and shop while preserving historical fourth-kind snapshots',()=>{
 assert.match(ui,/export const rentalTemplateKinds=\[\['apartment','عقد شقة'\],\['house','عقد بيت'\],\['shop','عقد محل'\]\]/);
 assert.match(ui,/commercial_investment','عقد تجاري أو استثماري \(تاريخي\)'/);
 assert.match(ui,/templateForContract\(r\)[\s\S]*!activeKind\(r\.kind\)/);
 assert.match(ui,/قوالب تاريخية للقراءة فقط/);
 assert.match(ui,/يمكن تعديل صياغة كل نوع من داخل المنصة/);
});

test('database guards reject new fourth-kind templates, drafts and contracts without rewriting historical rows',()=>{
 assert.match(threeKindGuard,/new\.kind not in \('apartment','house','shop'\)/);
 assert.match(threeKindGuard,/NEW_TRIAL_TEMPLATE_KIND_MUST_BE_APARTMENT_HOUSE_OR_SHOP/);
 assert.match(threeKindGuard,/new\.template_key='commercial_investment'/);
 assert.match(threeKindGuard,/COMMERCIAL_INVESTMENT_RENTAL_DRAFT_HISTORICAL_READ_ONLY/);
 assert.match(threeKindGuard,/before insert or update on public\.aqari_contract_template_drafts/);
 assert.match(threeKindGuard,/coalesce\(c->>'contractKind',''\) not in \('apartment','house','shop'\)/);
 assert.match(threeKindGuard,/coalesce\(c#>>'\{contractTemplate,kind\}',''\) not in \('apartment','house','shop'\)/);
 assert.match(threeKindGuard,/NEW_TRIAL_CONTRACT_KIND_MUST_BE_APARTMENT_HOUSE_OR_SHOP/);
 assert.match(threeKindGuard,/if previous is not null then continue;end if/);
 assert.doesNotMatch(threeKindGuard,/\bdelete\b/i);
});
