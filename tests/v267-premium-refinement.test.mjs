import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/v267/styles/premium-refinement.css',import.meta.url),'utf8');
const portal=readFileSync(new URL('../src/v267/styles/premium-portal-refinement.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/v267/premium-navigation-runtime.js',import.meta.url),'utf8');
const installer=readFileSync(new URL('../scripts/install-v267-owner-feedback.mjs',import.meta.url),'utf8');

test('premium pass keeps the requested restrained beige brown gold semantic palette',()=>{
 assert.match(css,/--aq-pr-brown:#4c352a/);
 assert.match(css,/--aq-pr-gold:#b48845/);
 assert.match(css,/--aq-pr-success:#2f7453/);
 assert.match(css,/--aq-pr-danger:#a8443d/);
 assert.doesNotMatch(css,/#[0-9a-f]{6}[^\n]*(blue|purple|pink)/i);
});

test('layout is deliberately iPhone first, then iPad, then desktop without eight tiny desktop KPI columns',()=>{
 assert.match(css,/@media screen and \(max-width:699px\)/);
 assert.match(css,/@media screen and \(min-width:700px\) and \(max-width:1179px\)/);
 assert.match(css,/@media screen and \(min-width:1180px\)/);
 assert.match(css,/aq-unified-metrics\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/aq-unified-metrics\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.doesNotMatch(css,/aq-unified-metrics\{grid-template-columns:repeat\(8/);
});

test('internal pages, dialogs, forms and tables share the same premium surface grammar',()=>{
 for(const token of ['aq-unified-page-head','aq267-dialog','input,select,textarea','table','aq-unified-action-card'])assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(css,/main\.w>\.p\.aq-unified-page-surface\.on:not\(#home\)/);
});

test('sidebar sections that previously opened grouping surfaces now delegate straight to authoritative functions',()=>{
 const required={units:'unit_readiness',contracts:'rental_contracts',expenses:'financial_register',staff:'employees_payroll',owners:'partner_access'};
 for(const [key,service] of Object.entries(required)){assert.match(nav,new RegExp(`\\['${key}',\\{service:'${service}'\\}\\]`));}
 assert.match(nav,/\['receipts',\{section:'collections'\}\]/);
 assert.match(nav,/control-center\.js/);
 assert.match(nav,/window\.addEventListener\('click',interceptDirect,true\)/);
 assert.doesNotMatch(nav,/localStorage|sessionStorage|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('direct navigation remains fail-closed behind the existing authenticated workspace boundary',()=>{
 for(const token of ['aqari-auth-unlocked','membership','AQARI_DATA_GATE','AQARI_EARLY_STORAGE_GATE','general_manager'])assert.match(nav,new RegExp(token));
 assert.match(nav,/الوظيفة الفعلية غير متاحة/);
});

test('tenant, partner and login portals receive the same refined identity at all three breakpoints',()=>{
 assert.match(portal,/premium portal refinement/i);
 assert.match(portal,/@media screen and \(max-width:699px\)/);
 assert.match(portal,/@media screen and \(min-width:700px\) and \(max-width:1179px\)/);
 assert.match(portal,/@media screen and \(min-width:1180px\)/);
 assert.match(portal,/--aq-portal-gold:#b48945/);
});

test('build installer loads the refinement after the unified compatibility layer and verifies it',()=>{
 assert.match(installer,/aqari-v267-premium-refinement-css/);
 assert.match(installer,/premium-refinement\.css/);
 assert.match(installer,/premium-navigation-runtime\.js/);
 assert.match(installer,/premium-portal-refinement\.css/);
 assert.match(installer,/v267-premium-refinement\.test\.mjs/);
});
