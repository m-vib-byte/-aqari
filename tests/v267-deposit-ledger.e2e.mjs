import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {t,LANGUAGES} from '../src/v267/components/locale.js';
const root=process.cwd(),out=path.join(root,'test-results/v267-deposit-ledger');fs.mkdirSync(out,{recursive:true});
const wid='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222',lid='33333333-3333-4333-8333-333333333333';
const tenant='مستأجر <literal> {amount}',property='عقار <source> {unit}';
let rows=[],writes=0,lostReply=false,readUnavailable=false,denied=false,manager=true;
const money=fils=>(Number(fils)/1000).toFixed(3);
function lease(){const received=rows.filter(x=>x.kind==='receipt').reduce((s,x)=>s+Math.round(Number(x.amount)*1000),0),refunded=rows.filter(x=>x.kind==='refund').reduce((s,x)=>s+Math.round(Number(x.amount)*1000),0);return {id:lid,contract_no:'C-DEPOSIT-TEST',tenant_id:'44444444-4444-4444-8444-444444444444',tenant_name:tenant,property_id:'55555555-5555-4555-8555-555555555555',property_name:property,unit_id:'66666666-6666-4666-8666-666666666666',unit_no:'101',status:'signed',contract_deposit:'125.750',received:money(received),refunded:money(refunded),balance:money(received-refunded),can_receive:true,can_refund:manager};}
const html=`<!doctype html><html class="aqari-auth-unlocked"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body><button id="open">Open synthetic deposit ledger</button><script type="module">
 const wid=${JSON.stringify(wid)},uid=${JSON.stringify(uid)};
 window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
 window.AQARI_DATA_GATE={scope:{userId:uid,workspaceId:wid}};
 window.AQARI_SUPABASE={context:{user:{id:uid},workspace:{id:wid},membership:{user_id:uid,workspace_id:wid,is_active:true,role:new URL(location.href).searchParams.get('role')||'general_manager'}},getClient:async()=>({rpc:(name,args)=>({abortSignal:signal=>fetch('/fixture/'+name,{method:'POST',body:JSON.stringify(args),signal}).then(async r=>r.ok?{data:await r.json(),status:r.status}:{error:await r.json(),status:r.status})})})};
 const {setLocale}=await import('/src/v267/components/locale.js');setLocale(new URL(location.href).searchParams.get('lang')||'ar');
 const {openDepositLedger}=await import('/src/v267/pages/deposit-ledger.js');document.getElementById('open').onclick=openDepositLedger;
 </script></body></html>`;
const reply=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/fixture/aqari_deposit_register'){let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const {p_workspace_id,p_action:a,p_data:d}=JSON.parse(body);assert.equal(p_workspace_id,wid,'RPC binds current workspace');
  if(denied)return reply(res,{code:'42501',message:'ACCESS_DENIED'},403);
  if(a==='list')return reply(res,{manager,leases:[lease()],entries:d.lease_id?[...rows].reverse():[]});
  if(a==='get')return readUnavailable?reply(res,{message:'TEMPORARY_UNAVAILABLE'},503):reply(res,{entry:rows.find(x=>x.id===d.id)||null,lease:rows.some(x=>x.id===d.id)?lease():null});
  assert.ok(['receive','refund'].includes(a));assert.equal(d.lease_id,lid);
  if(a==='refund'&&!manager)return reply(res,{code:'42501',message:'ACCESS_DENIED'},403);
  const existing=rows.find(x=>x.id===d.id);if(existing)return reply(res,{entry:existing,lease:lease()});
  const amount=Math.round(Number(d.amount)*1000),balance=Math.round(Number(lease().balance)*1000);
  if(a==='receive'&&balance+amount>125750)return reply(res,{code:'22023',message:'DEPOSIT_RECEIPT_EXCEEDS_CONTRACT'},400);
  if(a==='refund'&&amount>balance)return reply(res,{code:'22023',message:'DEPOSIT_REFUND_EXCEEDS_BALANCE'},400);
  const l=lease(),entry={...d,workspace_id:wid,kind:a==='receive'?'receipt':'refund',status:'confirmed',voucher_no:(a==='receive'?'DP':'DF')+'-TEST-'+(++writes),actor_id:uid,actor_name:'مدير اختبار',created_at:new Date().toISOString(),snapshot:{lease_id:lid,contract_no:l.contract_no,tenant_id:l.tenant_id,tenant_name:tenant,property_id:l.property_id,property_name:property,unit_id:l.unit_id,unit_no:l.unit_no},balance_after:money(balance+(a==='receive'?amount:-amount))};rows.push(entry);
  if(lostReply){lostReply=false;readUnavailable=true;return reply(res,{message:'REPLY_LOST_AFTER_COMMIT'},503);}
  return reply(res,{entry,lease:lease()});
 });return;}
 if(pathname==='/'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(html);}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript;charset=utf-8'});res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const [engine,browserType]of Object.entries({chromium,webkit})){
 const browser=await browserType.launch();
 try{for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try{for(const lang of Object.keys(LANGUAGES)){
   rows=[];writes=0;lostReply=false;readUnavailable=false;denied=false;manager=true;
   const tr=s=>t(s,lang);await page.goto(origin+'/?lang='+lang);await page.locator('#open').click();
   const dialog=page.getByRole('dialog'),status=dialog.getByRole('status'),button=s=>dialog.getByRole('button',{name:tr(s),exact:true}),field=s=>dialog.getByLabel(tr(s),{exact:true});
   const ready=()=>status.getByText(tr('تم استرجاع دفتر التأمين من السجلات المحفوظة.'),{exact:true}).waitFor();
   const saved=()=>status.getByText(tr('تم حفظ حركة التأمين والتحقق من الوصل والرصيد.'),{exact:true}).waitFor();
   await ready();await field('العقد المحفوظ').selectOption(lid);await ready();
   assert.equal(await dialog.getAttribute('lang'),lang);assert.equal(await dialog.getAttribute('dir'),['ar','ur'].includes(lang)?'rtl':'ltr');
   assert.equal(await dialog.locator('dd').getByText(tenant,{exact:true}).count(),1);
   await field('المبلغ بالدينار الكويتي').fill('١٢٥٫٧٥١');await button('حفظ الحركة والتحقق من الوصل').click();
   await status.getByText(tr('المبلغ يتجاوز التأمين المتبقي للعقد.'),{exact:true}).waitFor();assert.equal(writes,0,'rejected amount does not save');
   await field('المبلغ بالدينار الكويتي').fill('١٢٥٫٧٥٠');await button('حفظ الحركة والتحقق من الوصل').click();await saved();assert.equal(writes,1,'corrected request can save after rejection');
   assert.equal(await dialog.locator('[data-aq267-deposit-entry]').count(),1);
   await button('إغلاق').click();await page.reload();await page.locator('#open').click();await ready();await field('العقد المحفوظ').selectOption(lid);await ready();assert.equal(await dialog.locator('[data-aq267-deposit-entry]').count(),1,'saved receipt reloads');
   await button('تسجيل رد تأمين').click();await field('المبلغ بالدينار الكويتي').fill('125.751');await field('سبب رد التأمين').fill('رد اختبار <literal>');await button('حفظ الحركة والتحقق من الوصل').click();
   await status.getByText(tr('مبلغ الرد يتجاوز رصيد التأمين المحفوظ.'),{exact:true}).waitFor();assert.equal(writes,1);
   await button('استخدام كامل الرصيد للرد').click();assert.equal(await field('المبلغ بالدينار الكويتي').inputValue(),'125.750');
   lostReply=true;await button('حفظ الحركة والتحقق من الوصل').click();await status.getByText(tr('تعذر تأكيد العملية. حدّث السجل للتحقق قبل إعادة المحاولة.'),{exact:true}).waitFor();assert.equal(writes,2);
   assert.equal(await button('حفظ الحركة والتحقق من الوصل').count(),0,'uncertain reply blocks another write');
   const stored=await page.evaluate(()=>Object.values(sessionStorage).join('\n'));assert.ok(!stored.includes(tenant)&&!stored.includes('125.750')&&!stored.includes('رد اختبار'),'pending marker excludes financial/identity fields');
   readUnavailable=false;await page.reload();await page.locator('#open').click();await saved();assert.equal(writes,2,'reload reconciles same saved operation');assert.equal(await dialog.locator('[data-aq267-deposit-entry]').count(),2);
   assert.ok((await dialog.locator('dl').textContent()).includes('0.000'));
   const card=dialog.locator('[data-aq267-deposit-entry="'+rows.find(x=>x.kind==='refund').id+'"]');await card.getByRole('button',{name:tr('تجهيز الوصل المحفوظ للطباعة'),exact:true}).click();
   const link=dialog.getByRole('link',{name:tr('فتح الوصل للطباعة أو الحفظ'),exact:true});await link.waitFor();
   const receipt=await link.evaluate(async el=>{const r=await fetch(el.href);return r.text();});
   assert.ok(receipt.includes('125.750')&&receipt.includes('C-DEPOSIT-TEST')&&receipt.includes('مستأجر &lt;literal&gt; {amount}'));
   assert.ok(receipt.includes('DF-TEST-2'));assert.ok(!receipt.includes('<literal>'));
   const printPage=await context.newPage();try{await printPage.setContent(receipt);await printPage.emulateMedia({media:'print'});assert.equal(await printPage.locator('script').count(),0);await printPage.screenshot({path:path.join(out,`${engine}-${viewport.width}-${lang}-saved-refund.png`),fullPage:true});}finally{await printPage.close();}
   const box=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(box.width<=viewport.width&&box.scroll<=box.client+1,'deposit dialog fits '+lang);
   await page.screenshot({path:path.join(out,`${engine}-${viewport.width}-${lang}-ledger.png`),fullPage:true});
   denied=true;await button('تحديث السجل والتحقق من العملية').click();await status.getByText(tr('لا تملك صلاحية هذه العملية.'),{exact:true}).waitFor();assert.equal(await dialog.locator('[data-aq267-deposit-entry]').count(),0);assert.equal(await dialog.getByRole('link').count(),0);assert.ok(!(await dialog.textContent()).includes(tenant),'permission loss clears private details');
   await page.evaluate(()=>{document.documentElement.classList.remove('aqari-auth-unlocked');window.dispatchEvent(new Event('aqari:auth-boundary'));});assert.equal(await dialog.count(),0);
  }
  manager=false;denied=false;await page.goto(origin+'/?role=collector');await page.locator('#open').click();const dialog=page.getByRole('dialog');await dialog.getByLabel('العقد المحفوظ',{exact:true}).selectOption(lid);await dialog.getByText('تم استرجاع دفتر التأمين من السجلات المحفوظة.',{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'تسجيل رد تأمين',exact:true}).count(),0,'collector cannot refund');
  assert.deepEqual(errors,[]);console.log(`PASS deposits ${engine} ${viewport.width}: five languages, save/reload, limits, lost-reply recovery, saved print, role and access clearing`);
  }finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
