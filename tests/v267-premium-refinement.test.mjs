import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const css=readFileSync(new URL('../src/v267/styles/premium-refinement.css',import.meta.url),'utf8');
const portal=readFileSync(new URL('../src/v267/styles/premium-portal-refinement.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../src/v267/premium-navigation-runtime.js',import.meta.url),'utf8');
const installer=readFileSync(new URL('../scripts/install-v267-owner-feedback.mjs',import.meta.url),'utf8');
const localeRuntime=readFileSync(new URL('../src/v267/platform-locale-runtime.js',import.meta.url),'utf8');
const localeCss=readFileSync(new URL('../src/v267/styles/platform-locale.css',import.meta.url),'utf8');
const loginRuntime=readFileSync(new URL('../src/v267/login-owner-reference.js',import.meta.url),'utf8');
const loginCss=readFileSync(new URL('../src/v267/styles/professional-login.css',import.meta.url),'utf8');
const coreLocale=readFileSync(new URL('../src/v267/components/locale.js',import.meta.url),'utf8');

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

test('professional login exposes role paths but leaves authentication authoritative',()=>{
 for(const token of ["kind:'general'","kind:'staff'","href:'/partner.html'","href:'/tenant.html'",'aqari_guest_mode_status','data_access===false'])assert.match(loginRuntime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(loginRuntime,/المصادقة والصلاحيات الحالية هي المرجع/);
 assert.match(loginRuntime,/guestEnabled\(\)/);
 assert.doesNotMatch(loginRuntime,/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|signIn\(|signUp\(/);
 assert.doesNotMatch(loginRuntime,/service_role|SUPABASE_SERVICE|AQARI_SUPABASE_SERVICE_ROLE_KEY/i);
});

test('professional login is mobile first with deliberate tablet and desktop composition',()=>{
 assert.match(loginCss,/grid-template-areas:"brand language" "intro auth"/);
 assert.match(loginCss,/@media\(max-width:699px\)/);
 assert.match(loginCss,/@media\(min-width:700px\) and \(max-width:1023px\)/);
 assert.match(loginCss,/aq-login-role-grid/);
 assert.match(loginCss,/loginLanguageControl/);
});

test('platform language reuses scoped locale storage and flips the whole shell RTL or LTR',()=>{
 assert.match(nav,/import '\.\/platform-locale-runtime\.js\?release=V267'/);
 for(const token of ['bindLocale','setLocale','direction','LANGUAGES','aqPlatformLanguage','document.documentElement.dir=dir','window.location.reload()'])assert.match(localeRuntime,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.match(coreLocale,/aqari:v267:locale:/);
 assert.match(localeRuntime,/scopedStorageKey/);
 assert.doesNotMatch(localeRuntime,/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|fetch\(/);
 assert.match(localeCss,/html\[dir="rtl"\]/);
 assert.match(localeCss,/html\[dir="ltr"\]/);
 assert.match(localeCss,/margin-right:270px/);
 assert.match(localeCss,/margin-left:270px/);
});

test('Arabic and English have complete custom-shell labels while existing five-language infrastructure stays intact',()=>{
 assert.match(coreLocale,/ar:'العربية',en:'English',hi:'हिन्दी',ur:'اردو',ml:'മലയാളം'/);
 assert.match(localeRuntime,/'الرئيسية':'Home'/);
 assert.match(localeRuntime,/'مركز المدير العام':'General manager center'/);
 assert.match(loginRuntime,/en:\{choose:'Choose how to sign in'/);
 assert.match(loginRuntime,/ar:\{choose:'اختر طريقة الدخول'/);
 assert.match(loginRuntime,/This preview does not connect to the database or display any real record/);
});

test('new locale and login presentation scripts are syntactically valid',()=>{
 for(const path of ['src/v267/platform-locale-runtime.js','src/v267/login-owner-reference.js','src/v267/premium-navigation-runtime.js'])execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
});

test('build installer loads the refinement after the unified compatibility layer and verifies it',()=>{
 assert.match(installer,/aqari-v267-premium-refinement-css/);
 assert.match(installer,/premium-refinement\.css/);
 assert.match(installer,/premium-navigation-runtime\.js/);
 assert.match(installer,/premium-portal-refinement\.css/);
 assert.match(installer,/v267-premium-refinement\.test\.mjs/);
});
