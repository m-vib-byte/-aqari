import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {chromium,webkit} from 'playwright';
const html=fs.readFileSync('login.html','utf8');
const auth=html.match(/<script>[\s\S]*?<\/script>/)?.[0];
assert.equal(crypto.createHash('sha256').update(auth).digest('hex'),'fc0c29165898904d92d0303fb3d6901e4aa8de0052fdceb7ea34d069fb836361','existing auth must remain byte-identical');
assert.ok(html.includes('name="aqari-login-design" content="L1"'));
assert.equal((html.match(/rel="preload"/g)||[]).length,3);
assert.equal((html.match(/rel="stylesheet"/g)||[]).length,0,'first paint has no stylesheet request dependency');
const enhancement=html.match(/<script id="aqari-login-experience">([\s\S]*?)<\/script>/)[1];
assert.doesNotMatch(enhancement,/localStorage|sessionStorage|\bfetch\(|signIn|refreshContext|location\./,'UI must not change auth, storage or navigation');
const ctx={user:{id:'test-user'},workspace:{id:'test-space'},membership:{user_id:'test-user',workspace_id:'test-space',role:'general_manager',is_active:true}};
const stub=`window.AQARI_PUBLIC_CONFIG={};window.supabase={createClient(){}};window.fixtureCalls={login:0,recovery:0};window.fixtureMode='valid';window.AQARI_SUPABASE={context:${JSON.stringify(ctx)},getClient:async()=>({}),getSession:async()=>null,refreshContext:async()=>window.AQARI_SUPABASE.context,signIn:async()=>{window.fixtureCalls.login++;if(window.fixtureMode==='pending')return new Promise(()=>{});if(window.fixtureMode==='invalid')throw Error('Invalid login credentials');if(window.fixtureMode==='inactive')window.AQARI_SUPABASE.context.membership.is_active=false;},resetPasswordForEmail:async()=>{window.fixtureCalls.recovery++;},clearPersistedSession(){}};`;
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/app')){res.writeHead(200,{'content-type':'text/html'});return res.end('<h1>Authorized-navigation test destination only</h1>');}
 if(req.url.startsWith('/public-config.js')){res.writeHead(200,{'content-type':'application/javascript'});return res.end(stub);}
 if(req.url.includes('.js')){res.writeHead(200,{'content-type':'application/javascript'});return res.end('');}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
fs.mkdirSync('test-results/login-premium',{recursive:true});
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch();
  try{
   for(const [label,width,height] of [['mobile',390,844],['small',320,640],['tablet',820,1180],['desktop',1440,980]]){
    const page=await browser.newPage({viewport:{width,height},locale:'ar-KW'});const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(base+'/?manual=1');await page.waitForFunction(()=>window.AQARI_SUPABASE&&!document.getElementById('loginButton').disabled);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' '+label+' overflow');
    assert.ok(await page.locator('#email').isVisible());assert.ok(await page.locator('#password').isVisible());
    assert.equal(await page.locator('#password').getAttribute('autocomplete'),'current-password');
    await page.screenshot({path:`test-results/login-premium/${name}-${label}.png`,fullPage:true});
    if(label==='mobile'){
     await page.locator('#loginButton').click();assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
     assert.equal(await page.evaluate(()=>window.fixtureCalls.login),0);
     await page.locator('#email').fill('bad-email');await page.locator('#loginButton').click();assert.equal(await page.evaluate(()=>window.fixtureCalls.login),0);
     await page.locator('#email').fill('test@example.invalid');await page.locator('#loginButton').click();assert.equal(await page.locator('#password').getAttribute('aria-invalid'),'true');
     await page.locator('#password').fill('fictional-only');await page.locator('#togglePassword').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');assert.equal(await page.locator('#togglePassword').getAttribute('aria-pressed'),'true');
     await page.evaluate(()=>window.fixtureMode='invalid');await page.locator('#loginButton').click();await page.waitForFunction(()=>document.getElementById('status').classList.contains('bad'));
     assert.match(await page.locator('#status').innerText(),/غير صحيحة/);assert.equal(await page.locator('#password').getAttribute('type'),'password');assert.equal(await page.locator('#password').inputValue(),'');
     assert.equal(await page.locator('#loginHelp').getAttribute('open'),'');assert.ok(await page.locator('#retryButton').isVisible());
     assert.ok(page.url().includes('manual=1'));assert.equal(await page.evaluate(()=>document.getElementById('loginForm').getAttribute('aria-busy')),'false');
     await page.locator('#recoveryButton').click();await page.waitForFunction(()=>window.fixtureCalls.recovery===1);assert.match(await page.locator('#status').innerText(),/إذا كان الحساب موجودًا/);
     await page.evaluate(()=>window.fixtureMode='pending');await page.locator('#password').fill('fictional-only');await page.locator('#loginButton').click();await page.waitForFunction(()=>document.getElementById('loginForm').getAttribute('aria-busy')==='true');
     assert.ok(await page.locator('#loginSpinner').isVisible());assert.ok(await page.locator('#togglePassword').isDisabled());
    }
    assert.deepEqual(errors,[]);await page.close();console.log('PASS',name,label);
   }
   for(const mode of ['valid','inactive']){
    const page=await browser.newPage();await page.goto(base+'/?manual=1');await page.waitForFunction(()=>window.AQARI_SUPABASE);
    await page.evaluate(value=>window.fixtureMode=value,mode);await page.locator('#email').fill('test@example.invalid');await page.locator('#password').fill('fictional-only');await page.locator('#loginButton').click();
    if(mode==='valid')await page.waitForURL('**/app?release=V266');else{await page.waitForFunction(()=>document.getElementById('status').classList.contains('bad'));assert.ok(page.url().includes('manual=1'));}
    await page.close();console.log('PASS',name,mode,'navigation');
   }
   const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto(base+'/?manual=1');assert.ok(await nojs.locator('#email').isVisible());assert.ok(await nojs.locator('#loginButton').isDisabled());assert.ok(await nojs.locator('noscript').isVisible());assert.equal(await nojs.locator('#loginForm').getAttribute('method'),'post');await nojs.close();
   const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(base+'/?manual=1');assert.equal(await reduced.locator('#loginSpinner').evaluate(node=>getComputedStyle(node).animationName),'none');await reduced.close();console.log('PASS',name,'no-js and reduced-motion');
  }finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
