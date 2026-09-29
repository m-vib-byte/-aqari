import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {t as translate,message as formatMessage} from '../src/v267/components/locale.js';
import {label as navLabel} from '../src/v267/components/catalog.js';
const root=process.cwd(),out=path.join(root,'test-results/v267-workspace-tools');
fs.mkdirSync(out,{recursive:true});
const wid='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
const sections=['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports'];
let maintenanceReadUnavailable=false,maintenanceReadbackDenied=false,maintenanceLocationDenied=false,maintenanceLocationUnavailable=false,storageFailBefore=false,storageLoseReply=false,storageReadDenied=false,storageReadUnavailable=false,storageAttempts=0;
let settings={sections:{},permissions:{},labels:{}},revision=0,audit=[],docs=[],storageBytes=null,storageUploads=0,calls=[],failingWrite=false,entries=[],entryWrites=0,reviewWrites=0,statementReadDenied=false,maintenanceRows=[],maintenanceWrites=0,maintenanceWriteDenied=false,maintenanceWriteUnavailable=false,maintenanceReadDenied=false,prepareCalls=0;
let maintenanceAttachmentCalls=[],maintenanceAttachmentReads=0,maintenanceAttachmentWrites=0;
const maintenanceAttachmentBytes=Buffer.from([255,216,255,224,1,2,3,4,5,6,7,8]);
const maintenanceAttachment={id:'44444444-4444-4444-8444-444444444444',workspace_id:wid,request_id:'request2',created_by:uid,filename:'closed-request-original.jpg',mime_type:'image/jpeg',size_bytes:maintenanceAttachmentBytes.length,checksum_sha256:createHash('sha256').update(maintenanceAttachmentBytes).digest('hex'),status:'uploaded',storage_bucket:'aqari-maintenance-private',storage_path:wid+'/request2/44444444-4444-4444-8444-444444444444'};
const propertyName='ملاحظات <عقار> {unit}',tenantName='مستأجر <سجل> {rent}';
const statement={workspace_id:wid,property_id:'p1',period:'2026-08-01',source_sha256:'synthetic-source',content:{property_name:propertyName,period:'2026-08',summary:{printed_totals:{rent_kd:'125.750',advance_kd:'0.000',cleaning_kd:'5.000'}},rows:[{unit:'101',name_en_raw:tenantName,current_rent_kd:'125.750',contract_no_raw:'C-101',contract_start_raw:'2026-08-01',contract_end_raw:'2027-07-31',contract_rent_kd:'125.750',advance_kd:'0.000',insurance_kd:null,payment_method_raw:'كي نت من المصدر',payment_date_raw:'2026-08-03',payment_operation_raw:'OP-TEST',receipt_no_raw:'R-TEST',accountant_raw:'محاسب المصدر',phone_raw:'00000000',civil_id_raw:'synthetic-civil-id',pending:[]}]}};
const secondStatement=structuredClone(statement);secondStatement.property_id='p2';secondStatement.content.property_name='عقار آخر';secondStatement.content.rows[0].insurance_kd='100.000';delete secondStatement.content.rows[0].pending;
const lease={id:'lease1',external_ref:'source1',contract_no:'C-101',start_date:'2026-08-01',end_date:'2027-07-31',monthly_rent:'125.750',deposit:null,status:'draft',snapshot:{property:propertyName,unit:'101',tenant:tenantName,pending:[]}};
const reply=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const harness='<!doctype html><html class="aqari-auth-unlocked" lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="aq-v267"><h1>اختبار مكونات V267 — بيانات اصطناعية</h1><button data-v199-go="home"><span>ملخص</span><span id="fixtureKpi">42</span></button><button id="fixtureMaintenance">Open maintenance fixture</button><div id="home"><section id="v205SimpleHome"></section></div><section id="collectionProPage"></section><section id="financeSuitePage"></section><section id="reports"></section><section id="documentsHub"></section><div id="v199MoreMenu"><button data-v199-action="more" aria-label="إغلاق المزيد">إغلاق ×</button></div><script type="module">'+
 'const uid='+JSON.stringify(uid)+',wid='+JSON.stringify(wid)+';'+
 'window.AQARI_PUBLIC_CONFIG={supabaseUrl:"https://ofgmcsmxmdswlovsckqs.supabase.co",supabasePublishableKey:"sb_publishable_synthetic"};'+
 'window.AQARI_DATA_GATE={scope:{userId:uid,workspaceId:wid}};'+
 'const nativeFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const url=new URL(input,location.origin);if(url.origin==="https://ofgmcsmxmdswlovsckqs.supabase.co"&&url.pathname.startsWith("/storage/v1/object/"))return nativeFetch("/storage-fixture"+url.pathname,options);return nativeFetch(input,options);};'+
 'function query(name,args={}){const x={args};for(const k of ["select","eq","neq","order","range","single","maybeSingle","limit","not","insert","update"])x[k]=(...a)=>{if(k==="select")args._select=a[0];if(k==="eq")args[a[0]]=a[1];if(k==="single")args._single=true;if(k==="maybeSingle")args._maybeSingle=true;if(k==="update")args._update=a[0];if(k==="range")args._range=a;if(k==="insert")args._insert=a[0];return x;};x.abortSignal=signal=>fetch("/fixture/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args),signal}).then(async r=>r.ok?{data:await r.json(),status:r.status}:{error:await r.json(),status:r.status});return x;}'+
 'window.AQARI_SUPABASE={context:{user:{id:uid},workspace:{id:wid},membership:{user_id:uid,workspace_id:wid,role:"general_manager",is_active:true}},getClient:async()=>({rpc:query,from:name=>query(name,{})}),getSession:async()=>({user:{id:uid},access_token:"synthetic-not-a-real-token"})};'+
 'const {install}=await import("/src/v267/workspace.js");install();await import("/src/v267/pages/automation-status.js");document.getElementById("fixtureMaintenance").onclick=async()=>{const {openDesk}=await import("/v267-service-desk.js");await openDesk();};</script></body></html>';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/storage-fixture/storage/v1/object/')){
  if(req.headers.authorization!=='Bearer synthetic-not-a-real-token')return reply(res,{error:'AUTH'},403);
  if(url.pathname.includes('/aqari-maintenance-private/')){
   if(url.pathname!=='/storage-fixture/storage/v1/object/'+(req.method==='GET'?'authenticated/':'')+'aqari-maintenance-private/'+maintenanceAttachment.storage_path)return reply(res,{error:'SCOPE'},403);
   if(req.method!=='GET'){maintenanceAttachmentWrites++;req.resume();return reply(res,{error:'CLOSED_REQUEST'},403);}
   maintenanceAttachmentReads++;res.writeHead(200,{'content-type':maintenanceAttachment.mime_type,'cache-control':'no-store'});res.end(maintenanceAttachmentBytes);return;
  }
  if(!url.pathname.includes('/aqari-documents/'+wid+'/'))return reply(res,{error:'SCOPE'},403);
  if(req.method==='POST'){
   storageAttempts++;if(storageFailBefore){storageFailBefore=false;req.resume();return reply(res,{error:'TEMPORARY_UNAVAILABLE'},503);}
   if(req.headers['x-upsert']!=='false'||storageBytes!==null)return reply(res,{error:'REPLACEMENT'},409);
   const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{storageBytes=Buffer.concat(chunks);storageUploads++;if(storageLoseReply){storageLoseReply=false;return reply(res,{error:'RESPONSE_LOST_AFTER_STORE'},503);}reply(res,{stored:storageBytes.length});});return;
  }
  if(req.method==='GET'&&storageReadDenied)return reply(res,{error:'DENIED'},403);
  if(req.method==='GET'&&storageReadUnavailable)return reply(res,{error:'TEMPORARY_UNAVAILABLE'},503);
  if(req.method==='GET'&&storageBytes){res.writeHead(200,{'content-type':docs[0]?.mime_type||'application/octet-stream','cache-control':'no-store'});res.end(storageBytes);return;}
  return reply(res,{error:'NOT_STORED'},404);
 }
 if(url.pathname.startsWith('/fixture/')){let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const name=url.pathname.slice(9),args=JSON.parse(body||'{}');calls.push(name);
  if(name==='aqari_workspace_access')return reply(res,{user_id:uid,workspace_id:wid,role:'general_manager',features:{lease_expiry_report:true},sections:settings.sections,labels:settings.labels,permissions:Object.fromEntries(sections.map(s=>[s,{read:true,write:settings.sections[s]!==false}]))});
  if(name==='aqari_lease_expiry_report'){
   assert.equal(args.p_workspace_id,wid);assert.ok([30,60,90].includes(args.p_days));
   return reply(res,{as_of:'2026-09-12',timezone:'Asia/Kuwait',status:args.p_status,days:args.p_days,property_id:args.p_property_id,search:args.p_search,offset:args.p_offset,page_size:50,total:1,properties:[{id:'p1',name:propertyName}],rows:[{id:'expiry1',contract_no:'EXP-401',start_date:'2026-01-01',end_date:'2026-09-12',monthly_rent:'125.750',property_name:propertyName,unit_no:'401',tenant_name:tenantName,days_remaining:args.p_status==='expired'?-2:0}]});
  }
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
   const d={id:'33333333-3333-4333-8333-333333333333',workspace_id:wid,document_no:'DOC-TEST',title:args.p_title,entity_type:args.p_entity_type,entity_ref:args.p_entity_ref,status:'draft',created_by:uid,created_at:new Date().toISOString(),storage_bucket:'aqari-documents',storage_path:wid+'/33333333-3333-4333-8333-333333333333.pdf',mime_type:args.p_mime_type,document_type:args.p_document_type,metadata:structuredClone(args.p_metadata)};
   docs.push(d);return reply(res,[{document_id:d.id,document_no:d.document_no,storage_bucket:'aqari-documents',storage_path:d.storage_path}]);
  }
  if(name==='aqari_finalize_document'){const d=docs.find(d=>d.id===args.p_document_id);assert.ok(storageBytes?.length);d.status='uploaded';d.checksum_sha256=args.p_checksum;d.size_bytes=args.p_size_bytes;return reply(res,d.id);}
  if(name==='aqari_documents')return reply(res,args._single?docs.find(d=>d.id===args.id):[{id:'signed1',document_no:'SIGN-TEST',title:'عقد أصلي <موقع>',status:'uploaded'}]);
  if(name==='aqari_maintenance_attachments'){
   assert.equal(args.p_workspace_id,wid,'maintenance attachments stay workspace scoped');
   assert.equal(args.p_request_id,'request2','closed-card attachment reads use its exact request');
   maintenanceAttachmentCalls.push(structuredClone(args));
   if(args.p_action!=='list'){maintenanceAttachmentWrites++;return reply(res,{message:'CLOSED_REQUEST'},403);}
   assert.deepEqual(args.p_data,{});return reply(res,{can_upload:false,attachments:[maintenanceAttachment]});
  }
  if(name==='aqari_maintenance_requests'){
   assert.equal(args.workspace_id,wid,'maintenance requests stay workspace scoped');
   assert.doesNotMatch(args._select,/aqari_leases|snapshot/,'maintenance never fetches private contract snapshots');
   if(args._update){
    maintenanceWrites++;if(maintenanceWriteUnavailable)return reply(res,{message:'provider_token=private'},503);if(maintenanceWriteDenied)return reply(res,{message:'provider_token=private'},403);
    const row=maintenanceRows.find(x=>x.id===args.id&&x.revision===args.revision);if(!row)return reply(res,null);
    assert.deepEqual(Object.keys(args._update).sort(),['cost','status']);assert.equal(args._update.status,'assigned');assert.equal(args._update.cost,'12.345');
    Object.assign(row,args._update);row.revision++;return reply(res,row);
   }
   if(maintenanceReadbackDenied&&args._single)return reply(res,{message:'ACCESS_DENIED'},403);
   if(maintenanceReadDenied)return reply(res,{message:'ACCESS_DENIED'},403);
   if(maintenanceReadUnavailable)return reply(res,{message:'SERVICE_UNAVAILABLE'},503);
   if(args._single)return reply(res,maintenanceRows.find(x=>x.id===args.id));
   return reply(res,maintenanceRows.slice(args._range[0],args._range[1]+1));
  }
  if(name==='aqari_maintenance_executor_summary'){
   assert.equal(args.p_workspace_id,wid,'maintenance executors stay workspace scoped');
   assert.deepEqual(args.p_request_ids,['request1','request2']);
   return reply(res,args.p_request_ids.map(request_id=>({request_id,work_order_id:null})));
  }
  if(name==='aqari_maintenance_locations'){
   assert.equal(args.p_workspace_id,wid);assert.deepEqual(args.p_request_ids,['request1','request2']);
   if(maintenanceLocationDenied)return reply(res,{message:'ACCESS_DENIED'},403);
   if(maintenanceLocationUnavailable)return reply(res,{message:'SERVICE_UNAVAILABLE'},503);
   return reply(res,args.p_request_ids.map(request_id=>({request_id,property_name:propertyName,unit_no:'101'})));
  }
  if(name==='aqari_notification_outbox'){
   assert.equal(args.workspace_id,wid,'outbox stays workspace scoped');
   return reply(res,[{id:'notice1',kind:'rent_reminder',channel:'email',status:'awaiting_configuration',scheduled_at:'2026-09-08T10:00:00Z',period:'2026-08-01',lease}]);
  }
  if(name==='aqari_prepare_rent_reminders'){
   assert.equal(args.p_workspace_id,wid);assert.equal(args.p_grace_day,5);assert.match(args.p_as_of,/^\d{4}-\d{2}-\d{2}$/);prepareCalls++;return reply(res,prepareCalls===1?1:0);
  }
  if(name==='aqari_read_state_v267')return reply(res,{revision:1});
  if(name==='aqari_unit_readiness_register'){
   assert.equal(args.p_workspace_id,wid,'readiness remains workspace scoped');
   assert.equal(args.p_action,'list','statement reads must not change readiness');
   assert.deepEqual(args.p_data,{});
   return reply(res,{units:[statement,secondStatement].flatMap(s=>s.content.rows.map(row=>({property_id:s.property_id,unit_no:row.unit,state:'review_required'})))});
  }
  if(name==='aqari_review_source_lease'){reviewWrites++;return reply(res,{message:'UNEXPECTED_REVIEW_WRITE'},400);}
  if(['aqari_properties','aqari_utility_meters','aqari_utility_entries','aqari_property_statements','aqari_statement_links','aqari_leases','aqari_units','aqari_tenants','aqari_rent_payments'].includes(name)){
   assert.equal(args.workspace_id??args._insert?.workspace_id,wid,'all form queries are workspace scoped');
   if(name==='aqari_properties')return reply(res,[{id:'p1',name:propertyName,external_ref:'source1'},{id:'p2',name:'عقار آخر',external_ref:'source2'}]);
   if(name==='aqari_utility_meters')return reply(res,args.property_id==='p1'?[{id:'meter1',property_id:'p1',kind:'electricity',serial_no:'E-001',account_no:'AC-123',unit_no:'101',notes:'قراءة أصلية <محفوظة>'}]:[]);
   if(name==='aqari_utility_entries'){
    if(args._insert){const row=args._insert;assert.equal(row.property_id,'p1');assert.equal(row.meter_id,'meter1');assert.equal(row.recorded_by,uid);assert.equal(row.entry_type,'bill');assert.equal(row.payment_status,'unpaid');assert.equal(row.amount_due,'12.345');assert.equal(row.amount_paid,'0.000');assert.equal(row.source_ref,'مرجع أصلي <فاتورة> {date}');assert.equal(row.notes,'ملاحظات <أصلية>');assert.ok(!entries.some(x=>x.id===row.id));entries.push({...row,recorded_at:'2026-09-08T12:00:00Z'});entryWrites++;return reply(res,null);}
    const rows=entries.filter(x=>(!args.id||x.id===args.id)&&(!args.meter_id||x.meter_id===args.meter_id)&&(!args.property_id||x.property_id===args.property_id));return reply(res,args._single?rows[0]:rows);
   }
   if(name==='aqari_property_statements')return reply(res,[statement,secondStatement].filter(x=>(!args.period||x.period===args.period)&&(!args.property_id||x.property_id===args.property_id)));
   if(name==='aqari_statement_links')return statementReadDenied?reply(res,{message:'ACCESS_DENIED'},403):reply(res,[]);
   if(name==='aqari_leases')return reply(res,[lease]);
   if(name==='aqari_rent_payments')return reply(res,[{id:'pay1',amount:'120.000',status:'paid',paid_at:'2026-08-02'},{id:'pay2',amount:'5.750',status:'partial',paid_at:'2026-08-03'},{id:'unpaid',amount:'1000.000',status:'draft',paid_at:'2026-08-03'},{id:'other-month',amount:'20.000',status:'paid',paid_at:'2026-07-03'}]);
   if(name==='aqari_units')return reply(res,[{id:'unit1',property_id:'p1',unit_no:'101'},{id:'unit2',property_id:'p1',unit_no:'101'}]);
   if(name==='aqari_tenants')return reply(res,[{id:'tenant1',full_name:tenantName,civil_id:'synthetic',phone:'0000'}]);
  }
  return reply(res,{message:'UNKNOWN_TEST_RPC'},400);
 });return;}
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(harness);return;}
 const file=path.resolve(root,url.pathname.slice(1));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':file.endsWith('.css')?'text/css':'text/javascript'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(4175,'127.0.0.1',resolve));
async function verifyFinancialPanels(page,locale,name){
 const tr=source=>translate(source,locale),fmt=(source,values)=>formatMessage(source,values,locale);
 for(const id of ['collectionProPage','financeSuitePage','reports','documentsHub']){
  const panel=page.locator('#'+id),month=panel.getByLabel(tr('شهر التحصيل الفعلي'),{exact:true});
  if(id==='documentsHub'){
   assert.equal(await month.count(),0,'document retrieval is independent of the collection month');
   assert.equal(await panel.locator('.aq267-document-actions > button').count(),3,'document entry exposes scan, original upload and contract files');
   for(const label of ['مسح ورق أو رفع وثيقة','رفع ملف أصلي دون تعديل','فتح العقود ومرفقاتها'])assert.equal(await panel.getByRole('button',{name:tr(label),exact:true}).count(),1,'document entry has a named action');
   await panel.getByRole('button',{name:tr('قراءة السجلات المحفوظة'),exact:true}).click();
  }else{await month.fill('2026-08');await month.press('Tab');}
  await panel.getByText(tr('تمت القراءة من مساحة العمل الحالية. لا يوجد تغيير أو حفظ مالي من هذه الشاشة.'),{exact:true}).waitFor();
  if(id==='documentsHub')assert.equal(await panel.getByText(fmt('العقود المحفوظة: {leases} • المسودات: {drafts} • المستندات المؤكد رفعها: {documents}',{leases:1,drafts:1,documents:1}),{exact:true}).count(),1,'document totals come from the saved synthetic records');
  if(id!=='documentsHub')assert.equal(await panel.getByRole('heading',{name:fmt('التحصيل الفعلي خلال {month}: {amount} د.ك',{month:'2026-08',amount:'125.750'}),exact:true}).count(),1);
 }
 const alternate=locale==='en'?'ur':'en',before=calls.length;
 await page.locator('#aq267-interface-language').selectOption(alternate);
 await page.locator('#financeSuitePage').getByRole('heading',{name:formatMessage('التحصيل الفعلي خلال {month}: {amount} د.ك',{month:'2026-08',amount:'125.750'},alternate),exact:true}).waitFor();
 await page.locator('#aqari-v267-automation-status').getByRole('heading',{name:translate('التنبيهات والأتمتة',alternate),exact:true}).waitFor();
 assert.equal(await page.locator('#financeSuitePage .aq267-tools').getAttribute('dir'),alternate==='ur'?'rtl':'ltr');
 await page.locator('#aq267-interface-language').selectOption(locale);
 await page.locator('#financeSuitePage').getByRole('heading',{name:fmt('التحصيل الفعلي خلال {month}: {amount} د.ك',{month:'2026-08',amount:'125.750'}),exact:true}).waitFor();
 assert.equal(calls.length,before,'translating loaded financial panels does not read or write business data');
 assert.equal(await page.locator('#financeSuitePage').getByLabel(tr('شهر التحصيل الفعلي'),{exact:true}).inputValue(),'2026-08','language preserves selected financial month');
 const box=await page.locator('#financeSuitePage').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(box.scroll<=box.client+1,`financial translation fits viewport (${name}/${locale}: scroll=${box.scroll}, client=${box.client})`);
 await page.locator('#financeSuitePage').screenshot({path:path.join(out,name+'-'+locale+'-finance.png')});
}
async function verifyLocalizedForms(page,locale,name,viewport){
 const tr=source=>translate(source,locale),fmt=(source,values)=>formatMessage(source,values,locale);
 const dialog=page.getByRole('dialog'),close=()=>dialog.getByRole('button',{name:tr('إغلاق'),exact:true}).click();
 const button=source=>dialog.getByRole('button',{name:tr(source),exact:true});
 const field=source=>dialog.getByLabel(tr(source),{exact:true});
 async function fit(section){
  assert.equal(await dialog.getAttribute('lang'),locale);assert.equal(await dialog.getAttribute('dir'),['ar','ur'].includes(locale)?'rtl':'ltr');
  const box=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));
  assert.ok(box.width<=viewport.width&&box.scroll<=box.client+1,section+' fits '+locale);
  await page.screenshot({path:path.join(out,name+'-'+locale+'-'+section+'.png'),fullPage:true});
 }
 await page.getByRole('button',{name:tr('الإعدادات والخدمات — عدادات العقارات'),exact:true}).click();
 await page.getByText(tr('تم استرجاع العدادات والسجلات من قاعدة البيانات.'),{exact:true}).waitFor();
 assert.equal(await field('العقار').getByRole('option',{name:propertyName,exact:true}).count(),1,'property name is literal');
 await field('نوع السجل').selectOption('bill');
 await field('رقم الفاتورة').fill('B-'+locale);await field('شهر الفاتورة').fill('2026-08');
 await field('المبلغ المستحق — د.ك').fill('١٢٫٣٤٥');await field('المبلغ المسدد — د.ك').fill('0.000');
 await field('حالة السداد').selectOption('unpaid');await field('مرجع الصورة أو الفاتورة').fill('مرجع أصلي <فاتورة> {date}');await field('ملاحظات').fill('ملاحظات <أصلية>');
 const before=entryWrites;
 await field('المبلغ المسدد — د.ك').fill('1.000');
 await button('حفظ والتحقق من السجل').click();
 await page.getByText(tr('لإثبات السداد، أرفق المستند وأدخل المبلغ المسدد والتاريخ والطريقة.'),{exact:true}).waitFor();
 assert.equal(entryWrites,before,'missing payment proof never saves a record');
 await field('المبلغ المسدد — د.ك').fill('0.000');await button('حفظ والتحقق من السجل').click();
 await page.getByText(tr('تم حفظ السجل والتحقق منه بإعادة القراءة. الأصل محفوظ دون حذف أو استبدال.'),{exact:true}).waitFor();
 assert.equal(entryWrites,before+1);assert.equal(await dialog.getByRole('heading',{name:fmt('فاتورة {invoice}',{invoice:'B-'+locale}),exact:true}).count(),1);
 assert.equal(await dialog.getByText(tr('المصدر: ')+'مرجع أصلي <فاتورة> {date}',{exact:true}).count(),entries.length);
 await fit('utilities');
 await field('العقار').selectOption('p2');await page.getByText(tr('لا توجد عدادات مؤكدة لهذا العقار. الهيكل جاهز؛ لن تُضاف أرقام أو قراءات افتراضية.'),{exact:true}).waitFor();
 assert.equal(await dialog.locator('article').count(),0,'another property cannot display the previous property bills');
 await field('العقار').selectOption('p1');await page.getByText(tr('تم استرجاع العدادات والسجلات من قاعدة البيانات.'),{exact:true}).waitFor();
 assert.equal(await dialog.locator('article').count(),entries.length,'saved invoices reload');await close();
 await page.getByRole('button',{name:tr('كشوف العقارات — برج شيخة'),exact:true}).click();
 await page.getByText(tr('تم استرجاع الكشف المحفوظ من قاعدة البيانات.'),{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('heading',{name:propertyName+' — 2026-08',exact:true}).count(),1);
 const row=dialog.locator('details');await row.locator('summary').click();
 assert.equal(await row.getByText(tr('طريقة السداد')+': كي نت من المصدر',{exact:true}).count(),1,'source payment method is not translated');
 assert.equal(await row.locator('summary').textContent(),fmt('الوحدة {unit} — {tenant} — {rent} د.ك',{unit:'101',tenant:tenantName,rent:'125.750'}));
 assert.ok(!(await dialog.textContent()).includes('402'),'no hardcoded unit conflicts leak between properties');
 await fit('statements');
 await field('الشهر').fill('2026-09');await field('الشهر').press('Tab');
 await page.getByText(tr('لا يوجد كشف مصدر محفوظ لهذا الشهر. يمكنك عرض كشف التحصيل الفعلي أو تقرير موظفي التحصيل من العقود والدفعات المحفوظة.'),{exact:true}).waitFor();
 assert.equal(await button('تحميل PDF / طباعة').isDisabled(),true);assert.equal(await button('ربط الكشف بملفات المستأجرين والعقود').isDisabled(),true);
 assert.equal(await dialog.locator('details').count(),0,'missing month clears previous statement');
 await field('الشهر').fill('2026-08');await field('الشهر').press('Tab');await page.getByText(tr('تم استرجاع الكشف المحفوظ من قاعدة البيانات.'),{exact:true}).waitFor();
 statementReadDenied=true;await button('عرض الكشف').click();await dialog.waitFor({state:'detached'});
 assert.equal(await dialog.locator('details').count(),0,'denied reread removes private statement rows');
 assert.equal(await button('تحميل PDF / طباعة').count(),0);assert.equal(await button('ربط الكشف بملفات المستأجرين والعقود').count(),0,'failed reread cannot leave a printable or linkable candidate');
 statementReadDenied=false;await page.getByRole('button',{name:tr('كشوف العقارات — برج شيخة'),exact:true}).click();
 await page.getByText(tr('تم استرجاع الكشف المحفوظ من قاعدة البيانات.'),{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('heading',{name:propertyName+' — 2026-08',exact:true}).count(),1,'restored access reloads the saved statement');
 await field('العقار').selectOption('p2');await page.getByText(tr('تم استرجاع الكشف المحفوظ من قاعدة البيانات.'),{exact:true}).waitFor();
 await dialog.locator('details summary').click();assert.equal(await dialog.getByText(tr('التأمين')+': 100.000',{exact:true}).count(),1,'confirmed deposit is not labelled pending');
 assert.equal(await dialog.getByRole('heading',{name:'عقار آخر — 2026-08',exact:true}).count(),1);
 await close();
 await page.getByRole('button',{name:tr('اعتماد عقود المصدر'),exact:true}).click();
 await page.getByText(tr('راجع المستند قبل تنفيذ المرحلة التالية.'),{exact:true}).waitFor();
 assert.equal(await dialog.getByText(fmt('العقار: {property} • الوحدة: {unit} • المستأجر: {tenant}',{property:propertyName,unit:'101',tenant:tenantName}),{exact:true}).count(),1);
 await button('اعتماد العقد').click();await page.getByText(tr('حدد المستند والتأمين ومرجع المطابقة وأكد المراجعة.'),{exact:true}).waitFor();assert.equal(reviewWrites,0,'incomplete approval cannot write');
 await fit('leases');await close();
 await page.getByRole('button',{name:tr('مركز جودة البيانات'),exact:true}).click();
 await page.getByText(tr('اكتمل الفحص للقراءة فقط. التعارضات المصدرية المعروفة تبقى معلقة دون تغيير.'),{exact:true}).waitFor();
 assert.equal(await dialog.getByText(fmt('تمت قراءة {units} وحدة و{tenants} ملف مستأجر و{leases} عقداً من مساحة العمل الحالية.',{units:2,tenants:1,leases:1}),{exact:true}).count(),1);
 assert.equal(await dialog.locator('summary').filter({hasText:tr('رقم وحدة مكرر داخل العقار — يحتاج مراجعة')}).count(),1);
 await fit('quality');assert.equal(entryWrites,before+1);assert.equal(reviewWrites,0);
 await close();
}
async function verifyServiceDesk(page,locale,name,viewport){
 const tr=source=>translate(source,locale),fmt=(source,values)=>formatMessage(source,values,locale);
 const dialog=page.getByRole('dialog'),close=()=>dialog.getByRole('button',{name:tr('إغلاق'),exact:true}).click();
 const refresh=()=>dialog.getByRole('button',{name:tr('تحديث السجلات'),exact:true}).click();
 const ready=()=>dialog.getByText(tr('تمت قراءة طلبات الصيانة المحفوظة.'),{exact:true}).waitFor();
 await page.locator('#fixtureMaintenance').click();await ready();
 assert.equal(await dialog.getAttribute('lang'),locale);assert.equal(await dialog.getAttribute('dir'),['ar','ur'].includes(locale)?'rtl':'ltr');
 const card=dialog.locator('article').filter({has:page.getByRole('heading',{name:fmt('طلب {number}',{number:'TEST-1'}),exact:true})});
 const completed=dialog.locator('article').filter({has:page.getByRole('heading',{name:fmt('طلب {number}',{number:'TEST-2'}),exact:true})});
 assert.equal(await card.getByText(tenantName,{exact:true}).count(),1,'tenant name is literal');
 assert.equal(await card.getByText(fmt('العقار: {property} • الوحدة: {unit}',{property:propertyName,unit:'101'}),{exact:true}).count(),1,'location is available without the private lease join');
 assert.ok(!(await card.textContent()).includes('C-101'),'maintenance location does not include a contract number');
 assert.equal(await card.getByText('وصف <طلب> {status}',{exact:true}).count(),1,'request description is literal');
 assert.equal(await completed.getByRole('button',{name:tr('حفظ الحالة والتكلفة'),exact:true}).count(),0,'closed requests expose no save action');
 assert.equal(await completed.getByLabel(tr('التكلفة — د.ك'),{exact:true}).isDisabled(),true);
 const closedState=completed.getByLabel(tr('حالة الطلب'),{exact:true});
 assert.equal(await closedState.isDisabled(),true,'closed requests cannot transition');
 assert.deepEqual(await closedState.locator('option').evaluateAll(options=>options.map(option=>option.value)),['completed']);
 const closedBefore=structuredClone(maintenanceRows.find(row=>row.id==='request2')),closedWritesBefore=maintenanceWrites,attachmentCallsBefore=maintenanceAttachmentCalls.length,attachmentReadsBefore=maintenanceAttachmentReads;
 await completed.getByRole('button',{name:tr('صور البلاغ ومرفقاته'),exact:true}).click();
 await completed.getByText(tr('يمكنك استرجاع المرفقات المحفوظة. إضافة مرفقات جديدة غير متاحة لهذا البلاغ.'),{exact:true}).waitFor();
 assert.equal(await completed.locator('input[type=file]:visible').count(),0,'closed attachments expose no file or camera input');
 const upload=completed.getByRole('button',{name:tr('رفع المرفقات والتحقق منها'),exact:true,includeHidden:true});
 assert.equal(await upload.isVisible(),false,'closed attachments expose no upload action');
 assert.equal(await upload.isDisabled(),true);
 // Even a synthetic change to the hidden input cannot invoke reserve/finalize or Storage POST.
 await completed.locator('input[type=file]').first().setInputFiles({name:'blocked.jpg',mimeType:'image/jpeg',buffer:maintenanceAttachmentBytes});
 assert.equal(await upload.isDisabled(),true);
 await upload.evaluate(button=>button.onclick());
 await completed.getByRole('button',{name:tr('استرجاع المرفق'),exact:true}).click();
 const originalLink=completed.getByRole('link',{name:tr('فتح / تحميل الملف المحفوظ'),exact:true});await originalLink.waitFor();
 const downloaded=await originalLink.evaluate(async link=>Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())));
 assert.deepEqual(Buffer.from(downloaded),maintenanceAttachmentBytes,'closed request retrieves the unchanged original bytes');
 assert.equal(await originalLink.getAttribute('download'),maintenanceAttachment.filename);
 assert.equal(maintenanceAttachmentReads,attachmentReadsBefore+1);
 assert.deepEqual(maintenanceAttachmentCalls.slice(attachmentCallsBefore).map(call=>call.p_action),['list','list'],'attachment opening and download only reread metadata');
 assert.equal(maintenanceAttachmentWrites,0,'closed requests never reserve/finalize or upload');
 assert.equal(maintenanceWrites,closedWritesBefore,'reading closed attachments never saves or transitions the request');
 assert.deepEqual(maintenanceRows.find(row=>row.id==='request2'),closedBefore,'closed state, cost and revision remain unchanged');
 const cost=card.getByLabel(tr('التكلفة — د.ك'),{exact:true}),save=()=>card.getByRole('button',{name:tr('حفظ الحالة والتكلفة'),exact:true});
 const before=maintenanceWrites,storedCostBefore=await cost.inputValue();
 await cost.fill('6.125');maintenanceLocationUnavailable=true;await refresh();
 await dialog.getByText(tr('تعذر إكمال العملية أو تأكيدها. حدّث السجلات وتحقق قبل إعادة المحاولة.'),{exact:true}).waitFor();
 assert.equal(await dialog.locator('article').count(),2);assert.equal(await cost.inputValue(),'6.125','metadata outage preserves the unsaved cost');
 maintenanceLocationUnavailable=false;await refresh();await ready();assert.equal(await cost.inputValue(),'6.125');
 maintenanceLocationDenied=true;await refresh();await dialog.waitFor({state:'detached'});
 assert.equal(await dialog.locator('article').count(),0,'metadata permission denial clears requests and drafts');
 maintenanceLocationDenied=false;await page.locator('#fixtureMaintenance').click();await ready();assert.equal(await cost.inputValue(),storedCostBefore,'denied metadata cannot restore the revoked draft');
 await cost.fill('9.125');maintenanceReadUnavailable=true;await refresh();
 await dialog.getByText(tr('تعذر إكمال العملية أو تأكيدها. حدّث السجلات وتحقق قبل إعادة المحاولة.'),{exact:true}).waitFor();
 assert.equal(await dialog.locator('article').count(),2,'temporary outage preserves the current requests');assert.equal(await cost.inputValue(),'9.125','temporary outage preserves unsaved cost');
 maintenanceReadUnavailable=false;await refresh();await ready();assert.equal(await cost.inputValue(),'9.125','recovery preserves unsaved cost');
 await cost.fill('-1');await save().click();await dialog.getByText(tr('أدخل تكلفة صحيحة بدقة ثلاثة منازل.'),{exact:true}).waitFor();assert.equal(maintenanceWrites,before);
 await card.getByLabel(tr('حالة الطلب'),{exact:true}).selectOption('assigned');await cost.fill('١٢٫٣٤٥');await save().click();
 await dialog.getByText(tr('تم حفظ الطلب وإعادة قراءته من قاعدة البيانات.'),{exact:true}).waitFor();
 assert.equal(maintenanceWrites,before+1);assert.equal(await cost.inputValue(),'12.345');assert.equal(await card.getByLabel(tr('حالة الطلب'),{exact:true}).inputValue(),'assigned');
 maintenanceWriteUnavailable=true;await save().click();await dialog.getByText(tr('لم يتأكد الحفظ. حدّث السجلات وتحقق قبل إعادة الحفظ.'),{exact:true}).waitFor();
 assert.equal(await save().isDisabled(),true,'uncertain write cannot be repeated');assert.ok(!(await dialog.textContent()).includes('private'));maintenanceWriteUnavailable=false;
 await refresh();await ready();assert.equal(await save().isDisabled(),true,'ordinary refresh does not silently unlock an uncertain draft');
 assert.equal(maintenanceWrites,before+2,'refresh cannot repeat the uncertain write');
 const writesBeforeDiscard=maintenanceWrites;
 await card.getByRole('button',{name:tr('تجاهل التعديل المحلي واسترجاع المحفوظ'),exact:true}).click();await ready();
 assert.equal(await save().isEnabled(),true);assert.equal(maintenanceWrites,writesBeforeDiscard,'discard reloads without sending another write');
 assert.equal(await cost.inputValue(),'12.345');assert.equal(await card.getByLabel(tr('حالة الطلب'),{exact:true}).inputValue(),'assigned');
 const box=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(box.width<=viewport.width&&box.scroll<=box.client+1,'service translation fits viewport');
 await page.screenshot({path:path.join(out,name+'-'+locale+'-maintenance.png'),fullPage:true});
 await cost.fill('8.250');maintenanceReadDenied=true;await refresh();await dialog.waitFor({state:'detached'});assert.equal(await dialog.locator('article').count(),0,'denied reread clears previous requests');maintenanceReadDenied=false;
 await page.locator('#fixtureMaintenance').click();await ready();assert.equal(await cost.inputValue(),'12.345','restored access cannot revive a revoked private draft');assert.equal(maintenanceWrites,before+2,'access recovery only rereads');
 maintenanceWriteDenied=true;await save().click();await dialog.waitFor({state:'detached'});assert.equal(await dialog.locator('article').count(),0,'denied write disposes private data');maintenanceWriteDenied=false;
 await page.locator('#fixtureMaintenance').click();await ready();assert.equal(await cost.inputValue(),'12.345');assert.equal(maintenanceWrites,before+3,'reopening after denied write never repeats it');
 maintenanceReadbackDenied=true;await save().click();await dialog.waitFor({state:'detached'});
 assert.equal(await dialog.locator('article').count(),0,'revoked read access during save confirmation clears the private view');
 maintenanceReadbackDenied=false;await page.locator('#fixtureMaintenance').click();await ready();assert.equal(maintenanceWrites,before+4,'recovery cannot repeat an uncertain save');
 await close();
 await page.getByRole('button',{name:tr('عرض سجل التنبيهات المحفوظ'),exact:true}).click();
 await dialog.getByText(tr('الإرسال غير مفعّل. هذه سجلات تجهيز وإلغاء، وليست رسائل مرسلة.'),{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('heading',{name:tr('تذكير الإيجار'),exact:true}).count(),1);
 assert.ok((await dialog.textContent()).includes(tr('بانتظار إعداد الإرسال')));
 const grace=dialog.getByLabel(tr('آخر يوم في مهلة السداد من الشهر'),{exact:true}),prepare=dialog.getByRole('button',{name:tr('تجهيز تنبيهات اليوم'),exact:true}),beforePrepare=prepareCalls;
 await grace.fill('28');await prepare.click();await dialog.getByText(tr('حدد آخر يوم بين ١ و٢٧.'),{exact:true}).waitFor();assert.equal(prepareCalls,beforePrepare);
 await grace.fill('5');await prepare.click();
 await dialog.getByText(fmt('تم تجهيز {count} تنبيه مستحق. لم تُرسل رسائل. إذا كان العدد صفراً فلا توجد تنبيهات جديدة مستحقة اليوم.',{count:beforePrepare===0?1:0}),{exact:true}).waitFor();assert.equal(prepareCalls,beforePrepare+1);
 await page.screenshot({path:path.join(out,name+'-'+locale+'-notifications.png'),fullPage:true});await close();
 if(locale==='ar'){await page.locator('#fixtureMaintenance').click();await ready();}
}
const results=[];let failed=false;
try{
 for(const [engineName,engine]of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch();
  try{for(const [device,viewport]of [['iphone',{width:390,height:844}],['ipad',{width:820,height:1180}],['desktop',{width:1440,height:1000}]]){
   maintenanceReadUnavailable=false;maintenanceReadbackDenied=false;maintenanceLocationDenied=false;maintenanceLocationUnavailable=false;storageFailBefore=false;storageLoseReply=false;storageReadDenied=false;storageReadUnavailable=false;storageAttempts=0;
   maintenanceAttachmentCalls=[];maintenanceAttachmentReads=0;maintenanceAttachmentWrites=0;
   settings={sections:{},permissions:{},labels:{}};revision=0;audit=[];docs=[];storageBytes=null;storageUploads=0;calls=[];failingWrite=false;entries=[];entryWrites=0;reviewWrites=0;statementReadDenied=false;maintenanceWrites=0;maintenanceWriteDenied=false;maintenanceWriteUnavailable=false;maintenanceReadDenied=false;prepareCalls=0;maintenanceRows=[{id:'request1',request_no:'TEST-1',workspace_id:wid,description:'وصف <طلب> {status}',status:'received',cost:'0.000',revision:1,lease:null,tenant:{full_name:tenantName}},{id:'request2',request_no:'TEST-2',workspace_id:wid,description:'طلب مغلق',status:'completed',cost:'2.000',revision:1,lease:null}];
   const context=await browser.newContext({viewport,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   // The fixture redirects only the pinned Storage URL to its local HTTP endpoint.
   // Node receives the actual upload bytes on both engines; no inspector postData shortcut.
   // No credential or request reaches a real service.
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin==='http://127.0.0.1:4175')return route.continue();
    return route.abort();
   });
   const name=engineName+'-'+device;const start=Date.now();
   try{
    await page.goto('http://127.0.0.1:4175/');
    const directory=page.locator('#aq267-service-directory');
    await directory.waitFor({state:'visible'});
    const serviceSearch=directory.getByRole('searchbox',{name:'ابحث عن خدمة',exact:true});
    assert.equal(await page.locator('#aq267-kpi-dashboard').isVisible(),false,'grouped menu keeps unavailable backend features hidden');
    await serviceSearch.fill('راتب');
    await directory.getByRole('button',{name:'الموظفون والرواتب',exact:true}).waitFor({state:'visible',timeout:3000});
    await serviceSearch.fill('مركز تحكم المدير');
    await directory.getByRole('button',{name:'مركز تحكم المدير',exact:true}).click();
    await page.getByRole('dialog').getByText('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',{exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    assert.equal(revision,0,'opening a service must not write settings');
    const serviceLayout=await directory.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)}));
    assert.ok(serviceLayout.width<=viewport.width&&serviceLayout.scroll<=serviceLayout.client+1&&serviceLayout.buttons,'service directory fits each viewport with touch targets');
    await page.screenshot({path:path.join(out,name+'-service-directory.png'),fullPage:true});
    await serviceSearch.press('Escape');
    assert.equal(await serviceSearch.inputValue(),'');
    await page.locator('#v199MoreMenu').getByRole('button',{name:'العقود المنتهية والقريبة من الانتهاء',exact:true}).click();
    await page.getByRole('heading',{name:'عقد EXP-401',exact:true}).waitFor();
    await page.getByLabel('نوع التقرير',{exact:true}).selectOption('expired');
    await page.getByRole('button',{name:'عرض التقرير',exact:true}).click();
    await page.getByText('انتهى منذ 2 يومًا',{exact:true}).waitFor();
    await page.getByRole('dialog').screenshot({path:path.join(out,name+'-lease-expiry.png')});
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();

    await page.getByRole('button',{name:'مركز تحكم المدير',exact:true}).click();
    await page.getByText('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',{exact:true}).waitFor();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('checkbox',{name:'الصيانة',exact:true}).uncheck();
    await dialog.getByLabel('سبب التعديل',{exact:true}).fill('اختبار حفظ آلي مستقل');
    await dialog.getByRole('button',{name:'حفظ الإعدادات والتحقق',exact:true}).click();
    await page.getByText('تم الحفظ وإعادة القراءة وتسجيل التعديل.',{exact:true}).waitFor();
    assert.equal(revision,1);assert.equal(settings.sections.maintenance,false);assert.equal(audit.length,1);
    assert.equal(await page.locator('#fixtureKpi').textContent(),'42','label changes preserve financial numbers');
    await dialog.getByRole('button',{name:'إغلاق',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'إغلاق المزيد',exact:true}).count(),1,'close action stays distinct from navigation');
    await page.reload();await page.getByRole('button',{name:'مركز تحكم المدير',exact:true}).click();
    await page.getByText('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('dialog').getByRole('checkbox',{name:'الصيانة',exact:true}).isChecked(),false);
    failingWrite=true;await page.getByLabel('سبب التعديل',{exact:true}).fill('حفظ مرفوض');
    await page.getByRole('button',{name:'حفظ الإعدادات والتحقق',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(revision,1);failingWrite=false;
    const uploadShortcut=page.locator('#aq267-document-upload-action');
    await uploadShortcut.waitFor({state:'visible'});
    assert.equal(await uploadShortcut.textContent(),'رفع وثيقة أو مسح ورق','home exposes the direct document shortcut');
    assert.equal(await uploadShortcut.isEnabled(),true,'authorized document shortcut is actionable');
    await uploadShortcut.click();
    const scannerDialog=page.getByRole('dialog',{name:'مسح المستندات ورفع الوثائق',exact:true});
    await scannerDialog.waitFor({state:'visible'});
    assert.equal(await page.getByRole('dialog').count(),1,'home shortcut opens the original scanner once');
    await scannerDialog.getByText('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',{exact:true}).waitFor();
    await page.getByLabel('السجل المرتبط',{exact:true}).selectOption('p1');
    await page.getByText('تم تحديث مستندات السجل المحدد.',{exact:true}).waitFor();
    await page.getByLabel('تصنيف المستند',{exact:true}).selectOption('ownership_deed');
    await page.getByLabel('عنوان المستند',{exact:true}).fill('وثيقة اختبار للمسح');
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,900);ctx.fillStyle='black';ctx.font='40px sans-serif';ctx.fillText('AQARI scan fixture',40,80);return canvas.toDataURL('image/png').split(',')[1];});
    await page.getByLabel('اختيار ملف أو صور من الجهاز',{exact:true}).setInputFiles([{name:'scan-1.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},{name:'scan-2.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}]);
    await page.getByText('راجع وضوح الصورة والعنوان والسجل، ثم ارفع النسخة.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'تدوير الصورة',exact:true}).click();
    storageFailBefore=true;
    await page.getByRole('button',{name:'رفع نسخة جديدة والتحقق منها',exact:true}).click();
    await page.getByText('تعذر تأكيد تخزين الملف. حدّث السجلات قبل إعادة الرفع.',{exact:true}).waitFor();
    assert.equal(docs.length,1);assert.equal(storageUploads,0);assert.equal(storageAttempts,1);assert.equal(docs[0].status,'draft');
    storageReadUnavailable=true;
    await page.getByRole('button',{name:'رفع نسخة جديدة والتحقق منها',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'رفع نسخة جديدة والتحقق منها',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>[...document.querySelectorAll('.aq267-dialog button')].some(button=>button.textContent==='رفع نسخة جديدة والتحقق منها'&&!button.disabled));
    assert.equal(storageAttempts,1,'unavailable reread cannot retry the upload');assert.equal(docs[0].status,'draft');
    storageReadUnavailable=false;storageLoseReply=true;
    await page.getByRole('button',{name:'رفع نسخة جديدة والتحقق منها',exact:true}).click();
    const storedReview=page.locator('.aq267-stored-visual-review:not([hidden])');
    await storedReview.waitFor({state:'visible'});
    await storedReview.getByRole('checkbox',{name:'راجعت النسخة المرفوعة فعلياً وجميع صفحاتها وأؤكد وضوح النصوص والصور وعدم فقدان الجودة.',exact:true}).check();
    await storedReview.getByRole('button',{name:'اعتماد النسخة المرفوعة وإقفال المستند',exact:true}).click();
    await page.getByText('تم حفظ النسخة بعد استرجاعها من التخزين ومراجعة جودتها ومطابقة بصمتها وتصنيفها وارتباطها بالسجل.',{exact:true}).waitFor();
    assert.equal(storageAttempts,2,'a missing upload reuses the same reservation; a lost stored reply is recovered by reading');
    assert.equal(docs.length,1);assert.equal(storageUploads,1);assert.equal(docs[0].status,'uploaded');assert.equal(docs[0].entity_ref,'p1');assert.equal(docs[0].size_bytes,storageBytes.length);
    assert.equal(docs[0].metadata.document_category,'ownership_deed','selected category survives upload and canonical readback');
    assert.equal(docs[0].document_type,'mobile_scan','property evidence cannot become a signed contract');
    assert.equal(storageBytes.subarray(0,5).toString(),'%PDF-','images collected in a PDF');
    assert.equal(docs[0].mime_type,'application/pdf');assert.equal(docs[0].metadata.page_count,2);assert.match(storageBytes.toString('latin1'),/\/Count 2/);
    assert.equal(await page.getByText('رفع بواسطة: مدير اختبار',{exact:true}).count(),1);
    const layout=await page.getByRole('dialog').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth,buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44)}));
    assert.ok(layout.scroll<=layout.client+1);assert.ok(layout.width<=viewport.width);assert.ok(layout.buttons);
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    await page.reload();await page.getByRole('button',{name:'مسح مستند',exact:true}).click();
    await page.getByText('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',{exact:true}).waitFor();
    await page.getByLabel('السجل المرتبط',{exact:true}).selectOption('p1');await page.getByText('تم تحديث مستندات السجل المحدد.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'وثيقة اختبار للمسح'}).count(),1);
    // The server may revoke a section/property scope while the same membership
    // remains locally active. Exercise the real shared dialog and private URLs.
    await page.evaluate(()=>{
     window.fixtureRevokedUrls=[];const revoke=URL.revokeObjectURL.bind(URL);
     URL.revokeObjectURL=url=>{window.fixtureRevokedUrls.push(url);return revoke(url);};
     document.addEventListener('click',event=>{if(event.target.closest('.aq267-dialog a[download]'))event.preventDefault();});
    });
    await page.getByRole('dialog').getByRole('button',{name:'تحميل النسخة الأصلية',exact:true}).click();
    await page.getByText('تم استرجاع الملف الأصلي والتحقق من مطابقته للبصمة المحفوظة.',{exact:true}).waitFor();
    const privateUrl=await page.getByRole('dialog').locator('a[download]').getAttribute('href');assert.ok(privateUrl?.startsWith('blob:'));
    assert.equal(await page.evaluate(async url=>(await (await fetch(url)).blob()).size,privateUrl),storageBytes.length,'download URL contains the saved private document');
    const uploadsBeforeDenial=storageAttempts;
    storageReadDenied=true;await page.getByRole('dialog').getByRole('button',{name:'تحميل النسخة الأصلية',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'detached'});
    assert.equal(await page.getByRole('heading',{name:'وثيقة اختبار للمسح',exact:true}).count(),0,'server read denial removes the cached private document');
    assert.equal(await page.evaluate(()=>window.AQARI_SUPABASE.context.membership.is_active),true,'scope revocation is handled before a local membership update');
    assert.equal(await page.evaluate(url=>window.fixtureRevokedUrls.includes(url),privateUrl),true,'server denial revokes generated private download URLs');
    assert.equal(await page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},privateUrl),true,'revoked document URL cannot be read');
    assert.equal(storageAttempts,uploadsBeforeDenial,'read denial never starts another upload');
    storageReadDenied=false;await page.getByRole('button',{name:'مسح مستند',exact:true}).click();
    await page.getByText('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',{exact:true}).waitFor();
    await page.getByLabel('السجل المرتبط',{exact:true}).selectOption('p1');await page.getByText('تم تحديث مستندات السجل المحدد.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'وثيقة اختبار للمسح',exact:true}).count(),1,'restored access reloads the authoritative document in a fresh dialog');
    assert.equal(storageAttempts,uploadsBeforeDenial,'access recovery only rereads');
    await page.getByRole('dialog').getByRole('button',{name:'إغلاق',exact:true}).click();
    const languageLayouts=[];
    for(const locale of ['en','hi','ur','ml','ar']){
     await page.locator('#aq267-interface-language').selectOption(locale);
     await page.getByRole('button',{name:navLabel('control_center',locale),exact:true}).waitFor();
     await page.reload();
     assert.equal(await page.locator('#aq267-interface-language').inputValue(),locale,'language survives reload');
     await page.locator('#aq267-service-directory').waitFor({state:'visible'});
     await page.locator('#aq267-service-directory').screenshot({path:path.join(out,name+'-service-directory-'+locale+'.png')});
     await verifyFinancialPanels(page,locale,name);
     await page.getByRole('button',{name:navLabel('control_center',locale),exact:true}).click();
     await page.getByText(translate('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.',locale),{exact:true}).waitFor();
     const localizedDialog=page.getByRole('dialog');
     assert.equal(await localizedDialog.getAttribute('lang'),locale);
     assert.equal(await localizedDialog.getAttribute('dir'),['ar','ur'].includes(locale)?'rtl':'ltr');
     assert.equal(await localizedDialog.getByRole('checkbox',{name:navLabel('maintenance',locale),exact:true}).isChecked(),false,'permissions unaffected by language');
     const measurement=await localizedDialog.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,width:el.getBoundingClientRect().width}));
     assert.ok(measurement.scroll<=measurement.client+1&&measurement.width<=viewport.width,'localized dialog fits viewport');
     await localizedDialog.getByRole('button',{name:translate('إغلاق',locale),exact:true}).click();
     await page.getByRole('button',{name:navLabel('scan_document',locale),exact:true}).click();
     await page.getByText(translate('اختر من السجلات المحفوظة. يعرض البحث حتى ٥٠ نتيجة.',locale),{exact:true}).waitFor();
     await page.getByLabel(translate('السجل المرتبط',locale),{exact:true}).selectOption('p1');
     await page.getByText(translate('تم تحديث مستندات السجل المحدد.',locale),{exact:true}).waitFor();
     assert.equal(await page.getByRole('heading',{name:'وثيقة اختبار للمسح',exact:true}).count(),1,'stored title is never translated');
     assert.equal(await page.getByText(translate('رفع بواسطة: ',locale)+'مدير اختبار',{exact:true}).count(),1,'author stays unchanged');
     assert.equal(await page.locator('#fixtureKpi').textContent(),'42');
     assert.equal(storageUploads,1,'language changes never upload or save data');
     await page.screenshot({path:path.join(out,name+'-'+locale+'.png'),fullPage:true});
     languageLayouts.push({locale,...measurement});
     await page.getByRole('dialog').getByRole('button',{name:translate('إغلاق',locale),exact:true}).click();
     await verifyLocalizedForms(page,locale,name,viewport);
     await verifyServiceDesk(page,locale,name,viewport);
    }
    await page.evaluate(()=>{window.AQARI_DATA_GATE.scope=null;window.dispatchEvent(new CustomEvent('aqari:auth-boundary'));});
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByText('وصف <طلب> {status}',{exact:true}).count(),0,'logout removes cached maintenance details');
    assert.equal(await page.locator('#financeSuitePage h3').count(),0,'logout clears cached financial values');
    assert.deepEqual(errors,[]);
    results.push({name,passed:true,ms:Date.now()-start,layout,languageLayouts,controlRevision:revision,documents:docs.length,scope:'synthetic component backend; no real account or physical device'});console.log('PASS',name);
   }catch(e){failed=true;results.push({name,passed:false,error:e.stack,calls,errors});console.error('FAIL',name,e.stack);console.error('COMPONENT_ERRORS',JSON.stringify(errors));console.error('DIRECTORY_STATE',await page.locator('#aq267-service-directory').evaluate(el=>({text:el.textContent,query:el.querySelector('input')?.value,groups:[...el.querySelectorAll('details')].map(g=>({key:g.dataset.group,open:g.open}))})).catch(()=>null));await page.screenshot({path:path.join(out,name+'-failure.png'),fullPage:true}).catch(()=>{});}
   finally{await context.close();}
  }}finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
if(failed)process.exit(1);
