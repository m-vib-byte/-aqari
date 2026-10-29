import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.env.AQARI_CONTRACT_BROWSER_EVIDENCE||'docs/acceptance/2026-10-14/unified/contract-ui');
fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body class="aq-v267 aq-unified-experience"><button id="open">فتح تجربة العقود</button><script type="module">
import {createDialog} from '/src/v267/components/dialog.js';
import {mountSignatureReview,mountContractChangeRequest} from '/src/v267/components/contract-administration.js';
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'synthetic-user',workspaceId:'synthetic-workspace'}};
const s=window.TEST={mode:'ok',view:'signatures',calls:[],writes:[],state:{status:'missing_signature',required_signers:['tenant','landlord'],signed_by:['landlord']},lost:false};
const execute=async(name,args)=>{
 if(name!=='aqari_contract_administration')throw Error('Unexpected RPC');s.calls.push(structuredClone(args));const action=args.p_action;let result;
 if(action==='signature_status')result=s.state;
 else if(action==='requests')result=s.writes;
 else {
  if(s.mode==='reject')return {status:400,error:{code:'22023',message:action==='review_signatures'?'SIGNERS_INVALID':'CHANGE_REASON_REQUIRED'}};
  const data=structuredClone(args.p_data);let saved=s.writes.find(r=>r.id===data.id);
  if(!saved){saved={...data,status:'complete'};s.writes.push(saved);}
  if(action==='review_signatures')s.state=saved;
  if(s.mode==='lost'&&!s.lost){s.lost=true;throw Error('Simulated lost response after committed write');}
  result=saved;
 }
 return {data:{workspace_id:'synthetic-workspace',user_id:'synthetic-user',result}};
};
const client={rpc:(name,args)=>({abortSignal:()=>execute(name,args)})};
window.AQARI_SUPABASE={getClient:async()=>client,context:{user:{id:'synthetic-user'},workspace:{id:'synthetic-workspace'},membership:{user_id:'synthetic-user',workspace_id:'synthetic-workspace',is_active:true,role:'general_manager'}}};
document.querySelector('#open').onclick=()=>{const d=createDialog('اختبار معزول — لا بيانات حقيقية');window.DIALOG=d;d.run(async()=>s.view==='signatures'?mountSignatureReview(d,d.body,'synthetic-document'):mountContractChangeRequest(d,d.body,'SYNTHETIC-CONTRACT'));};
</script></body></html>`;
const server=createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');
 if(p==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(p==='/favicon.ico'){res.writeHead(204);return res.end();}
 const f=path.resolve(root,'.'+p);
 if(!p.startsWith('/src/')||!f.startsWith(root+path.sep)||!fs.existsSync(f)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(f));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,results=[];let browser;
try{
 for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
  browser=await type.launch();
  for(const [device,width,height,mobile] of [['Desktop',1440,1000,false],['Phone',390,844,true],['Tablet',820,1180,true]]){
   const ctx=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
   await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   const page=await ctx.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const done=()=>page.waitForFunction(()=>window.DIALOG?.el.getAttribute('aria-busy')==='false');
   const ready=async(mode='ok',view='signatures',role='general_manager')=>{await page.goto(origin);await page.waitForFunction(()=>window.TEST);await page.evaluate(({mode,view,role})=>{Object.assign(TEST,{mode,view});AQARI_SUPABASE.context.membership.role=role;},{mode,view,role});await page.locator('#open').click();await done();};
   const save=()=>page.locator('form button[type=submit]').click();
   const pass=name=>{results.push({engine,device,name,passed:true});console.log(`PASS ${engine}/${device}: ${name}`);};
   try{
    await ready();await page.getByLabel('توقيع المستأجر موجود',{exact:true}).check();await page.getByLabel('توقيع المؤجر موجود',{exact:true}).uncheck();await page.locator('textarea').fill('شاهد تجريبي');
    assert.equal(await page.getByLabel('توقيع المستأجر موجود',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('توقيع المؤجر موجود',{exact:true}).isChecked(),false);pass('تعديل الأطراف يحفظ اختيارات التوقيع غير المحفوظة');
    await save();await done();assert.match(await page.getByRole('status').innerText(),/حُفظت مراجعة/);const saved=await page.evaluate(()=>TEST.writes[0]);assert.deepEqual(saved.signed_by,['tenant']);assert.deepEqual(saved.required_signers,['tenant','landlord','شاهد تجريبي']);pass('الحفظ يعاد قراءته بنفس المعرف والاختيارات');
    await ready('reject');await page.locator('textarea').fill('شاهد أول');await save();await done();assert.equal(await page.locator('textarea').isEnabled(),true);assert.equal(await page.locator('input[type=checkbox]').first().isEnabled(),true);assert.equal(await page.evaluate(()=>TEST.writes.length),0);await page.locator('textarea').fill('شاهد مصحح');await page.evaluate(()=>TEST.mode='ok');await save();await done();assert.equal(await page.evaluate(()=>TEST.writes.length),1);assert.equal(await page.locator('textarea').inputValue(),'شاهد مصحح');pass('رفض مؤكد يفتح التصحيح ثم يحفظ مرة واحدة');
    await ready('lost');await page.getByLabel('توقيع المستأجر موجود',{exact:true}).check();await save();await done();assert.equal(await page.locator('textarea').isDisabled(),true);await save();await done();assert.equal(await page.evaluate(()=>TEST.writes.length),1);assert.equal(await page.evaluate(()=>new Set(TEST.calls.filter(x=>x.p_action==='review_signatures').map(x=>x.p_data.id)).size),1);assert.match(await page.getByRole('status').innerText(),/حُفظت مراجعة/);pass('فقد الرد يعيد معرف العملية نفسه دون سجل مكرر في المحاكاة');
    await ready('reject','change');await page.locator('textarea').fill('سبب اختبار التصحيح');await save();await done();assert.equal(await page.locator('textarea').isEnabled(),true);assert.equal(await page.locator('textarea').inputValue(),'سبب اختبار التصحيح');await page.evaluate(()=>TEST.mode='ok');await page.locator('textarea').fill('سبب مصحح للاختبار');await save();await done();assert.equal(await page.evaluate(()=>TEST.writes.length),1);assert.equal(await page.locator('textarea').inputValue(),'');assert.match(await page.getByRole('status').innerText(),/حُفظ الطلب/);pass('رفض طلب التعديل يحفظ السبب ويتيح تصحيحه وإعادة قراءته');
    await ready('lost','change');await page.locator('textarea').fill('سبب اختبار فقد الرد');await save();await done();assert.equal(await page.locator('textarea').isDisabled(),true);await save();await done();assert.equal(await page.evaluate(()=>TEST.writes.length),1);assert.equal(await page.evaluate(()=>new Set(TEST.calls.filter(x=>x.p_action==='request_change').map(x=>x.p_data.id)).size),1);pass('طلب التعديل بعد فقد الرد لا يولد عملية جديدة');
    await ready('ok','signatures','employee');assert.equal(await page.locator('form').count(),0);pass('الموظف يرى الحالة دون واجهة اعتماد التواقيع');
    await ready();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,engine+'-'+device+'.png'),fullPage:true});pass('واجهة مراجعة التوقيع ضمن عرض الشاشة');
    await page.evaluate(()=>{AQARI_DATA_GATE.scope.userId='another';window.dispatchEvent(new Event('aqari:auth-boundary'));});assert.equal(await page.locator('dialog').count(),0);pass('تغيير الجلسة يغلق واجهة الحساب السابق');
    assert.deepEqual(errors,[]);
   }catch(e){await page.screenshot({path:path.join(out,engine+'-'+device+'-failure.png'),fullPage:true}).catch(()=>{});console.error({engine,device,errors,message:e.message});throw e;}finally{await ctx.close();}
  }
  await browser.close();browser=null;
 }
 const tested=['src/v267/components/contract-administration.js','src/v267/components/dialog.js','src/v267/api/session.js'];
 const evidence={date:new Date().toISOString(),scope:'Real UI modules on localhost, synthetic RPC, external requests blocked. No hosted account or physical device acceptance.',codeBase:process.env.AQARI_EXPECTED_SHA||'e69e8993ce317a52a06551bef8d95c1f7f6d2287',hashes:Object.fromEntries(tested.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),results};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log(`TOTAL ${results.length} passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
