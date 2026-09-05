import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

// No production credentials or database requests: the entire app is served
// locally and its Supabase client is a synthetic in-memory fixture.
const root = process.cwd();
const out = path.join(root, 'test-results', 'authenticated-home');
fs.mkdirSync(out, { recursive:true });
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  let name = url.pathname === '/app' ? 'index.html' : url.pathname.slice(1);
  if(name === '') name = 'login.html';
  const file = path.resolve(root, name);
  if(!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){
    res.writeHead(404); res.end('Not found'); return;
  }
  let data = fs.readFileSync(file);
  // Diagnostics only: preserve execution while logging the synchronous unlock.
  if(name === 'secure-auth-bridge.js'){
    data = data.toString().replace('window.activateWorkspaceDbV198(nextContext, nextRemoteState?.payload);',
      "console.log('HOME_TRACE activate start'); window.activateWorkspaceDbV198(nextContext, nextRemoteState?.payload); console.log('HOME_TRACE activate end');")
      .replace('setCompatibility();',"console.log('HOME_TRACE compatibility start'); setCompatibility(); console.log('HOME_TRACE compatibility end');")
      .replace("if(typeof window.go === 'function') window.go('home');", "console.log('HOME_TRACE go start'); if(typeof window.go === 'function') window.go('home'); console.log('HOME_TRACE go end');");
  }
  const type = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(name)] || 'application/octet-stream';
  res.writeHead(200, {'content-type':type + '; charset=utf-8','cache-control':'no-store'});res.end(data);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let failed = false;
try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser = await engine.launch({headless:true});
    try{
      const context = await browser.newContext({viewport:{width:1473,height:850}});
      await context.route('**/*', route => {
        if(new URL(route.request().url()).origin === base) return route.continue();
        return route.abort();
      });
      await context.addInitScript(() => {
        const user = {id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'};
        const workspace = {id:'22222222-2222-4222-8222-222222222222',name:'Synthetic workspace'};
        const membership = {user_id:user.id,workspace_id:workspace.id,role:'general_manager',is_active:true};
        const session = {user,access_token:'synthetic-not-a-real-token',refresh_token:'synthetic'};
        localStorage.setItem('aqari-supabase-auth-v198',JSON.stringify(session));
        const callbacks=[];
        const client={auth:{
          async getSession(){return {data:{session},error:null};},
          async getUser(){return {data:{user},error:null};},
          async signInWithPassword(){return {data:{session,user},error:null};},
          onAuthStateChange(callback){callbacks.push(callback);setTimeout(()=>callback('INITIAL_SESSION',session),0);return {data:{subscription:{unsubscribe(){}}}};},
          stopAutoRefresh(){},async signOut(){return {error:null};}
        },from(table){
          const data = table==='aqari_memberships'?membership:table==='aqari_workspaces'?workspace:table==='aqari_profiles'?{user_id:user.id,display_name:'Synthetic user'}:table==='aqari_app_state'?{workspace_id:workspace.id,payload:{},revision:1}:[];
          const result={data,error:null};
          const query={};
          for(const op of ['select','eq','limit','order','range','in','is','neq','gte','lte','filter'])query[op]=()=>query;
          query.maybeSingle=query.single=()=>Promise.resolve(result);
          query.then=(a,b)=>Promise.resolve(result).then(a,b);
          return query;
        },rpc(){return Promise.resolve({data:[],error:null});}};
        window.supabase={createClient(){return client;}};
        setInterval(()=>{window.__homeHeartbeats=(window.__homeHeartbeats||0)+1;},100);
      });
      const page = await context.newPage();
      const messages=[];
      page.on('console',message=>{const text=message.text();messages.push(text);console.log(name,text.slice(0,700));});
      page.on('pageerror',error=>{messages.push(error.stack);console.error(name,error.stack);});
      page.on('dialog',dialog=>dialog.dismiss());
      await page.goto(base+'/app?release=V266',{waitUntil:'domcontentloaded',timeout:30000});
      const result = await Promise.race([
        page.waitForFunction(()=>document.documentElement.classList.contains('aqari-auth-unlocked'),{},{timeout:18000}).then(()=>({ready:true})),
        new Promise(resolve=>setTimeout(()=>resolve({ready:false,reason:'watchdog: renderer did not unlock'}),20000))
      ]);
      console.log('AUTHENTICATED_HOME_RESULT',name,JSON.stringify(result));
      fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({name,result,messages},null,2));
      if(!result.ready)failed=true;
      await Promise.race([page.screenshot({path:path.join(out,name+'.png')}),new Promise(resolve=>setTimeout(resolve,1500))]).catch(()=>{});
    }catch(error){failed=true;console.error('AUTHENTICATED_HOME_FAIL',name,error.stack);}
    finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2000))]);}
  }
}finally{server.close();}
process.exit(failed?1:0);
