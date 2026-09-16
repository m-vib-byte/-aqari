import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const FILES=['public-config.js','supabase-adapter.js','qa-b.html','qa-b-reauth.html'];
const HOST_RE=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;
const SHA_RE=/^[0-9a-f]{40}$/;
const FALLBACK_BRANCH_HOST='aqari-git-support-v267-knet-range-reconcile-20260915-m-vib-5421.vercel.app';

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

  for(const path of ['qa-b.html','qa-b-reauth.html']){
    const html=String(source.get(path)||'');
    const hostMatch=html.match(/const BRANCH_HOST='[^']+\.vercel\.app';/);
    if(!hostMatch) throw Error(`PREVIEW_QA_HOST_LAYOUT_CHANGED:${path}`);
    output.set(path,html.replace(hostMatch[0],`const BRANCH_HOST='${branchHost}';`));
  }
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
