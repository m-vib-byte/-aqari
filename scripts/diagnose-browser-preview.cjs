'use strict';
// Isolated PREVIEW diagnostic. Never deploy this branch to production.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
assert.equal(process.env.VERCEL_ENV,'preview','Diagnostic builds are preview-only; production is forbidden.');
const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(root,'.browser-diagnostic-'));
const cache=fs.mkdtempSync(path.join(os.tmpdir(),'aqari-browser-'));
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:os.tmpdir(),CI:'1',PLAYWRIGHT_BROWSERS_PATH:cache};
function run(args,timeout){
 const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',timeout,killSignal:'SIGKILL'});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error('Diagnostic command failed: '+args[0]+' (exit '+result.status+')');
}
function change(source,from,to){assert.equal(source.split(from).length,2,'Expected one diagnostic insertion: '+from.slice(0,80));return source.replace(from,to);}
try{
 run(['scripts/build-approved-integration.cjs'],120000);
 const deps=spawnSync('dnf',['install','-y','nspr','nss'],{env,stdio:'inherit',timeout:120000});
 if(deps.error)throw deps.error;
 assert.equal(deps.status,0,'Chromium system dependencies must install successfully');
 run(['node_modules/playwright/cli.js','install','chromium','--only-shell'],180000);
 console.log('BROWSER_DIAGNOSTIC: Chromium only. WebKit is NOT covered by this run. Synthetic local backend only.');
 let source=fs.readFileSync(path.join(root,'tests/v266-authenticated-home.e2e.mjs'),'utf8');
 source=change(source,"[['chromium',chromium],['webkit',webkit]]","[['chromium',chromium]]");
 // Seed ONLY the initial browser context. Application logout may clear sessionStorage;
 // an init-script guard in that storage must not reinsert credentials on reload.
 source=change(source,"const context=await browser.newContext({viewport:{width:1473,height:850}});","const context=await browser.newContext({viewport:{width:1473,height:850},storageState:{cookies:[],origins:scenario==='manual'?[]:[{origin:base,localStorage:[{name:'aqari-supabase-auth-v198',value:JSON.stringify(session)}]}]}});");
 source=change(source,"localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));","/* Initial session is set by browser.newContext, never by navigation scripts. */");
 source=change(source,"if(url.pathname==='/auth/v1/user')return send(res,user);","if(url.pathname==='/auth/v1/logout'){res.writeHead(204);res.end();return;}\n    if(url.pathname==='/auth/v1/user')return send(res,user);");
 source=change(source,"        const state=await page.evaluate(()=>({phase:",`        if(!hangCloud&&!hangConfirmation){
          for(const [route,target] of [['properties','list'],['tenants','list'],['collectionProPage','collectionProPage'],['maintenanceProPage','maintenanceProPage'],['home','home']]){
            await page.locator('.v199-primary-nav [data-v199-go="'+route+'"]').click({timeout:8000});
            assert.ok(await page.locator('#'+target).isVisible(),'ACTUAL click opens '+route);
            console.log('ACTUAL_CLICK',name,route);
          }
          await page.locator('#aqariV199Topbar .v199-add-button').click({timeout:8000});
          await page.waitForSelector('#v201CreateMenu.on',{timeout:5000});
          await delay(1500);
          assert.equal(await page.evaluate(()=>document.getElementById('v201CreateMenu').contains(document.activeElement)),true,'quick-create retains keyboard focus');
          await page.keyboard.press('Escape');
          await page.waitForSelector('#v201CreateMenu.on',{state:'hidden',timeout:5000});
          console.log('ACTUAL_CLICK',name,'quick-create-and-escape');
          if(scenario==='manual'){
            await page.locator('#aqariV199Topbar [data-v199-action="more"]').click({timeout:8000});
            await page.locator('#v199MoreMenu [data-v199-action="logout"]').click({timeout:8000});
            try{
              await page.waitForFunction(()=>!localStorage.getItem('aqari-supabase-auth-v198')&&!document.documentElement.classList.contains('aqari-auth-unlocked'),{},{timeout:15000});
            }catch(error){
              console.error('LOGOUT_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({unlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),hasSession:Boolean(localStorage.getItem('aqari-supabase-auth-v198')),phase:document.getElementById('aqariCloudGateV168')?.getAttribute('data-auth-phase'),stage:document.getElementById('aqariCloudGateV168')?.getAttribute('data-auth-stage'),message:document.getElementById('cloudGateMsgV168')?.textContent}))));
              console.error('LOGOUT_TRANSPORT',JSON.stringify(requests.filter(r=>r.includes('/auth/'))));throw error;
            }
            await page.reload({waitUntil:'domcontentloaded'});
            await page.waitForSelector('#aqariManualLoginRecovery',{state:'visible',timeout:15000});
            assert.ok(await page.locator('#home').isHidden(),'signed-out home must remain hidden after reload');
            const sealed=await page.evaluate(()=>({data:window.AQARI_DATA_GATE?.scope,storage:window.AQARI_EARLY_STORAGE_GATE?.scope}));
            assert.ok(!sealed.data&&!sealed.storage,'both workspace scopes stay sealed after logout');
            await page.locator('#aqariManualLoginRecovery').click();
            await page.waitForURL('**/login?release=V266&manual=1');
            await page.fill('#email',user.email);await page.fill('#password','Synthetic-password-only');
            await page.click('#loginButton');await page.waitForURL('**/app?release=V266');
            await page.waitForFunction(()=>document.documentElement.classList.contains('aqari-auth-unlocked')&&Boolean(window.AQARI_V266),{},{timeout:18000});
            assert.ok(await page.locator('#home').isVisible(),'repeat login displays the full app home');
            console.log('ACTUAL_CLICK',name,'logout-sealed-reload-return-link-and-repeat-login');
          }
        }
        const state=await page.evaluate(()=>({phase:`);
 const script=path.join(temp,'authenticated-home.mjs');fs.writeFileSync(script,source);
 run([script],240000);
 let login=fs.readFileSync(path.join(root,'tests/luxury-login.e2e.mjs'),'utf8');
 login=change(login,"[['chromium',chromium],['webkit',webkit]]","[['chromium',chromium]]");
 const loginFile=path.join(temp,'login.mjs');fs.writeFileSync(loginFile,login);
 run([loginFile],90000);
 console.log('BROWSER_DIAGNOSTIC_COMPLETE: full-app Chromium synthetic scenarios passed; WebKit and owner session remain unverified.');
}finally{
 fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(cache,{recursive:true,force:true});
 fs.rmSync(path.join(root,'test-results'),{recursive:true,force:true});
}
