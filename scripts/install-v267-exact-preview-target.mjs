import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const FILES=['public-config.js','supabase-adapter.js','qa-b.html','qa-b-reauth.html'];
const HOST_RE=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;

export function exactPreviewTarget({vercelEnv,vercelUrl},source){
  if(String(vercelEnv||'')!=='preview') return new Map();
  const host=String(vercelUrl||'').trim().toLowerCase();
  if(!HOST_RE.test(host)) throw Error('EXACT_PREVIEW_HOST_REQUIRED');
  const login=`https://${host}/login.html?release=V267`;
  const output=new Map();

  const browser=String(source.get('public-config.js')||'');
  const browserMatch=browser.match(/"supabaseAuthRedirectUrl":\s*"https:\/\/[^"/]+\/login\.html\?release=V267"/);
  if(!browserMatch) throw Error('PREVIEW_PUBLIC_REDIRECT_LAYOUT_CHANGED');
  output.set('public-config.js',browser.replace(browserMatch[0],`"supabaseAuthRedirectUrl": "${login}"`));

  const adapter=String(source.get('supabase-adapter.js')||'');
  const adapterMatch=adapter.match(/target\.hostname !== '[^']+\.vercel\.app'/);
  if(!adapterMatch) throw Error('PREVIEW_ADAPTER_REDIRECT_LAYOUT_CHANGED');
  output.set('supabase-adapter.js',adapter.replace(adapterMatch[0],`target.hostname !== '${host}'`));

  for(const path of ['qa-b.html','qa-b-reauth.html']){
    const html=String(source.get(path)||'');
    const hostMatch=html.match(/const BRANCH_HOST='[^']+\.vercel\.app';/);
    if(!hostMatch) throw Error(`PREVIEW_QA_HOST_LAYOUT_CHANGED:${path}`);
    output.set(path,html.replace(hostMatch[0],`const BRANCH_HOST='${host}';`));
  }
  return output;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const env={vercelEnv:process.env.VERCEL_ENV,vercelUrl:process.env.VERCEL_URL};
  if(String(env.vercelEnv||'')!=='preview'){
    console.log('Exact Preview target patch skipped outside Preview.');
  }else{
    const source=new Map(FILES.map(path=>[path,readFileSync(path,'utf8')]));
    const output=exactPreviewTarget(env,source);
    for(const [path,content] of output) writeFileSync(path,content);
    console.log(`Pinned V267 Preview auth and Phase-B gates to exact deployment host ${String(env.vercelUrl).toLowerCase()}.`);
  }
}
