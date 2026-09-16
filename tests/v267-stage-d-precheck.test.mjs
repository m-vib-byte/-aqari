import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStageDPreparation } from '../scripts/v267-stage-d-precheck.mjs';

const SHA='fdb4aaf8a31571c9b2adea9bcaed3534eeda8545';
const flows=['login','session','refresh','navigate','logoutLogin'];
function packet(){return {
  schema:'AQARI-V267-STAGE-D-PREPARATION-1',candidateSha:SHA,status:'prepared-not-accepted',
  phaseBClosed:false,phaseCAccepted:false,productionChangeAllowed:false,
  ownerPracticalTestRequired:true,explicitOwnerApprovalRequired:true,
  requirements155:{plannedCount:155,evidence:['docs/V267-REQUIREMENTS-155.md','docs/V267-EVIDENCE-155.json']},
  devices:{desktop:{required:true,physical:false,flows},iphone:{required:true,physical:true,flows},ipad:{required:true,physical:true,flows}},
  releaseGateValidator:'scripts/v267-release-gate-manifest.mjs',
  ownerApprovalValidator:'scripts/v267-owner-production-approval.mjs',
};}

test('D can be fully prepared without claiming B/C/owner acceptance',()=>{
  assert.equal(validateStageDPreparation(packet()).ok,true);
});

test('D preparation fails closed if it claims acceptance or allows Production early',()=>{
  for(const patch of [
    {status:'accepted'},{phaseBClosed:true},{phaseCAccepted:true},{productionChangeAllowed:true},{ownerPracticalTestRequired:false},
    {approvedAt:'2026-09-16T08:00:00Z'},{ownerDecision:'approved_for_production'},
  ]) assert.equal(validateStageDPreparation({...packet(),...patch}).ok,false);
});

test('D preparation requires physical iPhone/iPad and the complete practical flow plan',()=>{
  const p=packet();p.devices.iphone.physical=false;assert.equal(validateStageDPreparation(p).ok,false);
  const q=packet();q.devices.ipad.flows=['login'];assert.equal(validateStageDPreparation(q).ok,false);
});
