// Local UI acceptance with synthetic data; no hosted account or physical device claims.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium,webkit} from 'playwright';

const out=path.resolve(process.env.AQARI_BROWSER_EVIDENCE||'counter-browser-evidence');fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فحص عدادات المتابعة — بيانات اصطناعية</title><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body><button id="open">فتح لوحة المؤشرات</button><script type="module">
import {openKpiDashboard} from '/src/v267/pages/kpi-dashboard.js';
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'fixture',workspaceId:'test-workspace'}};
const state=window.AQARI_COUNTER_TEST={bad:false,denied:false,pending:false,release:[],calls:0};
const permissions=Object.fromEntries(['finance','properties','tenants','contracts','maintenance'].map(key=>[key,{read:true}]));
class Query {
 constructor(table){this.table=table;}
 select(){return this;}eq(){return this;}in(){return this;}lte(){return this;}gte(){return this;}lt(){return this;}
 async abortSignal(){state.calls++;if(state.pending)await new Promise(resolve=>state.release.push(resolve));return {data:null,count:state.bad?null:this.table==='aqari_tenants'?1501:3,error:null};}
}
const client={from:table=>new Query(table),rpc(name,args){return {abortSignal:async()=>{
 if(state.denied)return {error:{message:'ACCESS_DENIED',code:'42501'},status:403};
 if(name==='aqari_workspace_access')return {data:{user_id:'fixture',workspace_id:'test-workspace',role:'general_manager',features:{kpi_dashboard:true},permissions}};
 return {data:{period:{from:args.p_from,to:args.p_to},units:{total:42,occupied:39,vacant:3,vacancy_rate:7.14},collections:{expected_monthly_snapshot:'8900.000',actual:'7550.125',rate:84.83,average_days:2},profit:{actual_income:'7550.125',approved_expenses:'250.000',actual_net:'7300.125',projected_net:'8650.000'},sources:['اختبار اصطناعي'],generated_at:'2026-09-12T21:05:00Z'}};
 }}}};
window.AQARI_SUPABASE={getClient:async()=>client,context:{user:{id:'fixture'},workspace:{id:'test-workspace'},membership:{user_id:'fixture',workspace_id:'test-workspace',role:'general_manager',is_active:true}}};
document.querySelector('#open').onclick=openKpiDashboard;
</script></body></html>`;
const root=process.cwd();
const server=createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1);res.setHeader('Cache-Control','no-store');
 if(!name){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(name==='favicon.ico'){res.writeHead(204);return res.end();}
 const file=path.resolve(root,name);
 if(!name.startsWith('src/v267/')||!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const results=[];let browser;
try {
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
  browser=await type.launch();
  for(const [device,width,height,mobile] of [['desktop',1440,1000,false],['phone',390,844,true],['tablet',820,1180,true]]) {
   const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   const pass=name=>{results.push({engine,device,name});console.log('PASS '+engine+'/'+device+': '+name);};
   try {
    await page.goto(origin);await page.locator('#open').click();await page.waitForFunction(()=>document.querySelectorAll('[data-counter]').length===11);
    assert.match(await page.locator('.aq267-management-counters').innerText(),/2026-09-13/);
    assert.equal(await page.locator('[data-counter="tenants"] dd').innerText(),(1501).toLocaleString('ar-KW'));
    assert.equal(await page.locator('dialog').getAttribute('aria-busy'),'false');pass('11 saved counters and Kuwait server date render');
    const overflow=await page.locator('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);pass('dialog fits viewport without horizontal overflow');
    await page.locator('.aq267-management-counters').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,engine+'-'+device+'.png'),fullPage:true});
    await page.evaluate(()=>window.AQARI_COUNTER_TEST.bad=true);await page.getByRole('button',{name:'عرض المؤشرات'}).click();await page.waitForFunction(()=>document.querySelector('dialog').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('[data-counter]').count(),0);assert.match(await page.getByRole('status').innerText(),/تعذر التحقق/);pass('failed count clears prior report instead of showing zero');
    await page.evaluate(()=>window.AQARI_COUNTER_TEST.bad=false);await page.getByRole('button',{name:'عرض المؤشرات'}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-counter]').length===11);pass('refresh recovers and reads saved counters again');
    await page.evaluate(()=>window.AQARI_COUNTER_TEST.denied=true);await page.getByRole('button',{name:'عرض المؤشرات'}).click();await page.waitForFunction(()=>!document.querySelector('dialog'));pass('server access denial removes private report');
    await page.evaluate(()=>{const s=window.AQARI_COUNTER_TEST;s.denied=false;s.pending=true;});await page.locator('#open').click();await page.waitForFunction(()=>window.AQARI_COUNTER_TEST.release.length>0);await page.getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.evaluate(()=>{const s=window.AQARI_COUNTER_TEST;s.pending=false;s.release.splice(0).forEach(resolve=>resolve());});
    await page.locator('#open').click();await page.waitForFunction(()=>document.querySelectorAll('[data-counter]').length===11);assert.equal(await page.locator('dialog').count(),1);pass('close cancels pending read and a new dialog loads safely');
    assert.deepEqual(errors,[]);pass('no browser or module loading errors');
   }catch(error){await page.screenshot({path:path.join(out,engine+'-'+device+'-failure.png'),fullPage:true}).catch(()=>{});throw error;}
   finally{await context.close();}
  }
  await browser.close();browser=null;
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'Synthetic local browsers; no live account or physical-device acceptance',passed:results.length,results},null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
