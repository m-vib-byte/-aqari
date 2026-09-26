import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/v267/styles/luxury-warm-beige.css');
const installer=read('scripts/install-v267-owner-feedback.mjs');
const login=read('login.html');

test('final owner visual system is warm beige brown gold and explicitly light',()=>{
 assert.match(css,/--aq-lx-canvas:#f2e8dc/);
 assert.match(css,/--aq-lx-brown:#4a342a/);
 assert.match(css,/--aq-lx-gold:#b48743/);
 assert.match(css,/color-scheme:light!important/);
 assert.doesNotMatch(css,/#070805|#080b09|color-scheme:dark/i);
});

test('design is structural and not a color-only override',()=>{
 assert.match(css,/grid-template-areas:"collection" "alerts" "portfolio" "operations" "finance" "ai" "owner" "quick"/);
 assert.match(css,/grid-template-areas:"collection collection" "alerts portfolio" "operations finance" "ai owner" "quick quick"/);
 assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)!important/);
 assert.match(css,/aq-unified-section-grid/);
 assert.match(css,/aq-exact-property-grid/);
 assert.match(css,/aq-exact-quick/);
});

test('iPhone is the primary breakpoint followed by iPad and desktop',()=>{
 const phone=css.indexOf('@media screen and (max-width:699px)');
 const tablet=css.indexOf('@media screen and (min-width:700px) and (max-width:1179px)');
 const desktop=css.indexOf('@media screen and (min-width:1180px)');
 assert.ok(phone>0&&tablet>phone&&desktop>tablet);
 assert.match(css,/env\(safe-area-inset-top\)/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});

test('all functional page types share the same internal grammar',()=>{
 for(const token of ['main.w>.p.on:not(#home)','aq-exact-section-head','aq-unified-page-head','aq-unified-action-card','aq267-dialog','input,select,textarea','table','table-wrap']){
  assert.match(css,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
 assert.match(css,/aq-lx-success/);
 assert.match(css,/aq-lx-danger/);
});

test('login tenant and partner portals receive the same final luxury layer',()=>{
 assert.match(css,/body\.v267-login-page/);
 assert.match(css,/body:has\(>main>#partnerAuth\)/);
 assert.match(css,/body:has\(>main>#auth\)/);
 assert.match(installer,/aqari-v267-luxury-warm-css/);
 assert.match(installer,/luxury-warm-beige\.css/);
 assert.match(installer,/V267_LUXURY_PORTAL_STYLE_ANCHOR_MISSING/);
});

test('login preloads its luxury layer and uses the requested accessible colors',()=>{
 assert.match(login,/meta name="description" content="منصة عقاري لإدارة الأملاك، دخول المستأجرين، ومتابعة الشركاء في الكويت\."/);
 assert.match(login,/id="aqari-v267-luxury-warm-css" rel="preload" href="\/src\/v267\/styles\/luxury-warm-beige\.css\?release=V267" as="style"/);
 assert.match(css,/body\.v267-login-page \.login-brand>span:last-child\{color:#8A6D3B!important\}/);
 assert.match(css,/body\.v267-login-page \.aq-login-role-icon\{color:#5E491F!important\}/);
});

test('luxury layer is additive and the successful iPhone startup blocker remains chained',()=>{
 assert.doesNotMatch(css,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|localStorage|sessionStorage/);
 assert.match(installer,/await import\('\.\/install-v267-iphone-startup-fix\.mjs'\)/);
 assert.match(installer,/v267-luxury-warm-beige\.test\.mjs/);
});

test('the legacy 860px modal rule excludes full document pages',()=>{
 const modalRule=css.match(/([^{}]+)\{\s*width:min\(860px,[^{}]+\}/);
 assert.ok(modalRule,'the ordinary modal size remains available');
 assert.equal((modalRule[1].match(/\.aq267-dialog:where\(:not\(\.aq267-page\)\)/g)||[]).length,2);
 assert.doesNotMatch(modalRule[1],/\.aq267-dialog[,)]/);
 const pages=read('src/v267/styles/contract-pages.css');
 assert.match(pages,/body\.aq267-page-open main\.aq267-page\.aq267-dialog\{[^}]*width:100%!important[^}]*height:100dvh!important[^}]*max-height:none!important/);
});
