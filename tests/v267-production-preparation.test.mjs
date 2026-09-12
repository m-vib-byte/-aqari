import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {productionPatch,PRODUCTION_PROJECT,PREVIEW_PROJECT,PRODUCTION_REDIRECT} from '../scripts/prepare-v267-production.mjs';
import {deploymentTargetErrors} from '../scripts/verify-deployment-target.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const options={projectRef:PRODUCTION_PROJECT,publishableKey:'sb_publishable_fixture'};
const patch=productionPatch(read,options);
function browserConfig(){const ctx={window:{}};vm.runInNewContext(patch.get('public-config.js'),ctx);return ctx.window.AQARI_PUBLIC_CONFIG;}
function sessionFixture(){
  const cfg=browserConfig(),scope={userId:'u',workspaceId:'w'};
  const context={user:{id:'u'},workspace:{id:'w'},membership:{user_id:'u',workspace_id:'w',is_active:true,role:'general_manager'}};
  const calls=[];const w={AQARI_PUBLIC_CONFIG:cfg,AQARI_DATA_GATE:{scope},AQARI_SUPABASE:{context,getClient:async()=>({}),getSession:async()=>({user:{id:'u'},access_token:'synthetic-only'})}};
  const ctx={window:w,document:{documentElement:{classList:{contains:()=>true}}},AbortController,setTimeout,clearTimeout,Blob,
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,blob:async()=>new Blob(['synthetic file']),json:async()=>({Key:'saved'})};}};
  vm.runInNewContext(patch.get('src/v267/api/session.js').replace(/\bexport /g,''),ctx);
  return {ctx,window:w,calls,session:ctx.createSession()};
}
test('production preparation is separate and leaves isolated source unchanged',()=>{
  assert.match(read('public-config.js'),new RegExp(PREVIEW_PROJECT));
  assert.equal(patch.size,15);
  for(const path of patch.keys())assert.ok(!/^(staging-database|supabase|\.github)\//.test(path));
  const cfg=browserConfig();assert.equal(cfg.supabaseUrl,`https://${PRODUCTION_PROJECT}.supabase.co`);
  assert.equal(cfg.supabaseAuthStorageKey,`sb-${PRODUCTION_PROJECT}-auth-token`);
  assert.equal(cfg.supabaseAuthRedirectUrl,PRODUCTION_REDIRECT);
  const backend=patch.get('lib/release-config.js');
  assert.match(backend,/RELEASE_STAGE = 'production'/);
  assert.deepEqual(deploymentTargetErrors('production',cfg,{PRODUCT_VERSION:'V267',RELEASE_STAGE:'production',SUPABASE_PUBLIC_CONFIG:{url:cfg.supabaseUrl,publishableKey:cfg.supabasePublishableKey}}),[]);
});
test('preparation refuses another database, private keys and unreviewed source drift',()=>{
  for(const projectRef of [PREVIEW_PROJECT,'qtavnufzbkdfeauyukot','unknown'])assert.throws(()=>productionPatch(read,{...options,projectRef}),/CURRENT_PRODUCTION_PROJECT_REQUIRED/);
  for(const publishableKey of ['service_role','sb_secret_never_public',''])assert.throws(()=>productionPatch(read,{...options,publishableKey}),/PUBLISHABLE_KEY_REQUIRED/);
  assert.throws(()=>productionPatch(path=>read(path)+(path==='cloud-sync.js'?PREVIEW_PROJECT:''),options),/PRODUCTION_SOURCE_CHANGED/);
  assert.throws(()=>productionPatch(path=>path==='src/v267/workspace.js'?read(path).replace('tools.append(staffCirculars,readinessButton,','tools.append(readinessButton,'):read(path),options),/PRODUCTION_SOURCE_CHANGED/);
});
test('production document reads and writes retain scope, immutable uploads and the current data source',async()=>{
  const f=sessionFixture();
  assert.equal(await (await f.session.storage('GET','w/file.pdf')).text(),'synthetic file');
  await f.session.storage('POST','w/new.pdf',new Blob(['synthetic'],{type:'application/pdf'}));
  assert.equal(f.calls.length,2);
  assert.equal(f.calls[0].url,`https://${PRODUCTION_PROJECT}.supabase.co/storage/v1/object/authenticated/aqari-documents/w/file.pdf`);
  assert.equal(f.calls[1].options.headers['x-upsert'],'false');
  assert.equal(f.calls[1].options.redirect,'error');
  for(const path of ['other/file.pdf','w/../file.pdf'])await assert.rejects(f.session.storage('POST',path,new Blob()));
  assert.equal(f.calls.length,2);f.session.close();
});
test('production session rejects changed account, workspace and configuration before file transmission',async()=>{
  for(const mutation of [f=>{f.window.AQARI_SUPABASE.context.user.id='foreign';},f=>{f.window.AQARI_DATA_GATE.scope.workspaceId='foreign';},f=>{f.window.AQARI_PUBLIC_CONFIG={...f.window.AQARI_PUBLIC_CONFIG,supabaseUrl:`https://${PREVIEW_PROJECT}.supabase.co`};}]){
    const f=sessionFixture();mutation(f);await assert.rejects(f.session.storage('GET','w/file.pdf'));assert.equal(f.calls.length,0);f.session.close();
  }
});
test('production Auth callbacks allow only the exact myaqari.com login callback',()=>{
  for(const redirect of [PRODUCTION_REDIRECT,'https://myaqari.com.evil.invalid/login.html?release=V267','https://myaqari.com/login.html?next=https://evil.invalid',`https://aqari-git-design-v267-premium-workspace-m-vib-5421.vercel.app/login.html?release=V267`]){
    const window={AQARI_PUBLIC_CONFIG:{...browserConfig(),supabaseAuthRedirectUrl:redirect},location:{origin:'https://myaqari.com'}};
    vm.runInNewContext(patch.get('supabase-adapter.js'),{window,document:{},URL,location:window.location,setTimeout,clearTimeout});
    if(redirect===PRODUCTION_REDIRECT)assert.equal(window.AQARI_SUPABASE.authRedirectUrl(),redirect);
    else assert.throws(()=>window.AQARI_SUPABASE.authRedirectUrl(),/AQARI_PRODUCTION_REDIRECT_INVALID/);
  }
});
test('tenant, partner and password recovery retain explicit production project and stage guards',()=>{
  for(const path of ['v267-tenant-portal.js','v267-partner-portal.js','v267-reset-password.js']){
    assert.ok(patch.get(path).includes(PRODUCTION_PROJECT));assert.ok(!patch.get(path).includes(PREVIEW_PROJECT));assert.match(patch.get(path),/releaseStage!==?'production'/);
  }
  assert.ok(patch.get('v267-partner-portal.js').includes("redirect!=='"+PRODUCTION_REDIRECT+"'"));
  assert.ok(!patch.get('v267-partner-portal.js').includes('aqari-git-design-v267-premium-workspace'));
});

test('Vercel prepares production in a disposable build and leaves preview isolated',()=>{
  for(const environment of ['preview','production']){
    const dir=mkdtempSync(join(tmpdir(),'aqari-target-build-'));
    try{
      const paths=new Set([...patch.keys(),'scripts/build-vercel.mjs','scripts/check.mjs','scripts/prepare-v267-production.mjs','scripts/verify-deployment-target.mjs','config/production-target.json','package.json','index.html','vercel.json','api/health.js','api/release.js','api/config-status.js','.env.example']);
      for(const path of paths){const target=join(dir,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,read(path));}
      const result=spawnSync(process.execPath,['scripts/build-vercel.mjs'],{cwd:dir,encoding:'utf8',env:{...process.env,VERCEL_ENV:environment}});
      assert.equal(result.status,0,result.stderr);
      const ctx={window:{}};vm.runInNewContext(readFileSync(join(dir,'public-config.js'),'utf8'),ctx);
      assert.equal(ctx.window.AQARI_PUBLIC_CONFIG.releaseStage,environment);
      assert.equal(ctx.window.AQARI_PUBLIC_CONFIG.supabaseUrl,`https://${environment==='production'?PRODUCTION_PROJECT:PREVIEW_PROJECT}.supabase.co`);
      if(environment==='preview')assert.equal(readFileSync(join(dir,'src/v267/api/session.js'),'utf8'),read('src/v267/api/session.js'));
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
  assert.match(read('public-config.js'),new RegExp(PREVIEW_PROJECT));
});

test('production imported-tenant edits omit the unsupported preference and confirm the existing record',async()=>{
  const controls={},calls=[];let profile={nameAr:'اسم محفوظ',passportNo:'OLD'},revision=4,saved=0;
  const node=(tag,text)=>({tag,textContent:text||'',value:'',children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const field=(label,input)=>{controls[label]=input;return input;};
  const d={body:node('div'),status:node('p'),session:{bound:{workspace:'w'},check(){},client:{rpc:(name,args)=>({name,args})},async request(call){
    calls.push(call);if(call.name.endsWith('_save')){
      assert.ok(!Object.hasOwn(call.args.p_patch,'preferredContact'),'current backend rejects this unsupported key');
      assert.equal(call.args.p_expected_revision,revision);
      profile={...profile,...call.args.p_patch};revision++;
    }
    return {profile:{...profile},revision,history:[]};
  }},run:fn=>fn()};
  const context={createDialog:()=>d,node,field};
  vm.runInNewContext(patch.get('src/v267/pages/imported-tenant.js').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
  await context.openImportedTenant({ref:'tenant-a',onSaved:async()=>{saved++;},onDraft:async()=>{}});
  assert.equal(controls['وسيلة التواصل المفضلة'],undefined);
  controls['رقم الجواز'].value='UPDATED';controls['سبب التعديل أو مرجع التصحيح'].value='مرجع تصحيح محفوظ';
  await d.body.children.find(x=>x.tag==='button'&&x.textContent==='حفظ التعديل والتحقق').onclick();
  assert.equal(profile.passportNo,'UPDATED');assert.equal(saved,1);assert.equal(revision,5);
  assert.equal(calls.at(-1).name,'aqari_imported_tenant_read');
  assert.match(d.status.textContent,/تم حفظ التعديل وإعادة قراءته/);
});

test('unavailable new original-document uploads cannot open or send a request in production',()=>{
  let opened=0;const context={createDialog(){opened++;throw Error('must not open');}};
  vm.runInNewContext(patch.get('src/v267/pages/original-documents.js').replace(/^import .*;$/gm,'').replace(/\bexport /g,''),context);
  assert.throws(()=>context.openOriginalDocuments(),/قيد التجهيز/);assert.equal(opened,0);
  assert.ok(patch.get('src/v267/workspace.js').includes('originals.hidden=true;originals.disabled=true;'));
  assert.equal(patch.has('src/v267/pages/document-scanner.js'),false,'existing compatible scanner remains available');
});
