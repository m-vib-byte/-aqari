// Additional isolated Chromium acceptance while GitHub runners fail to start.
// No production backend, credentials, runtime patches, or weakened assertions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
if(process.env.VERCEL_ENV==='production')throw Error('This diagnostic build is preview-only; do not promote it to production.');
const safeEnv=Object.fromEntries(['PATH','HOME','TMPDIR','TMP','TEMP','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function run(bin,args,env=safeEnv,timeout=240000){const r=spawnSync(bin,args,{cwd:root,env,stdio:'inherit',timeout});if(r.error)throw r.error;if(r.status!==0)throw Error('Acceptance command failed with exit '+r.status);}
run(process.execPath,['scripts/build-approved-integration.cjs']);
let source=fs.readFileSync('tests/v266-authenticated-home.e2e.mjs','utf8');
const blob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(blob,'e1f6477ad75b0c2f508b7139220c570fdfeac4c1','Review upstream acceptance before adapting its runner.');
function change(old,next){assert.equal(source.split(old).length,2,'Expected unique fixture anchor: '+old.slice(0,75));source=source.replace(old,next);}
change("import { chromium, webkit } from 'playwright';",`import { chromium as stockChromium } from 'playwright';
const chromium={launch:options=>stockChromium.launch({...options,executablePath:process.env.AQARI_TEST_BROWSER,args:JSON.parse(process.env.AQARI_TEST_BROWSER_ARGS)})};`);
change("[['chromium',chromium],['webkit',webkit]]","[['chromium-serverless',chromium]]");
// Seed once per isolated browser context, never resurrect a session after logout.
change("localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));",`if(!sessionStorage.getItem('qaSeededOnce')){
            sessionStorage.setItem('qaSeededOnce','1');
            if(!location.pathname.startsWith('/login'))localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));
          }`);
change("if(url.pathname==='/auth/v1/user')return send(res,user);","if(url.pathname==='/auth/v1/logout')return send(res,{});\n    if(url.pathname==='/auth/v1/user')return send(res,user);");
change("const page=await context.newPage();","const page=await context.newPage();page.setDefaultTimeout(6000);");
change("          assert.ok(await page.locator('#home').isVisible());",`          assert.ok(await page.locator('#home').isVisible());
          console.log('QA_HOME_READY',name);
          for(const [route,target] of [['properties','list'],['tenants','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
            await page.locator('.v199-primary-nav [data-v199-go="'+route+'"]').click();
            await page.waitForFunction(id=>{const e=document.getElementById(id);return e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';},target);
          }
          console.log('QA_REAL_NAVIGATION_OK',name);
          await page.locator('#v205DailyActions [data-v205-daily-action="contract"]').click();
          await page.waitForSelector('#v205PropertyChooser.on');
          assert.equal(await page.locator('#v205ChooserList [data-v205-property-index]').count(),scenario==='empty'?0:1,'contract chooser uses fixture properties only');
          await page.locator('[data-v205-chooser-close]').click();
          await page.locator('#v205SimpleHome [data-v205-command="quick"]').click();
          await page.waitForTimeout(250);
          let menu=await page.evaluate(()=>({open:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden'),focus:document.activeElement?.getAttribute('data-v201-create')}));
          assert.equal(menu.open,'false','quick-create dialog must open');
          assert.ok(menu.focus,'quick-create must focus an actionable option: '+JSON.stringify(menu));
          await page.evaluate(()=>window.AQARI_V205.refresh());
          await page.waitForTimeout(250);
          assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-v201-create')),menu.focus,'dashboard refresh must not steal dialog focus');
          await page.locator('[data-v201-create-close]').click();
          console.log('QA_DIALOG_FOCUS_OK',name);
          await page.locator('.v199-account[data-v199-action="more"]').click();
          await page.locator('#v199MoreMenu [data-v199-action="logout"]').click();
          await page.waitForFunction(()=>!document.documentElement.classList.contains('aqari-auth-unlocked'));
          await page.waitForTimeout(1300);
          assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('aqari-auth-unlocked')),false,'logout must stay locked after reload');
          assert.equal(await page.evaluate(()=>Boolean(window.AQARI_DATA_GATE?.scope||window.AQARI_EARLY_STORAGE_GATE?.scope)),false,'logout seals both data scopes');
          assert.equal(await page.evaluate(()=>document.body.innerText.includes('Synthetic Tenant')),false,'no private data visible after logout');
          console.log('QA_LOGOUT_OK',name);`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aqari-browser-'));
const generated=path.join(root,'tests','.preview-browser-generated.mjs');
try{
  console.log('Installing preview-only Chromium in temporary storage; application dependencies unchanged.');
  run('npm',['install','--prefix',temp,'--no-save','--ignore-scripts','--no-package-lock','--no-audit','--no-fund','@sparticuz/chromium@149.0.0'],{...safeEnv,npm_config_cache:path.join(temp,'cache')},120000);
  const require=createRequire(path.join(temp,'package.json'));
  const {default:serverless}=await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
  const executable=await serverless.executablePath();
  fs.writeFileSync(generated,source);
  run(process.execPath,[generated],{...safeEnv,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'',AQARI_TEST_BROWSER:executable,AQARI_TEST_BROWSER_ARGS:JSON.stringify(serverless.args)},240000);
  console.log('PREVIEW_BROWSER_ACCEPTANCE_PASS: real Chromium + full application + synthetic backend; WebKit and owner session remain separate.');
}finally{
  fs.rmSync(generated,{force:true});
  fs.rmSync(temp,{recursive:true,force:true});
  fs.rmSync(path.join(root,'test-results','authenticated-home'),{recursive:true,force:true});
}
