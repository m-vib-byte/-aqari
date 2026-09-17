import {SUPABASE_PUBLIC_CONFIG,validSupabasePublicConfig} from '../lib/release-config.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT=/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const ROLES=new Set(['general_manager','property_manager','accountant','viewer']);
const ALLOWED_KEYS=new Set(['workspace_id','expected_role','question','current_route','section_context','visible_summary']);
const clean=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function providerConfig(env=process.env){
 const raw=String(env.AQARI_AI_PROVIDER_URL||'').trim(),token=String(env.AQARI_AI_PROVIDER_TOKEN||''),model=String(env.AQARI_AI_MODEL||'').trim();
 if(!raw||token.length<12||token.length>8192||!model||model.length>120)return null;
 try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.hash||['localhost','127.0.0.1','::1'].includes(url.hostname))return null;return {url:url.toString(),token,model};}catch{return null;}
}
async function readJson(response){const text=await response.text();if(text.length>131072)throw Error('UPSTREAM_TOO_LARGE');try{return JSON.parse(text);}catch{throw Error('UPSTREAM_INVALID_JSON');}}
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
   if(!UUID.test(String(user?.id||''))||access?.user_id!==user.id||access?.workspace_id!==input.workspace_id||access?.role!==input.expected_role||status?.assistant_enabled!==true)return fail(status?.assistant_enabled===false?403:401,status?.assistant_enabled===false?'ASSISTANT_DISABLED':'ACCESS_CHANGED');
   const allowed=Object.entries(access.permissions||{}).filter(([,v])=>v?.read===true).map(([k])=>k);
   const requested=sectionContext.filter(section=>allowed.includes(section));
   const provider=providerConfig(env);if(!provider)return fail(503,'AI_PROVIDER_NOT_CONFIGURED');
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
   try{
    const system=[
     'You are AQARI V267 assistant inside a Kuwait property-management platform.',
     'Reply in Arabic unless the user explicitly asks for another language.',
     'You are read-only: never claim that you saved, approved, deleted, paid, sent, or changed anything.',
     'Only discuss sections the authenticated user is allowed to read. Never infer or expose hidden sections or private identities.',
     'If a request needs a write action, explain the exact in-app section the user should open instead of pretending to execute it.',
     `Authenticated role: ${access.role}. Allowed sections: ${allowed.join(', ')||'none'}. Current route: ${route||'unknown'}.`,
     `Requested visible sections: ${requested.join(', ')||'none'}.`,
     `Visible aggregate summaries only: ${visibleSummary.join(' | ')||'none'}.`
    ].join('\n');
    const response=await fetchImpl(provider.url,{method:'POST',headers:{Authorization:'Bearer '+provider.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({model:provider.model,messages:[{role:'system',content:system},{role:'user',content:question}],temperature:0.2,max_tokens:700}),signal:controller.signal,cache:'no-store',redirect:'error'});
    if(!response.ok)return fail(502,'AI_PROVIDER_FAILED');const data=await readJson(response);
    const answer=clean(data?.output_text??data?.text??data?.choices?.[0]?.message?.content,5000);if(!answer)return fail(502,'AI_PROVIDER_INVALID_RESPONSE');
    return res.status(200).json({answer,read_only:true,allowed_sections:allowed});
   }finally{clearTimeout(timer);}
  }catch(error){const status=[401,403].includes(error?.status)?403:error?.name==='AbortError'?504:502;return fail(status,status===403?'ACCESS_CHANGED':status===504?'AI_PROVIDER_TIMEOUT':'ASSISTANT_UNAVAILABLE');}
 };
}
export default createOwnerAssistantHandler();
