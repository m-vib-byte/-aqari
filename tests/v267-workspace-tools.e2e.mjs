import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const root=process.cwd(),out=path.join(root,'test-results/v267-workspace-tools');
fs.mkdirSync(out,{recursive:true});
const wid='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
const sections=['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports'];
let settings={sections:{},permissions:{},labels:{}},revision=0,audit=[],docs=[],storageBytes=null,calls=[],failingWrite=false;
const reply=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const harness='<!doctype html><html class="aqari-auth-unlocked" lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body><h1>اختبار مكونات V267 — بيانات اصطناعية</h1><button data-v199-go="home"><span>ملخص</span><span id="fixtureKpi">42</span></button><div id="v199MoreMenu"><button data-v199-action="more" aria-label="إغلاق المزيد">إغلاق ×</button></div><script type="module">'+
 'const uid='+JSON.stringify(uid)+',wid='+JSON.stringify(wid)+';'+
 'window.AQARI_PUBLIC_CONFIG={supabaseUrl:"https://djkpkkgoibruaezdrchb.supabase.co",supabasePublishableKey:"sb_publishable_synthetic"};'+
 'window.AQARI_DATA_GATE={scope:{userId:uid,workspaceId:wid}};'+
 'function query(name,args={}){const x={args};for(const k of ["select","eq","order","range","single","maybeSingle"])x[k]=(...a)=>{if(k==="eq")args[a[0]]=a[1];return x;};x.abortSignal=signal=>fetch("/fixture/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args),signal}).then(async r=>r.ok?{data:await r.json()}:{error:await r.json()});return x;}'+
 'window.AQARI_SUPABASE={context:{user:{id:uid},workspace:{id:wid},membership:{user_id:uid,workspace_id:wid,role:"general_manager",is_active:true}},getClient:async()=>({rpc:query,from:name=>query(name,{})}),getSession:async()=>({user:{id:uid},access_token:"synthetic-not-a-real-token"})};'+
 'const {install}=await import("/src/v267/workspace.js");install();</script></body></html>';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/fixture/')){let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const name=url.pathname.slice(9),args=JSON.parse(body||'{}');calls.push(name);
  if(name==='aqari_workspace_access')return reply(res,{user_id:uid,workspace_id:wid,role:'general_manager',sections:settings.sections,labels:settings.labels,permissions:Object.fromEntries(sections.map(s=>[s,{read:true,write:settings.sections[s]!==false}]))});
  if(name==='aqari_control_center')return reply(res,{control:{workspace_id:wid,settings,revision},members:[{user_id:uid,role:'general_manager',is_active:true,display_name:'مدير اختبار'}]});
  if(name==='aqari_control_audit')return reply(res,audit);
  if(name==='aqari_save_controls'){
   if(failingWrite)return reply(res,{message:'ACCESS_DENIED'},403);
   if(args.p_expected_revision!==revision)return reply(res,{message:'REVISION_CONFLICT'},409);
   audit.push({id:'audit',actor_id:uid,reason:args.p_reason,before_value:settings,after_value:args.p_settings,created_at:new Date().toISOString()});settings=args.p_settings;return reply(res,++revision);
  }
  if(name==='aqari_document_entities')return reply(res,[{entity_ref:'p1',title:'عقار اختبار مستقل'}]);
  if(name==='aqari_document_listing')return reply(res,docs.map(d=>({...d,author_name:'مدير اختبار'})));
  if(name==='aqari_reserve_document'){
   const d={id:'33333333-3333-4333-8333-333333333333',document_no:'DOC-TEST',title:args.p_title,entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,status:'draft',created_by:uid,created_at:new Date().toISOString(),storage_path:wid+'/33333333-3333-4333-8333-333333333333.jpg',mime_type:'image/jpeg'};
   docs.push(d);return reply(res,[{document_id:d.id,document_no:d.document_no,storage_bucket:'aqari-documents',storage_path:d.storage_path}]);
  }
  if(name==='aqari_finalize_document'){const d=docs.find(d=>d.id===args.p_document_id);assert.ok(storageBytes?.length);d.status='uploaded';d.checksum_sha256=args.p_checksum;d.size_bytes=args.p_size_bytes;return reply(res,d.id);}
  if(name==='aqari_documents')return reply(res,docs.find(d=>d.id===args.id));
  return reply(res,{message:'UNKNOWN_TEST_RPC'},400);
 });return;}
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(harness);return;}
 const file=path.resolve(root,url.pathname.slice(1));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));
const results=[];let failed=false;
try{
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch();
  try{for(const [device,viewport]of [['iphone',{width:390,height:844}],['ipad',{width:820,height:1180}],['desktop',{width:1440,height:1000}]]){
   settings={sections:{},permissions:{},labels:{}};revision=0;audit=[];docs=[];storageBytes=null;calls=[];failingWrite=false;
   const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   // The isolated component harness never sends credentials or requests to a real service.
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin==='http://127.0.0.1:4175')return route.continue();
    if(url.origin==='https://djkpkkgoibruaezdrchb.supabase.co'&&url.pathname.startsWith('/storage/v1/object/')){
     const headers={'access-control-allow-origin':'http://127.0.0.1:4175','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'apikey,authorization,content-type,x-upsert'};
     if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
     assert.equal(request.headers().authorization,'Bearer synthetic-not-a-real-token');
     if(request.method()==='POST'){assert.equal(request.headers()['x-upsert'],'false');assert.equal(storageBytes,null);storageBytes=request.postDataBuffer();return route.fulfill({status:200,headers,contentType:'application/json',body:'{}'});}
     assert.ok(storageBytes);return route.fulfill({status:200,headers,contentType:'image/jpeg',body:storageBytes});
    }
    return route.abort();
   });
   const name=engineName+'-'+device;const start=Date.now();
   try{
    await page.goto('http://127.0.0.1:4175/');
    await page.getByRole('button',{name:'مركز تحكم المدير',exact:true}).click();
    await page.getByText('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',{exact:true}).waitFor();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('checkbox',{name:'الصيانة',exact:true}).uncheck();
    await dialog.getByLabel('سبب التعديل',{exact:true}).fill('اختبار حفظ آلي مستقل');
    await dialog.getByRole('button',{name:'حفظ الإعدادات والتحقق',exact:true}).click();
    await page.getByText('تم الحفظ وإعادة القراءة وتسجيل التعديل.',{exact:true}).waitFor();
    assert.equal(revision,1);assert.equal(settings.sections.maintenance,false);assert.equal(audit.length,1);
    assert.equal(await page.locator('#fixtureKpi').textContent(),'42','label changes preserve financial numbers');
    assert.equal(await page.getByRole('button',{name:'إغلاق المزيد',exact:true}).count(),1,'close action stays distinct from navigation');
    await dialog.getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.reload();await page.getByRole('button',{name:'مركز تحكم المدير',exact:true}).click();
    await page.getByText('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('checkbox',{name:'الصيانة',exact:true}).isChecked(),false);
    failingWrite=true;await page.getByLabel('سبب التعديل',{exact:true}).fill('حفظ مرفوض');
    await page.getByRole('button',{name:'حفظ الإعدادات والتحقق',exact:true}).click();
    await page.getByText('لا تملك صلاحية هذه العملية.',{exact:true}).waitFor();assert.equal(revision,1);failingWrite=false;
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.getByRole('button',{name:'مسح مستند',exact:true}).click();
    await page.getByText('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',{exact:true}).waitFor();
    await page.getByLabel('السجل المرتبط',{exact:true}).selectOption('p1');
    await page.getByText('تم تحديث مستندات السجل المحدد.',{exact:true}).waitFor();
    await page.getByLabel('عنوان المستند',{exact:true}).fill('وثيقة اختبار للمسح');
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,900);ctx.fillStyle='black';ctx.font='40px sans-serif';ctx.fillText('AQARI scan fixture',40,80);return canvas.toDataURL('image/png').split(',')[1];});
    await page.getByLabel('تصوير المستند أو اختيار صورة',{exact:true}).setInputFiles({name:'scan.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByText('راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'تدوير الصورة',exact:true}).click();
    await page.getByRole('button',{name:'رفع نسخة جديدة والتحقق منها',exact:true}).click();
    await page.getByText('تم حفظ النسخة وإعادة قراءة الملف ومطابقة بصمته وتأكيد ارتباطه بالسجل.',{exact:true}).waitFor();
    assert.equal(docs.length,1);assert.equal(docs[0].status,'uploaded');assert.equal(docs[0].entity_ref,'p1');assert.equal(docs[0].size_bytes,storageBytes.length);
    assert.ok(storageBytes[0]===255&&storageBytes[1]===216,'reencoded JPEG');
    assert.equal(await page.getByText('رفع بواسطة: مدير اختبار',{exact:true}).count(),1);
    const layout=await page.getByRole('dialog').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)}));
    assert.ok(layout.scroll<=layout.client+1);assert.ok(layout.width<=viewport.width);assert.ok(layout.buttons);
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.reload();await page.getByRole('button',{name:'مسح مستند',exact:true}).click();
    await page.getByText('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',{exact:true}).waitFor();
    await page.getByLabel('السجل المرتبط',{exact:true}).selectOption('p1');await page.getByText('تم تحديث مستندات السجل المحدد.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'وثيقة اختبار للمسح'}).count(),1);
    await page.evaluate(()=>{window.AQARI_DATA_GATE.scope=null;window.dispatchEvent(new CustomEvent('aqari:auth-boundary'));});
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.deepEqual(errors,[]);
    results.push({name,passed:true,ms:Date.now()-start,layout,controlRevision:revision,documents:docs.length,scope:'synthetic component backend; no real account or physical device'});console.log('PASS',name);
   }catch(e){failed=true;results.push({name,passed:false,error:e.stack,calls,errors});console.error('FAIL',name,e.stack);await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true}).catch(()=>{});}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
if(failed)process.exit(1);
