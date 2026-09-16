const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
function text(value){return String(value ?? '').trim();}
function evidence(value){return Array.isArray(value)&&value.length>0&&value.every((item)=>typeof item==='string'&&item.trim());}

export function validateStageDPreparation(packet = {}) {
  const errors=[];
  const sha=text(packet.candidateSha).toLowerCase();
  if(packet.schema!=='AQARI-V267-STAGE-D-PREPARATION-1')errors.push('D preparation schema mismatch');
  if(!FULL_SHA_RE.test(sha))errors.push('full candidate SHA required');
  if(packet.status!=='prepared-not-accepted')errors.push('D must remain prepared-not-accepted');
  if(packet.phaseBClosed!==false)errors.push('D preparation must not claim B closed');
  if(packet.phaseCAccepted!==false)errors.push('D preparation must not claim C accepted');
  if(packet.productionChangeAllowed!==false)errors.push('Production changes must remain forbidden');
  if(packet.ownerPracticalTestRequired!==true)errors.push('owner practical test must remain required');
  if(packet.explicitOwnerApprovalRequired!==true)errors.push('explicit owner approval must remain required');
  if(packet.requirements155?.plannedCount!==155)errors.push('155-requirement acceptance matrix must remain in D packet');
  if(!evidence(packet.requirements155?.evidence))errors.push('155-requirement evidence references required');
  for(const name of ['desktop','iphone','ipad']){
    const device=packet.devices?.[name]||{};
    if(device.required!==true)errors.push(`${name} device test required`);
    if(name!=='desktop'&&device.physical!==true)errors.push(`${name} must be physical`);
    if(!Array.isArray(device.flows)||!['login','session','refresh','navigate','logoutLogin'].every((flow)=>device.flows.includes(flow)))errors.push(`${name} device flow plan incomplete`);
  }
  if(packet.releaseGateValidator!=='scripts/v267-release-gate-manifest.mjs')errors.push('release gate validator reference required');
  if(packet.ownerApprovalValidator!=='scripts/v267-owner-production-approval.mjs')errors.push('owner approval validator reference required');
  if(packet.approvedAt||packet.approvedSha||packet.ownerDecision)errors.push('D preparation must not contain an approval decision');
  return {ok:errors.length===0,candidateSha:sha,errors};
}
