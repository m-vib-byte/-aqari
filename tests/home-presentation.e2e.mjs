import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

// Synthetic presentation only: no account, cookies, remote API or business records.
const source=fs.readFileSync('src/v267/home-presentation.js','utf8');
const css=fs.readFileSync('src/v267/styles/home-presentation.css','utf8');
const styles=['aqari-owner-feedback-css','aqari-owner-final-beige-css','aqari-v267-unified-layout-css','aqari-v267-unified-virtual-css','aqari-v267-premium-refinement-css','aqari-v267-luxury-warm-css','aqari-live-stability-css'];
const scripts=['owner-reference','owner-feedback','owner-final','unified-layout','premium-navigation','live-stability'];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/style.css'){res.setHeader('content-type','text/css');return res.end('#final{background:rgb(250,248,243)}');}
  if(url.pathname==='/module.js'){res.setHeader('content-type','text/javascript');return res.end('/* synthetic presentation module */');}
  res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${url.searchParams.has('before')?'':css}</style></head><body><main id="legacy"><h1>لوحة المدير العام</h1></main><section id="aqHomePresentation" aria-hidden="true"><div class="aq-home-loading-card"><strong>عقاري</strong><p role="status">جارٍ تجهيز الصفحة الرئيسية…</p><button hidden>إعادة المحاولة</button></div></section></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
fs.mkdirSync('test-results/home-presentation',{recursive:true});
const results=[];
try{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      for(const viewport of [{width:393,height:852},{width:820,height:1180}]){
        const context=await browser.newContext({viewport,serviceWorkers:'block'});
        const errors=[];let releaseCSS;
        try{
          await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
          const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
          const visibleLegacy=()=>page.locator('#legacy').evaluate(node=>getComputedStyle(node).opacity!=='0');
          await page.goto(base+'/?before');
          await page.evaluate(()=>document.documentElement.classList.add('aqari-auth-unlocked'));
          assert.equal(await visibleLegacy(),true,'negative control reproduces exposed legacy home');
          await page.goto(base+'/');await page.addScriptTag({content:source});
          await page.evaluate(()=>{
            window.AQARI_SUPABASE={context:{user:{id:'synthetic-u'},workspace:{id:'synthetic-w'},membership:{user_id:'synthetic-u',workspace_id:'synthetic-w',role:'general_manager',is_active:true}}};
            window.AQARI_DATA_GATE={scope:{userId:'synthetic-u',workspaceId:'synthetic-w'}};
            window.AQARI_EARLY_STORAGE_GATE={scope:{userId:'synthetic-u',workspaceId:'synthetic-w'}};
            document.documentElement.classList.add('aqari-auth-unlocked');
            window.dispatchEvent(new CustomEvent('aqari:auth-boundary',{detail:{state:'ready'}}));
          });
          assert.equal(await visibleLegacy(),false);assert.equal(await page.locator('#legacy').evaluate(n=>n.inert),true);
          assert.equal(await page.locator('#aqHomePresentation').isVisible(),true);
          await context.route('**/style.css?last',async route=>{await new Promise(resolve=>releaseCSS=resolve);await route.continue();});
          await page.evaluate(({styles,scripts})=>{
            for(const name of ['V201','V202','V205','V206','V208','V209','V210','V211','OWNER_EXACT','OWNER_FINAL','UNIFIED_EXPERIENCE','PREMIUM_NAVIGATION','LIVE_STABILITY'])window['AQARI_'+name]={};
            for(const [i,id] of styles.entries()){const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href='/style.css?'+(i===styles.length-1?'last':i);document.head.append(link);}
            for(const name of scripts){const script=document.createElement('script');script.id='aqari-v267-'+name+'-js';script.src='/module.js?'+name;document.body.append(script);}
            document.getElementById('legacy').innerHTML='<div id="aqOwnerExactHome"><div id="aqLiveStability">الرئيسية الذهبية</div></div><nav id="aqOwnerExactBottom"></nav>';
            document.body.classList.add('aq-live-stable');
          },{styles,scripts});
          await page.waitForFunction(()=>document.querySelectorAll('link').length===7);
          await page.waitForTimeout(300);
          assert.equal(await visibleLegacy(),false,'late stylesheet cannot reveal an intermediate layout');
          assert.equal(await page.locator('#aqHomePresentation').isVisible(),true);
          // Simulate the bounded timeout without waiting 15 seconds per viewport.
          await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+16000;});
          await page.locator('#aqHomePresentation button').waitFor({state:'visible'});
          assert.equal(await visibleLegacy(),false,'asset failure never falls through to old home');
          releaseCSS();releaseCSS=null;
          await page.waitForFunction(()=>document.documentElement.classList.contains('aqari-home-presented'));
          assert.equal(await page.locator('#aqHomePresentation').isVisible(),false);
          assert.equal(await visibleLegacy(),true);assert.equal(await page.locator('#legacy').evaluate(n=>n.inert),false);
          assert.equal(await page.locator('#aqLiveStability').isVisible(),true);
          await page.screenshot({path:`test-results/home-presentation/${name}-${viewport.width}.png`});
          await page.evaluate(()=>{document.documentElement.classList.remove('aqari-auth-unlocked');window.dispatchEvent(new CustomEvent('aqari:auth-boundary',{detail:{state:'locked'}}));});
          assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('aqari-home-presented')),false);
          assert.deepEqual(errors,[]);results.push({engine:name,width:viewport.width,passed:true});
        }finally{releaseCSS?.();await context.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.closeAllConnections();server.close();fs.writeFileSync('test-results/home-presentation/results.json',JSON.stringify(results,null,2));}
console.log('HOME_PRESENTATION',JSON.stringify(results));
