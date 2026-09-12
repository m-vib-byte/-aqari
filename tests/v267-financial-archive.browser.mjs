// Offline UI integration: actual archive/dialog/session modules; synthetic RPC responses.
// Chromium/WebKit viewports are not evidence of physical iPhone/iPad acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const root=process.cwd(),out=path.resolve(root,'archive-browser-evidence');
fs.mkdirSync(out,{recursive:true});
const archivePath='src/v267/pages/financial-archive.js';
const base='741f39d92e14bef8f28599ac1943fb0a8d4c8780';
const original=execFileSync('git',['show',`${base}:${archivePath}`],{encoding:'utf8'});
const HTML=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اختبار الأرشيف — بيانات اصطناعية</title><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body><h1>اختبار الأرشيف المالي — بيانات اصطناعية</h1><button id="open" type="button">فتح الأرشيف</button><script type="module">
import {openFinancialArchive} from '/src/v267/pages/financial-archive.js';
window.fixture={count:2,error:false,requests:[],delay:0};
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'user-a',workspaceId:'workspace-a'}};
window.AQARI_SUPABASE={context:{user:{id:'user-a'},workspace:{id:'workspace-a'},membership:{user_id:'user-a',workspace_id:'workspace-a',is_active:true,role:'general_manager'}},getClient:async()=>({rpc(name,args){fixture.requests.push({name,args:structuredClone(args)});return {abortSignal:signal=>new Promise((resolve,reject)=>{
const stop=()=>reject(Error('aborted'));signal.addEventListener('abort',stop,{once:true});
setTimeout(()=>{signal.removeEventListener('abort',stop);if(fixture.error){resolve({data:null,status:503,error:{message:'اتصال الاختبار غير متاح'}});return;}
const month=args.p_month||args.p_data?.month;
const expenses=Array.from({length:fixture.count},(_,i)=>({id:'expense-'+i,workspace_id:'workspace-a',expense_date:month+'-01',property_id:'property-a',voucher_no:'EXP-'+(401+i),payee:i?'مورد الاختبار':'شركة الصيانة',description:'صيانة المصعد',category:'صيانة',reference:'BANK-'+i,amount:'120.500',state:i?'draft':'approved'}));
const streams=['rent','expense','deposit','adjustment','opening','tenant_ledger','credit_allocation','petty_cash'];
const entries=expenses.map((e,i)=>({id:e.id,workspace_id:e.workspace_id,on_date:e.expense_date,property_id:e.property_id,reference:e.voucher_no,description:e.payee+' — '+e.description,amount:e.amount,status:e.state,direction:'paid',stream:fixture.mixed?streams[i%streams.length]:'expense'}));
const common={summary:{approved_expenses:'120.500',count:1},period:null,history:[],properties:[{id:'property-a',name:'برج الاختبار'}]};
const data=name==='aqari_financial_register'?{...common,expenses}:{...common,month,entries,history_truncated:false,scope:'scoped_sources_not_consolidated_profit'};
resolve({data,error:null,status:200});
},fixture.delay);})};}})};
const originalCreate=URL.createObjectURL.bind(URL),originalRevoke=URL.revokeObjectURL.bind(URL);
window.urlCounts={created:0,revoked:0};
URL.createObjectURL=(...args)=>{urlCounts.created++;return originalCreate(...args);};URL.revokeObjectURL=(...args)=>{urlCounts.revoked++;return originalRevoke(...args);};
document.getElementById('open').onclick=openFinancialArchive;window.ready=true;
</script></body></html>`;
const server=createServer((req,res)=>{
 const file=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 if(file==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(HTML);return;}
 const allowed=new Map([
  ['/src/v267/pages/financial-archive.js',archivePath],
  ['/src/v267/components/dialog.js','src/v267/components/dialog.js'],
  ['/src/v267/api/session.js','src/v267/api/session.js'],
  ['/src/v267/styles/workspace.css','src/v267/styles/workspace.css']
 ]);
 if(file==='/src/v267/components/locale.js'){
  res.setHeader('Content-Type','text/javascript');res.end("export const t=x=>x,getLocale=()=>'ar',direction=()=>'rtl';");return;
 }
 if(!allowed.has(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(path.resolve(root,allowed.get(file))));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,results=[];
const jsonLabel=/^(تصدير نسخة JSON للتدقيق|تصدير السجل للتدقيق)$/;
function pass(engine,viewport,name,extra={}){results.push({engine,viewport,name,passed:true,...extra});console.log(`PASS ${engine}/${viewport}: ${name}`);}
async function configure(context,baseline=false){
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin!==origin)return route.abort();
  if(baseline&&new URL(route.request().url()).pathname===`/${archivePath}`)return route.fulfill({body:original,contentType:'text/javascript'});
  return route.continue();
 });
}
async function openArchive(page){
 await page.locator('#open').click();
 await page.getByRole('button',{name:jsonLabel}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('input[type=month]').disabled);
}
async function downloadJson(page,file){
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:jsonLabel}).click();
 const download=await pending;assert.equal(await download.failure(),null);
 const destination=path.join(out,file);await download.saveAs(destination);
 return {name:download.suggestedFilename(),data:JSON.parse(fs.readFileSync(destination,'utf8'))};
}
let activeBrowser;
try{
 activeBrowser=await chromium.launch();
 const baseline=await activeBrowser.newContext({acceptDownloads:true});await configure(baseline,true);
 const page=await baseline.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.waitForFunction(()=>window.ready);await openArchive(page);
 const initial=await page.locator('input[type=month]').inputValue(),changed=initial==='2026-10'?'2026-11':'2026-10';
 await page.locator('input[type=month]').fill(changed);
 const before=await downloadJson(page,'baseline-month-mismatch.json');
 assert.equal(before.data.month,changed);assert.equal(before.data.expenses[0].expense_date.slice(0,7),initial);assert.notEqual(changed,initial);
 pass('chromium','baseline','original month-label bug reproduced',{labelMonth:changed,dataMonth:initial});
 await baseline.close();await activeBrowser.close();activeBrowser=null;
 for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
  activeBrowser=await browserType.launch();
  for(const [viewport,width,height,mobile] of [['desktop',1440,1000,false],['phone',390,844,true],['tablet',820,1180,true]]){
   const context=await activeBrowser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
   await configure(context);const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.waitForFunction(()=>window.ready);await openArchive(page);
   const month=await page.locator('input[type=month]').inputValue();
   assert.equal(await page.locator('tbody tr').count(),2);assert.match(await page.locator('tbody').innerText(),/120\.500 د\.ك/);
   pass(engine,viewport,'native dialog, rows and currency render');
   await page.screenshot({path:path.join(out,`${engine}-${viewport}-summary.png`),fullPage:true});
   const region=page.getByRole('region',{name:'جدول الحركات؛ قابل للتمرير أفقياً',exact:true});
   const box=await region.boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=width+1);
   if(width<704)assert.ok(await region.evaluate(el=>el.scrollWidth>el.clientWidth));
   pass(engine,viewport,'production dialog styling contains wide table within viewport');
   await page.getByLabel('البحث في الحركات',{exact:true}).fill('٤٠١');
   assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/EXP-401/);
   pass(engine,viewport,'Arabic voucher search');
   const exported=await downloadJson(page,`${engine}-${viewport}-archive.json`);
   assert.equal(exported.name,`AQARI-finance-${month}.json`);assert.equal(exported.data.month,month);assert.equal(exported.data.entries.length,2);
   assert.ok(exported.data.entries.every(x=>x.on_date.slice(0,7)===month));
   pass(engine,viewport,'download bytes preserve loaded month and full returned rows');
   const csvEvent=page.waitForEvent('download');await page.getByRole('button',{name:'تنزيل جدول CSV',exact:true}).click();const csv=await csvEvent;
   assert.equal(await csv.failure(),null);assert.equal(csv.suggestedFilename(),`AQARI-finance-${month}.csv`);
   const csvPath=path.join(out,`${engine}-${viewport}-archive.csv`);await csv.saveAs(csvPath);const csvText=fs.readFileSync(csvPath,'utf8');
   assert.equal(csvText.split('\r\n').length,3);assert.match(csvText,/EXP-401/);assert.match(csvText,/EXP-402/);pass(engine,viewport,'native CSV download preserves all rows despite search filter');
   await page.getByLabel('البحث في الحركات',{exact:true}).fill('');await page.getByLabel('حالة الحركة',{exact:true}).selectOption('draft');
   assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/EXP-402/);
   pass(engine,viewport,'state filter');
   await page.getByRole('button',{name:'إغلاق',exact:true}).click();assert.equal(await page.locator('dialog').count(),0);assert.ok(await page.evaluate(()=>urlCounts.created===urlCounts.revoked));
   pass(engine,viewport,'close removes private records and revokes object URLs');
   await openArchive(page);await page.locator('input[type=month]').fill(changed);assert.equal(await page.locator('table').count(),0);assert.equal(await page.getByRole('button',{name:jsonLabel}).count(),0);
   await page.getByRole('button',{name:'استرجاع الشهر',exact:true}).click();await page.getByRole('button',{name:jsonLabel}).waitFor();
   const after=await downloadJson(page,`${engine}-${viewport}-changed-month.json`);assert.equal(after.data.month,changed);assert.ok(after.data.entries.every(x=>x.on_date.slice(0,7)===changed));
   pass(engine,viewport,'month change clears old evidence and retrieves correct month');
   await page.evaluate(()=>{fixture.error=true;});await page.getByRole('button',{name:'استرجاع الشهر',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('input[type=month]').disabled);
   assert.equal(await page.locator('table').count(),0);assert.equal(await page.getByRole('button',{name:jsonLabel}).count(),0);assert.match(await page.locator('dialog').innerText(),/اتصال الاختبار غير متاح/);
   pass(engine,viewport,'reload failure clears stale rows and export');
   await page.evaluate(()=>{fixture.error=false;fixture.count=51;});await page.getByRole('button',{name:'استرجاع الشهر',exact:true}).click();await page.getByRole('button',{name:jsonLabel}).waitFor();
   assert.equal(await page.locator('tbody tr').count(),50);await page.getByRole('button',{name:'التالي',exact:true}).click();assert.equal(await page.locator('tbody tr').count(),1);assert.ok(await page.getByRole('button',{name:'التالي',exact:true}).isDisabled());
   pass(engine,viewport,'pagination and recovery after reload error');
   await page.evaluate(()=>{fixture.count=5000;});const started=performance.now();await page.getByRole('button',{name:'استرجاع الشهر',exact:true}).click();await page.getByRole('button',{name:jsonLabel}).waitFor();
   assert.equal(await page.locator('tbody tr').count(),50);pass(engine,viewport,'5000 synthetic rows bound to 50 visible rows',{elapsedMs:Math.round(performance.now()-started)});
   await page.evaluate(()=>{fixture.count=8;fixture.mixed=true;});await page.getByRole('button',{name:'استرجاع الشهر',exact:true}).click();await page.getByRole('button',{name:jsonLabel}).waitFor();
   assert.equal(await page.locator('tbody tr').count(),8);assert.match(await page.locator('tbody').innerText(),/رصيد افتتاحي/);assert.match(await page.locator('tbody').innerText(),/عهدة مالية/);
   await page.getByLabel('نوع الحركة',{exact:true}).selectOption('credit_allocation');assert.equal(await page.locator('tbody tr').count(),1);assert.match(await page.locator('tbody').innerText(),/تخصيص رصيد سابق/);
   pass(engine,viewport,'all eight canonical movement streams retained with separate type filtering');
   await region.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${engine}-${viewport}.png`),fullPage:true});
   await page.evaluate(()=>{AQARI_SUPABASE.context.membership.is_active=false;window.dispatchEvent(new Event('aqari:auth-boundary'));});assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.locator('table').count(),0);
   pass(engine,viewport,'real session boundary removes cached private records');assert.deepEqual(errors,[]);pass(engine,viewport,'no uncaught page errors');
   await context.close();
  }
  await activeBrowser.close();activeBrowser=null;
 }
 assert.equal(results.length,85);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Local UI integration with synthetic RPC responses; no live DB or physical devices',baselineReproductions:1,fixedUiChecks:84,passed:85,results},null,2)+'\n');
 console.log('Archive browser verification: 1 baseline reproduction + 84 fixed UI checks PASS.');
}finally{
 if(activeBrowser)await activeBrowser.close();await new Promise(resolve=>server.close(resolve));
}
