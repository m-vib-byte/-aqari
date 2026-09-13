import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMatrix,audit} from '../scripts/audit-v267-evidence.mjs';
const text=fs.readFileSync(new URL('../docs/V267-REQUIREMENTS-155.md',import.meta.url),'utf8');
test('all 155 requirements have unique ordered source identifiers and resolvable evidence files',()=>{const result=audit(process.cwd());assert.equal(result.requirements.length,155);assert.ok(result.files.length>50);assert.equal(result.releaseGate,'HOLD');assert.equal(result.releasePolicy.authorizationAlreadyGranted,false);assert.equal(result.releasePolicy.previewDevelopmentAuthorized,true);assert.equal(result.releasePolicy.ownerAcceptanceRequiredBeforeProduction,true);assert.ok(result.releasePolicy.required.includes('explicit-owner-acceptance-before-production'));assert.ok(result.requirements.every(x=>x.fullAcceptance==='NOT_PROVEN'));});
test('missing or duplicate requirement numbers cannot silently disappear from the release matrix',()=>{assert.throws(()=>parseMatrix(text.replace(/^\| 155 \|.*\n/m,'')),/EXPECTED_155/);assert.throws(()=>parseMatrix(text.replace('| 155 |','| 154 |')),/EXPECTED_155/);});
test('an unknown evidence reference cannot be counted as implementation proof',()=>{assert.throws(()=>parseMatrix(text.replace('جزئي — E01، E02','جزئي — E99، E02')),/UNKNOWN_EVIDENCE/);});
