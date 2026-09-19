import {SUPABASE_PUBLIC_CONFIG,validSupabasePublicConfig} from '../lib/release-config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH_VERSION=/^v\d+\.\d+$/;
const PHONE_ID=/^\d{5,40}$/;
const TEMPLATE=/^[a-z0-9_]{1,512}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseConfig(env=process.env){
 const key=String(env.AQARI_SUPABASE_SECRET_KEY||env.AQARI_SUPABASE_SERVICE_ROLE_KEY||''),cron=String(env.CRON_SECRET||env.AQARI_OWNER_REPORT_CRON_SECRET||'');
 if(key.length<32||key.length>8192||cron.length<24||cron.length>512)return null;
 return {key,cron};
}
function metaConfig(env=process.env){
 const token=String(env.META_WHATSAPP_ACCESS_TOKEN||''),phone=String(env.META_WHATSAPP_PHONE_NUMBER_ID||''),version=String(env.META_WHATSAPP_GRAPH_VERSION||''),template=String(env.META_WHATSAPP_TEMPLATE_NAME||'aqari_owner_report_v267'),language=String(env.META_WHATSAPP_TEMPLATE_LANGUAGE||'ar');
 if(token.length<32||token.length>8192||!PHONE_ID.test(phone)||!GRAPH_VERSION.test(version)||!TEMPLATE.test(template)||!/^[A-Za-z_-]{2,20}$/.test(language))return null;
 return {token,phone,version,template,language};
}
function emailConfig(env=process.env){
 const raw=String(env.AQARI_EMAIL_PROVIDER_URL||''),token=String(env.AQARI_EMAIL_PROVIDER_TOKEN||''),from=String(env.AQARI_EMAIL_FROM||'').trim();
 if(token.length<12||token.length>8192||!EMAIL.test(from))return null;
 try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.hash||['localhost','127.0.0.1','::1'].includes(url.hostname))return null;return {url:url.toString(),token,from};}catch{return null;}
}
function kuwaitParts(date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {...parts,iso:`${parts.year}-${parts.month}-${parts.day}`};
}
function due(setting,parts){
 if(Number(setting.report_hour)!==Number(parts.hour))return false;
 if(setting.report_schedule==='daily')return true;
 if(setting.report_schedule==='weekly')return parts.weekday==='Sun';
 if(setting.report_schedule==='monthly')return parts.day==='01';
 return false;
}
function startFor(schedule,iso){const date=new Date(iso+'T00:00:00Z');if(schedule==='daily')return iso;if(schedule==='weekly'){date.setUTCDate(date.getUTCDate()-6);return date.toISOString().slice(0,10);}date.setUTCDate(1);return date.toISOString().slice(0,10);}
async function json(response){const text=await response.text();if(text.length>524288)throw Error('RESPONSE_TOO_LARGE');return text?JSON.parse(text):null;}
const money=value=>Number(value||0).toLocaleString('ar-KW',{minimumFractionDigits:3,maximumFractionDigits:3})+' د.ك';
const compact=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const listNames=(rows,state)=>rows.filter(x=>x.state===state).slice(0,12).map(x=>`${compact(x.tenant_name,80)} (${compact(x.unit_no,30)})`).join('، ')||'لا يوجد';
function reportText(setting,snapshot){
 const c=snapshot?.collection||{},alerts=snapshot?.alerts||{},period=snapshot?.period_activity||{};
 const props=(snapshot?.properties||[]).map(x=>x.name).join('، ')||'العقارات المحددة';
 const paid=listNames(snapshot?.tenants||[],'paid'),unpaid=[...snapshot?.tenants||[]].filter(x=>x.state!=='paid').slice(0,12).map(x=>`${compact(x.tenant_name,80)} (${compact(x.unit_no,30)}) — متبقي ${money(x.remaining)}`).join('، ')||'لا يوجد';
 return `تقرير عقاري للمالك: ${compact(setting.owner_name,120)}
العقارات: ${props}
الفترة: ${snapshot.from} إلى ${snapshot.to}
استحقاق الشهر: ${money(c.due)}
المحصل: ${money(c.collected)}
المتبقي: ${money(c.remaining)}
المتأخرات السابقة: ${money(snapshot?.arrears?.remaining)}
من دفع: ${paid}
من لم يسدد بالكامل: ${unpaid}
تنبيهات: عقود تنتهي خلال 30 يوم ${Number(alerts.leases_expiring_30||0)}، صيانة مفتوحة ${Number(alerts.maintenance_open||0)}، حالات غير مسددة ${Number(alerts.unpaid_current||0)}
حركة الفترة: تحصيلات ${money(period.collections)}، مصروفات معتمدة ${money(period.approved_expenses)}، صافي ${money(period.net)}.`;
}
function metaParameters(setting,snapshot){
 const c=snapshot?.collection||{},alerts=snapshot?.alerts||{};
 const props=(snapshot?.properties||[]).map(x=>x.name).join('، ')||'العقارات المحددة';
 const paid=listNames(snapshot?.tenants||[],'paid'),unpaid=[...snapshot?.tenants||[]].filter(x=>x.state!=='paid').slice(0,8).map(x=>`${compact(x.tenant_name,60)} (${compact(x.unit_no,24)})`).join('، ')||'لا يوجد';
 return [
  compact(setting.owner_name,120),compact(props,500),`${snapshot.from} — ${snapshot.to}`,
  money(c.due),money(c.collected),money(c.remaining),money(snapshot?.arrears?.remaining),
  paid,unpaid,`عقود 30 يوم: ${Number(alerts.leases_expiring_30||0)} | صيانة: ${Number(alerts.maintenance_open||0)}`
 ].map(text=>({type:'text',text:compact(text,1000)}));
}
async function sendMeta(fetchImpl,cfg,setting,snapshot){
 const to=String(setting.whatsapp||'').replace(/\D/g,'');if(to.length<8||to.length>20)throw Error('INVALID_WHATSAPP_RECIPIENT');
 const url=`https://graph.facebook.com/${cfg.version}/${cfg.phone}/messages`;
 const response=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:cfg.template,language:{code:cfg.language},components:[{type:'body',parameters:metaParameters(setting,snapshot)}]}}),cache:'no-store',redirect:'error'});
 const data=await json(response);if(!response.ok||!data?.messages?.[0]?.id)throw Error('META_WHATSAPP_FAILED');return data.messages[0].id;
}
async function sendEmail(fetchImpl,cfg,setting,snapshot,idempotency){
 if(!EMAIL.test(String(setting.email||'')))throw Error('INVALID_EMAIL_RECIPIENT');
 const text=reportText(setting,snapshot);
 const response=await fetchImpl(cfg.url,{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json',Accept:'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from:cfg.from,to:setting.email,subject:`تقرير عقاري — ${setting.owner_name}`,text,html:`<div dir="rtl"><pre style="font-family:inherit;white-space:pre-wrap">${text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre></div>`}),cache:'no-store',redirect:'error'});
 if(!response.ok)throw Error('EMAIL_PROVIDER_FAILED');const data=await json(response);return compact(data?.id||data?.message_id||'accepted',200);
}
export function createOwnerReportDeliveryHandler({fetchImpl=globalThis.fetch,env=process.env,now=()=>new Date()}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');const fail=(status,code)=>res.status(status).json({error:code});
  if(!['POST','GET'].includes(req.method)){res.setHeader('Allow','GET, POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const base=baseConfig(env);if(!base||!validSupabasePublicConfig()||typeof fetchImpl!=='function')return res.status(200).json({ok:true,configured:false,status:'not_configured',checked_at:kuwaitParts(now()).iso,sent:[],failed:[]});
  if(req.headers?.authorization!==`Bearer ${base.cron}`)return fail(401,'CRON_AUTH_REQUIRED');
  const sb=async(path,body)=>{const headers={apikey:base.key,'Content-Type':'application/json',Accept:'application/json'};if(!base.key.startsWith('sb_secret_'))headers.Authorization='Bearer '+base.key;const response=await fetchImpl(new URL(path,SUPABASE_PUBLIC_CONFIG.url),{method:'POST',headers,body:JSON.stringify(body||{}),cache:'no-store',redirect:'error'});if(!response.ok)throw Error('SUPABASE_SERVICE_FAILED');return json(response);};
  try{
   const settings=await sb('/rest/v1/rpc/aqari_owner_report_delivery_targets_v3',{}),parts=kuwaitParts(now()),sent=[],failed=[],meta=metaConfig(env),email=emailConfig(env);
   for(const setting of Array.isArray(settings)?settings:[]){
    if(!UUID.test(String(setting.workspace_id||''))||!UUID.test(String(setting.target_id||''))||!due(setting,parts)||!Array.isArray(setting.property_ids)||!setting.property_ids.length)continue;
    const from=startFor(setting.report_schedule,parts.iso),snapshot=await sb('/rest/v1/rpc/aqari_owner_report_service_v3',{p_workspace_id:setting.workspace_id,p_property_ids:setting.property_ids,p_from:from,p_to:parts.iso});
    for(const channel of Array.isArray(setting.channels)?setting.channels:[]){
     if(!['whatsapp','email'].includes(channel))continue;
     const dispatchKey=`${setting.report_schedule}:${parts.iso}`,claim=await sb('/rest/v1/rpc/aqari_owner_report_delivery_claim',{p_target_id:setting.target_id,p_channel:channel,p_dispatch_key:dispatchKey});
     if(claim?.send!==true)continue;
     const idempotency=`owner-report:${setting.target_id}:${channel}:${dispatchKey}`;
     try{
      let providerId;
      if(channel==='whatsapp'){if(!meta)throw Error('META_WHATSAPP_NOT_CONFIGURED');providerId=await sendMeta(fetchImpl,meta,setting,snapshot);}
      else{if(!email)throw Error('EMAIL_NOT_CONFIGURED');providerId=await sendEmail(fetchImpl,email,setting,snapshot,idempotency);}
      await sb('/rest/v1/rpc/aqari_owner_report_delivery_complete',{p_target_id:setting.target_id,p_channel:channel,p_dispatch_key:dispatchKey,p_success:true,p_provider_id:providerId,p_error_code:null});
      sent.push({target_id:setting.target_id,channel,property_ids:setting.property_ids,period:{from,to:parts.iso}});
     }catch(error){
      const code=compact(error?.message||'DELIVERY_FAILED',120);
      await sb('/rest/v1/rpc/aqari_owner_report_delivery_complete',{p_target_id:setting.target_id,p_channel:channel,p_dispatch_key:dispatchKey,p_success:false,p_provider_id:null,p_error_code:code});
      failed.push({target_id:setting.target_id,channel,error:code});
     }
    }
   }
   return res.status(failed.length?207:200).json({ok:failed.length===0,checked_at:parts.iso,sent,failed});
  }catch{return fail(502,'OWNER_REPORT_DELIVERY_FAILED');}
 };
}
export default createOwnerReportDeliveryHandler();
