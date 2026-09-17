import {SUPABASE_PUBLIC_CONFIG,validSupabasePublicConfig} from '../lib/release-config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function serviceConfig(env=process.env){
 const key=String(env.AQARI_SUPABASE_SERVICE_ROLE_KEY||''),cron=String(env.AQARI_OWNER_REPORT_CRON_SECRET||''),provider=String(env.AQARI_NOTIFICATION_PROVIDER_URL||''),token=String(env.AQARI_NOTIFICATION_PROVIDER_TOKEN||'');
 if(key.length<32||key.length>8192||cron.length<24||cron.length>512||token.length<12||token.length>8192)return null;
 try{const url=new URL(provider);if(url.protocol!=='https:'||url.username||url.password||url.hash||['localhost','127.0.0.1','::1'].includes(url.hostname))return null;return {key,cron,url:url.toString(),token};}catch{return null;}
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
async function json(response){const text=await response.text();if(text.length>262144)throw Error('RESPONSE_TOO_LARGE');return text?JSON.parse(text):null;}
export function createOwnerReportDeliveryHandler({fetchImpl=globalThis.fetch,env=process.env,now=()=>new Date()}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');const fail=(status,code)=>res.status(status).json({error:code});
  if(!['POST','GET'].includes(req.method)){res.setHeader('Allow','GET, POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const cfg=serviceConfig(env);if(!cfg||!validSupabasePublicConfig()||typeof fetchImpl!=='function')return fail(503,'OWNER_REPORT_DELIVERY_NOT_CONFIGURED');
  if(req.headers?.authorization!==`Bearer ${cfg.cron}`)return fail(401,'CRON_AUTH_REQUIRED');
  const sb=async(path,body)=>{const response=await fetchImpl(new URL(path,SUPABASE_PUBLIC_CONFIG.url),{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body||{}),cache:'no-store',redirect:'error'});if(!response.ok)throw Error('SUPABASE_SERVICE_FAILED');return json(response);};
  try{
   const settings=await sb('/rest/v1/rpc/aqari_owner_report_delivery_settings',{}),parts=kuwaitParts(now()),sent=[];
   for(const setting of Array.isArray(settings)?settings:[]){
    if(!UUID.test(String(setting.workspace_id||''))||!due(setting,parts))continue;
    const from=startFor(setting.report_schedule,parts.iso),snapshot=await sb('/rest/v1/rpc/aqari_owner_report_service',{p_workspace_id:setting.workspace_id,p_from:from,p_to:parts.iso});
    const idempotency=`owner-report:${setting.workspace_id}:${setting.report_schedule}:${parts.iso}`;
    const response=await fetchImpl(cfg.url,{method:'POST',headers:{Authorization:'Bearer '+cfg.token,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({channel:setting.report_channel,recipient:setting.report_recipient,template:'aqari_owner_report_v267',locale:'ar-KW',report:snapshot}),cache:'no-store',redirect:'error'});
    if(!response.ok)throw Error('NOTIFICATION_PROVIDER_FAILED');sent.push({workspace_id:setting.workspace_id,channel:setting.report_channel,period:{from,to:parts.iso}});
   }
   return res.status(200).json({ok:true,checked_at:parts.iso,sent});
  }catch{return fail(502,'OWNER_REPORT_DELIVERY_FAILED');}
 };
}
export default createOwnerReportDeliveryHandler();
