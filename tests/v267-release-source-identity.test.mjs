import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifyReleaseSource} from '../scripts/verify-release-source.mjs';

const workflow=fs.readFileSync(new URL('../.github/workflows/release-verification-workspace.yml',import.meta.url),'utf8');
test('release verification checks out the preview head and checks identity before tests and source export',()=>{
  const verify=workflow.split('\n  inventory:')[0];
  assert.match(verify,/AQARI_EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(verify,/ref: \$\{\{ env\.AQARI_EXPECTED_SHA \}\}/);
  assert.match(verify,/persist-credentials: false/);
 const regressions=verify.indexOf('node scripts/test-release-regressions.mjs');
 assert.ok(regressions>=0,'prepared regression suite must run');
 assert.ok(verify.indexOf('node scripts/verify-release-source.mjs')<regressions);
  const exported=verify.slice(verify.indexOf('name: Export tracked source'));
  assert.ok(exported.indexOf('node scripts/verify-release-source.mjs')>=0);
  assert.ok(exported.indexOf('node scripts/verify-release-source.mjs')<exported.indexOf('git archive'));
  assert.ok(!verify.includes('continue-on-error: true'));
});

function repository(t) {
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'aqari-identity-'));
  t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q'); git('config','user.email','test@example.invalid'); git('config','user.name','Isolated verification test');
  fs.writeFileSync(path.join(cwd,'tracked.txt'),'original\n'); git('add','tracked.txt'); git('commit','-qm','synthetic test source');
  return {cwd,git,expectedSha:git('rev-parse','HEAD'),outputPath:path.join(cwd,'evidence','source.json')};
}
test('records verified SHA and tree without exporting unrelated environment or credentials',t=>{
  const args=repository(t),result=verifyReleaseSource({...args,eventName:'pull_request',runId:'123'});
  assert.equal(result.testedSha,args.expectedSha);assert.equal(result.gitTree,args.git('rev-parse','HEAD^{tree}'));
  assert.equal(JSON.parse(fs.readFileSync(args.outputPath)).expectedSha,args.expectedSha);
  assert.match(result.scope,/not hosted acceptance/);
  assert.deepEqual(Object.keys(result).sort(),['schemaVersion','expectedSha','testedSha','gitTree','trackedSourceClean','eventName','runId','verifiedAt','scope'].sort());
});
test('rejects a different commit, even if its tree is identical',t=>{
  const args=repository(t); args.git('commit','--allow-empty','-qm','synthetic merge identity');
  assert.throws(()=>verifyReleaseSource(args),/RELEASE_SOURCE_SHA_MISMATCH/);
  assert.equal(fs.existsSync(args.outputPath),false);
});
for (const expectedSha of ['', 'abc123', 'z'.repeat(40), 'A'.repeat(40), '0'.repeat(40)+'\n']) {
  test(`rejects invalid expected revision (${JSON.stringify(expectedSha)})`,()=>{
    assert.throws(()=>verifyReleaseSource({expectedSha,cwd:'/not-used'}),/RELEASE_EXPECTED_SHA_INVALID/);
  });
}
test('rejects unstaged changes in tracked source',t=>{
  const args=repository(t);fs.writeFileSync(path.join(args.cwd,'tracked.txt'),'changed\n');
  assert.throws(()=>verifyReleaseSource(args),/RELEASE_TRACKED_SOURCE_CHANGED/);
});
test('rejects staged source changes',t=>{
  const args=repository(t);fs.writeFileSync(path.join(args.cwd,'tracked.txt'),'changed\n');args.git('add','tracked.txt');
  assert.throws(()=>verifyReleaseSource(args),/RELEASE_TRACKED_SOURCE_CHANGED/);
});
test('allows untracked test output without including it in the source tree',t=>{
  const args=repository(t);fs.writeFileSync(path.join(args.cwd,'test-output.log'),'synthetic output\n');
  assert.equal(verifyReleaseSource(args).testedSha,args.expectedSha);
});
