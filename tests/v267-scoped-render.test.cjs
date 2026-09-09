const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('index.html','utf8');
const helper=source.match(/function aqariRenderPageActiveV267\(ids\)\{[\s\S]*?\n\}/)[0];
const wrappers=[...source.matchAll(/render=function\(\)\{rv(\d+)\(\);if\(aqariRenderPageActiveV267\(\[([^\]]+)\]\)\)\{([^\n]+?)\}\};render\(\);/g)];
function harness(){
 let active='home';const calls=[];
 const context={document:{getElementById:id=>({classList:{contains:()=>id===active}})}};
 vm.createContext(context);vm.runInContext(helper,context);
 for(const m of wrappers){
  context['rv'+m[1]]=()=>{};
  for(const call of m[3].matchAll(/\b(\w+)\(\)/g))context[call[1]]=()=>calls.push(call[1]);
 }
 return {context,calls,select(id){active=id},render(){for(const m of wrappers)vm.runInContext(m[0],context)}};
}
test('repeated navigation does not execute hidden module rendering or storage audits',()=>{
 const h=harness();assert.equal(wrappers.length,36);
 for(let pass=0;pass<20;pass++)for(const page of ['home','collectionProPage','list','maintenanceProPage','home']){h.select(page);h.render()}
 assert.equal(h.calls.filter(x=>x==='refreshCollectionProV61').length,20);
 assert.equal(h.calls.filter(x=>x==='refreshMaintenanceProV62').length,20);
 assert.equal(h.calls.filter(x=>x==='runHardeningAuditV118').length,0);
 assert.equal(h.calls.filter(x=>x==='renderMigrationHealthV118').length,0);
 assert.ok(h.calls.every(x=>['fillInstTenantsV61','renderInstallmentPlansV61','refreshCollectionProV61','refreshMaintenanceProV62'].includes(x)));
});
test('every scoped section still renders on entry and renders fresh data again on return',()=>{
 for(const m of wrappers){
  for(const page of m[2].matchAll(/'([^']+)'/g)){
   const h=harness();h.select(page[1]);vm.runInContext(m[0],h.context);
   const first=h.calls.length;assert.ok(first>0,page[1]);
   h.select('list');vm.runInContext(m[0],h.context);assert.equal(h.calls.length,first);
   h.select(page[1]);vm.runInContext(m[0],h.context);assert.equal(h.calls.length,first*2);
  }
 }
});
test('hardening storage scan remains available through an explicit action',()=>{
 const h=harness();h.select('list');h.render();assert.equal(h.calls.length,0);
 h.context.runHardeningAuditV118();assert.deepEqual(h.calls,['runHardeningAuditV118']);
});
