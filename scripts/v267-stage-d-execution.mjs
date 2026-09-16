const SHA=/^[0-9a-f]{40}$/i;
export const DEVICE_FLOWS=['login','session','save','reopen','permissions','contracts','printing'];
const text=v=>String(v??'').trim();
const evidence=v=>Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string'&&x.trim());
export function validateStageDExecution(packet={}){
  const errors=[]; const blockers=[]; const candidateSha=text(packet.candidateSha).toLowerCase();
  if(packet.schema!=='AQARI-V267-STAGE-D-EXECUTION-1') errors.push('D execution schema mismatch');
  if(!SHA.test(candidateSha)) errors.push('full candidate SHA required');
  if(packet.phaseBClosed!==true) errors.push('phase B must be closed before D execution');
  if(packet.phaseCClosed!==true) errors.push('phase C must be closed before D execution');
  if(packet.productionChangeAllowed!==false) errors.push('Production changes must remain forbidden');
  if(packet.ownerPracticalTestRequired!==true) errors.push('owner practical test must remain required');
  if(packet.explicitOwnerApprovalRequired!==true) errors.push('explicit owner approval must remain required');
  if(packet.ownerDecision||packet.approvedAt||packet.approvedSha) errors.push('owner approval must not be inferred');
  const r=packet.requirements155||{};
  if(r.mappedCount!==155) errors.push('155 requirement map must contain 155 items');
  if(!evidence(r.evidence)) errors.push('155 evidence references required');
  const preview=packet.hostedPreview||{};
  if(preview.phaseBAccepted!==true||text(preview.commitSha).toLowerCase()!==candidateSha) errors.push('exact-SHA hosted Preview B evidence required');
  const c=packet.phaseC||{};
  for(const key of ['backupTestPassed','independentRestorePassed','storageByteHashMatch','rollbackRehearsed','temporaryRestoreBranchDeleted']) if(c[key]!==true) errors.push(`phase C evidence missing: ${key}`);
  const ci=packet.ci||{};
  if(ci.commitSha&&text(ci.commitSha).toLowerCase()!==candidateSha) errors.push('CI evidence SHA mismatch');
  if(ci.allRequiredPassed!==true) blockers.push('SAME_SHA_CI_NOT_GREEN');
  const pc=packet.productionConfig||{};
  if(pc.readOnlyAuditComplete!==true) blockers.push('PRODUCTION_CONFIG_READONLY_AUDIT_PENDING');
  if(pc.changeApplied===true) errors.push('Production configuration must not be changed before owner approval');
  const devices=packet.devices||{};
  for(const name of ['desktop','iphone','ipad']){
    const d=devices[name]||{};
    if(d.required!==true) errors.push(`${name} device requirement missing`);
    if(name!=='desktop'&&d.physicalRequired!==true) errors.push(`${name} must remain physical`);
    if(!Array.isArray(d.flows)||!DEVICE_FLOWS.every(f=>d.flows.includes(f))) errors.push(`${name} flow plan incomplete`);
    if(d.accepted!==true) blockers.push(`${name.toUpperCase()}_ACCEPTANCE_PENDING`);
    if(d.accepted===true && text(d.commitSha).toLowerCase()!==candidateSha) errors.push(`${name} accepted evidence SHA mismatch`);
  }
  if(packet.ownerPracticalTestCompleted!==true) blockers.push('OWNER_PRACTICAL_TEST_PENDING');
  return {prepared:errors.length===0,readyForOwnerTest:errors.length===0&&blockers.every(x=>x==='OWNER_PRACTICAL_TEST_PENDING'),candidateSha,errors,blockers};
}
