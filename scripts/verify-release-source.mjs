// Verify the exact revision under test; never accept a PR merge SHA as its head.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function verifyReleaseSource({cwd=process.cwd(), expectedSha, outputPath, eventName='', runId=''}={}) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '')) throw new Error('RELEASE_EXPECTED_SHA_INVALID');
  const git = (...args) => execFileSync('git', args, {cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
  const actualSha = git('rev-parse','HEAD');
  if (actualSha !== expectedSha) throw new Error('RELEASE_SOURCE_SHA_MISMATCH');
  // Untracked screenshots/logs are allowed; changed tracked source is not.
  try { git('diff','--quiet','HEAD','--'); } catch { throw new Error('RELEASE_TRACKED_SOURCE_CHANGED'); }
  const gitTree = git('rev-parse','HEAD^{tree}');
  const evidence = {schemaVersion:1, expectedSha, testedSha:actualSha, gitTree,
    trackedSourceClean:true, eventName, runId:String(runId),
    verifiedAt:new Date().toISOString(),
    scope:'Source identity only; not hosted acceptance, backup, restore, rollback or production deployment.'};
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath),{recursive:true});
    fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  }
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result=verifyReleaseSource({expectedSha:process.env.AQARI_EXPECTED_SHA,
      outputPath:process.argv[2],eventName:process.env.GITHUB_EVENT_NAME,runId:process.env.GITHUB_RUN_ID});
    console.log(`Verified clean release source ${result.testedSha}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
