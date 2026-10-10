import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.env.AQARI_PROPERTY_BROWSER_EVIDENCE||'property-browser-evidence');fs.mkdirSync(out,{recursive:true});
const html=`<!doctype html><html lang="ar" dir="rtl" class="aqari-auth-unlocked"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اختبار الأرشفة — بيانات تجريبية</title><link rel="stylesheet" href="/src/v267/styles/workspace.css"><body class="aq-v267 aq-unified-experience"><h1>فحص معزول — عقار تجريبي</h1><button id="open">فتح الأرشفة</button><script type="module">
import {openPropertyLifecycle} from '/src/v267/pages/property-lifecycle.js';
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:'test-user',workspaceId:'test-workspace'}};
const s=window.TEST={life:{state:'active',revision:0},calls:[],mode:'ok',finish:null};
const execute=async(name,args)=>{if(name!=='aqari_property_lifecycle')throw Error('Unexpected RPC');s.calls.push(args);
 if(args.p_action!=='context'){
  if(s.mode==='pause')await new Promise(r=>s.finish=r);
  if(s.mode==='mfa')return {error:{code:'42501',message:'MFA_RECENT_REAUTH_REQUIRED'},status:403};
  s.life={state:args.p_action==='archive'?'archived':'active',revision:s.life.revision+1,operationId:args.p_operation_id};
 }
 const life={...s.life};if(s.mode==='bad-ack'&&args.p_action!=='context'||s.mode==='bad-read'&&s.life.revision>0&&args.p_action==='context')life.operationId='wrong-operation';
 return {data:{workspace_id:'test-workspace',user_id:'test-user',propertyId:'test-property',name:'عقار تجريبي — لا بيانات حقيقية',units:2,contracts:2,documents:11,lifecycle:life}};
};
const client={rpc:(name,args)=>({abortSignal:()=>execute(name,args)})};
window.AQARI_SUPABASE={getClient:async()=>client,context:{user:{id:'test-user'},workspace:{id:'test-workspace'},membership:{user_id:'test-user',workspace_id:'test-workspace',is_active:true,role:'general_manager'}}};
document.querySelector('#open').onclick=()=>openPropertyLifecycle('test-property');
</script></body></html>`;
const server=createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname.slice(1);res.setHeader('Cache-Control','no-store');if(!p){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}if(p==='favicon.ico'){res.writeHead(204);return res.end();}if(!/^src\/v267\/(components|api|pages|styles)\/[a-z0-9-]+\.(js|css)$/.test(p)||!fs.existsSync(path.join(root,p))){res.writeHead(404);return res.end();}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,p)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const results=[],screens=[];let browser;
try{
 for(const [engine,type] of [['Chromium',chromium],['WebKit',webkit]]){
  browser=await type.launch();
  for(const [device,width,height,mobile] of [['Desktop',1440,1000,false],['Phone',390,844,true],['Tablet',820,1180,true]]){
   const ctx=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
   await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   const page=await ctx.newPage();page.setDefaultTimeout(10000);let accept=true;const errors=[];
   page.on('dialog',d=>accept?d.accept():d.dismiss());page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   const ready=async(mode='ok')=>{accept=true;await page.goto(origin);await page.waitForFunction(()=>window.TEST);await page.evaluate(m=>window.TEST.mode=m,mode);await page.locator('#open').click();await page.locator('textarea').waitFor();await page.waitForFunction(()=>document.querySelector('dialog')?.getAttribute('aria-busy')==='false');};
   const done=()=>page.waitForFunction(()=>document.querySelector('dialog')?.getAttribute('aria-busy')==='false');
   const count=()=>page.evaluate(()=>window.TEST.calls.filter(x=>x.p_action!=='context').length);
   const save=()=>page.locator('form button').click();
   const pass=name=>{results.push({engine,device,name,passed:true});console.log(`PASS ${engine}/${device}: ${name}`);};
   try{
    await ready();await page.locator('textarea').fill('اختبار أرشفة معزول');await save();await done();assert.match(await page.getByRole('status').innerText(),/تمت أرشفة/);assert.equal(await count(),1);assert.equal(await page.locator('form button').innerText(),'إعادة تفعيل العقار');
    await page.locator('textarea').fill('اختبار استعادة معزول');await save();await done();assert.match(await page.getByRole('status').innerText(),/تمت إعادة تفعيل/);assert.equal(await count(),2);assert.equal(await page.evaluate(()=>window.TEST.life.revision),2);pass('أرشفة وإعادة تفعيل مع تأكيد الحالة والمراجعة');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const bounds=await page.locator('.aq267-close').boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=height);pass('لا تمرير أفقي وزر الإغلاق داخل الشاشة');
    const png=path.join(out,`${engine}-${device}.png`);await page.screenshot({path:png,fullPage:true});screens.push({engine,device,file:png});
    await ready();await page.locator('textarea').fill('مسودة تبقى بعد الإلغاء');accept=false;await save();await done();assert.equal(await count(),0);await page.locator('.aq267-close').click();assert.equal(await page.locator('dialog').count(),1);assert.equal(await page.locator('textarea').inputValue(),'مسودة تبقى بعد الإلغاء');pass('إلغاء التأكيد والمغادرة يحفظ المسودة ولا يكتب');
    await ready('mfa');await page.locator('textarea').fill('سبب محفوظ للتحقق');await save();await done();assert.match(await page.getByRole('status').innerText(),/يلزم تأكيد حديث/);assert.equal(await page.locator('textarea').inputValue(),'سبب محفوظ للتحقق');assert.equal(await count(),1);await page.evaluate(()=>window.TEST.mode='ok');await save();await done();assert.match(await page.getByRole('status').innerText(),/تمت أرشفة/);assert.equal(await count(),2);pass('رفض التحقق الثنائي يحفظ السبب ويسمح بإعادة محاولة يدوية');
    await ready('bad-ack');await page.locator('textarea').fill('اختبار نتيجة غير مؤكدة');await save();await done();assert.doesNotMatch(await page.getByRole('status').innerText(),/تمت أرشفة/);assert.equal(await page.locator('form button').isDisabled(),true);assert.equal(await count(),1);await page.getByRole('button',{name:'تحديث الحالة من الخادم',exact:true}).click();await done();assert.equal(await page.locator('form button').innerText(),'إعادة تفعيل العقار');assert.equal(await count(),1);pass('النتيجة غير المؤكدة تسترد بالقراءة دون تكرار الكتابة');
    await ready('bad-read');await page.locator('textarea').fill('اختبار عدم تطابق إعادة القراءة');await save();await done();assert.doesNotMatch(await page.getByRole('status').innerText(),/تمت أرشفة/);assert.equal(await page.locator('form button').isDisabled(),true);assert.equal(await count(),1);pass('إعادة قراءة غير مطابقة لا تعلن النجاح');
    await ready('pause');await page.locator('textarea').fill('اختبار الطلب الجاري');await save();await page.waitForFunction(()=>typeof window.TEST.finish==='function');assert.equal(await page.locator('textarea').evaluate(e=>!!e.closest('[inert]')),true);await page.locator('.aq267-close').click();assert.equal(await page.locator('dialog').count(),1);assert.equal(await count(),1);await page.evaluate(()=>window.TEST.finish());await done();assert.match(await page.getByRole('status').innerText(),/تمت أرشفة/);pass('الطلب الجاري يقفل المدخلات ويمنع الإغلاق والتكرار');
    await ready('pause');await page.locator('textarea').fill('اختبار فقدان الجلسة');await save();await page.waitForFunction(()=>typeof window.TEST.finish==='function');await page.evaluate(()=>{window.AQARI_DATA_GATE.scope.userId='other';window.dispatchEvent(new Event('aqari:auth-boundary'));window.TEST.finish();});await page.waitForFunction(()=>!document.querySelector('dialog'));assert.equal(await page.locator('dialog').count(),0);pass('فقدان الجلسة يغلق الواجهة قبل وصول النتيجة المتأخرة');
    assert.deepEqual(errors,[]);pass('لا أخطاء متصفح أو تحميل وحدات');
   }catch(e){await page.screenshot({path:path.join(out,`${engine}-${device}-failure.png`),fullPage:true}).catch(()=>{});console.error({engine,device,errors,message:e.message});throw e;}finally{await ctx.close();}
  }
  await browser.close();browser=null;
 }
 assert.equal(results.length,54);
 const files=['src/v267/pages/property-lifecycle.js','src/v267/components/dialog.js','src/v267/api/session.js'];
 const report={date:new Date().toISOString(),sha:process.env.AQARI_EXPECTED_SHA||'local-working-tree',scope:'Local browser execution with synthetic RPC only. No live account, hosted writes, or physical devices.',passed:results.length,results,hashes:Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]))};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 fs.writeFileSync(path.join(out,'AQARI-Property-Archive-Browser-Check-2026-10-10.html'),`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>عقاري — فحص واجهة أرشفة العقار</title><style>body{margin:24px auto;max-width:1000px;padding:16px;font-family:Arial;line-height:1.7;background:#faf7f0;color:#30291e}article{padding:18px;border:1px solid #ba9b65;border-radius:12px;margin:16px 0;background:white}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;direction:ltr;text-align:left}</style><h1>فحص واجهة أرشفة العقار وإعادة تفعيله</h1><p>10 أكتوبر 2026 — نسخة ${report.sha.slice(0,8)}</p><article><strong>نجح ${results.length} فحصًا</strong><p>متصفحا Chromium وWebKit، بمقاسات 1440×1000 و390×844 و820×1180. هذه محاكاة لمقاسات الكمبيوتر والهاتف واللوحي على المتصفح؛ ليست اختبارًا على iPhone أو iPad فعلي.</p><p>شُغلت واجهة المنصة الفعلية مع جلسة وخادم بيانات اصطناعيين على الجهاز المحلي، ومُنعت الاتصالات الخارجية. لم يتغير عقار أو مستند أو حساب حقيقي. لا تثبت هذه النتيجة تنفيذ الأرشفة من حساب المالك على الخادم، ولا تمثل نشرًا أو تسليمًا نهائيًا.</p></article><table><tr><th>المتصفح</th><th>المقاس</th><th>الفحص الناجح</th></tr>${results.map(r=>`<tr><td>${r.engine}</td><td>${r.device}</td><td>${esc(r.name)}</td></tr>`).join('')}</table>${screens.map(s=>`<article><h2>${s.engine} — ${s.device}</h2><img alt="تأكيد إعادة تفعيل العقار التجريبي" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"></article>`).join('')}<details><summary>الدليل التقني وبصمات الملفات</summary><pre>${esc(JSON.stringify(report,null,2))}</pre></details><details><summary>برنامج الفحص القابل لإعادة التشغيل</summary><pre>${esc(fs.readFileSync(import.meta.filename,'utf8'))}</pre></details></html>`);
 console.log(`TOTAL ${results.length} passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
