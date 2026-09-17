import {SUPABASE_PUBLIC_CONFIG,validSupabasePublicConfig} from '../lib/release-config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT=/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ROLES=new Set(['general_manager','property_manager','accountant','viewer']);
const ALLOWED_KEYS=new Set(['workspace_id','expected_role','question','current_route','section_context','visible_summary']);
const OPENAI_URL='https://api.openai.com/v1/responses';
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function openAIConfig(env=process.env){
 const key=String(env.OPENAI_API_KEY||'').trim(),model=String(env.OPENAI_MODEL||'gpt-6-astra').trim();
 if(!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)||key.length>8192||!/^[A-Za-z0-9._:-]{2,120}$/.test(model))return null;
 return {key,model};
}
async function readJson(response){const text=await response.text();if(text.length>262144)throw Error('UPSTREAM_TOO_LARGE');try{return JSON.parse(text);}catch{throw Error('UPSTREAM_INVALID_JSON');}}
function responseText(data){
 const direct=clean(data?.output_text,6000);if(direct)return direct;
 const parts=[];for(const item of Array.isArray(data?.output)?data.output:[]){for(const content of Array.isArray(item?.content)?item.content:[]){if(content?.type==='output_text'&&content?.text)parts.push(content.text);}}
 return clean(parts.join('\n'),6000);
}
export function createOwnerAssistantHandler({fetchImpl=globalThis.fetch,env=process.env}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vary','Authorization');
  const fail=(status,code)=>res.status(status).json({error:code});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
  const origin=req.headers?.origin,host=req.headers?.host;if(origin&&origin!=='https://'+host)return fail(403,'ORIGIN_REJECTED');
  const auth=req.headers?.authorization;if(typeof auth!=='string'||auth.length>8192||!JWT.test(auth))return fail(401,'AUTH_REQUIRED');
  let input=req.body;if(typeof input==='string'){if(input.length>16384)return fail(413,'BODY_TOO_LARGE');try{input=JSON.parse(input);}catch{return fail(400,'INVALID_REQUEST');}}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!ALLOWED_KEYS.has(k))||!UUID.test(String(input.workspace_id||''))||!ROLES.has(input.expected_role))return fail(400,'INVALID_REQUEST');
  const question=clean(input.question,1200),route=clean(input.current_route,80);
  const sectionContext=Array.isArray(input.section_context)?input.section_context.slice(0,24).map(v=>clean(v,64)).filter(Boolean):[];
  const visibleSummary=Array.isArray(input.visible_summary)?input.visible_summary.slice(0,12).map(v=>clean(v,180)).filter(Boolean):[];
  if(question.length<2)return fail(400,'QUESTION_REQUIRED');
  if(!validSupabasePublicConfig()||typeof fetchImpl!=='function')return fail(503,'ASSISTANT_UNAVAILABLE');
  const upstream=async(path,body)=>{const response=await fetchImpl(new URL(path,SUPABASE_PUBLIC_CONFIG.url),{method:body?'POST':'GET',headers:{apikey:SUPABASE_PUBLIC_CONFIG.publishableKey,Authorization:auth,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error'});if(!response.ok){const e=Error('ACCESS_CHANGED');e.status=response.status;throw e;}return readJson(response);};
  try{
   const [user,access,status]=await Promise.all([
    upstream('/auth/v1/user'),
    upstream('/rest/v1/rpc/aqari_workspace_access',{p_workspace_id:input.workspace_id}),
    upstream('/rest/v1/rpc/aqari_owner_experience_status',{p_workspace_id:input.workspace_id})
   ]);
   if(!UUID.test(String(user?.id||''))||access?.user_id!==user.id||access?.workspace_id!==input.workspace_id||access?.role!==input.expected_role)return fail(403,'ACCESS_CHANGED');
   if(status?.assistant_enabled!==true)return fail(403,'ASSISTANT_DISABLED');
   const allowed=Object.entries(access.permissions||{}).filter(([,v])=>v?.read===true).map(([k])=>k);
   const requested=sectionContext.filter(section=>allowed.includes(section));
   const provider=openAIConfig(env);if(!provider)return fail(503,'OPENAI_NOT_CONFIGURED');
   const instructions=[
    'أنت المساعد الذكي لمنصة عقاري AQARI V267 لإدارة العقارات في الكويت.',
    'أجب بالعربية ما لم يطلب المستخدم لغة أخرى صراحة.',
    'أنت في وضع قراءة فقط. لا تدّع مطلقًا أنك حفظت أو عدلت أو حذفت أو اعتمدت أو دفعت أو أرسلت أي شيء.',
    'لا تناقش إلا الأقسام التي يملك المستخدم الحالي صلاحية قراءتها. لا تستنتج أو تكشف أقسامًا أو هويات أو بيانات غير موجودة في السياق المصرح.',
    'إذا طلب المستخدم عملية كتابة أو اعتماد، اشرح له الصفحة المناسبة داخل عقاري بدل تنفيذها أو الادعاء بتنفيذها.',
    'تعامل مع الملخصات المرسلة كبيانات عرض مجمعة فقط ولا تخمّن تفاصيل سجلات غير مرسلة.',
    `الدور المصادق: ${access.role}. الأقسام المقروءة المسموحة: ${allowed.join(', ')||'لا يوجد'}. الصفحة الحالية: ${route||'غير محددة'}.`,
    `الأقسام المطلوبة ضمن السياق والمسموحة: ${requested.join(', ')||'لا يوجد'}.`,
    `الملخصات المرئية المصرح بها فقط: ${visibleSummary.join(' | ')||'لا يوجد'}.`
   ].join('\n');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
   try{
    const response=await fetchImpl(OPENAI_URL,{method:'POST',headers:{Authorization:'Bearer '+provider.key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({model:provider.model,instructions,input:[{role:'user',content:[{type:'input_text',text:question}]}],max_output_tokens:700,store:false,text:{verbosity:'low'}}),signal:controller.signal,cache:'no-store',redirect:'error'});
    if(!response.ok)return fail(response.status===429?429:502,response.status===429?'OPENAI_RATE_LIMITED':'OPENAI_FAILED');
    const data=await readJson(response),answer=responseText(data);if(!answer)return fail(502,'OPENAI_INVALID_RESPONSE');
    return res.status(200).json({answer,provider:'openai',model:provider.model,read_only:true,allowed_sections:allowed});
   }finally{clearTimeout(timer);}
  }catch(error){const statusCode=[401,403].includes(error?.status)?403:error?.name==='AbortError'?504:502;return fail(statusCode,statusCode===403?'ACCESS_CHANGED':statusCode===504?'OPENAI_TIMEOUT':'ASSISTANT_UNAVAILABLE');}
 };
}
export default createOwnerAssistantHandler();
