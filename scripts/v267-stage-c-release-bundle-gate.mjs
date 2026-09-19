import {createHash} from 'node:crypto';

export const STAGE_C_BUNDLE_FORMAT='AQARI-V267-STAGE-C-EVIDENCE-1';
const BACKUP_FORMAT='AQARI-V267-BACKUP-SET-MANIFEST-1';
const STORAGE_FORMAT='AQARI-V267-STORAGE-BYTE-MANIFEST-1';
const RESTORE_FORMAT='AQARI-V267-RESTORE-EQUIVALENCE-1';
const ROLLBACK_FORMAT='AQARI-V267-ROLLBACK-REHEARSAL-1';
const FULL_SHA_RE=/^[0-9a-f]{40}$/;
const SHA256_RE=/^[0-9a-f]{64}$/;
const REHEARSAL_ID_RE=/^[0-9a-f]{32}$/;
const PROJECT_REF_RE=/^[a-z0-9][a-z0-9_-]{2,127}$/;
const DEPLOYMENT_ID_RE=/^dpl_[A-Za-z0-9]+$/;
const UTC_SECOND_RE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const UNSAFE_EVIDENCE_PATH_CHAR_RE=/[%\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;
const REQUIRED_DIGESTS=['backup_set','backup_storage_bytes','independent_restore','rollback_rehearsal','physical_devices'];
const DEVICE_CLASSES=['desktop','iphone','ipad'];
const REQUIRED_FLOWS=['login','session','save','reopen','permissions','contracts','printing'];
const RESTORE_SECTIONS=['auth_safe','business','schema_safe','storage_safe'];
const BACKUP_COMPONENTS=['auth','database','storage'];
const BACKUP_KEYS=['candidate_sha','capture_finished_at','capture_started_at','capture_window_seconds','components','format','project_ref'];
const MAX_CAPTURE_WINDOW_SECONDS=300;

function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort().map((key)=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}

function normalizedSha(value){return String(value||'').trim().toLowerCase()}
function text(value){return typeof value==='string'?value.trim():''}
function nonNegativeInt(value){return Number.isSafeInteger(value)&&value>=0}
function positiveInt(value){return Number.isSafeInteger(value)&&value>0}
function exactKeys(value,keys){
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&
    JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
}
function canonicalUtcSecond(value){
  const raw=text(value);
  if(!UTC_SECOND_RE.test(raw))return null;
  const millis=Date.parse(raw);
  if(!Number.isFinite(millis))return null;
  if(new Date(millis).toISOString().replace('.000Z','Z')!==raw)return null;
  return {raw,millis};
}
function normalizedEvidenceList(value){
  if(!Array.isArray(value)||value.length===0)return null;
  const refs=[];
  const seen=new Set();
  for(const item of value){
    if(typeof item!=='string'||!item||item.trim()!==item)return null;
    const ref=item;
    if(!ref.startsWith('evidence/')||ref.startsWith('/')||ref.includes('://')||ref.includes('\\')||ref.includes('?')||ref.includes('#')||UNSAFE_EVIDENCE_PATH_CHAR_RE.test(ref))return null;
    const segments=ref.split('/');
    if(segments.some((segment)=>!segment||segment==='.'||segment==='..'))return null;
    if(seen.has(ref))return null;
    seen.add(ref);
    refs.push(ref);
  }
  return refs.sort();
}
function normalizedPreviewUrl(value){
  const raw=text(value);
  if(!raw)return '';
  try{
    const parsed=new URL(raw);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash)return '';
    if(parsed.pathname&&parsed.pathname!=='/')return '';
    if(!parsed.hostname.endsWith('.vercel.app'))return '';
    return `https://${parsed.hostname}`;
  }catch{return ''}
}

export function stageCEvidenceSha256(value){
  return createHash('sha256').update(Buffer.from(canonical(value),'utf8')).digest('hex');
}

export function stageCBundleSha256(payload={}){
  const copy={...(payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{})};
  delete copy.bundle_sha256;
  return stageCEvidenceSha256(copy);
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
  const preview=value.preview&&typeof value.preview==='object'&&!Array.isArray(value.preview)?value.preview:{};
  const previewDeploymentId=text(preview.deployment_id);
  const previewUrl=normalizedPreviewUrl(preview.url);
  const previewSha=normalizedSha(preview.candidate_sha);
  if(!DEPLOYMENT_ID_RE.test(previewDeploymentId))errors.push('Stage C Preview deployment_id is invalid');
  if(!previewUrl)errors.push('Stage C Preview url must be an immutable HTTPS vercel.app deployment URL');
  if(!FULL_SHA_RE.test(previewSha)||previewSha!==candidateSha)errors.push('Stage C Preview identity is not tied to the exact candidate SHA');
  if(preview.environment!=='preview')errors.push('Stage C Preview environment must be exactly preview');
  if(preview.release_stage!=='preview')errors.push('Stage C Preview release_stage must be exactly preview');

  const digests=value.evidence_sha256&&typeof value.evidence_sha256==='object'&&!Array.isArray(value.evidence_sha256)?value.evidence_sha256:{};
  const digestKeys=Object.keys(digests).sort();
  if(JSON.stringify(digestKeys)!==JSON.stringify([...REQUIRED_DIGESTS].sort()))errors.push('Stage C evidence digest set is incomplete');
  for(const key of REQUIRED_DIGESTS){if(!SHA256_RE.test(String(digests[key]||'')))errors.push(`Stage C ${key} digest must be SHA-256`)}

  const storage=value.storage&&typeof value.storage==='object'&&!Array.isArray(value.storage)?value.storage:{};
  if(!nonNegativeInt(storage.object_count))errors.push('Stage C Storage object count must be a non-negative integer');
  if(!nonNegativeInt(storage.total_bytes))errors.push('Stage C Storage total bytes must be a non-negative integer');
  if(!SHA256_RE.test(String(storage.manifest_sha256||'')))errors.push('Stage C Storage manifest digest must be SHA-256');
  const storageEvidenceDigest=stageCEvidenceSha256({
    format:STORAGE_FORMAT,
    verified:true,
    object_count:storage.object_count,
    total_bytes:storage.total_bytes,
    manifest_sha256:storage.manifest_sha256,
  });
  if(SHA256_RE.test(String(digests.backup_storage_bytes||''))&&digests.backup_storage_bytes!==storageEvidenceDigest){
    errors.push('Stage C backup Storage byte evidence digest does not match the embedded Storage summary');
  }

  const backup=value.backup&&typeof value.backup==='object'&&!Array.isArray(value.backup)?value.backup:{};
  if(!exactKeys(backup,BACKUP_KEYS))errors.push('Stage C backup set must contain exactly the canonical backup manifest fields');
  if(backup.format!==BACKUP_FORMAT)errors.push(`Stage C backup format must be exactly ${BACKUP_FORMAT}`);
  const backupCandidateSha=normalizedSha(backup.candidate_sha);
  if(!FULL_SHA_RE.test(backupCandidateSha)||backupCandidateSha!==candidateSha)errors.push('Stage C backup set is not tied to the exact candidate SHA');
  const backupProject=text(backup.project_ref);
  if(!PROJECT_REF_RE.test(backupProject)||backupProject!==source)errors.push('Stage C backup project must match the exact source project');
  const captureStarted=canonicalUtcSecond(backup.capture_started_at);
  const captureFinished=canonicalUtcSecond(backup.capture_finished_at);
  if(!captureStarted)errors.push('Stage C backup capture_started_at must use canonical UTC second precision');
  if(!captureFinished)errors.push('Stage C backup capture_finished_at must use canonical UTC second precision');
  if(!nonNegativeInt(backup.capture_window_seconds)||backup.capture_window_seconds>MAX_CAPTURE_WINDOW_SECONDS){
    errors.push(`Stage C backup capture_window_seconds must be between 0 and ${MAX_CAPTURE_WINDOW_SECONDS}`);
  }
  if(captureStarted&&captureFinished){
    const actualWindow=(captureFinished.millis-captureStarted.millis)/1000;
    if(actualWindow<0||actualWindow>MAX_CAPTURE_WINDOW_SECONDS)errors.push('Stage C backup capture window is outside the allowed bound');
    else if(backup.capture_window_seconds!==actualWindow)errors.push('Stage C backup capture_window_seconds does not match capture timestamps');
  }
  const backupComponents=backup.components&&typeof backup.components==='object'&&!Array.isArray(backup.components)?backup.components:{};
  if(JSON.stringify(Object.keys(backupComponents).sort())!==JSON.stringify(BACKUP_COMPONENTS))errors.push('Stage C backup set must contain exactly database, auth and storage components');
  for(const name of ['database','auth']){
    const item=backupComponents[name]&&typeof backupComponents[name]==='object'&&!Array.isArray(backupComponents[name])?backupComponents[name]:{};
    if(!exactKeys(item,['bytes','sha256']))errors.push(`Stage C backup ${name} component fields are invalid`);
    if(!positiveInt(item.bytes))errors.push(`Stage C backup ${name} byte size must be a positive integer`);
    if(!SHA256_RE.test(String(item.sha256||'')))errors.push(`Stage C backup ${name} sha256 must be SHA-256`);
  }
  const backupStorage=backupComponents.storage&&typeof backupComponents.storage==='object'&&!Array.isArray(backupComponents.storage)?backupComponents.storage:{};
  if(!exactKeys(backupStorage,['bytes','object_bytes','object_count','sha256','storage_manifest_sha256']))errors.push('Stage C backup storage component fields are invalid');
  if(!positiveInt(backupStorage.bytes))errors.push('Stage C backup storage manifest byte size must be a positive integer');
  if(!SHA256_RE.test(String(backupStorage.sha256||'')))errors.push('Stage C backup storage manifest file sha256 must be SHA-256');
  if(!nonNegativeInt(backupStorage.object_count)||backupStorage.object_count!==storage.object_count)errors.push('Stage C backup Storage object count must match the embedded Storage summary');
  if(!nonNegativeInt(backupStorage.object_bytes)||backupStorage.object_bytes!==storage.total_bytes)errors.push('Stage C backup Storage object bytes must match the embedded Storage summary');
  if(!SHA256_RE.test(String(backupStorage.storage_manifest_sha256||''))||backupStorage.storage_manifest_sha256!==storage.manifest_sha256){
    errors.push('Stage C backup Storage manifest digest must match the embedded Storage summary');
  }
  const backupEvidenceDigest=stageCEvidenceSha256(backup);
  if(SHA256_RE.test(String(digests.backup_set||''))&&digests.backup_set!==backupEvidenceDigest){
    errors.push('Stage C backup-set evidence digest does not match the embedded canonical backup manifest');
  }

  const restore=value.restore&&typeof value.restore==='object'&&!Array.isArray(value.restore)?value.restore:{};
  if(restore.format!==RESTORE_FORMAT)errors.push(`Stage C restore format must be exactly ${RESTORE_FORMAT}`);
  if(restore.verified!==true)errors.push('Stage C independent restore must be explicitly verified');
  const restoreCandidateSha=normalizedSha(restore.candidate_sha);
  if(!FULL_SHA_RE.test(restoreCandidateSha)||restoreCandidateSha!==candidateSha)errors.push('Stage C restore evidence is not tied to the exact candidate SHA');
  const restoreSource=text(restore.source_project_ref);
  const restoreTarget=text(restore.restore_project_ref);
  if(!PROJECT_REF_RE.test(restoreSource)||restoreSource!==source)errors.push('Stage C restore source project must match the exact source project');
  if(!PROJECT_REF_RE.test(restoreTarget)||restoreTarget!==restored)errors.push('Stage C restore target project must match the exact independent restore project');
  if(restoreSource&&restoreTarget&&restoreSource===restoreTarget)errors.push('Stage C restore target must differ from source project');
  const sourceGenerated=canonicalUtcSecond(restore.source_generated_at);
  const restoredGenerated=canonicalUtcSecond(restore.restored_generated_at);
  if(!sourceGenerated)errors.push('Stage C restore source_generated_at must use canonical UTC second precision');
  if(!restoredGenerated)errors.push('Stage C restore restored_generated_at must use canonical UTC second precision');
  if(sourceGenerated&&restoredGenerated&&restoredGenerated.millis<=sourceGenerated.millis)errors.push('Stage C restored evidence must be generated after source evidence');
  const sections=restore.section_sha256&&typeof restore.section_sha256==='object'&&!Array.isArray(restore.section_sha256)?restore.section_sha256:{};
  if(JSON.stringify(Object.keys(sections).sort())!==JSON.stringify(RESTORE_SECTIONS))errors.push('Stage C restore section hash set is incomplete');
  for(const name of RESTORE_SECTIONS){if(!SHA256_RE.test(String(sections[name]||'')))errors.push(`Stage C restore ${name} hash must be SHA-256`)}
  if(!nonNegativeInt(restore.storage_object_count)||restore.storage_object_count!==storage.object_count)errors.push('Stage C restored Storage object count must match the backup Storage summary');
  if(!nonNegativeInt(restore.storage_total_bytes)||restore.storage_total_bytes!==storage.total_bytes)errors.push('Stage C restored Storage bytes must match the backup Storage summary');
  if(!SHA256_RE.test(String(restore.storage_manifest_sha256||''))||restore.storage_manifest_sha256!==storage.manifest_sha256)errors.push('Stage C restored Storage manifest must match the backup Storage summary');
  const restoreEvidenceDigest=stageCEvidenceSha256(restore);
  if(SHA256_RE.test(String(digests.independent_restore||''))&&digests.independent_restore!==restoreEvidenceDigest){
    errors.push('Stage C independent restore evidence digest does not match the embedded restore report');
  }

  const rollback=value.rollback&&typeof value.rollback==='object'&&!Array.isArray(value.rollback)?value.rollback:{};
  if(rollback.format!==ROLLBACK_FORMAT)errors.push(`Stage C rollback format must be exactly ${ROLLBACK_FORMAT}`);
  if(rollback.verified!==true)errors.push('Stage C rollback rehearsal must be explicitly verified');
  const rollbackCandidateSha=normalizedSha(rollback.candidate_sha);
  if(!FULL_SHA_RE.test(rollbackCandidateSha)||rollbackCandidateSha!==candidateSha)errors.push('Stage C rollback evidence is not tied to the exact candidate SHA');
  const rollbackApplicationSha=normalizedSha(rollback.rollback_application_sha);
  if(!FULL_SHA_RE.test(rollbackApplicationSha))errors.push('Stage C rollback application SHA must be a full 40-character hexadecimal commit SHA');
  else if(rollbackApplicationSha===candidateSha)errors.push('Stage C rollback application SHA must differ from the candidate SHA');
  if(!REHEARSAL_ID_RE.test(String(rollback.rehearsal_id||'')))errors.push('Stage C rollback rehearsal_id must be a lowercase 32-character hexadecimal id');
  const rollbackProject=text(rollback.database_project_ref);
  if(!PROJECT_REF_RE.test(rollbackProject))errors.push('Stage C rollback database project reference is invalid');
  else if(source&&rollbackProject!==source)errors.push('Stage C rollback must use the exact source database project');
  if(rollback.database_rollback_performed!==false)errors.push('Stage C rollback rehearsal must explicitly avoid database rollback');
  if(!positiveInt(rollback.rehearsal_window_seconds)||rollback.rehearsal_window_seconds>3600)errors.push('Stage C rollback rehearsal_window_seconds must be an integer between 1 and 3600');
  if(!positiveInt(rollback.checkpoint_record_count))errors.push('Stage C rollback checkpoint_record_count must be a positive integer proving pre-existing transactions');
  if(!positiveInt(rollback.new_record_count))errors.push('Stage C rollback new_record_count must be a positive integer proving transactions created during rehearsal');
  if(!positiveInt(rollback.after_record_count))errors.push('Stage C rollback after_record_count must be a positive integer');
  if(positiveInt(rollback.checkpoint_record_count)&&positiveInt(rollback.new_record_count)&&positiveInt(rollback.after_record_count)&&rollback.after_record_count!==rollback.checkpoint_record_count+rollback.new_record_count){
    errors.push('Stage C rollback must preserve checkpoint plus new transactions');
  }
  const counts=rollback.counts_by_kind&&typeof rollback.counts_by_kind==='object'&&!Array.isArray(rollback.counts_by_kind)?rollback.counts_by_kind:null;
  if(!counts){
    errors.push('Stage C rollback counts_by_kind must be an object');
  }else{
    let total=0;
    let valid=true;
    for(const [kind,count] of Object.entries(counts)){
      if(!text(kind)||!nonNegativeInt(count)){valid=false;break}
      total+=count;
    }
    if(!valid)errors.push('Stage C rollback counts_by_kind contains an invalid kind or count');
    else if(positiveInt(rollback.after_record_count)&&total!==rollback.after_record_count)errors.push('Stage C rollback counts_by_kind must match after_record_count');
  }
  for(const field of ['checkpoint_records_sha256','during_records_sha256','after_records_sha256']){
    if(!SHA256_RE.test(String(rollback[field]||'')))errors.push(`Stage C rollback ${field} must be SHA-256`);
  }
  const rollbackEvidenceDigest=stageCEvidenceSha256(rollback);
  if(SHA256_RE.test(String(digests.rollback_rehearsal||''))&&digests.rollback_rehearsal!==rollbackEvidenceDigest){
    errors.push('Stage C rollback evidence digest does not match the embedded rollback report');
  }

  const devices=value.devices&&typeof value.devices==='object'&&!Array.isArray(value.devices)?value.devices:{};
  if(JSON.stringify(Object.keys(devices).sort())!==JSON.stringify([...DEVICE_CLASSES].sort()))errors.push('Stage C device evidence must contain exactly desktop, iphone and ipad');
  const instances=new Set();
  const evidenceRefs=new Set();
  for(const deviceClass of DEVICE_CLASSES){
    const row=devices[deviceClass]&&typeof devices[deviceClass]==='object'&&!Array.isArray(devices[deviceClass])?devices[deviceClass]:{};
    if(row.accepted!==true)errors.push(`Stage C ${deviceClass} acceptance must be true`);
    if(row.real_account!==true)errors.push(`Stage C ${deviceClass} must use a real authenticated account`);
    if(row.simulated!==false||row.emulated!==false||row.physical!==true)errors.push(`Stage C ${deviceClass} evidence must be physical, non-simulated and non-emulated`);
    const rowSha=normalizedSha(row.candidate_sha);
    if(!FULL_SHA_RE.test(rowSha)||rowSha!==candidateSha)errors.push(`Stage C ${deviceClass} evidence is not tied to the exact candidate SHA`);
    const rowDeploymentId=text(row.preview_deployment_id);
    const rowPreviewUrl=normalizedPreviewUrl(row.preview_url);
    if(!DEPLOYMENT_ID_RE.test(rowDeploymentId)||rowDeploymentId!==previewDeploymentId)errors.push(`Stage C ${deviceClass} evidence must use the exact accepted Preview deployment`);
    if(!rowPreviewUrl||rowPreviewUrl!==previewUrl)errors.push(`Stage C ${deviceClass} evidence must use the exact accepted Preview URL`);
    const instance=text(row.device_instance),browser=text(row.browser);
    if(!instance)errors.push(`Stage C ${deviceClass} physical device instance is required`);
    else if(instances.has(instance))errors.push('Stage C physical device instances must be distinct');
    else instances.add(instance);
    if(!browser)errors.push(`Stage C ${deviceClass} browser is required`);
    const flows=row.flows&&typeof row.flows==='object'&&!Array.isArray(row.flows)?row.flows:{};
    if(JSON.stringify(Object.keys(flows).sort())!==JSON.stringify([...REQUIRED_FLOWS].sort())||REQUIRED_FLOWS.some((flow)=>flows[flow]!==true))errors.push(`Stage C ${deviceClass} must pass every required practical flow`);

    const flowEvidence=row.flow_evidence&&typeof row.flow_evidence==='object'&&!Array.isArray(row.flow_evidence)?row.flow_evidence:{};
    if(JSON.stringify(Object.keys(flowEvidence).sort())!==JSON.stringify([...REQUIRED_FLOWS].sort())){
      errors.push(`Stage C ${deviceClass} must provide evidence for every required practical flow`);
    }
    const flattened=[];
    for(const flow of REQUIRED_FLOWS){
      const refs=normalizedEvidenceList(flowEvidence[flow]);
      if(!refs){
        errors.push(`Stage C ${deviceClass} ${flow} evidence must contain unique canonical repository evidence paths`);
        continue;
      }
      for(const ref of refs){
        if(evidenceRefs.has(ref))errors.push('Stage C physical-device evidence references must not be reused across flows or devices');
        else evidenceRefs.add(ref);
        flattened.push(ref);
      }
    }
    const aggregate=normalizedEvidenceList(row.evidence);
    if(!aggregate)errors.push(`Stage C ${deviceClass} evidence references must be unique canonical repository evidence paths`);
    else if(JSON.stringify(aggregate)!==JSON.stringify(flattened.sort()))errors.push(`Stage C ${deviceClass} evidence list must exactly match the per-flow evidence references`);
  }
  const deviceEvidenceDigest=stageCEvidenceSha256(devices);
  if(SHA256_RE.test(String(digests.physical_devices||''))&&digests.physical_devices!==deviceEvidenceDigest){
    errors.push('Stage C physical-device evidence digest does not match the embedded device evidence');
  }

  const digest=String(value.bundle_sha256||'').trim().toLowerCase();
  if(!SHA256_RE.test(digest))errors.push('Stage C bundle_sha256 must be a lowercase SHA-256 digest');
  else if(digest!==stageCBundleSha256(value))errors.push('Stage C bundle_sha256 does not match the canonical evidence bundle');

  return {ok:errors.length===0,candidateSha,errors};
}
