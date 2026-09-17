import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnerReportDeliveryHandler} from '../api/owner-report-delivery.js';

function response(data,status=200){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)};}
function res(){return {code:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}

test('direct Meta WhatsApp Cloud API and independent Email delivery are permission-scoped and idempotent',async()=>{
 const calls=[];
 const fetchImpl=async(url,options={})=>{
  const href=String(url);calls.push({href,options});
  if(href.includes('/rest/v1/rpc/aqari_owner_report_delivery_targets_v3'))return response([{
   target_id:'11111111-1111-4111-8111-111111111111',workspace_id:'22222222-2222-4222-8222-222222222222',
   owner_name:'مالك اختبار',owner_user_id:'33333333-3333-4333-8333-333333333333',
   property_ids:['44444444-4444-4444-8444-444444444444'],property_names:['عقار اختبار'],
   channels:['whatsapp','email'],email:'owner@example.invalid',whatsapp:'+96550000000',report_schedule:'daily',report_hour:8
  }]);
  if(href.includes('/rest/v1/rpc/aqari_owner_report_service_v3'))return response({
   workspace_id:'22222222-2222-4222-8222-222222222222',from:'2026-09-17',to:'2026-09-17',currency:'KWD',
   properties:[{id:'44444444-4444-4444-8444-444444444444',name:'عقار اختبار'}],
   collection:{due:100,collected:50,remaining:50,paid_count:1,partial_count:0,unpaid_count:1},
   tenants:[{tenant_name:'مستأجر دافع',unit_no:'1',state:'paid',remaining:0},{tenant_name:'مستأجر غير دافع',unit_no:'2',state:'unpaid',remaining:50}],
   arrears:{count:1,remaining:25},alerts:{leases_expiring_30:1,maintenance_open:2,unpaid_current:1},
   period_activity:{collections:50,approved_expenses:5,net:45}
  });
  if(href.includes('/rest/v1/rpc/aqari_owner_report_delivery_claim'))return response({send:true});
  if(href.includes('/rest/v1/rpc/aqari_owner_report_delivery_complete'))return response({ok:true});
  if(href.startsWith('https://graph.facebook.com/'))return response({messages:[{id:'wamid.test'}]});
  if(href==='https://email.example.invalid/send')return response({id:'mail-test'});
  throw Error('UNEXPECTED_FETCH '+href);
 };
 const env={
  AQARI_SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),CRON_SECRET:'c'.repeat(32),
  META_WHATSAPP_ACCESS_TOKEN:'m'.repeat(50),META_WHATSAPP_PHONE_NUMBER_ID:'123456789012345',
  META_WHATSAPP_GRAPH_VERSION:'v25.0',META_WHATSAPP_TEMPLATE_NAME:'aqari_owner_report_v267',META_WHATSAPP_TEMPLATE_LANGUAGE:'ar',
  AQARI_EMAIL_PROVIDER_URL:'https://email.example.invalid/send',AQARI_EMAIL_PROVIDER_TOKEN:'e'.repeat(30),AQARI_EMAIL_FROM:'reports@example.invalid'
 };
 const handler=createOwnerReportDeliveryHandler({fetchImpl,env,now:()=>new Date('2026-09-17T05:00:00Z')});
 const out=res();await handler({method:'GET',headers:{authorization:'Bearer '+env.CRON_SECRET}},out);
 assert.equal(out.code,200);assert.equal(out.body.sent.length,2);assert.equal(out.body.failed.length,0);
 const meta=calls.find(x=>x.href.startsWith('https://graph.facebook.com/'));assert.ok(meta);assert.match(meta.href,/\/v25\.0\/123456789012345\/messages$/);
 const metaBody=JSON.parse(meta.options.body);assert.equal(metaBody.messaging_product,'whatsapp');assert.equal(metaBody.type,'template');assert.equal(metaBody.template.name,'aqari_owner_report_v267');assert.ok(metaBody.template.components[0].parameters.some(x=>String(x.text).includes('د.ك')));
 const email=calls.find(x=>x.href==='https://email.example.invalid/send');assert.ok(email);const emailBody=JSON.parse(email.options.body);assert.match(emailBody.text,/من دفع/);assert.match(emailBody.text,/من لم يسدد بالكامل/);assert.match(emailBody.text,/المتأخرات السابقة/);
 assert.equal(email.options.headers['Idempotency-Key'],'owner-report:11111111-1111-4111-8111-111111111111:email:daily:2026-09-17');
});

test('selected external channel fails closed when its server secret is absent',async()=>{
 const fetchImpl=async(url)=>{
  const href=String(url);
  if(href.includes('aqari_owner_report_delivery_targets_v3'))return response([{target_id:'11111111-1111-4111-8111-111111111111',workspace_id:'22222222-2222-4222-8222-222222222222',owner_name:'مالك',property_ids:['44444444-4444-4444-8444-444444444444'],property_names:['عقار'],channels:['whatsapp'],whatsapp:'+96550000000',report_schedule:'daily',report_hour:8}]);
  if(href.includes('aqari_owner_report_service_v3'))return response({from:'2026-09-17',to:'2026-09-17',properties:[],collection:{},tenants:[],arrears:{},alerts:{},period_activity:{}});
  if(href.includes('aqari_owner_report_delivery_claim'))return response({send:true});
  if(href.includes('aqari_owner_report_delivery_complete'))return response({ok:true});
  throw Error('unexpected');
 };
 const env={AQARI_SUPABASE_SERVICE_ROLE_KEY:'x'.repeat(40),CRON_SECRET:'c'.repeat(32)};
 const out=res();await createOwnerReportDeliveryHandler({fetchImpl,env,now:()=>new Date('2026-09-17T05:00:00Z')})({method:'GET',headers:{authorization:'Bearer '+env.CRON_SECRET}},out);
 assert.equal(out.code,207);assert.equal(out.body.sent.length,0);assert.equal(out.body.failed[0].error,'META_WHATSAPP_NOT_CONFIGURED');
});
