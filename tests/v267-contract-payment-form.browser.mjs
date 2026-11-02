// Actual execution dialog, native browser validation, synthetic session/RPC only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {browserTargets,launchBrowser} from './browser-targets.mjs';
const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.env.AQARI_PAYMENT_BROWSER_EVIDENCE||'payment-browser-evidence');
fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body class="aq-v267 aq-unified-experience"><button id="open">فتح نموذج تجريبي</button><script type="module">
import {openContractExecution} from '/src/v267/pages/contract-execution.js';
import {setLocale} from '/src/v267/components/locale.js';
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'synthetic-user',workspaceId:'synthetic-workspace'}};
const state=window.TEST={reads:0,calls:[],writes:0,language:code=>setLocale(code),payload:{contractsV202:[{id:'contract',status:'signing',tenantId:'tenant',contract_no:'SYNTHETIC-1',property:'عقار تجريبي',unit:'1',rentEntitlement:{startDate:'2026-10-01'}}],tenantProfilesV267:[{id:'tenant',nameAr:'مستأجر تجريبي',nameEn:'Synthetic tenant'}]}};
const client={rpc:(name,args)=>({abortSignal:async()=>{state.calls.push({name,args});return {error:{code:'42501',message:'MFA_REQUIRED'},status:403};}})};
window.AQARI_SUPABASE={getClient:async()=>client,loadAppState:async()=>{state.reads++;return {payload:structuredClone(state.payload),revision:1};},saveAppState:async()=>{state.writes++;throw Error('Unexpected synthetic write');},context:{user:{id:'synthetic-user'},workspace:{id:'synthetic-workspace'},membership:{user_id:'synthetic-user',workspace_id:'synthetic-workspace',is_active:true,role:'general_manager'}}};
window.AQARI_RENTAL_RECORDS={primary:x=>x,entitlementBreakdown:()=>({net:100}),entitlementDueOn:()=> '2026-10-01',kuwaitDate:()=> '2026-11-01'};
document.querySelector('#open').onclick=()=>openContractExecution('contract');
</script></body></html>`;
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 const file=path.resolve(root,'.'+pathname);
 if(!pathname.startsWith('/src/')||!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,results=[];let browser;
try{
 for(const [engine,type] of browserTargets){
  browser=await launchBrowser(type);
  for(const [device,width,height,mobile] of [['desktop',1440,1000,false],['phone',390,844,true],['tablet',820,1180,true]]){
   const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
   let blocked=0;await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked++;return route.abort();});
   const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const pass=name=>{results.push({engine,device,name,passed:true});console.log(`PASS ${engine}/${device}: ${name}`);};
   try{
    await page.goto(origin);await page.locator('#open').click();await page.locator('form').waitFor();
    const method=page.locator('form select'),provider=page.getByLabel('اسم البنك أو مزوّد الدفع',{exact:true});
    const reference=page.locator('form input[type=text]').first(),submit=page.locator('form button[type=submit]');
    await reference.fill('SYNTHETIC-REF');await page.locator('form input[type=checkbox]').check();
    assert.equal(await provider.isVisible(),false);pass('provider hidden until a relevant payment method is chosen');
    for(const code of ['bank','cheque']){
     await method.selectOption(code);await provider.fill('');assert.equal(await provider.isEnabled(),true);
     await submit.click();assert.equal(await provider.evaluate(el=>el.validity.valueMissing),true);
     assert.equal(await page.evaluate(()=>TEST.reads),1);assert.equal(await page.evaluate(()=>TEST.calls.length),0);
    }
    pass('native required validation blocks missing bank/cheque provider before reads or reservations');
    await provider.fill('none');await submit.click();await page.getByRole('status').filter({hasText:'أدخل اسم البنك'}).waitFor();
    assert.equal(await page.evaluate(()=>TEST.reads),1);assert.equal(await submit.isEnabled(),true);
    pass('placeholder provider rejected while form remains editable');
    await provider.fill('بنك تجريبي');await submit.click();await page.waitForFunction(()=>TEST.calls.length===1&&document.querySelector('dialog').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>TEST.calls[0].name),'aqari_contract_execution_artifacts');
    assert.equal(await submit.isEnabled(),true);assert.equal(await provider.inputValue(),'بنك تجريبي');
    assert.equal(await reference.inputValue(),'SYNTHETIC-REF');assert.equal(await page.evaluate(()=>TEST.writes),0);
    pass('MFA rejection retains bank/reference and permits deliberate retry without settlement');
    await method.selectOption('knet');assert.equal(await provider.inputValue(),'KNET');assert.equal(await provider.isDisabled(),true);
    await method.selectOption('bank');assert.equal(await provider.inputValue(),'');assert.equal(await provider.isEnabled(),true);
    pass('KNET is fixed and cannot leak into a later bank transfer');
    await provider.fill('Old bank');await method.selectOption('cash');assert.equal(await provider.inputValue(),'');assert.equal(await provider.isVisible(),false);
    pass('cash clears and hides the previous bank');
    await method.selectOption('bank');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(out,`${engine}-${device}.png`),fullPage:true});
    pass('payment dialog fits viewport without horizontal overflow');
    await page.evaluate(()=>{AQARI_DATA_GATE.scope.userId='other';window.dispatchEvent(new Event('aqari:auth-boundary'));});assert.equal(await page.locator('dialog').count(),0);
    pass('account boundary disposes private payment form');
    await page.goto(origin);await page.waitForFunction(()=>window.TEST);await page.evaluate(()=>TEST.language('en'));await page.locator('#open').click();await page.locator('form select').selectOption('bank');
    assert.equal(await page.getByLabel('Bank or payment provider name',{exact:true}).isVisible(),true);
    pass('English interface uses the translated payment provider label');
    assert.deepEqual(errors,[]);assert.equal(blocked,0);pass('no uncaught browser errors or attempted external requests');
   }finally{await context.close();}
  }
  await browser.close();browser=null;
 }
 assert.equal(results.length,30*browserTargets.length);
 const files=['src/v267/pages/contract-execution.js','src/v267/domain/contract-execution.js','src/v267/components/translations.js','src/v267/components/dialog.js','src/v267/api/session.js','src/v267/styles/workspace.css','src/v267/styles/ultra-luxury.css'];
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({date:new Date().toISOString(),scope:'Local Chromium/WebKit as explicitly selected; synthetic RPC and session. Not actual payment, hosted acceptance, or physical device testing.',source_commit:process.env.AQARI_EXPECTED_SHA||'local-working-tree',hashes:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),results},null,2));
 console.log(`TOTAL ${results.length} passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
