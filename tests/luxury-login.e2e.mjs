import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const out='test-results/luxury-login';fs.mkdirSync(out,{recursive:true});
const results=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/app'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
  return res.end('<!doctype html><html><body><h1 id="synthetic-navigation-target">Synthetic navigation target, NOT the real workspace</h1></body></html>');
 }
 if(url.pathname==='/'||url.pathname==='/login.html'){
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(fs.readFileSync('login.html'));
 }
 if(url.pathname==='/login-luxury.js'){
  res.writeHead(200,{'content-type':'text/javascript'});return res.end(fs.readFileSync('login-luxury.js'));
 }
 if(url.pathname.endsWith('.js')){res.writeHead(200,{'content-type':'text/javascript'});return res.end('/* No production backend or credentials in this fixture. */');}
 res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
function fixture(kind){
 window.__calls={login:0,recovery:0,context:0};
 const user={id:'synthetic-user',email:'person@example.invalid'};
 const access={user,workspace:{id:'synthetic-workspace'},membership:{user_id:user.id,workspace_id:'synthetic-workspace',is_active:kind!=='denied',role:'general_manager'}};
 window.AQARI_PUBLIC_CONFIG={};window.supabase={createClient(){}};
 window.AQARI_SUPABASE={context:access,async getClient(){return{};},async getSession(){return ['saved','denied'].includes(kind)?{user}:null;},async refreshContext(){window.__calls.context++;return access;},async signIn(){window.__calls.login++;await new Promise(r=>setTimeout(r,250));if(kind!=='valid')throw Error('invalid login credentials');},async resetPasswordForEmail(){window.__calls.recovery++;},clearPersistedSession(){throw Error('view must not reset credentials');}};
}
let failed=false;
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS',name);}catch(e){failed=true;results.push({name,passed:false,error:e.message});console.error('FAIL',name,e.stack);}}
try{
 for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  async function pageFor(kind='invalid',width=390,js=true,blocked=false){
   const context=await browser.newContext({viewport:{width,height:width<500?844:960},javaScriptEnabled:js,reducedMotion:'reduce'});
   await context.addInitScript(fixture,kind);
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==base||(blocked&&u.pathname==='/login-luxury.js'))return route.abort();
    return route.continue();
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/?manual=1',{waitUntil:'domcontentloaded'});
   if(js&&!blocked)await page.waitForFunction(()=>window.AQARI_LOGIN_DESIGN?.version==='L1');
   return{page,context,errors};
  }
  try{
   for(const width of [320,390,820,1440])await check(engineName+' responsive '+width,async()=>{
    const{page,context,errors}=await pageFor('invalid',width);
    try{
     for(const id of ['email','password','loginButton'])assert.ok(await page.locator('#'+id).isVisible(),id);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     assert.ok(await page.locator('#password').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16);
     assert.equal(await page.locator('#password').getAttribute('autocomplete'),'current-password');
     assert.ok((await page.locator('#loginButton').boundingBox()).height>=48);
     assert.equal(await page.locator('#status').getAttribute('aria-live'),'polite');
     assert.equal(await page.locator('.primary').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
     assert.deepEqual(errors,[]);
     await page.screenshot({path:path.join(out,engineName+'-'+width+'.png'),fullPage:true});
    }finally{await context.close();}
   });
   await check(engineName+' validation password visibility recovery and offline state',async()=>{
    const{page,context,errors}=await pageFor();
    try{
     await page.click('#loginButton');assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
     assert.equal(await page.evaluate(()=>window.__calls.login),0);
     await page.fill('#email','broken-address');await page.click('#recoveryButton');assert.equal(await page.evaluate(()=>window.__calls.recovery),0);
     await page.fill('#email','person@example.invalid');await page.click('#loginButton');assert.equal(await page.locator('#password').getAttribute('aria-invalid'),'true');
     await page.fill('#password','Synthetic-password');await page.click('#passwordToggle');
     assert.equal(await page.locator('#password').getAttribute('type'),'text');assert.equal(await page.locator('#passwordToggle').getAttribute('aria-pressed'),'true');
     await page.click('#passwordToggle');assert.equal(await page.locator('#password').getAttribute('type'),'password');
     await page.click('#loginButton');
     await page.waitForFunction(()=>!document.getElementById('loginButton').disabled&&document.getElementById('status').classList.contains('bad'));
     assert.equal(await page.evaluate(()=>window.__calls.login),1);
     assert.ok((await page.locator('#status').textContent()).includes('غير صحيحة'));
     assert.equal(await page.locator('#password').inputValue(),'');
     await page.click('#recoveryButton');await page.waitForFunction(()=>window.__calls.recovery===1&&!document.getElementById('loginButton').disabled);
     assert.ok((await page.locator('#status').textContent()).includes('إذا كان الحساب موجودًا'));
     await context.setOffline(true);await page.waitForSelector('#networkHint',{state:'visible'});
     assert.ok((await page.locator('#connectionState').textContent()).includes('غير متصل'));
     await context.setOffline(false);await page.waitForSelector('#networkHint',{state:'hidden'});
     await page.locator('#loginHelp summary').click();assert.ok(await page.locator('#loginHelp p').isVisible());
     assert.deepEqual(errors,[]);
    }finally{await context.close();}
   });
   for(const mode of ['javascript-disabled','enhancement-blocked'])await check(engineName+' usable fallback '+mode,async()=>{
    const{page,context}=await pageFor('invalid',390,mode!=='javascript-disabled',mode==='enhancement-blocked');
    try{
     assert.ok(await page.locator('#email').isVisible());assert.ok(await page.locator('#password').isVisible());assert.ok(await page.locator('#loginButton').isEnabled());
     assert.ok(await page.locator('#passwordToggle').isHidden());
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     await page.screenshot({path:path.join(out,engineName+'-'+mode+'.png'),fullPage:true});
    }finally{await context.close();}
   });
   await check(engineName+' valid account retains existing navigation target',async()=>{
    const{page,context,errors}=await pageFor('valid');
    try{
     await page.fill('#email','person@example.invalid');await page.fill('#password','Synthetic-password');
     await page.click('#loginButton');await page.waitForURL('**/app?release=V266');assert.ok(await page.locator('#synthetic-navigation-target').isVisible());assert.deepEqual(errors,[]);
    }finally{await context.close();}
   });
   for(const kind of ['saved','denied'])await check(engineName+' '+kind+' account retains authorization boundary',async()=>{
    const{page,context,errors}=await pageFor(kind);
    try{
     assert.equal(new URL(page.url()).pathname,'/','manual entry never restores automatically');
     await page.goto(base+'/',{waitUntil:'domcontentloaded'});
     if(kind==='saved'){await page.waitForURL('**/app?release=V266');assert.ok(await page.locator('#synthetic-navigation-target').isVisible());}
     else{await page.waitForFunction(()=>document.getElementById('status').classList.contains('bad'));assert.equal(new URL(page.url()).pathname,'/');assert.ok(await page.locator('#email').isVisible());}
     assert.deepEqual(errors,[]);
    }finally{await context.close();}
   });
  }finally{await browser.close();}
 }
}finally{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({note:'Synthetic browser tests of login presentation and navigation contract; not proof the owner workspace freeze is fixed.',results},null,2));
 server.closeAllConnections();server.close();
}
if(failed)process.exitCode=1;
