import {createHash} from 'node:crypto';

export const PRODUCTION_CONFIG_FORMAT='AQARI-V267-PRODUCTION-CONFIG-EVIDENCE-1';
const FULL_SHA_RE=/^[0-9a-f]{40}$/;
const SHA256_RE=/^[0-9a-f]{64}$/;
const PROJECT_REF_RE=/^[a-z0-9]{20}$/;
const PUBLISHABLE_KEY_RE=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const PRODUCTION_HOST='myaqari.com';
const PRODUCTION_REDIRECT='https://myaqari.com/login.html?release=V267';
const PREVIEW_PROJECT='ofgmcsmxmdswlovsckqs';
const FORBIDDEN_EVIDENCE_KEYS=['publishableKey','serviceRoleKey','service_role_key','secret','password','token'];

function text(value){return typeof value==='string'?value.trim():''}
function normalizedSha(value){return text(value).toLowerCase()}
function sha256(value){return createHash('sha256').update(Buffer.from(String(value),'utf8')).digest('hex')}
function evidencePresent(value){return Array.isArray(value)&&value.length>0&&value.every((item)=>typeof item==='string'&&item.trim())}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function expectedSupabaseUrl(projectRef){return PROJECT_REF_RE.test(projectRef)?`https://${projectRef}.supabase.co`:''}

export function productionTargetFingerprint(target={}){
  const value=object(target);
  const projectRef=text(value.projectRef);
  const publishableKey=text(value.publishableKey);
  if(!PROJECT_REF_RE.test(projectRef)||!PUBLISHABLE_KEY_RE.test(publishableKey))return '';
  return sha256(JSON.stringify({projectRef,publishableKeySha256:sha256(publishableKey)}));
}

export function productionSupabaseTopologyFingerprint(input={}){
  const value=object(input);
  const projectRef=text(value.projectRef);
  const parentProjectRef=text(value.parentProjectRef);
  const branchName=text(value.branchName);
  if(!PROJECT_REF_RE.test(projectRef)||!PROJECT_REF_RE.test(parentProjectRef))return '';
  if(value.isDefault!==true||parentProjectRef!==projectRef||!branchName)return '';
  return sha256(JSON.stringify({projectRef,parentProjectRef,branchName,isDefault:true}));
}

export function productionRuntimeConfigFingerprint(input={}){
  const value=object(input);
  const projectRef=text(value.projectRef);
  const publishableKeySha256=text(value.publishableKeySha256);
  const supabaseTopologySha256=text(value.supabaseTopologySha256);
  const supabaseUrl=text(value.supabaseUrl);
  const hostname=text(value.hostname);
  const authRedirectUrl=text(value.authRedirectUrl);
  const authStorageKey=text(value.authStorageKey);
  const productVersion=text(value.productVersion);
  const releaseStage=text(value.releaseStage);
  if(!PROJECT_REF_RE.test(projectRef)||!SHA256_RE.test(publishableKeySha256)||!SHA256_RE.test(supabaseTopologySha256))return '';
  if(supabaseUrl!==expectedSupabaseUrl(projectRef))return '';
  if(hostname!==PRODUCTION_HOST||authRedirectUrl!==PRODUCTION_REDIRECT)return '';
  if(authStorageKey!==`sb-${projectRef}-auth-token`)return '';
  if(productVersion!=='V267'||releaseStage!=='production')return '';
  return sha256(JSON.stringify({
    projectRef,
    supabaseUrl,
    hostname,
    authRedirectUrl,
    authStorageKey,
    productVersion,
    releaseStage,
    publishableKeySha256,
    supabaseTopologySha256,
  }));
}

export function validateProductionConfigForCli(input={},expectedCandidateSha=''){
  const errors=[];
  const candidateSha=normalizedSha(expectedCandidateSha);
  if(!FULL_SHA_RE.test(candidateSha))return {ok:false,candidateSha,errors:['expected candidate SHA must be a full 40-character hexadecimal commit SHA']};

  const value=object(input.productionConfig);
  const stageC=object(input.stageCBundle);
  const target=object(input.productionTarget);
  if(value.format!==PRODUCTION_CONFIG_FORMAT)errors.push(`Production configuration format must be exactly ${PRODUCTION_CONFIG_FORMAT}`);
  if(value.correct!==true)errors.push('Production configuration must remain explicitly verified correct');
  if(value.verified!==true)errors.push('Production configuration must be explicitly verified');

  const configSha=normalizedSha(value.candidateSha);
  if(!FULL_SHA_RE.test(configSha))errors.push('Production configuration candidate SHA must be a full 40-character hexadecimal commit SHA');
  else if(configSha!==candidateSha)errors.push('Production configuration evidence is not tied to the exact candidate SHA');

  if(value.targetEnvironment!=='production')errors.push('Production configuration targetEnvironment must be exactly production');
  if(value.productVersion!=='V267')errors.push('Production configuration productVersion must be exactly V267');
  if(value.releaseStage!=='production')errors.push('Production configuration releaseStage must be exactly production');
  if(value.hostname!==PRODUCTION_HOST)errors.push(`Production configuration hostname must be exactly ${PRODUCTION_HOST}`);
  if(value.authRedirectUrl!==PRODUCTION_REDIRECT)errors.push(`Production Auth redirect must be exactly ${PRODUCTION_REDIRECT}`);

  const projectRef=text(value.projectRef);
  if(!PROJECT_REF_RE.test(projectRef))errors.push('Production project reference must be a 20-character lowercase Supabase project reference');
  if(projectRef===PREVIEW_PROJECT)errors.push('Production project must not reuse the Preview/Staging project');
  const sourceProject=text(stageC.source_project_ref);
  const restoreProject=text(stageC.restore_project_ref);
  if(projectRef&&sourceProject&&projectRef===sourceProject)errors.push('Production project must differ from the Stage C source project');
  if(projectRef&&restoreProject&&projectRef===restoreProject)errors.push('Production project must differ from the independent Stage C restore project');

  const expectedUrl=expectedSupabaseUrl(projectRef);
  const supabaseUrl=text(value.supabaseUrl);
  if(!expectedUrl)errors.push('Production Supabase URL cannot be validated without a valid Production project reference');
  else if(supabaseUrl!==expectedUrl)errors.push('Production Supabase URL must match the exact Production project reference');

  const topology=object(value.supabaseTopology);
  const topologyProjectRef=text(topology.projectRef);
  const topologyParentProjectRef=text(topology.parentProjectRef);
  const topologyBranchName=text(topology.branchName);
  if(topologyProjectRef!==projectRef)errors.push('Production Supabase topology projectRef must match the exact Production project reference');
  if(topologyParentProjectRef!==projectRef)errors.push('Production Supabase project must be the default project, not a development/preview branch');
  if(topology.isDefault!==true)errors.push('Production Supabase project must be verified as the default branch');
  if(!topologyBranchName)errors.push('Production Supabase topology branch name is required');
  if(!evidencePresent(value.supabaseTopologyEvidence))errors.push('Production Supabase topology evidence references are required');
  const expectedTopologyDigest=productionSupabaseTopologyFingerprint(topology);
  if(!SHA256_RE.test(String(value.supabaseTopologySha256||'')))errors.push('Production Supabase topology fingerprint must be SHA-256');
  else if(expectedTopologyDigest&&value.supabaseTopologySha256!==expectedTopologyDigest)errors.push('Production Supabase topology fingerprint does not match the verified default project');

  const targetRef=text(target.projectRef);
  const publishableKey=text(target.publishableKey);
  if(!PROJECT_REF_RE.test(targetRef))errors.push('Repository production target projectRef is invalid');
  else if(projectRef&&targetRef!==projectRef)errors.push('Production evidence projectRef does not match config/production-target.json');
  if(!PUBLISHABLE_KEY_RE.test(publishableKey))errors.push('Repository production target publishable key is invalid');

  const expectedKeyDigest=PUBLISHABLE_KEY_RE.test(publishableKey)?sha256(publishableKey):'';
  if(!SHA256_RE.test(String(value.publishableKeySha256||'')))errors.push('Production publishable-key fingerprint must be SHA-256');
  else if(expectedKeyDigest&&value.publishableKeySha256!==expectedKeyDigest)errors.push('Production publishable-key fingerprint does not match config/production-target.json');

  const expectedTargetDigest=productionTargetFingerprint(target);
  if(!SHA256_RE.test(String(value.targetConfigSha256||'')))errors.push('Production target configuration fingerprint must be SHA-256');
  else if(expectedTargetDigest&&value.targetConfigSha256!==expectedTargetDigest)errors.push('Production target configuration fingerprint does not match config/production-target.json');

  if(value.authStorageKey!==`sb-${projectRef}-auth-token`)errors.push('Production Auth storage key must be scoped to the exact Production project');

  const expectedRuntimeDigest=productionRuntimeConfigFingerprint({
    projectRef,
    supabaseUrl:expectedUrl,
    hostname:PRODUCTION_HOST,
    authRedirectUrl:PRODUCTION_REDIRECT,
    authStorageKey:`sb-${projectRef}-auth-token`,
    productVersion:'V267',
    releaseStage:'production',
    publishableKeySha256:expectedKeyDigest,
    supabaseTopologySha256:expectedTopologyDigest,
  });
  if(!SHA256_RE.test(String(value.runtimeConfigSha256||'')))errors.push('Production runtime configuration fingerprint must be SHA-256');
  else if(expectedRuntimeDigest&&value.runtimeConfigSha256!==expectedRuntimeDigest)errors.push('Production runtime configuration fingerprint does not match the exact Production project/domain/Auth/topology configuration');

  if(!evidencePresent(value.evidence))errors.push('Production configuration evidence references are required');
  const verifiedAt=Date.parse(text(value.verifiedAt));
  if(!Number.isFinite(verifiedAt))errors.push('Production configuration verifiedAt must be a valid ISO-8601 date/time');
  for(const key of FORBIDDEN_EVIDENCE_KEYS){if(Object.prototype.hasOwnProperty.call(value,key))errors.push(`Production configuration evidence must not contain raw ${key}`)}

  return {ok:errors.length===0,candidateSha,projectRef,errors};
}
