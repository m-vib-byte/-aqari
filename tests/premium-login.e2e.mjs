import {chromium,webkit} from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const html=fs.readFileSync('login.html','utf8');
const output='test-results/premium-login';fs.mkdirSync(output,{recursive:true});
const results=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/app'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>Synthetic app destination</title><p id="fixture-app">Test destination only</p>');return;}
 if(url.pathname.endsWith('.js')){res.writeHead(200,{'Content-Type':'application/javascript'});res.end('');return;}
 if(url.pathname.endsWith('.svg')){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
async function fixture(context,mode='signedout'){
 await context.addInitScript(mode=>{
   window.__loginMode=mode;window.__signIns=0;window.__refreshes=0;
   const access={user:{id:'synthetic-user'},workspace:{id:'synthetic-workspace'},membership:{user_id:'synthetic-user',workspace_id:'synthetic-workspace',role:'general_manager',is_active:true}};
   window.AQARI_PUBLIC_CONFIG={};window.supabase={createClient(){}};
   window.AQARI_SUPABASE={context:access,async getClient(){return {};},async getSession(){return window.__loginMode==='saved'?{user:access.user}:null;},async refreshContext(){window.__refreshes++;return access;},async signIn(){window.__signIns++;if(window.__loginMode==='bad')throw new Error('Invalid login credentials');if(window.__loginMode==='pending')await new Promise(resolve=>window.__resolveLogin=resolve);},async resetPasswordForEmail(){},clearPersistedSession(){}};
 },mode);
}
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   for(const width of [320,390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:width<700?844:1000},locale:'ar-KW'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
    await fixture(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/?manual=1');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('الاتصال جاهز'));
    assert.equal(await page.locator('body').getAttribute('data-design'),'premium-login-v1');
    assert.ok(await page.locator('#email').isVisible());assert.ok(await page.locator('#password').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow at '+width);
    assert.equal(await page.locator('link[rel="stylesheet"]').count(),0,'critical design never waits for external styles');
    assert.equal(await page.locator('#loginForm').getAttribute('method'),'post','never submit passwords in query strings');
    await page.screenshot({path:output+'/'+name+'-'+width+'.png',fullPage:true});
    await page.fill('#password','synthetic-password');await page.click('#passwordToggle');
    assert.equal(await page.locator('#password').getAttribute('type'),'text');assert.equal(await page.locator('#passwordToggle').getAttribute('aria-pressed'),'true');
    await page.click('#passwordToggle');assert.equal(await page.locator('#password').getAttribute('type'),'password');
    await page.fill('#email','invalid-email');await page.click('#loginButton');
    assert.equal(await page.evaluate(()=>window.__signIns),0);assert.match(await page.locator('#status').innerText(),/صيغة البريد/);
    await page.fill('#email','synthetic@example.invalid');await page.evaluate(()=>window.__loginMode='bad');await page.click('#loginButton');
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('غير صحيحة'));
    assert.equal(await page.inputValue('#password'),'');assert.ok(await page.locator('#loginButton').isEnabled());assert.deepEqual(errors,[]);
    results.push({engine:name,width,layout:true,validation:true,passwordToggle:true,invalidCredentials:true});await context.close();
   }
   {
    const context=await browser.newContext();await fixture(context,'saved');const page=await context.newPage();await page.goto(base+'/');
    await page.locator('#continueButton').waitFor({state:'visible'});
    assert.equal(page.url(),base+'/','stored session must not silently navigate');assert.equal(await page.evaluate(()=>window.__refreshes),0);
    await page.click('#continueButton');await page.waitForURL('**/app?release=V266');
    results.push({engine:name,explicitContinuation:true});await context.close();
   }
   {
    const context=await browser.newContext();await fixture(context,'pending');const page=await context.newPage();await page.goto(base+'/?manual=1');
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('الاتصال جاهز'));await page.clock.install();
    await page.fill('#email','synthetic@example.invalid');await page.fill('#password','synthetic-password');await page.click('#loginButton');
    await page.waitForFunction(()=>typeof window.__resolveLogin==='function');await page.clock.runFor(21000);
    assert.ok(await page.locator('#loginButton').isEnabled());assert.match(await page.locator('#status').innerText(),/تعذر الاتصال/);
    await page.evaluate(()=>window.__resolveLogin());await page.clock.runFor(1000);assert.ok(page.url().includes('manual=1'),'late login must not navigate');
    results.push({engine:name,timeoutRecovery:true,lateResponseIgnored:true});await context.close();
   }
   console.log('PREMIUM_LOGIN_PASS',name);
  }finally{await browser.close();}
 }
}finally{
 fs.writeFileSync(output+'/results.json',JSON.stringify({note:'Synthetic login transport. Real workspace opening remains covered separately; no owner credentials used.',results},null,2));
 server.closeAllConnections();server.close();
}
