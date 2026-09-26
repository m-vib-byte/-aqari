const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('active browser and server config are isolated from production with a recognized session key',async()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('public-config.js','utf8'),ctx);const browser=ctx.window.AQARI_PUBLIC_CONFIG;
 const server=await import('../lib/release-config.js');
 assert.equal(browser.supabaseUrl,'https://ofgmcsmxmdswlovsckqs.supabase.co');assert.equal(server.SUPABASE_PUBLIC_CONFIG.url,browser.supabaseUrl);assert.equal(server.SUPABASE_PUBLIC_CONFIG.publishableKey,browser.supabasePublishableKey);
 assert.equal(browser.releaseStage,'preview');assert.equal(server.RELEASE_STAGE,'preview');assert.equal(browser.supabaseAuthStorageKey,'sb-ofgmcsmxmdswlovsckqs-auth-token');
 for(const protectedRef of ['djkpkkgoibruaezdrchb','qtavnufzbkdfeauyukot']){
  assert.ok(!browser.supabaseUrl.includes(protectedRef));
  assert.notEqual(browser.supabaseAuthStorageKey,'sb-'+protectedRef+'-auth-token');
 }
 const html=fs.readFileSync('index.html','utf8');const fn=html.slice(html.indexOf('  function isSupabaseSessionKey('),html.indexOf('  function isManagedSession('));vm.runInNewContext(fn+';result=isSupabaseSessionKey('+JSON.stringify(browser.supabaseAuthStorageKey)+');',ctx);assert.equal(ctx.result,true);
});
test('active runtime cannot route back to either protected hosted database',()=>{
 const paths=['public-config.js','lib/release-config.js','src/v267/api/session.js','cloud-sync.js','final-release-ui.js','v205-simplified-shell.js','v267-rental-records.js','v267-partner-portal.js','v267-reset-password.js'];
 for(const file of paths){
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/djkpkkgoibruaezdrchb|qtavnufzbkdfeauyukot|sb_publishable_IZsu-9m2X/,file);
 }
});
test('tenant portal release map keeps Preview isolated while retaining the reviewed Production target',()=>{
 const source=fs.readFileSync('v267-tenant-portal.js','utf8');
 assert.match(source,/releaseSource=Object\.freeze\(\{preview:'https:\/\/ofgmcsmxmdswlovsckqs\.supabase\.co',production:'https:\/\/djkpkkgoibruaezdrchb\.supabase\.co'\}\)/);
 assert.match(source,/releaseSource\[cfg\.releaseStage\]!==cfg\.supabaseUrl/);
 assert.doesNotMatch(source,/qtavnufzbkdfeauyukot|sb_publishable_IZsu-9m2X/);
});
test('new staging migrations stay outside the production migration directory',()=>{
 assert.equal(fs.readdirSync('supabase/migrations').filter(n=>/v267_(isolated|rental_projection|tenant_portal)/.test(n)).length,0);
 assert.ok(fs.readdirSync('staging-database/supabase/migrations').some(n=>n.endsWith('v267_isolated_core.sql')));
});
