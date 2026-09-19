export const API_CONTRACT_VERSION = 'V198';
export const PRODUCT_VERSION = 'V267';
export const RELEASE_STAGE = 'preview';
export const RELEASE_PATCH = 'premium-workspace';

export const SUPABASE_PUBLIC_CONFIG = Object.freeze({
  url: 'https://ofgmcsmxmdswlovsckqs.supabase.co',
  publishableKey: 'sb_publishable_eX12btKoKuLYSGiEWTFv5A_781Wyx7z'
});

export const SUPABASE_PROBE_TIMEOUT_MS = 2500;
export const SUPABASE_PROBE_TTL_MS = 60_000;
export const CDN_STATUS_CACHE_SECONDS = 60;

export function validSupabasePublicConfig(config = SUPABASE_PUBLIC_CONFIG){
  if(!String(config.publishableKey || '').startsWith('sb_publishable_')) return false;
  try{
    const url = new URL(config.url);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  }catch(_error){
    return false;
  }
}

export function releaseIdentity(){
  return {
    version: API_CONTRACT_VERSION,
    apiContractVersion: API_CONTRACT_VERSION,
    productVersion: PRODUCT_VERSION,
    releaseStage: RELEASE_STAGE
  };
}

export function deploymentMetadata(){
  return {
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    url: process.env.VERCEL_URL || null,
    region: process.env.VERCEL_REGION || null,
    builtAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT || null
  };
}

export function publicConfigurationStatus(){
  const configured = {
    SUPABASE_PUBLIC_URL: validSupabasePublicConfig(SUPABASE_PUBLIC_CONFIG),
    SUPABASE_PUBLISHABLE_KEY: String(SUPABASE_PUBLIC_CONFIG.publishableKey || '').startsWith('sb_publishable_')
  };
  const present = Object.values(configured).filter(Boolean).length;
  const required = Object.keys(configured).length;
  return {
    configured,
    summary: { present, required, ready: present === required }
  };
}

export function shouldProbeSupabase(){
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
}

export function unverifiedSupabaseConnection(){
  return {
    state: 'not_checked',
    connected: null,
    verified: false,
    checkedAt: null,
    latencyMs: null
  };
}

export function deploymentIdentityStatus(){
  const deployment = deploymentMetadata();
  const required = deployment.environment === 'production' || deployment.environment === 'preview';
  const expectedReleaseStage = deployment.environment === 'production'
    ? 'production'
    : deployment.environment === 'preview'
      ? 'preview'
      : null;
  const identityReady = !required || Boolean(deployment.gitSha && deployment.url);
  const releaseStageMatches = !required || RELEASE_STAGE === expectedReleaseStage;
  const ready = identityReady && releaseStageMatches;
  return {
    required,
    ready,
    identityReady,
    releaseStageMatches,
    expectedReleaseStage,
    actualReleaseStage: RELEASE_STAGE,
    deployment
  };
}

export function setOperationalCache(res){
  const value = `public, s-maxage=${CDN_STATUS_CACHE_SECONDS}`;
  // Browsers retain the no-store contract from beginReadOnly. These dedicated
  // headers allow the Vercel/shared CDN to absorb repeated public status calls.
  res.setHeader('CDN-Cache-Control', value);
  res.setHeader('Vercel-CDN-Cache-Control', value);
}
