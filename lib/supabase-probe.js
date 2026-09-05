import {
  PRODUCT_VERSION,
  SUPABASE_PUBLIC_CONFIG,
  SUPABASE_PROBE_TIMEOUT_MS,
  SUPABASE_PROBE_TTL_MS
} from './release-config.js';

let cachedProbe = null;
let inFlightProbe = null;

function validPublicConfig(url, publishableKey){
  if(!String(publishableKey || '').startsWith('sb_publishable_')) return false;
  try{
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  }catch(_error){
    return false;
  }
}

function probeEndpoint(url){
  return new URL('/rest/v1/rpc/aqari_runtime_health', url).toString();
}

function result(state, startedAt, finishedAt, extra = {}){
  const verified = state === 'up' || state === 'down';
  return {
    state,
    connected: state === 'up' ? true : state === 'down' ? false : null,
    verified,
    checkedAt: new Date(finishedAt).toISOString(),
    latencyMs: Math.max(0, finishedAt - startedAt),
    ...extra
  };
}

export async function probeSupabase(options = {}){
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = options.url === undefined ? SUPABASE_PUBLIC_CONFIG.url : options.url;
  const publishableKey = options.publishableKey === undefined
    ? SUPABASE_PUBLIC_CONFIG.publishableKey
    : options.publishableKey;
  const timeoutMs = options.timeoutMs ?? SUPABASE_PROBE_TIMEOUT_MS;
  const ttlMs = options.ttlMs ?? SUPABASE_PROBE_TTL_MS;
  const now = options.now || Date.now;
  const cacheKey = `${String(url || '')}\u0000${String(publishableKey || '')}`;
  const currentTime = now();

  if(!validPublicConfig(url, publishableKey)){
    return result('misconfigured', currentTime, currentTime, { reason:'missing_public_config' });
  }
  if(typeof fetchImpl !== 'function'){
    return result('down', currentTime, currentTime, { reason:'fetch_unavailable' });
  }
  if(cachedProbe && cachedProbe.key === cacheKey && cachedProbe.expiresAt > currentTime){
    return cachedProbe.value;
  }
  if(inFlightProbe && inFlightProbe.key === cacheKey) return inFlightProbe.promise;

  const promise = (async () => {
    const startedAt = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let value;

    try{
      const response = await fetchImpl(probeEndpoint(url), {
        method: 'GET',
        headers: {
          apikey: String(publishableKey),
          accept: 'application/json',
          'x-client-info': `aqari-readiness/${PRODUCT_VERSION}`
        },
        redirect: 'error',
        signal: controller.signal
      });
      const finishedAt = now();
      if(response?.ok){
        let healthy = false;
        try{ healthy = (await response.json()) === true; }catch(_error){ }
        value = healthy
          ? result('up', startedAt, finishedAt, { httpStatus:response.status })
          : result('down', startedAt, finishedAt, { reason:'invalid_response', httpStatus:Number(response.status) || null });
      }else{
        const httpStatus = Number(response?.status) || null;
        value = [401,403,404].includes(httpStatus)
          ? result('misconfigured', startedAt, finishedAt, { reason:'health_rpc_unavailable', httpStatus })
          : result('down', startedAt, finishedAt, { reason:'http_error', httpStatus });
      }
    }catch(error){
      const finishedAt = now();
      const timedOut = controller.signal.aborted || error?.name === 'AbortError';
      value = timedOut
        ? result('timeout', startedAt, finishedAt, { reason:'timeout' })
        : result('unreachable', startedAt, finishedAt, { reason:'network_error' });
    }finally{
      clearTimeout(timer);
    }

    cachedProbe = { key:cacheKey, value, expiresAt:now() + ttlMs };
    return value;
  })();

  inFlightProbe = { key:cacheKey, promise };
  try{
    return await promise;
  }finally{
    if(inFlightProbe?.promise === promise) inFlightProbe = null;
  }
}

export function resetSupabaseProbeForTests(){
  cachedProbe = null;
  inFlightProbe = null;
}
