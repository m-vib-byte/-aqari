import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';import {t,LANGUAGES} from '../src/v267/components/locale.js';
const root=process.cwd(),out=path.join(root,'test-results/v267-vacating');fs.mkdirSync(out,{recursive:true});
const w='11111111-1111-4111-8111-111111111111',u='22222222-2222-4222-8222-222222222222',l='33333333-3333-4333-8333-333333333333',doc='44444444-4444-4444-8444-444444444444';
const tenant='مستأجر <literal> {amount}';let record=null,ops=new Map(),writes=0,lost=false,unavailable=false,denied=false;
function statement(){return {lease:{id:l,external_ref:'fixture-c'},identity:{tenant_name:tenant,contract_no:'VC-CONTRACT',property_name:'عقار الاختبار',unit_no:'101'},rent_remaining:'100.000',deposit_balance:'0.000',open_maintenance:0,unallocated_utility_bills:0,source_review_required:false,periods:[{period:'2026-01',due:'100.000',paid:'0.000',remaining:'100.000'}],documents:[{id:doc,title:'محضر اختبار محفوظ',purpose:'vacating_handover'}],review_token:'synthetic-review'};}
const html=`<!doctype html><html class="aqari-auth-unlocked"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body><button id="open" disabled>Open synthetic vacating</button><script type="module">
 window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};window.AQARI_DATA_GATE={scope:{userId:'${u}',workspaceId:'${w}'}};
 window.AQARI_SUPABASE={context:{user:{id:'${u}'},workspace:{id:'${w}'},membership:{user_id:'${u}',workspace_id:'${w}',role:'general_manager',is_active:true}},getClient:async()=>({rpc:(name,args)=>({abortSignal:signal=>fetch('/fixture',{method:'POST',body:JSON.stringify(args),signal}).then(async r=>r.ok?{data:await r.json(),status:r.status}:{error:await r.json(),status:r.status})})})};
 const {setLocale}=await import('/src/v267/components/locale.js');setLocale(new URL(location.href).searchParams.get('lang')||'ar');const {openVacating}=await import('/src/v267/pages/vacating.js');document.getElementById('open').onclick=openVacating;document.getElementById('open').disabled=false;</script></body></html>`;
const reply=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json;charset=utf-8'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/fixture'){let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{
  const {p_workspace_id,p_action:a,p_data:d}=JSON.parse(raw);assert.equal(p_workspace_id,w);
  if(denied)return reply(res,{code:'42501',message:'ACCESS_DENIED'},403);
  if(a==='list')return reply(res,[{id:l,contract_no:'VC-CONTRACT',start_date:'2026-01-01',end_date:'2026-12-31'}]);
  if(a==='get')return reply(res,record);if(a==='statement')return reply(res,statement());
  if(a==='operation')return unavailable?reply(res,{message:'TEMPORARY_UNAVAILABLE'},503):reply(res,ops.get(d.id)??null);
  if(ops.has(d.id))return reply(res,ops.get(d.id).result);
  if(d.revision!==(record?.revision??0))return reply(res,{code:'40001',message:'VACATING_STALE_REVISION'},400);
  if(a==='issue'&&!d.exception_reason)return reply(res,{code:'22023',message:'VACATING_OPEN_OBLIGATIONS'},400);
  writes++;record=a==='save'?{...d,workspace_id:w,state:'draft',revision:d.revision+1,updated_by:u}:{...record,state:'issued',revision:record.revision+1,updated_by:u,certificate_no:'VC-SYNTHETIC',issued_by:u,issued_name:'مدير اختبار',issued_at:'2026-09-09T12:00:00Z',snapshot:{...statement(),inspection:record.inspection,additional_obligations:record.obligations,exception_reason:d.exception_reason}};
  ops.set(d.id,{id:d.id,action:a,request:d,result:record});
  if(lost){lost=false;unavailable=true;return reply(res,{message:'LOST_REPLY'},503);}return reply(res,record);
 });return;}
 if(p==='/'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});return res.end(html);}
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript;charset=utf-8'});res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const [engine,kind]of Object.entries({chromium,webkit})){const browser=await kind.launch();try{for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}]){
 const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 try{for(const lang of Object.keys(LANGUAGES)){
  record=null;ops=new Map();writes=0;lost=false;unavailable=false;denied=false;const tr=x=>t(x,lang);
  await page.goto(origin+'/?lang='+lang);await page.locator('#open').click();const dialog=page.getByRole('dialog'),field=x=>dialog.getByLabel(tr(x),{exact:true}),button=x=>dialog.getByRole('button',{name:tr(x),exact:true});
  await field('العقد المحفوظ').selectOption(l);await dialog.getByText(tenant,{exact:false}).waitFor();
  assert.equal(await dialog.getAttribute('lang'),lang);assert.equal(await dialog.getAttribute('dir'),['ar','ur'].includes(lang)?'rtl':'ltr');
  await field('تاريخ الإخلاء').fill('2026-01-31');await button('تحديث بيان التسوية').click();await dialog.getByText(tenant,{exact:false}).waitFor();
  await field('محضر حالة الوحدة').fill('معاينة <literal> {amount}');await field('تم استلام المفاتيح').check();await dialog.getByLabel('محضر اختبار محفوظ',{exact:true}).check();await field('سبب العملية').fill('إنشاء محضر اختبار');
  lost=true;await button('حفظ مسودة الإخلاء').click();await button('إعادة نفس العملية دون تكرار').waitFor();
  assert.equal(writes,1);unavailable=false;await page.reload();await page.locator('#open').click();await field('محضر حالة الوحدة').waitFor();assert.equal(await field('محضر حالة الوحدة').inputValue(),'معاينة <literal> {amount}');assert.equal(writes,1);
  await field('سبب العملية').fill('اعتماد اختبار موثق');await button('اعتماد الإخلاء وإصدار براءة الذمة').click();await dialog.getByText(tr('توجد التزامات مفتوحة. أكمل التسوية أو وثّق استثناء معتمدًا.'),{exact:true}).waitFor();assert.equal(writes,1);
  await field('الاستثناء المعتمد').fill('استثناء اختبار موثق <debt>');await button('اعتماد الإخلاء وإصدار براءة الذمة').click();await dialog.getByText('VC-SYNTHETIC',{exact:true}).waitFor();assert.equal(writes,2);
  await button('تجهيز المستند المحفوظ للطباعة').click();const link=dialog.getByRole('link',{name:tr('فتح المستند للطباعة أو الحفظ'),exact:true});await link.waitFor();
  const receipt=await link.evaluate(async a=>(await fetch(a.href)).text());assert.ok(receipt.includes('&lt;debt&gt;')&&receipt.includes('100.000')&&!receipt.includes('<literal>'));
  const print=await context.newPage();try{await print.setContent(receipt);await print.emulateMedia({media:'print'});assert.equal(await print.locator('script').count(),0);await print.screenshot({path:path.join(out,`${engine}-${viewport.width}-${lang}-clearance.png`),fullPage:true});}finally{await print.close();}
  const size=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.width<=viewport.width&&size.scroll<=size.client+1);await page.screenshot({path:path.join(out,`${engine}-${viewport.width}-${lang}.png`),fullPage:true});
  denied=true;await button('تحديث السجل والتحقق من العملية').click();await dialog.waitFor({state:'detached'});assert.ok(!(await page.locator('body').innerText()).includes(tenant));
 }
 assert.deepEqual(errors,[]);console.log(`PASS vacating ${engine} ${viewport.width}: five languages, saved draft/reload, lost reply, obligation guard, explicit exception, saved print, revoked access`);
 }catch(error){console.error('VACATING_FIXTURE_FAILURE',JSON.stringify({url:page.url(),errors,body:await page.locator('body').innerText()}));await page.screenshot({path:path.join(out,engine+'-'+viewport.width+'-failure.png'),fullPage:true});throw error;}
 finally{await context.unrouteAll({behavior:'wait'});await context.close();}
 }}finally{await browser.close();}}}finally{await new Promise(r=>server.close(r));}
