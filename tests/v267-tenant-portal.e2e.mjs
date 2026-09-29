import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {t,LANGUAGES} from '../src/v267/components/locale.js';
const root=process.cwd(),out=path.join(root,'test-results/v267-tenant-portal');fs.mkdirSync(out,{recursive:true});
const name='مستأجر <literal> {amount}',property='عقار <source> {unit}',description='دخول <record> {number}';
const data={account:{user_id:'tenant-fixture',workspace_id:'workspace-fixture',tenant_id:'tenant-id',is_active:true},tenant:{id:'tenant-id',workspace_id:'workspace-fixture',full_name:name},leases:[{id:'lease-fixture',contract_no:'C-101',snapshot:{unit:'101',property},monthly_rent:'125.750',status:'signed',start_date:'2026-01-01',end_date:'2099-12-31'}],payments:[{reference:'R-101',amount:'125.750',paid_at:'2026-09-01'}],maintenance:[{request_no:'M-101',status:'received',description}]};
let reads=0,writes=0;
const config=`window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co',releaseStage:'preview',supabasePublishableKey:'synthetic',supabaseAuthStorageKey:'fixture',supabaseAuthRedirectUrl:location.origin+'/tenant.html'};`;
const fixture=`let session={user:{id:'tenant-fixture'},access_token:'synthetic'},callback;window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{session=null;callback('SIGNED_OUT',null);return {}},signInWithPassword:async()=>{session={user:{id:'tenant-fixture'},access_token:'synthetic'};callback('SIGNED_IN',session);return {}},stopAutoRefresh(){},startAutoRefresh(){}},rpc:()=>({abortSignal:signal=>fetch('/fixture/snapshot',{signal}).then(r=>r.json())}),from:()=>({insert:()=>({abortSignal:signal=>fetch('/fixture/write',{method:'POST',signal}).then(r=>r.json())})})})};`;
const html=fs.readFileSync('tenant.html','utf8').replace(/<script src="\/vendor\/supabase[^>]+><\/script>/,'<script src="/fixture/client.js"></script>');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;res.setHeader('cache-control','no-store');
 if(pathname==='/fixture/snapshot'){reads++;res.setHeader('content-type','application/json');return res.end(JSON.stringify({data}));}
 if(pathname==='/fixture/write'){writes++;res.setHeader('content-type','application/json');return res.end('{}');}
 if(pathname==='/api/rent-receipt'){res.setHeader('content-type','application/pdf');return res.end('%PDF-1.4\nfixture');}
 if(pathname==='/tenant.html'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
 if(pathname==='/public-config.js'||pathname==='/fixture/client.js'){res.setHeader('content-type','text/javascript; charset=utf-8');return res.end(pathname==='/public-config.js'?config:fixture);}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('content-type','text/javascript; charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [engine,browserType] of Object.entries({chromium,webkit})){
  const browser=await browserType.launch();
  try{for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}]){
   const context=await browser.newContext({viewport});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   try{
    await page.goto(origin+'/tenant.html');await page.locator('#content').waitFor({state:'visible'});
    await page.locator('#maintenanceDescription').fill('مسودة <draft> {amount}');await page.locator('#maintenanceLease').selectOption('lease-fixture');
    await page.getByRole('button',{name:'فتح وصل الإيجار',exact:true}).click();await page.locator('#tenantPayments a[download]').waitFor();
    const href=await page.locator('#tenantPayments a[download]').getAttribute('href'),before=reads;
    for(const code of Object.keys(LANGUAGES)){
     await page.locator('#tenantLanguage').selectOption(code);
     assert.equal(await page.locator('html').getAttribute('lang'),code);assert.equal(await page.locator('html').getAttribute('dir'),['ar','ur'].includes(code)?'rtl':'ltr');
     assert.equal(await page.title(),t('حساب المستأجر',code)+' | AQARI V267');assert.equal(await page.locator('h1').textContent(),t('حساب المستأجر',code));
     assert.equal(await page.locator('#maintenanceDescription').inputValue(),'مسودة <draft> {amount}');assert.equal(await page.locator('#maintenanceLease').inputValue(),'lease-fixture');
     assert.equal(await page.locator('#tenantName').textContent(),name);assert.ok((await page.locator('#tenantLeases').textContent()).includes(property));assert.ok((await page.locator('#tenantLeases').textContent()).includes('125.750'));
     assert.ok((await page.locator('#tenantRequests').textContent()).includes(description));assert.ok((await page.locator('#tenantRequests').textContent()).includes(t('تم الاستلام',code)));
     assert.equal(await page.locator('#tenantPayments a[download]').getAttribute('href'),href);assert.equal(await page.locator('#tenantPayments a[download]').textContent(),t('تحميل PDF',code));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
     await page.screenshot({path:path.join(out,`${engine}-${viewport.width}-${code}.png`),fullPage:true});
    }
    assert.equal(reads,before);assert.equal(writes,0);await page.reload();await page.locator('#content').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('lang'),'ml');
    await page.locator('#tenantLogout').click();await page.locator('#auth').waitFor({state:'visible'});assert.equal(await page.locator('#tenantName').textContent(),'');assert.equal(await page.locator('#tenantPayments').textContent(),'');assert.equal(await page.locator('html').getAttribute('lang'),'ml','sign-out preserves the public language preference while clearing private records');assert.equal(await page.locator('#tenantLanguage').inputValue(),'ml');
    await page.locator('#tenantEmail').fill('fixture@example.test');await page.locator('#tenantPassword').fill('synthetic-password');
    for(const code of Object.keys(LANGUAGES)){await page.locator('#tenantLanguage').selectOption(code);assert.equal(await page.locator('#tenantEmail').inputValue(),'fixture@example.test');assert.equal(await page.locator('#tenantPassword').inputValue(),'synthetic-password');assert.equal(await page.locator('#tenantLogin button').textContent(),t('دخول',code));}
    assert.deepEqual(errors,[]);console.log(`PASS tenant ${engine} ${viewport.width}: five languages, unchanged records/draft/links, persisted preference, sign-out clearing`);
   }finally{try{await context.unrouteAll({behavior:'wait'});}finally{await context.close();}}
  }}finally{await browser.close();}
 }
}finally{await new Promise(r=>server.close(r));}
