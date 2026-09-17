import {createHash} from 'node:crypto';

export const STAGE_C_BUNDLE_FORMAT='AQARI-V267-STAGE-C-EVIDENCE-1';
const FULL_SHA_RE=/^[0-9a-f]{40}$/;
const SHA256_RE=/^[0-9a-f]{64}$/;
const PROJECT_REF_RE=/^[a-z0-9][a-z0-9_-]{2,127}$/;
const REQUIRED_DIGESTS=['backup_set','backup_storage_bytes','independent_restore','rollback_rehearsal','physical_devices'];
const DEVICE_CLASSES=['desktop','iphone','ipad'];
const REQUIRED_FLOWS=['login','session','save','reopen','permissions','contracts','printing'];

function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}

function normalizedSha(value){return String(value||'').trim().toLowerCase()}
function text(value){return typeof value==='string'?value.trim():''}
function evidencePresent(value){return Array.isArray(value)&&value.length>0&&value.every((item)=>typeof item==='string'&&item.trim())}
function nonNegativeInt(value){return Number.isInteger(value)&&value>=0}

export function stageCBundleSha256(payload={}){
  const copy={...(payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{})};
  delete copy.bundle_sha256;
  return createHash('sha256').update(Buffer.from(canonical(copy),'utf8')).digest('hex');
}

export function validateStageCReleaseBundle(bundle={},expectedCandidateSha=''){
  const errors=[];
  const candidateSha=normalizedSha(expectedCandidateSha);
  if(!FULL_SHA_RE.test(candidateSha))return {ok:false,candidateSha,errors:['expected candidate SHA must be a full 40-character hexadecimal commit SHA']};
  const value=bundle&&typeof bundle==='object'&&!Array.isArray(bundle)?bundle:{};
  if(value.format!==STAGE_C_BUNDLE_FORMAT)errors.push(`Stage C bundle format must be exactly ${STAGE_C_BUNDLE_FORMAT}`);
  if(value.accepted!==true)errors.push('Stage C bundle must be explicitly accepted');
  const bundleSha=normalizedSha(value.candidate_sha);
  if(!FULL_SHA_RE.test(bundleSha))errors.push('Stage C bundle candidate SHA must be a full 40-character hexadecimal commit SHA');
  else if(bundleSha!==candidateSha)errors.push('Stage C bundle is not tied to the exact candidate SHA');

  const source=text(value.source_project_ref);
  const restored=text(value.restore_project_ref);
  if(!PROJECT_REF_RE.test(source))errors.push('Stage C source project reference is invalid');
  if(!PROJECT_REF_RE.test(restored))errors.push('Stage C restore project reference is invalid');
  if(source&&restored&&source===restored)errors.push('Stage C independent restore project must differ from the source project');

  const digests=value.evidence_sha256&&typeof value.evidence_sha256==='object'&&!Array.isArray(value.evidence_sha256)?value.evidence_sha256:{};
  const digestKeys=Object.keys(digests).sort();
  if(JSON.stringify(digestKeys)!==JSON.stringify([...REQUIRED_DIGESTS].sort()))errors.push('Stage C evidence digest set is incomplete');
  for(const key of REQUIRED_DIGESTS){if(!SHA256_RE.test(String(digests[key]||'')))errors.push(`Stage C ${key} digest must be SHA-256`)}

  const storage=value.storage&&typeof value.storage==='object'&&!Array.isArray(value.storage)?value.storage:{};
  if(!nonNegativeInt(storage.object_count))errors.push('Stage C Storage object count must be a non-negative integer');
  if(!nonNegativeInt(storage.total_bytes))errors.push('Stage C Storage total bytes must be a non-negative integer');
  if(!SHA256_RE.test(String(storage.manifest_sha256||'')))errors.push('Stage C Storage manifest digest must be SHA-256');

  const rollback=value.rollback&&typeof value.rollback==='object'&&!Array.isArray(value.rollback)?value.rollback:{};
  for(const key of ['checkpoint_record_count','new_record_count','after_record_count']){
    if(!nonNegativeInt(rollback[key]))errors.push(`Stage C rollback ${key} must be a non-negative integer`);
  }
  if(nonNegativeInt(rollback.checkpoint_record_count)&&nonNegativeInt(rollback.new_record_count)&&nonNegativeInt(rollback.after_record_count)&&rollback.after_record_count!==rollback.checkpoint_record_count+rollback.new_record_count){
    errors.push('Stage C rollback must preserve checkpoint plus new transactions');
  }

  const devices=value.devices&&typeof value.devices==='object'&&!Array.isArray(value.devices)?value.devices:{};
  if(JSON.stringify(Object.keys(devices).sort())!==JSON.stringify([...DEVICE_CLASSES].sort()))errors.push('Stage C device evidence must contain exactly desktop, iphone and ipad');
  const instances=new Set();
  for(const deviceClass of DEVICE_CLASSES){
    const row=devices[deviceClass]&&typeof devices[deviceClass]==='object'&&!Array.isArray(devices[deviceClass])?devices[deviceClass]:{};
    if(row.accepted!==true)errors.push(`Stage C ${deviceClass} acceptance must be true`);
    if(row.real_account!==true)errors.push(`Stage C ${deviceClass} must use a real authenticated account`);
    if(row.simulated!==false||row.emulated!==false||row.physical!==true)errors.push(`Stage C ${deviceClass} evidence must be physical, non-simulated and non-emulated`);
    const rowSha=normalizedSha(row.candidate_sha);
    if(!FULL_SHA_RE.test(rowSha)||rowSha!==candidateSha)errors.push(`Stage C ${deviceClass} evidence is not tied to the exact candidate SHA`);
    const instance=text(row.device_instance),browser=text(row.browser);
    if(!instance)errors.push(`Stage C ${deviceClass} physical device instance is required`);
    else if(instances.has(instance))errors.push('Stage C physical device instances must be distinct');
    else instances.add(instance);
    if(!browser)errors.push(`Stage C ${deviceClass} browser is required`);
    const flows=row.flows&&typeof row.flows==='object'&&!Array.isArray(row.flows)?row.flows:{};
    if(JSON.stringify(Object.keys(flows).sort())!==JSON.stringify([...REQUIRED_FLOWS].sort())||REQUIRED_FLOWS.some((flow)=>flows[flow]!==true))errors.push(`Stage C ${deviceClass} must pass every required practical flow`);
    if(!evidencePresent(row.evidence))errors.push(`Stage C ${deviceClass} evidence references are required`);
  }

  const digest=String(value.bundle_sha256||'').trim().toLowerCase();
  if(!SHA256_RE.test(digest))errors.push('Stage C bundle_sha256 must be a lowercase SHA-256 digest');
  else if(digest!==stageCBundleSha256(value))errors.push('Stage C bundle_sha256 does not match the canonical evidence bundle');

  return {ok:errors.length===0,candidateSha,errors};
}
