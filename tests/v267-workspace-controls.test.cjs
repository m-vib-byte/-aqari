const test=require('node:test');const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const path=require('node:path');
const moduleAt=name=>import(pathToFileURL(path.resolve('src/v267/'+name)).href);
test('all five locales cover stable keys with readable labels',async()=>{
 const {LANGUAGES,LABEL_KEYS,label}=await moduleAt('components/catalog.js');
 assert.equal(Object.keys(LANGUAGES).length,5);
 for(const locale of Object.keys(LANGUAGES))for(const key of LABEL_KEYS)assert.ok(label(key,locale).trim());
 assert.throws(()=>label('renamed-programmatic-key'));
});
test('custom display labels cannot inject markup or rename keys',async()=>{
 const {label,validateSettings}=await moduleAt('components/catalog.js');
 assert.equal(label('home','ar',{ar:{home:'الرئيسية التنفيذية'}}),'الرئيسية التنفيذية');
 assert.equal(label('home','ar',{ar:{home:'<img onerror=x>'}}),'الرئيسية');
 assert.throws(()=>validateSettings({sections:{home:true},permissions:{},labels:{ar:{home:'<script>'}}}));
 assert.throws(()=>validateSettings({sections:{production:true},permissions:{},labels:{}}));
 assert.throws(()=>validateSettings({sections:{home:'false'},permissions:{},labels:{}}));
 assert.throws(()=>validateSettings({sections:{},permissions:{},labels:{fr:{home:'Accueil'}}}));
});
test('scan geometry bounds iPhone image processing and preserves rotated aspect ratio',async()=>{
 const {scanGeometry}=await moduleAt('components/scan-image.js');
 assert.deepEqual(scanGeometry(4000,3000,90),{sx:0,sy:0,sw:4000,sh:3000,width:1800,height:2400,rotation:90});
 assert.deepEqual(scanGeometry(1000,500,0,{top:10,bottom:10,left:10,right:10}),{sx:100,sy:50,sw:800,sh:400,width:800,height:400,rotation:0});
 for(const args of [[0,100],[100000,100000],[100,100,45],[100,100,0,{top:-1,bottom:0,left:0,right:0}]])assert.throws(()=>scanGeometry(...args));
});
test('document content digest detects changed bytes',async()=>{
 const {checksum}=await moduleAt('components/scan-image.js');
 assert.equal(await checksum(new Blob(['abc'])),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.notEqual(await checksum(new Blob(['abd'])),await checksum(new Blob(['abc'])));
});
function context(){
 global.document={documentElement:{classList:{contains:()=>true}}};
 global.window={AQARI_PUBLIC_CONFIG:{supabaseUrl:'https://djkpkkgoibruaezdrchb.supabase.co'},AQARI_DATA_GATE:{scope:{userId:'u',workspaceId:'w'}},AQARI_SUPABASE:{context:{user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',role:'general_manager',is_active:true}},getClient:async()=>({})}};
}
test('session rejects production configuration and a mismatched workspace',async()=>{
 context();const {currentScope}=await moduleAt('api/session.js');assert.equal(currentScope().workspace,'w');
 window.AQARI_PUBLIC_CONFIG.supabaseUrl='https://example.invalid';assert.throws(currentScope);
 context();window.AQARI_DATA_GATE.scope.workspaceId='other';assert.throws(currentScope);
});
test('closing a page aborts in-flight requests',async()=>{
 context();const {createSession}=await moduleAt('api/session.js');const s=createSession();let signal;
 const pending=s.request({abortSignal(value){signal=value;return new Promise((_,reject)=>value.addEventListener('abort',()=>reject(Error('aborted'))));}});
 s.close();await assert.rejects(pending,/aborted/);assert.equal(signal.aborted,true);
});
test('late response is discarded when account changes',async()=>{
 context();const {createSession}=await moduleAt('api/session.js');const s=createSession();let finish;
 const pending=s.request({abortSignal(){return new Promise(resolve=>finish=resolve);}});
 window.AQARI_SUPABASE.context.user.id='another';finish({data:{private:'never returned'}});
 await assert.rejects(pending,/جلسة/);s.close();
});
test('new upload paths must be inside the bound workspace',async()=>{
 context();const {createSession}=await moduleAt('api/session.js');const s=createSession();
 await assert.rejects(s.storage('POST','other/doc.jpg',new Blob(['x'])),/مسار/);
 await assert.rejects(s.storage('POST','w/../doc.jpg',new Blob(['x'])),/مسار/);s.close();
});
test('backend errors never expose raw provider messages',async()=>{
 const {safeError}=await moduleAt('api/session.js');
 assert.ok(!safeError(Error('upstream secret_value')).includes('secret_value'));
 assert.match(safeError(Error('ACCESS_DENIED')),/صلاحية/);
});

test('initial client connection times out and a late resolution cannot replace the retry client',async t=>{
 context();const {createSession}=await moduleAt('api/session.js');t.mock.timers.enable({apis:['setTimeout']});
 const s=createSession();let finish;window.AQARI_SUPABASE.getClient=()=>new Promise(resolve=>finish=resolve);
 const pending=s.connect(),rejected=assert.rejects(pending,/انتهت مهلة الاتصال/);
 await Promise.resolve();t.mock.timers.tick(20000);await rejected;
 const retryClient={fresh:true};window.AQARI_SUPABASE.getClient=async()=>retryClient;
 assert.equal(await s.connect(),retryClient);finish({stale:true});await Promise.resolve();await Promise.resolve();
 assert.equal(s.client,retryClient);s.close();
});

test('closing the dialog interrupts client setup even when the provider never resolves',async t=>{
 context();const {createSession}=await moduleAt('api/session.js');t.mock.timers.enable({apis:['setTimeout']});
 const s=createSession();window.AQARI_SUPABASE.getClient=()=>new Promise(()=>{});
 const pending=s.connect();let outcome='pending';pending.then(()=>outcome='resolved',()=>outcome='rejected');
 s.close();for(let n=0;n<8;n++)await Promise.resolve();
 assert.equal(outcome,'rejected','close must settle setup without waiting for the connection deadline');
 await assert.rejects(pending,/جلسة/);assert.equal(s.client,undefined);
});

test('changed account during client setup rejects the candidate without retaining it',async()=>{
 context();const {createSession}=await moduleAt('api/session.js');const s=createSession();let finish;
 window.AQARI_SUPABASE.getClient=()=>new Promise(resolve=>finish=resolve);
 const pending=s.connect();await Promise.resolve();window.AQARI_SUPABASE.context.user.id='another';finish({private:'discard'});
 await assert.rejects(pending,/جلسة/);assert.equal(s.client,undefined);s.close();
});

test('a synchronous client setup error permits a successful retry',async()=>{
 context();const {createSession}=await moduleAt('api/session.js');const s=createSession();
 window.AQARI_SUPABASE.getClient=()=>{throw Error('provider unavailable');};await assert.rejects(s.connect(),/provider unavailable/);
 const client={ready:true};window.AQARI_SUPABASE.getClient=async()=>client;assert.equal(await s.connect(),client);s.close();
});
