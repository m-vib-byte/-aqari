import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const FILES=['public-config.js','supabase-adapter.js','qa-b.html','qa-b-reauth.html','qa-b-reauth-v2.html'];
const HOST_RE=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;
const SHA_RE=/^[0-9a-f]{40}$/;
const FALLBACK_BRANCH_HOST='aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app';

function replaceRequired(source,needle,replacement,code){
  if(!source.includes(needle))throw Error(code);
  return source.replace(needle,replacement);
}

export function exactPreviewTarget({vercelEnv,vercelUrl,vercelBranchUrl,candidateSha},source){
  if(String(vercelEnv||'')!=='preview') return new Map();
  const immutableHost=String(vercelUrl||'').trim().toLowerCase();
  const branchHost=String(vercelBranchUrl||FALLBACK_BRANCH_HOST).trim().toLowerCase();
  const sha=String(candidateSha||'').trim().toLowerCase();
  if(!HOST_RE.test(immutableHost)) throw Error('EXACT_PREVIEW_HOST_REQUIRED');
  if(!HOST_RE.test(branchHost)) throw Error('PREVIEW_SESSION_HOST_REQUIRED');
  if(!SHA_RE.test(sha)) throw Error('PREVIEW_CANDIDATE_SHA_REQUIRED');
  const login=`https://${branchHost}/login.html?release=V267`;
  const output=new Map();

  const browser=String(source.get('public-config.js')||'');
  const browserMatch=browser.match(/"supabaseAuthRedirectUrl":\s*"https:\/\/[^"/]+\/login\.html\?release=V267",?/);
  if(!browserMatch) throw Error('PREVIEW_PUBLIC_REDIRECT_LAYOUT_CHANGED');
  const browserReplacement=`"supabaseAuthRedirectUrl": "${login}",\n  "previewBranchHost": "${branchHost}",\n  "previewImmutableHost": "${immutableHost}",\n  "previewCandidateSha": "${sha}",`;
  output.set('public-config.js',browser.replace(browserMatch[0],browserReplacement));

  const adapter=String(source.get('supabase-adapter.js')||'');
  const adapterMatch=adapter.match(/target\.hostname !== '[^']+\.vercel\.app'/);
  if(!adapterMatch) throw Error('PREVIEW_ADAPTER_REDIRECT_LAYOUT_CHANGED');
  output.set('supabase-adapter.js',adapter.replace(adapterMatch[0],`target.hostname !== '${branchHost}'`));

  let runner=String(source.get('qa-b.html')||'');
  const runnerHost=runner.match(/const BRANCH_HOST='[^']+\.vercel\.app';/);
  if(!runnerHost)throw Error('PREVIEW_QA_HOST_LAYOUT_CHANGED:qa-b.html');
  runner=runner.replace(runnerHost[0],`const BRANCH_HOST='${branchHost}';\nconst CANDIDATE_SHA='${sha}';`);
  runner=replaceRequired(runner,"'Authorization':'Bearer '+token}","'Authorization':'Bearer '+token,'X-AQARI-Candidate-Sha':CANDIDATE_SHA}",'PREVIEW_QA_API_HEADER_LAYOUT_CHANGED');
  runner=replaceRequired(runner,"'Authorization':'Bearer '+token}","'Authorization':'Bearer '+token,'X-AQARI-Candidate-Sha':CANDIDATE_SHA}",'PREVIEW_QA_EVIDENCE_HEADER_LAYOUT_CHANGED');
  runner=replaceRequired(runner,
    "assert(cfg.releaseStage==='preview'&&cfg.supabaseUrl===EXPECTED_URL,'PREVIEW_CONFIG_REQUIRED');",
    "assert(cfg.releaseStage==='preview'&&cfg.supabaseUrl===EXPECTED_URL,'PREVIEW_CONFIG_REQUIRED');assert(cfg.previewCandidateSha===CANDIDATE_SHA&&cfg.previewBranchHost===BRANCH_HOST,'EXACT_CANDIDATE_CONFIG_REQUIRED');const requestedCandidate=new URLSearchParams(location.search).get('candidate');assert(requestedCandidate===CANDIDATE_SHA,'EXACT_CANDIDATE_REQUIRED');",
    'PREVIEW_QA_CANDIDATE_GUARD_LAYOUT_CHANGED');
  runner=replaceRequired(runner,"assert(saved?.ok===true&&saved?.id,'EVIDENCE_NOT_CONFIRMED');","assert(saved?.ok===true&&saved?.id&&saved?.candidate_sha===CANDIDATE_SHA,'EVIDENCE_NOT_CONFIRMED');",'PREVIEW_QA_EVIDENCE_CONFIRM_LAYOUT_CHANGED');
  output.set('qa-b.html',runner);

  let reauth=String(source.get('qa-b-reauth.html')||'');
  const reauthHost=reauth.match(/const BRANCH_HOST='[^']+\.vercel\.app';/);
  if(!reauthHost)throw Error('PREVIEW_QA_HOST_LAYOUT_CHANGED:qa-b-reauth.html');
  reauth=reauth.replace(reauthHost[0],`const BRANCH_HOST='${branchHost}';\nconst CANDIDATE_SHA='${sha}';`);
  reauth=replaceRequired(reauth,
    "if(location.hostname!==BRANCH_HOST||cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL)fail('PREVIEW_REQUIRED');",
    "if(location.hostname!==BRANCH_HOST||cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL||cfg.previewCandidateSha!==CANDIDATE_SHA||cfg.previewBranchHost!==BRANCH_HOST)fail('PREVIEW_REQUIRED');",
    'PREVIEW_REAUTH_CANDIDATE_GUARD_LAYOUT_CHANGED');
  reauth=replaceRequired(reauth,"location.replace('/qa-b.html?run=1');","location.replace('/qa-b.html?run=1&candidate='+encodeURIComponent(CANDIDATE_SHA));",'PREVIEW_REAUTH_RUNNER_TARGET_LAYOUT_CHANGED');
  output.set('qa-b-reauth.html',reauth);

  let reauthV2=String(source.get('qa-b-reauth-v2.html')||'');
  reauthV2=replaceRequired(reauthV2,
    "const EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co';",
    `const EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co';\nconst BRANCH_HOST='${branchHost}';\nconst CANDIDATE_SHA='${sha}';`,
    'PREVIEW_REAUTH_V2_HEADER_LAYOUT_CHANGED');
  reauthV2=replaceRequired(reauthV2,
    "if(cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL||cfg.previewBranchHost!==location.hostname||!/^[0-9a-f]{40}$/.test(sha))fail('PREVIEW_CANDIDATE_REQUIRED');",
    "if(location.hostname!==BRANCH_HOST||cfg.releaseStage!=='preview'||cfg.supabaseUrl!==EXPECTED_URL||cfg.previewBranchHost!==BRANCH_HOST||sha!==CANDIDATE_SHA)fail('PREVIEW_CANDIDATE_REQUIRED');",
    'PREVIEW_REAUTH_V2_CANDIDATE_GUARD_LAYOUT_CHANGED');
  reauthV2=replaceRequired(reauthV2,
    "location.replace('/qa-b.html?run=1&candidate='+encodeURIComponent(sha));",
    "location.replace('/qa-b.html?run=1&candidate='+encodeURIComponent(CANDIDATE_SHA));",
    'PREVIEW_REAUTH_V2_RUNNER_TARGET_LAYOUT_CHANGED');
  output.set('qa-b-reauth-v2.html',reauthV2);
  return output;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env={
    vercelEnv:process.env.VERCEL_ENV,
    vercelUrl:process.env.VERCEL_URL,
    vercelBranchUrl:process.env.VERCEL_BRANCH_URL,
    candidateSha:process.env.VERCEL_GIT_COMMIT_SHA
  };
  if(String(env.vercelEnv||'')!=='preview'){
    console.log('Exact Preview target patch skipped outside Preview.');
  }else{
    const source=new Map(FILES.map(path=>[path,readFileSync(path,'utf8')]));
    const output=exactPreviewTarget(env,source);
    for(const [path,content] of output) writeFileSync(path,content);
    console.log(`Pinned V267 Preview browser session to ${String(env.vercelBranchUrl||FALLBACK_BRANCH_HOST).toLowerCase()} while binding exact candidate ${String(env.candidateSha).toLowerCase()} / immutable host ${String(env.vercelUrl).toLowerCase()}.`);
  }
}
