import { SUPABASE_PUBLIC_CONFIG, validSupabasePublicConfig } from '../lib/release-config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['general_manager','property_manager','accountant','viewer']);
const KEYS = new Set(['p_workspace_id','p_expected_role','p_include_payload','traceCode']);

// Confirm only the caller's own access, using the same JWT and public key.
// No service-role credentials, payload reads, cookies, writes or shared cache.
export function createConfirmationHandler({fetchImpl = globalThis.fetch, timeoutMs = 8000, log = console.info} = {}){
  return async function handler(req, res){
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('CDN-Cache-Control','no-store');
    res.setHeader('Vercel-CDN-Cache-Control','no-store');
    res.setHeader('Vary','Authorization');
    const fail = (status, code) => res.status(status).json({error:code});
    if(req.method !== 'POST'){res.setHeader('Allow','POST');return fail(405,'METHOD_NOT_ALLOWED');}
    const origin = req.headers?.origin;
    const host = req.headers?.host;
    if(origin && origin !== 'https://' + host) return fail(403,'ORIGIN_REJECTED');
    const auth = req.headers?.authorization;
    if(typeof auth !== 'string' || auth.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)){
      return fail(401,'AUTH_REQUIRED');
    }
    let input = req.body;
    if(typeof input === 'string'){
      if(input.length > 1024) return fail(413,'BODY_TOO_LARGE');
      try{input=JSON.parse(input);}catch{return fail(400,'INVALID_REQUEST');}
    }
    if(!input || typeof input !== 'object' || Array.isArray(input) ||
       Object.keys(input).some(key=>!KEYS.has(key)) || typeof input.p_workspace_id !== 'string' || !UUID.test(input.p_workspace_id) ||
       !ROLES.has(input.p_expected_role) || input.p_include_payload !== false ||
       (input.traceCode !== undefined && (typeof input.traceCode !== 'string' || !/^AQ-[A-F0-9]{8}$/.test(input.traceCode)))){
      return fail(400,'INVALID_REQUEST');
    }
    if(!validSupabasePublicConfig() || typeof fetchImpl !== 'function') return fail(503,'CONFIRMATION_UNAVAILABLE');
    const started=Date.now(), controller=new AbortController();
    const traceCode=input.traceCode || 'unlinked';
    // Fixed, allowlisted metadata only. Never log headers, users or body text.
    const record=outcome=>{try{log('AQARI_ACCESS_CONFIRMATION',JSON.stringify({traceCode,outcome,elapsedMs:Math.min(120000,Date.now()-started)}));}catch{}};
    let timer;
    const upstream=async (path,body)=>{
      const response=await fetchImpl(new URL(path,SUPABASE_PUBLIC_CONFIG.url),{
        method:body ? 'POST' : 'GET',
        headers:{apikey:SUPABASE_PUBLIC_CONFIG.publishableKey,Authorization:auth,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
        body:body ? JSON.stringify(body) : undefined,
        signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'
      });
      if(!response.ok){const error=new Error('UPSTREAM_DENIED');error.status=[401,403].includes(response.status)?response.status:502;throw error;}
      return response.json();
    };
    record('started');
    try{
      const work=Promise.all([
        upstream('/auth/v1/user'),
        upstream('/rest/v1/rpc/aqari_startup_snapshot_v266',{
          p_workspace_id:input.p_workspace_id,p_expected_role:input.p_expected_role,p_include_payload:false
        })
      ]);
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
        const error=new Error('CONFIRMATION_TIMEOUT');error.status=504;reject(error);controller.abort();
      },timeoutMs);});
      const [user,confirmation]=await Promise.race([work,deadline]);
      const member=confirmation?.membership;
      if(typeof user?.id !== 'string' || !UUID.test(user.id) || confirmation?.user_id !== user.id ||
         member?.user_id !== user.id || member?.workspace_id !== input.p_workspace_id ||
         member?.role !== input.p_expected_role || member?.is_active !== true ||
         confirmation?.workspace?.id !== input.p_workspace_id || confirmation?.profile?.user_id !== user.id ||
         confirmation?.app_state != null){
        record('denied');return fail(403,'ACCESS_CHANGED');
      }
      record('confirmed');
      return res.status(200).json({user:{id:user.id},confirmation});
    }catch(error){
      const status=[401,403,504].includes(error?.status)?error.status:502;
      record(status===504?'timeout':status===401||status===403?'denied':'unavailable');
      return fail(status,status===504?'CONFIRMATION_TIMEOUT':status===401||status===403?'ACCESS_CHANGED':'CONFIRMATION_UNAVAILABLE');
    }finally{clearTimeout(timer);controller.abort();}
  };
}
export default createConfirmationHandler();
