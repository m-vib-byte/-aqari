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
test('auth return uses only the stable V267 staging entry, independent of Visit deployment origin',()=>{
 const r=runtime();assert.equal(r.api.authRedirectUrl(),'https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?release=V267');
 for(const url of ['http://localhost:3000','https://myaqari.com/login.html?release=V267','https://attacker.invalid/login.html?release=V267','https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?next=https://attacker.invalid'])assert.throws(()=>runtime({url}).api.authRedirectUrl(),/AQARI_STAGING_REDIRECT_INVALID/);
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
 assert.doesNotMatch(html.split('</head>')[0],/<link[^>]+rel=["']stylesheet["'][^>]*>/i);
 const allowed=new Set(['owner-reference-login','unified-portal','premium-portal-refinement','luxury-warm-beige','owner-final-login','professional-login']);
 for(const match of login.split('</head>')[0].matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)){
  const href=match[0].match(/href="([^"]+)"/)?.[1];
  const style=href?.match(/^\/src\/v267\/styles\/([a-z-]+)\.css\?release=V267$/)?.[1];
  assert.ok(allowed.has(style),'only reviewed same-origin reference styles may augment the inline login');
 }
 assert.ok(Buffer.byteLength(login)<19000);
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
