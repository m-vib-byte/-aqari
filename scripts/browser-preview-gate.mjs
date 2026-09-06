// Additional preview-only Chromium acceptance; never a replacement for WebKit CI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
if(process.env.VERCEL_ENV==='production')throw Error('Diagnostic build is preview-only.');
const safeEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function run(bin,args,env=safeEnv,timeout=240000){const r=spawnSync(bin,args,{cwd:root,env,stdio:'inherit',timeout});if(r.error)throw r.error;if(r.status!==0)throw Error('Acceptance command failed with exit '+r.status);}
run(process.execPath,['scripts/build-approved-integration.cjs']);
let source=fs.readFileSync('tests/v266-authenticated-home.e2e.mjs','utf8');
assert.equal(crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex'),'e1f6477ad75b0c2f508b7139220c570fdfeac4c1','Review upstream acceptance before adapting its runner.');
function change(old,next){assert.equal(source.split(old).length,2,'Unique fixture anchor required: '+old.slice(0,75));source=source.replace(old,next);}
change("import { chromium, webkit } from 'playwright';",`import { chromium as stockChromium } from 'playwright';
import { assertActualUI } from './preview-live-actions.mjs';
const chromium={launch:options=>stockChromium.launch({...options,executablePath:process.env.AQARI_TEST_BROWSER,args:JSON.parse(process.env.AQARI_TEST_BROWSER_ARGS)})};`);
change("[['chromium',chromium],['webkit',webkit]]","[['chromium-serverless',chromium]]");
// Seed only once, leaving manual sign-in unseeded and never resurrecting logout.
change("localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));",`if(!sessionStorage.getItem('qaSeededOnce')){sessionStorage.setItem('qaSeededOnce','1');if(!location.pathname.startsWith('/login'))localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));}`);
change("if(url.pathname==='/auth/v1/user')return send(res,user);","if(url.pathname==='/auth/v1/logout')return send(res,{});\n    if(url.pathname==='/auth/v1/user')return send(res,user);");
change("const page=await context.newPage();","const page=await context.newPage();page.setDefaultTimeout(6000);");
// Retain all original route, no-early-start, heartbeat and timeout assertions.
change("          assert.ok(await page.locator('#home').isVisible());","          assert.ok(await page.locator('#home').isVisible());\n          console.log('QA_HOME_READY',name);\n          await assertActualUI(page,scenario);");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aqari-browser-'));
const generated=path.join(root,'tests','.preview-browser-generated.mjs');
try{
  run('npm',['install','--prefix',temp,'--no-save','--ignore-scripts','--no-package-lock','--no-audit','--no-fund','@sparticuz/chromium@149.0.0'],{...safeEnv,npm_config_cache:path.join(temp,'cache')},120000);
  const require=createRequire(path.join(temp,'package.json'));
  const {default:serverless}=await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const executable=await serverless.executablePath();
  fs.writeFileSync(generated,source);
  run(process.execPath,[generated],{...safeEnv,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'',AQARI_TEST_BROWSER:executable,AQARI_TEST_BROWSER_ARGS:JSON.stringify(serverless.args)},240000);
  console.log('PREVIEW_BROWSER_ACCEPTANCE_PASS: full application, real Chromium, synthetic backend only. WebKit/owner-session acceptance is separate.');
}finally{fs.rmSync(generated,{force:true});fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(path.join(root,'test-results','authenticated-home'),{recursive:true,force:true});}
