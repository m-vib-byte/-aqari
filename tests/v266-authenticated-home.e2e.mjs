import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

// Real shipped SDK and renderer; synthetic account/rows; no production login,
// tokens or database traffic. Backend is same-origin to keep WebKit preflights
// inside the fixture as well as the intercepted application requests.
const root=process.cwd();
const out=path.join(root,'test-results','authenticated-home');
fs.mkdirSync(out,{recursive:true});
const sdkResponse=await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/dist/umd/supabase.min.js');
if(!sdkResponse.ok)throw Error('Cannot obtain the pinned SDK fixture');
const sdk=Buffer.from(await sdkResponse.arrayBuffer());
if(crypto.createHash('sha384').update(sdk).digest('base64')!=='0UK+HVlz5Y7F//atDpPysyocv/PjGXQoBX+XSaL/eEotARW8rPFh+lL5sO0Ljzfi')throw Error('SDK integrity mismatch');
const backend='http://127.0.0.1:4173';
const user={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const workspace={id:'22222222-2222-4222-8222-222222222222',name:'Synthetic workspace'};
const membership={user_id:user.id,workspace_id:workspace.id,role:'general_manager',is_active:true};
const profile={user_id:user.id,display_name:'Synthetic user'};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const expires=Math.floor(Date.now()/1000)+3600;
const token=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,exp:expires,iat:expires-3600,role:'authenticated',aud:'authenticated',iss:backend+'/auth/v1'})+'.synthetic-signature';
const session={user,access_token:token,refresh_token:'synthetic-refresh-token',token_type:'bearer',expires_at:expires,expires_in:3600};
const populated={properties:[['Synthetic Tower','Test','Residential','110','27500','0','Active']],tenants:[],contractsV202:[],tenantDirectoryV202:[],rentLedgerV202:[]};
for(let i=1;i<=110;i++){
  const tenant='Synthetic Tenant '+i,unit=String(i),id='SYN-'+i,property='Synthetic Tower';
  populated.tenants.push([tenant,property,unit,'250','2026-01-01','2026-12-31','نشط']);
  populated.contractsV202.push({id,contract_no:id,property,unit,tenant,rent:250,contractRent:250,status:'نشط',start_date:null,end_date:null,source:'synthetic'});
  populated.tenantDirectoryV202.push({property,unit,tenant,contractNo:id,email:'',phone:'',civilId:'',source:'synthetic',verified:true});
  populated.rentLedgerV202.push({id:'PAY-'+i,contractId:id,contractNo:id,property,unit,tenant,period:'2026-08',due:250,paid:250,balance:0,receiptNo:'R-'+i,paidAt:'2026-08-05',method:'bank',status:'paid',source:'synthetic',note:''});
}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,backend);
  const name=url.pathname==='/app'?'index.html':url.pathname.slice(1)||'login.html';
  if(name==='public-config.js'){
    res.writeHead(200,{'content-type':'text/javascript'});res.end('window.AQARI_PUBLIC_CONFIG='+JSON.stringify({supabaseUrl:backend,supabasePublishableKey:'sb_publishable_synthetic',supabaseAuthStorageKey:'aqari-supabase-auth-v198'})+';');return;
  }
  if(name==='vendor/supabase-js-2.114.0.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(sdk);return;}
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  let data=fs.readFileSync(file);
  if(name==='secure-auth-bridge.js')data=data.toString()
    .replace('window.activateWorkspaceDbV198(nextContext, nextRemoteState?.payload);',"console.log('HOME_TRACE activate start');window.activateWorkspaceDbV198(nextContext, nextRemoteState?.payload);console.log('HOME_TRACE activate end');")
    .replace('setCompatibility();',"console.log('HOME_TRACE compatibility start');setCompatibility();console.log('HOME_TRACE compatibility end');")
    .replace("if(typeof window.go === 'function') window.go('home');","console.log('HOME_TRACE go start');if(typeof window.go === 'function')window.go('home');console.log('HOME_TRACE go end');");
  const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)]||'application/octet-stream';
  res.writeHead(200,{'content-type':type+'; charset=utf-8','cache-control':'no-store'});res.end(data);
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const base=backend;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let failed=false;
try{
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    for(const [fixtureName,payload] of [['empty',{}],['populated',populated]]){
      const name=engineName+'-'+fixtureName;
      const browser=await engine.launch({headless:true});
      const messages=[],requests=[];
      let page;
      try{
        const context=await browser.newContext({viewport:{width:1473,height:850}});
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(url.origin!==backend)return route.abort();
          if(!/^\/(?:auth|rest)\/v1\//.test(url.pathname))return route.continue();
          requests.push(request.method()+' '+url.pathname);
          console.log(name,'REQUEST',request.method(),url.pathname);
          const headers={'content-type':'application/json'};
          if(url.pathname==='/auth/v1/user')return route.fulfill({status:200,headers,body:JSON.stringify(user)});
          if(url.pathname==='/auth/v1/token')return route.fulfill({status:200,headers,body:JSON.stringify(session)});
          if(request.method()!=='GET')return route.fulfill({status:403,headers,body:JSON.stringify({message:'Synthetic fixture: writes disabled'})});
          const table=url.pathname.split('/').pop();
          const row=table==='aqari_memberships'?membership:table==='aqari_workspaces'?workspace:table==='aqari_profiles'?profile:table==='aqari_app_state'?{workspace_id:workspace.id,payload,revision:1}:null;
          const single=(request.headers().accept||'').includes('vnd.pgrst.object');
          return route.fulfill({status:200,headers,body:JSON.stringify(single?row:row?[row]:[])});
        });
        await context.addInitScript(value=>{
          localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(value));
          setInterval(()=>{window.__homeHeartbeats=(window.__homeHeartbeats||0)+1;},100);
        },session);
        page=await context.newPage();
        page.on('console',message=>{const text=message.text();messages.push(text);console.log(name,text.slice(0,500));});
        page.on('pageerror',error=>{messages.push(error.stack);console.error(name,error.stack);});
        page.on('dialog',dialog=>dialog.dismiss());
        await page.goto(base+'/app?release=V266',{waitUntil:'domcontentloaded',timeout:30000});
        const outcome=await Promise.race([
          page.waitForFunction(()=>document.documentElement.classList.contains('aqari-auth-unlocked'),{},{timeout:18000}).then(()=>({ready:true})).catch(e=>({ready:false,error:e.message})),
          delay(20000).then(()=>({ready:false,error:'host watchdog'}))
        ]);
        await delay(700);
        const state=await Promise.race([page.evaluate(()=>({classes:document.documentElement.className,message:document.getElementById('cloudGateMsgV168')?.textContent,heartbeat:window.__homeHeartbeats})),delay(1500).then(()=>({unresponsive:true}))]);
        console.log('AUTHENTICATED_HOME_RESULT',name,JSON.stringify({outcome,state}));
        fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({name,outcome,state,requests,messages},null,2));
        if(!outcome.ready||state.unresponsive)failed=true;
        await Promise.race([page.screenshot({path:path.join(out,name+'.png')}),delay(1500)]).catch(()=>{});
      }catch(error){failed=true;console.error('AUTHENTICATED_HOME_FAIL',name,error.stack);fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({name,error:error.stack,messages,requests},null,2));}
      finally{await Promise.race([browser.close(),delay(2000)]);}
    }
  }
}finally{server.close();}
process.exit(failed?1:0);
