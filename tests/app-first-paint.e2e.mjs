import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';

// No account, backend, tokens, or business data. Block every external script
// and hold stylesheets pending to test first paint before the auth boot runs.
const names = ['first-run-migration.css','safe-autosync.css','production-status.css','final-release-ui.css','production-lockdown.css'];
const source = fs.readFileSync('index.html','utf8');
for(const name of names){
  const inline = '<style data-aqari-source="/' + name + '">\n' + fs.readFileSync(name,'utf8') + '\n</style>';
  assert.ok(source.includes(inline), 'inline CSS must match its canonical source: ' + name);
  assert.ok(!source.includes('<link rel="stylesheet" href="/' + name + '">'));
}
assert.ok(!/<link[^>]+rel=["']stylesheet["'][^>]*>/i.test(source.split('</head>')[0]));
const oldSource = source.replace(/<style data-aqari-source="(\/[^"]+\.css)">[\s\S]*?<\/style>/g, (_, href) => '<link rel="stylesheet" href="' + href + '">');
const server = http.createServer((_req,res) => { res.writeHead(404); res.end(); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const output = 'test-results/app-first-paint';
fs.mkdirSync(output,{recursive:true});
const results=[];
let failed=false;
try {
  for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser = await engine.launch({headless:true});
    try {
      for(const [variant,html] of [['before',oldSource],['after',source]]){
        const context=await browser.newContext({viewport:{width:1473,height:850},serviceWorkers:'block'});
        const held=[];
        try {
          await context.route('**/*',async route => {
            if(route.request().isNavigationRequest()) return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
            const pathname=new URL(route.request().url()).pathname;
            if(names.some(name=>pathname==='/'+name)){
              await new Promise(resolve=>held.push(resolve));
            }
            return route.abort();
          });
          const page=await context.newPage();
          await page.goto(base+'/app?release=V266',{waitUntil:'commit',timeout:15000});
          if(variant==='before'){
            for(let i=0;i<40&&held.length<5;i++) await page.waitForTimeout(50);
            assert.equal(held.length,5,'negative control must really hold all five stylesheets');
            assert.equal(await page.locator('#aqariCloudGateV168').isVisible(),false,'original hides the gate while CSS is pending');
            assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('aqari-shell-ready')),false);
          } else {
            await page.locator('#aqariCloudGateV168').waitFor({state:'visible',timeout:3500});
            assert.equal(held.length,0,'fixed shell does not request blocking stylesheets');
            assert.equal(await page.locator('#home').isVisible(),false,'private home stays hidden without authentication');
            assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('aqari-auth-unlocked')),false);
            assert.equal(await page.locator('#auth').isVisible(),false,'legacy gate never leaks');
            await page.screenshot({path:output+'/'+engineName+'-after.png',timeout:10000});
          }
          const result={engine:engineName,variant,passed:true,heldStylesheets:held.length,gateVisible:await page.locator('#aqariCloudGateV168').isVisible()};
          results.push(result);console.log('APP_FIRST_PAINT',JSON.stringify(result));
        } catch(error) {
          failed=true;results.push({engine:engineName,variant,passed:false,error:error.message});console.error(error);
        } finally { for(const release of held) release(); await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.closeAllConnections();server.close();
  fs.writeFileSync(output+'/results.json',JSON.stringify({note:'Synthetic stalled-CSS reproduction, not a diagnosis of the owner device',results},null,2));
}
process.exitCode=failed?1:0;
