import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Exercise the actual renderer and pinned SDK. The local HTTP backend also
// serves requests initiated by service workers, which bypass Playwright route
// interception in WebKit. No production account, token or tenant data is used.
const root=process.cwd(),out=path.join(root,'test-results','authenticated-home');
fs.mkdirSync(out,{recursive:true});
const response=await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/dist/umd/supabase.min.js');
assert.ok(response.ok);
const sdk=Buffer.from(await response.arrayBuffer());
assert.equal(crypto.createHash('sha384').update(sdk).digest('base64'),'0UK+HVlz5Y7F//atDpPysyocv/PjGXQoBX+XSaL/eEotARW8rPFh+lL5sO0Ljzfi');
const base='http://127.0.0.1:4173';
const user={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const workspace={id:'22222222-2222-4222-8222-222222222222',name:'Synthetic workspace'};
const membership={user_id:user.id,workspace_id:workspace.id,role:'general_manager',is_active:true};
const profile={user_id:user.id,display_name:'Synthetic user'};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),expires=Math.floor(Date.now()/1000)+3600;
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,exp:expires,iat:expires-3600,role:'authenticated',aud:'authenticated',iss:base+'/auth/v1'})+'.synthetic-signature';
const session={user,access_token:token,refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_at:expires,expires_in:3600};
const populated={properties:[['Synthetic Tower','Test','Residential','110','27500','0','Active']],tenants:[],contractsV202:[],tenantDirectoryV202:[],rentLedgerV202:[]};
for(let i=1;i<=110;i++){
  const tenant='Synthetic Tenant '+i,unit=String(i),id='SYN-'+i,property='Synthetic Tower';
  populated.tenants.push([tenant,property,unit,'250','2026-01-01','2026-12-31','نشط']);
  populated.contractsV202.push({id,contract_no:id,property,unit,tenant,rent:250,contractRent:250,status:'نشط',start_date:null,end_date:null,source:'synthetic'});
  populated.tenantDirectoryV202.push({property,unit,tenant,contractNo:id,email:'',phone:'',civilId:'',source:'synthetic',verified:true});
  populated.rentLedgerV202.push({id:'PAY-'+i,contractId:id,contractNo:id,property,unit,tenant,period:'2026-08',due:250,paid:250,balance:0,receiptNo:'R-'+i,paidAt:'2026-08-05',method:'bank',status:'paid',source:'synthetic',note:''});
}
let fixture={},hangCloud=false,requests=[];
const send=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,base);
  if(/^\/(auth|rest)\/v1\//.test(url.pathname)){
    requests.push(req.method+' '+url.pathname);
    if(url.pathname==='/auth/v1/token')return send(res,session);
    if(req.headers.authorization!=='Bearer '+token)return send(res,{message:'Synthetic fixture: unauthorized'},401);
    if(url.pathname==='/auth/v1/user')return send(res,user);
    if(req.method!=='GET')return send(res,{message:'Synthetic fixture: database writes forbidden'},403);
    const table=url.pathname.split('/').pop();
    if(table==='aqari_app_state'&&hangCloud)return;
    const row=table==='aqari_memberships'?membership:table==='aqari_workspaces'?workspace:table==='aqari_profiles'?profile:table==='aqari_app_state'?{workspace_id:workspace.id,payload:fixture,revision:1}:null;
    return send(res,(req.headers.accept||'').includes('vnd.pgrst.object')?row:row?[row]:[]);
  }
  const name=url.pathname==='/app'?'index.html':url.pathname==='/login'?'login.html':url.pathname.slice(1)||'login.html';
  if(name==='public-config.js'){
    res.writeHead(200,{'content-type':'text/javascript'});res.end('window.AQARI_PUBLIC_CONFIG='+JSON.stringify({supabaseUrl:base,supabasePublishableKey:'sb_publishable_synthetic',supabaseAuthStorageKey:'aqari-supabase-auth-v198'})+';');return;
  }
  if(name==='vendor/supabase-js-2.114.0.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(sdk);return;}
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type+'; charset=utf-8','cache-control':'no-store'});res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let failed=false;
try{
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    for(const scenario of ['empty','populated','manual','timeout']){
      const name=engineName+'-'+scenario;
      fixture=scenario==='empty'?{}:populated;hangCloud=scenario==='timeout';requests=[];
      const browser=await engine.launch({headless:true});
      const errors=[];
      try{
        const context=await browser.newContext({viewport:{width:1473,height:850}});
        await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
        await context.addInitScript(value=>{
          localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));
          setInterval(()=>{window.__homeHeartbeats=(window.__homeHeartbeats||0)+1;},100);
        },session);
        const page=await context.newPage();
        page.on('pageerror',error=>errors.push(error.stack));
        page.on('dialog',dialog=>dialog.dismiss());
        if(scenario==='manual'){
          await page.goto(base+'/login?release=V266&manual=1',{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>Boolean(window.AQARI_SUPABASE));
          await delay(800);
          assert.equal(new URL(page.url()).pathname,'/login','manual entry must not restore/redirect');
          await page.fill('#email',user.email);await page.fill('#password','Synthetic-password-only');
          await page.click('#loginButton');
          await page.waitForURL('**/app?release=V266');
        }else await page.goto(base+'/app?release=V266',{waitUntil:'domcontentloaded',timeout:30000});
        if(scenario==='timeout'){
          await page.waitForSelector('[data-auth-phase="error"]',{timeout:16000});
          assert.ok(await page.locator('#aqariManualLoginRecovery').isVisible());
          await page.evaluate(()=>window.AQARI_SUPABASE.getClient().then(client=>client.auth.refreshSession()));
          await delay(800);
          assert.equal(await page.locator('#aqariCloudGateV168').getAttribute('data-auth-phase'),'error');
          assert.equal(requests.filter(r=>r==='GET /rest/v1/aqari_app_state').length,1,'late auth must not restart loading');
        }else{
          await page.waitForFunction(()=>document.documentElement.classList.contains('aqari-auth-unlocked'),{},{timeout:18000});
          await delay(700);
          assert.ok(await page.locator('#home').isVisible());
        }
        const state=await page.evaluate(()=>({phase:document.getElementById('aqariCloudGateV168')?.getAttribute('data-auth-phase'),stage:document.getElementById('aqariCloudGateV168')?.getAttribute('data-auth-stage'),unlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),heartbeat:window.__homeHeartbeats}));
        assert.deepEqual(errors,[]);
        fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({name,passed:true,state,requests},null,2));
        await page.screenshot({path:path.join(out,name+'.png')});
        console.log('PASS',name,JSON.stringify(state));
      }catch(error){failed=true;console.error('FAIL',name,error.stack);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({name,passed:false,error:error.stack,requests,errors},null,2));}
      finally{await Promise.race([browser.close(),delay(2000)]);}
    }
  }
}finally{server.closeAllConnections();server.close();}
process.exit(failed?1:0);
