const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('active browser and server config are isolated from production with a recognized session key',async()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('public-config.js','utf8'),ctx);const browser=ctx.window.AQARI_PUBLIC_CONFIG;
 const server=await import('../lib/release-config.js');
 assert.equal(browser.supabaseUrl,'https://djkpkkgoibruaezdrchb.supabase.co');assert.equal(server.SUPABASE_PUBLIC_CONFIG.url,browser.supabaseUrl);assert.equal(server.SUPABASE_PUBLIC_CONFIG.publishableKey,browser.supabasePublishableKey);
 assert.equal(browser.releaseStage,'preview');assert.equal(server.RELEASE_STAGE,'preview');assert.equal(browser.supabaseAuthStorageKey,'sb-djkpkkgoibruaezdrchb-auth-token');
 const html=fs.readFileSync('index.html','utf8');const fn=html.slice(html.indexOf('  function isSupabaseSessionKey('),html.indexOf('  function isManagedSession('));vm.runInNewContext(fn+';result=isSupabaseSessionKey('+JSON.stringify(browser.supabaseAuthStorageKey)+');',ctx);assert.equal(ctx.result,true);
});
test('new staging migrations stay outside the production migration directory',()=>{
 assert.equal(fs.readdirSync('supabase/migrations').filter(n=>/v267_(isolated|rental_projection|tenant_portal)/.test(n)).length,0);
 assert.ok(fs.readdirSync('staging-database/supabase/migrations').some(n=>n.endsWith('v267_isolated_core.sql')));
});
