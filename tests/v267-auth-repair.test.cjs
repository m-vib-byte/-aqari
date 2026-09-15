const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const adapter=fs.readFileSync('supabase-adapter.js','utf8');
const configContext={window:{}};vm.runInNewContext(fs.readFileSync('public-config.js','utf8'),configContext);
const config=configContext.window.AQARI_PUBLIC_CONFIG;
function runtime({hash='',search='',url=config.supabaseAuthRedirectUrl}={}){
 const current={user:{id:'synthetic-owner'},access_token:'synthetic-token-not-valid'};
 const client={auth:{async getSession(){return {data:{session:current},error:null};},stopAutoRefresh(){}}};
 const window={AQARI_PUBLIC_CONFIG:{...config,supabaseAuthRedirectUrl:url},location:{origin:'https://preview-test.invalid',hash,search},supabase:{createClient(_url,_key,options){assert.equal(options.auth.detectSessionInUrl,true);assert.equal(options.auth.persistSession,true);return client;}}};
 vm.runInNewContext(adapter,{window,document:{},URL,location:window.location,console,setTimeout,clearTimeout});
 return {api:window.AQARI_SUPABASE,current};
}
test('auth return uses only the configured exact V267 Preview entry, independent of Visit deployment origin',()=>{
 const expected=new URL(config.supabaseAuthRedirectUrl);
 const r=runtime();assert.equal(r.api.authRedirectUrl(),expected.href);
 for(const url of ['http://localhost:3000','https://myaqari.com/login.html?release=V267','https://attacker.invalid/login.html?release=V267',`https://${expected.hostname}/login.html?next=https://attacker.invalid`,'https://different-preview.vercel.app/login.html?release=V267'])assert.throws(()=>runtime({url}).api.authRedirectUrl(),/AQARI_STAGING_REDIRECT_INVALID/);
});
test('callback error never restores an older session or displays provider query contents',async()=>{
 const r=runtime({hash:'#error=access_denied&error_description=private-provider-text'});
 await assert.rejects(r.api.getSession(),e=>!e.message.includes('private-provider-text')&&e.message.includes('بحسابك الحالي'));
 assert.equal(r.current.user.id,'synthetic-owner');
});
test('SDK callback session remains available for normal membership verification',async()=>{
 const r=runtime({hash:'#access_token=synthetic-token-not-valid&type=signup'});
 assert.equal((await r.api.getSession()).user.id,'synthetic-owner');
 assert.equal(r.api.context.membership,null,'a callback alone must not grant workspace authorization');
});
test('canonical V267 styles are inline on the app entry and login identity is present before any script',()=>{
 const css=fs.readFileSync('v267-unified.css','utf8'),html=fs.readFileSync('index.html','utf8'),login=fs.readFileSync('login.html','utf8');
 assert.ok(html.includes('<style data-aqari-unified-source="/v267-unified.css">\n'+css+'\n</style>'));
 assert.ok(login.slice(0,login.indexOf('</head>')).includes(css.slice(css.lastIndexOf('@media screen {'))));
 for(const source of [html,login])assert.doesNotMatch(source.split('</head>')[0],/<link[^>]+rel=["']stylesheet["'][^>]*>/i);
 assert.ok(Buffer.byteLength(login)<17000);
});
test('transport timeout resets loading without erasing a persisted session',()=>{
 const source=fs.readFileSync('login.html','utf8');const start=source.indexOf('function resetTimedOutCore('),end=source.indexOf('function loadScript(',start);
 let clears=0;const context={window:{AQARI_SUPABASE:{clearPersistedSession(){clears++;}}},corePromise:{}};
 vm.runInNewContext(source.slice(start,end)+";resetTimedOutCore({code:'AQARI_TIMEOUT'});",context);
 assert.equal(context.corePromise,null);assert.equal(clears,0);
});
test('closing the property chooser restores the captured connected trigger after cleanup',()=>{
 const source=fs.readFileSync('v205-simplified-shell.js','utf8');
 const start=source.indexOf('function closeChooser('),end=source.indexOf('function openPropertyAction(',start);
 for(const connected of [true,false]){
  let focused=0;const queued=[];
  class Element{constructor(){this.isConnected=connected;}focus(){focused++;}}
  const overlay={classList:{contains(){return true;},remove(){}},setAttribute(){}};
  const context={chooserTrigger:new Element(),HTMLElement:Element,document:{getElementById(){return overlay;},body:{classList:{remove(){}}}},setChooserBackgroundInert(){},setTimeout(fn){queued.push(fn);}};
  vm.runInNewContext(source.slice(start,end)+';closeChooser(true);',context);
  assert.equal(context.chooserTrigger,null);assert.equal(focused,0);assert.equal(queued.length,1);
  queued[0]();assert.equal(focused,connected?1:0);
 }
});
