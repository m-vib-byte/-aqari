// Isolated UI integration. Synthetic API fixtures; SQL authorization is tested
// separately by staging-database/local-test/run-pdf-editor-drafts.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),propertyId='22222222-2222-4222-8222-222222222222',wid='11111111-1111-4111-8111-111111111111',uid='44444444-4444-4444-8444-444444444444';
const original='33333333-3333-4333-8333-333333333333';
const baseMapping={version:1,title:'نموذج اختبار معزول',propertyId,fields:[{id:'name',label:'اسم المستأجر',type:'text',page:1,x:.2,y:.2,width:.55,height:.04,fontSize:10,align:'right',color:'#000000'}]};
let drafts=new Map(),writes=[],loseReply=false,deny=false,templateSaves=0,propertiesEmpty=false;
const mappings=new Map([[original,baseMapping]]);
function png(){const chunk=(name,body)=>{const bytes=Buffer.concat([Buffer.from(name),body]);let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}const size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(body.length);end.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,bytes,end]);};const header=Buffer.alloc(13);header.writeUInt32BE(595);header.writeUInt32BE(842,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc((595*3+1)*842,250);for(let y=0;y<842;y++)pixels[y*(595*3+1)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
const pageImage=png();
const reply=(res,data,status=200,type='application/json')=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data);};
const html=`<!doctype html><html class="aqari-auth-unlocked" lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="aq-v267"><button id="open" disabled>فتح المحرر التجريبي</button><script type="module">
const uid=${JSON.stringify(uid)},wid=${JSON.stringify(wid)};
window.AQARI_PUBLIC_CONFIG={supabaseUrl:'https://ofgmcsmxmdswlovsckqs.supabase.co'};
window.AQARI_DATA_GATE={scope:{userId:uid,workspaceId:wid}};
const auth={user:{id:uid},access_token:'synthetic-token'};
const client={auth:{getSession:async()=>({data:{session:auth}})},rpc:(name,args)=>({abortSignal:signal=>fetch('/fixture/rpc',{method:'POST',body:JSON.stringify({name,args}),signal}).then(async r=>r.ok?{data:await r.json(),status:r.status}:{error:await r.json(),status:r.status})})};
window.AQARI_SUPABASE={context:{user:{id:uid},workspace:{id:wid},membership:{user_id:uid,workspace_id:wid,role:'general_manager',is_active:true}},getClient:async()=>client};
const {openPdfFieldTemplate}=await import('/src/v267/pages/pdf-field-template.js');document.querySelector('#open').onclick=()=>openPdfFieldTemplate({propertyId:new URLSearchParams(location.search).has('unselected')?null:${JSON.stringify(propertyId)}});document.querySelector('#open').disabled=false;
</script></body></html>`;
const overrides={
 '/src/v267/components/template-property-logo.js':`export const createTemplateLogoContext=()=>({listProperties:async()=>fetch('/fixture/properties').then(r=>r.json())});`,
 '/src/v267/components/property-contract-archive.js':`export const listPropertyContractArchive=async()=>({items:[{id:${JSON.stringify(original)},title:'نموذج تجريبي',metadata:{pdf_field_template:true}}],nextOffset:100,hasMore:false});`,
 '/src/v267/components/original-document-upload.js':`export const originalDocument=async f=>f;export const createOriginalDocumentUpload=()=>async()=>({id:'template-version'});`,
};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');let text='';if(req.method==='POST')for await(const part of req)text+=part;const body=text?JSON.parse(text):{};
 if(url.pathname==='/fixture/properties')return reply(res,propertiesEmpty?[]:[{id:propertyId,externalRef:'synthetic',name:'عقار تجريبي'}]);
 if(url.pathname==='/fixture/rpc'){
  assert.equal(body.name,'aqari_pdf_editor_drafts');assert.equal(body.args.p_workspace_id,wid);const {p_action:action,p_data:data}=body.args;assert.equal(data.property_id,propertyId);
  if(deny)return reply(res,{message:'ACCESS_DENIED',code:'42501'},403);
  if(action==='list')return reply(res,{items:[...drafts.values()].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id)).map(d=>({id:d.id,document_id:d.document_id,revision:d.revision,title:d.snapshot.mapping.title,updated_at:d.updated_at})),next_offset:20,has_more:false});
  if(action==='get')return reply(res,drafts.get(data.id));
  if(action==='save'){
   writes.push(structuredClone(data));const old=drafts.get(data.id);
   if(old?.last_request===data.request_id)return reply(res,old);
   if((old?.revision||0)!==data.expected_revision)return reply(res,{message:'PDF_DRAFT_REVISION_CONFLICT',code:'40001'},409);
   const saved={...data,revision:data.expected_revision+1,last_request:data.request_id,created_by:uid,workspace_id:wid,updated_at:new Date().toISOString()};drafts.set(data.id,saved);
   if(loseReply){loseReply=false;return reply(res,{message:'simulated lost response after commit'},503);}return reply(res,saved);
  }throw Error('Unexpected action');
 }
 if(url.pathname==='/api/pdf-field-template'){
  assert.equal(body.workspaceId,wid);assert.equal(body.propertyId,propertyId);
  if(body.action==='inspect')return reply(res,{pages:[{width:595,height:842},{width:595,height:842}],mapping:mappings.get(body.documentId)});
  if(['page','filled_page'].includes(body.action))return reply(res,pageImage,200,'image/png');
  if(body.action==='save'){templateSaves++;mappings.set('template-version',body.mapping);return reply(res,Buffer.from('%PDF-1.7\nsynthetic-template'),200,'application/pdf');}
  if(body.action==='fill')return reply(res,Buffer.from('%PDF-1.7\nsynthetic-filled'),200,'application/pdf');
  throw Error('Unexpected PDF action');
 }
 if(url.pathname==='/')return reply(res,html,200,'text/html; charset=utf-8');
 if(overrides[url.pathname])return reply(res,overrides[url.pathname],200,'text/javascript');
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return reply(res,{},404);
 reply(res,fs.readFileSync(file),200,file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');
 }catch(error){console.error(error);reply(res,{message:'TEST_FIXTURE_FAILURE'},500);}});
await new Promise(resolve=>server.listen(Number(process.env.PORT||0),'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port;
if(process.argv.includes('--serve'))console.log(url);
else{
 const {chromium,webkit}=await import(process.env.AQARI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.AQARI_PLAYWRIGHT_MODULE):'playwright');
 try{for(const [name,engine,viewport] of [['chromium',chromium,{width:1440,height:1000}],['webkit',webkit,{width:393,height:852}]]){
  drafts.clear();writes=[];deny=false;templateSaves=0;
  const browser=await engine.launch(),context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const button=(p,label)=>p.getByRole('button',{name:label,exact:true});
  const open=async p=>{await p.goto(url);await button(p,'فتح المحرر التجريبي').click();await button(p,'فتح النموذج وتعبئته').waitFor();};
  const loaded=async p=>p.waitForFunction(()=>document.querySelector('.aq267-pdf-map-page>img')?.naturalWidth>0);
  const saved=async p=>p.waitForFunction(()=>document.querySelector('.aq267-pdf-draft-status')?.textContent.startsWith('حُفظت المسودة'));
  try{
   // File-first entry must survive a property change; no re-upload selection.
   await page.goto(url+'?unselected=1');await button(page,'فتح المحرر التجريبي').click();
   const uploadButton=button(page,'رفع النموذج وتحديد الحقول');await uploadButton.waitFor();assert.equal(await uploadButton.isDisabled(),true);
   await page.locator('input[type=file]').setInputFiles({name:'contract.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsynthetic-upload')});
   await page.getByLabel('العقار',{exact:true}).selectOption(propertyId);await button(page,'فتح النموذج وتعبئته').waitFor();
   assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files[0]?.name),'contract.pdf');assert.equal(await uploadButton.isDisabled(),false);
   await page.getByLabel('العقار',{exact:true}).selectOption('');await page.waitForFunction(()=>!document.querySelector('.aq267-dialog-body').inert);
   assert.equal(await uploadButton.isDisabled(),true);assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files[0]?.name),'contract.pdf');
   await page.getByLabel('العقار',{exact:true}).selectOption(propertyId);await button(page,'فتح النموذج وتعبئته').waitFor();await uploadButton.click();await loaded(page);
   await button(page,'العودة للمنصة').click();
   // Empty authorized property results are recoverable, not a silent dead end.
   propertiesEmpty=true;await page.goto(url+'?unselected=1');await button(page,'فتح المحرر التجريبي').click();await button(page,'إعادة تحميل العقارات').waitFor();
   assert.equal(await uploadButton.isDisabled(),true);assert.match(await page.locator('.aq267-pdf-upload-status').innerText(),/لا توجد عقارات/);
   propertiesEmpty=false;await button(page,'إعادة تحميل العقارات').click();await page.waitForFunction(()=>document.querySelectorAll('.aq267-dialog-body select option').length===2);
   await page.getByLabel('العقار',{exact:true}).selectOption(propertyId);await button(page,'فتح النموذج وتعبئته').waitFor();
   assert.equal(await uploadButton.isDisabled(),true);assert.match(await page.locator('.aq267-pdf-upload-status').innerText(),/اختر ملف/);
   console.log('PASS '+name+': file-first selection retained across property changes, upload opens, empty properties recover, required inputs gate upload');
   await open(page);await button(page,'فتح النموذج وتعبئته').click();await loaded(page);
   await page.getByLabel('بيانات الحقل',{exact:true}).fill('اسم تجريبي طويل');await saved(page);assert.equal(drafts.size,1);assert.equal(writes.at(-1).snapshot.values.name,'اسم تجريبي طويل');
   assert.equal(await page.locator('.aq267-dialog-body').evaluate(el=>el.inert),false);
   const draftId=[...drafts.keys()][0];
   await page.reload();await button(page,'فتح المحرر التجريبي').click();await button(page,'استعادة المسودة').click();await loaded(page);assert.equal(await page.getByLabel('بيانات الحقل',{exact:true}).inputValue(),'اسم تجريبي طويل');
   assert.equal(await page.getByLabel('اسم النموذج',{exact:true}).inputValue(),baseMapping.title);
   // A no-op restored mapping must not generate another immutable PDF version.
   await button(page,'حفظ ومعاينة العقد').click();await page.locator('.aq267-pdf-preview-image').waitFor();assert.equal(templateSaves,0);await button(page,'العودة لتعديل البيانات').click();
   // Same working copy in a second tab must preserve its local text on conflict.
   const second=await context.newPage();await open(second);await button(second,'استعادة المسودة').click();await loaded(second);
   await page.getByLabel('بيانات الحقل',{exact:true}).fill('التعديل الأحدث');await saved(page);
   await second.getByLabel('بيانات الحقل',{exact:true}).fill('تعديل التبويب الآخر');await button(second,'حفظ كمسودة مستقلة').waitFor();assert.equal(drafts.get(draftId).snapshot.values.name,'التعديل الأحدث');
   await button(second,'حفظ كمسودة مستقلة').click();await saved(second);assert.equal(drafts.size,2);await second.close();
   // Lost reply: input remains enabled, retry must reuse the same payload/key.
   loseReply=true;await page.getByLabel('بيانات الحقل',{exact:true}).fill('تعديل مع انقطاع الاتصال');await page.waitForFunction(()=>document.querySelector('.aq267-pdf-draft-status')?.textContent.startsWith('لم يتأكد'));
   const uncertain=writes.at(-1);await page.getByLabel('بيانات الحقل',{exact:true}).fill('تعديل لاحق للانقطاع');await button(page,'حفظ المسودة الآن').click();await saved(page);assert.deepEqual(writes.at(-2),uncertain);assert.equal(drafts.get(draftId).snapshot.values.name,'تعديل لاحق للانقطاع');
   // Close flushes a pending edit; restore after navigating away keeps it.
   await page.getByLabel('بيانات الحقل',{exact:true}).fill('آخر كتابة قبل الإغلاق');await button(page,'العودة للمنصة').click();await button(page,'فتح المحرر التجريبي').click();await button(page,'استعادة المسودة').first().click();await loaded(page);assert.equal(await page.getByLabel('بيانات الحقل',{exact:true}).inputValue(),'آخر كتابة قبل الإغلاق');
   assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>/draft|pdf/i.test(k))),false);
   // Server-side revocation clears the private editor immediately.
   deny=true;await page.getByLabel('بيانات الحقل',{exact:true}).fill('صلاحية مسحوبة');await page.locator('#aq267-pdf-field-workspace').waitFor({state:'detached'});
   // Mobile filling follows visual page order and retains text across page loads.
   deny=false;const navigationMapping=structuredClone(baseMapping);
   navigationMapping.fields.push({...baseMapping.fields[0],id:'last',label:'الحقل الأخير',page:2,y:.4},{...baseMapping.fields[0],id:'middle',label:'الحقل الأوسط',page:1,y:.4,width:.3});
   mappings.set(original,navigationMapping);await open(page);await button(page,'فتح النموذج وتعبئته').click();await loaded(page);
   const entry=page.getByLabel('بيانات الحقل',{exact:true});
   assert.equal(await button(page,'الحقل السابق').isDisabled(),true);
   assert.equal(await entry.getAttribute('enterkeyhint'),'next');
   await entry.fill('قيمة الصفحة الأولى');await entry.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.aq267-pdf-field-navigation p')?.textContent.includes('2 / 3'));
   assert.equal(await page.getByLabel('اسم الحقل',{exact:true}).inputValue(),'الحقل الأوسط');
   await button(page,'الحقل التالي').click();await loaded(page);
   assert.equal(await page.getByLabel('الصفحة',{exact:true}).inputValue(),'2');
   assert.equal(await button(page,'الحقل التالي').isDisabled(),true);assert.equal(await entry.getAttribute('enterkeyhint'),'done');
   await entry.fill('قيمة الصفحة الثانية');await button(page,'الحقل السابق').click();await loaded(page);
   assert.equal(await page.getByLabel('الصفحة',{exact:true}).inputValue(),'1');
   await button(page,'الحقل السابق').click();assert.equal(await entry.inputValue(),'قيمة الصفحة الأولى');
   await button(page,'أول حقل غير معبأ').click();assert.equal(await page.getByLabel('اسم الحقل',{exact:true}).inputValue(),'الحقل الأوسط');
   await entry.fill('اكتملت الحقول');assert.equal(await button(page,'أول حقل غير معبأ').isDisabled(),true);await saved(page);
   assert.deepEqual(writes.at(-1).snapshot.values,{name:'قيمة الصفحة الأولى',last:'قيمة الصفحة الثانية',middle:'اكتملت الحقول'});
   await button(page,'حفظ ومعاينة العقد').click();await page.locator('.aq267-pdf-preview-image').waitFor();
   await button(page,'العودة لتعديل البيانات').click();
   await page.getByLabel('تكرار البيانات من حقل',{exact:true}).selectOption('name');
   await page.getByText('القيم مختلفة. وحّد القيم أو أفرغ أحد الحقلين قبل الربط.',{exact:true}).waitFor();
   await entry.fill('');await page.getByLabel('تكرار البيانات من حقل',{exact:true}).selectOption('name');
   assert.equal(await entry.inputValue(),'قيمة الصفحة الأولى');
   await entry.fill('قيمة مرتبطة');await saved(page);
   assert.equal(writes.at(-1).snapshot.values.name,'قيمة مرتبطة');assert.equal(writes.at(-1).snapshot.values.middle,'قيمة مرتبطة');
   await page.getByLabel('تكرار البيانات من حقل',{exact:true}).selectOption('');await entry.fill('قيمة مستقلة');await saved(page);
   assert.equal(writes.at(-1).snapshot.values.name,'قيمة مرتبطة');assert.equal(writes.at(-1).snapshot.values.middle,'قيمة مستقلة');
   console.log('PASS '+name+': explicit field links, conflict refusal, synchronized value, unlink preserves peers');
   await page.getByText('نسخ الحقل ومحاذاته',{exact:true}).click();await button(page,'نسخ هذا الحقل').click();
   assert.equal(await entry.inputValue(),'');await entry.fill('بيانات النسخة');await saved(page);
   const copiedId=writes.at(-1).snapshot.selected;
   assert.equal(writes.at(-1).snapshot.mapping.fields.length,4);
   assert.equal(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId).dataKey,undefined);
   await page.getByText('نسخ الحقل ومحاذاته',{exact:true}).click();
   await page.getByLabel('الحقل المرجعي للمحاذاة',{exact:true}).selectOption('name');
   await page.getByLabel('عملية المحاذاة',{exact:true}).selectOption('top');await button(page,'تطبيق المحاذاة أو الحجم').click();
   await page.getByText('هذا التغيير يتداخل مع حقل آخر أو يتجاوز الصفحة. حرّك الحقل ثم أعد المحاولة.',{exact:true}).waitFor();
   await page.getByLabel('عملية المحاذاة',{exact:true}).selectOption('size');await button(page,'تطبيق المحاذاة أو الحجم').click();await saved(page);
   assert.equal(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId).width,.55);
   await button(page,'تراجع').click();await saved(page);assert.equal(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId).width,.3);
   await button(page,'إعادة').click();await saved(page);assert.equal(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId).width,.55);
   assert.equal(writes.at(-1).snapshot.values[copiedId],'بيانات النسخة');
   console.log('PASS '+name+': duplicate independent blank field, collision refusal, match size, undo/redo and saved values');
   const lock=page.getByLabel('تثبيت موضع الحقل وحجمه',{exact:true});await lock.check();await saved(page);
   const lockedGeometry=structuredClone(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId));
   assert.equal(lockedGeometry.locked,true);
   await page.getByText('نسخ الحقل ومحاذاته',{exact:true}).click();assert.equal(await button(page,'تطبيق المحاذاة أو الحجم').isDisabled(),true);
   await page.getByText('إعدادات دقيقة (اختياري)',{exact:true}).click();assert.equal(await page.getByLabel('المسافة من يسار الصفحة ٪',{exact:true}).isDisabled(),true);
   const selectedBox=page.locator('.aq267-pdf-map-field.is-selected');await selectedBox.scrollIntoViewIfNeeded();await selectedBox.press('ArrowRight');await selectedBox.press('Alt+ArrowDown');
   const bounds=await selectedBox.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+25,bounds.y+bounds.height/2+15);await page.mouse.up();
   await entry.fill('قيمة داخل حقل ثابت');await page.getByLabel('حجم الخط',{exact:true}).fill('20');await page.getByLabel('حجم الخط',{exact:true}).press('Tab');await saved(page);
   const afterLocked=writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId);
   for(const k of ['x','y','width','height'])assert.equal(afterLocked[k],lockedGeometry[k]);
   assert.equal(afterLocked.fontSize,20);assert.equal(writes.at(-1).snapshot.values[copiedId],'قيمة داخل حقل ثابت');
   await page.reload();await button(page,'فتح المحرر التجريبي').click();await button(page,'استعادة المسودة').first().click();await loaded(page);
   assert.equal(await lock.isChecked(),true);assert.equal(await entry.inputValue(),'قيمة داخل حقل ثابت');
   await lock.uncheck();await saved(page);await button(page,'تراجع').click();await saved(page);assert.equal(await lock.isChecked(),true);
   await button(page,'إعادة').click();await saved(page);assert.equal(await lock.isChecked(),false);
   await page.locator('.aq267-pdf-map-field.is-selected').press('ArrowRight');await saved(page);
   assert.ok(writes.at(-1).snapshot.mapping.fields.find(f=>f.id===copiedId).x>lockedGeometry.x);
   console.log('PASS '+name+': position lock blocks pointer, keyboard, numeric and alignment changes; editable value/font; reload restore; undo/redo unlock');
   mappings.set(original,baseMapping);
   console.log('PASS '+name+': previous/next, Enter, page order, required-field jump, retained values and filled preview');
   assert.deepEqual(errors,[]);console.log('PASS '+name+': autosave, reload, preview, two-tab CAS/fork, lost response, close flush, no local PII, revoked access');
  }catch(error){console.error('PDF_DRAFT_UI_FAILURE',name,JSON.stringify({errors,body:await page.locator('body').innerText()}));throw error;}finally{await browser.close();}
 }}finally{server.close();}
}
