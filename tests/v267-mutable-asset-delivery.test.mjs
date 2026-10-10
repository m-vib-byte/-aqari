import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const config=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
const sourcePattern=source=>new RegExp('^'+source.split('(.*)').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
function headersFor(url){
 const pathname=new URL(url,'https://myaqari.com').pathname;
 return Object.fromEntries(config.headers.filter(rule=>sourcePattern(rule.source).test(pathname)).flatMap(rule=>rule.headers.map(header=>[header.key.toLowerCase(),header.value])));
}
function mutableFiles(directory='src/v267'){
 return readdirSync(new URL(directory+'/',root),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?mutableFiles(directory+'/'+entry.name):/\.(?:js|css)$/.test(entry.name)?['/'+directory+'/'+entry.name]:[]);
}

test('every mutable V267 module and stylesheet receives no-store including nested dependencies',()=>{
 const assets=mutableFiles();assert.ok(assets.length>100);
 for(const asset of assets){
  const headers=headersFor(asset);
  assert.equal(headers['cache-control'],'no-store, max-age=0, must-revalidate',asset);
  assert.equal(headers['x-content-type-options'],'nosniff',asset);
  assert.equal(headers['x-frame-options'],'DENY',asset);
 }
 for(const asset of ['/src/v267/workspace.js','/src/v267/pages/rental-contracts.js','/src/v267/pages/contract-templates.js','/src/v267/components/rental-templates.js','/src/v267/domain/rental-template-starters.js','/src/v267/styles/contract-template-studio.css','/src/v267/styles/saved-contract-viewer.css']){
  assert.ok(assets.includes(asset));assert.equal(headersFor(asset+'?release=V267')['cache-control'],'no-store, max-age=0, must-revalidate');
 }
});

test('versioned vendor caching and global security headers remain intact',()=>{
 const vendor=headersFor('/vendor/supabase-js-2.116.0.js');
 assert.equal(vendor['cache-control'],'public, max-age=31536000, immutable');assert.equal(vendor['x-vercel-enable-rewrite-caching'],'1');
 assert.equal(vendor['x-content-type-options'],'nosniff');assert.equal(vendor['referrer-policy'],'strict-origin-when-cross-origin');assert.equal(vendor['permissions-policy'],'camera=(), microphone=(), geolocation=()');assert.equal(vendor['x-frame-options'],'DENY');
 assert.equal(config.rewrites.find(rule=>rule.source==='/vendor/supabase-js-2.116.0.js').destination,'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js');
});

test('delivery hardening keeps the app route and does not clear data, cookies or force navigation',()=>{
 assert.equal(config.rewrites.find(rule=>rule.source==='/app').destination,'/index.html');
 assert.equal(headersFor('/app?release=V267')['cache-control'],'no-store, max-age=0, must-revalidate');
 const runtimeRule=config.headers.find(rule=>rule.source==='/src/v267/(.*)');assert.ok(runtimeRule);assert.deepEqual(runtimeRule.headers,[{key:'Cache-Control',value:'no-store, max-age=0, must-revalidate'}]);
 for(const rule of config.headers)for(const header of rule.headers)assert.ok(!['clear-site-data','refresh','set-cookie','location'].includes(header.key.toLowerCase()),header.key);
 assert.equal(config.redirects.some(rule=>sourcePattern(rule.source).test('/src/v267/pages/rental-contracts.js')),false);
});

test('microphone access is scoped to application documents',()=>{
 for(const route of ['/app','/app?release=V267','/index.html'])assert.equal(headersFor(route)['permissions-policy'],'camera=(), microphone=(self), geolocation=()',route);
 for(const route of ['/','/login','/login.html','/api/owner-assistant','/vendor/supabase-js-2.116.0.js'])assert.equal(headersFor(route)['permissions-policy'],'camera=(), microphone=(), geolocation=()',route);
});
