import {t,message} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// No database writes: exercise the actual screen handlers against a read-only fixture.
test('statement navigation isolates months and disables actions after missing data or read failure', async()=>{
 class Element {
  constructor(tag,text){this.tag=tag;this.textContent=text||'';this.children=[];this.value='';this.disabled=false;}
  append(...items){this.children.push(...items);if(this.tag==='select'&&!this.value)this.value=items[0].value;}
  prepend(...items){this.children.unshift(...items);}
  replaceChildren(){this.children=[];}
  addEventListener(){}
 }
 const content={property_key:'shaikhah-tower',property_name:'اختبار معزول',period:'2026-08',summary:{printed_totals:{rent_kd:195,advance_kd:50,cleaning_kd:5}},rows:[{unit:'101',current_rent_kd:195,insurance_kd:50},{unit:'102',current_rent_kd:195,insurance_kd:75,insurance_status:'pending_reconciliation'}]};
 const record={workspace_id:'w',property_id:'p',period:'2026-08-01',source_sha256:'fixture',content};
 let duplicateName=false;let omitInitialSource=false;let failReadiness=false;let failLinks=false;let noSource=false;let failLatest=false;let failInitial=false;let readinessPending=false;
 const queries=[];
 const dialog={onDispose(){return ()=>{};},body:new Element('div'),el:new Element('dialog'),status:new Element('p'),session:{bound:{workspace:'w'},client:{from(table){const q={table,filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},order(k,v){q.orderBy={k,...v};return q;},limit(n){q.limitCount=n;return q;}};return q;},rpc(name,args){return {rpc:name,args};}},async request(q){queries.push(q);if(q.rpc==='aqari_unit_readiness_register'&&failReadiness)throw Error('readiness read failed');if(q.rpc==='aqari_unit_readiness_register')return {properties:[{id:'p',name:content.property_name}],units:content.rows.map(row=>({id:'u-'+row.unit,property_id:'p',unit_no:row.unit,state:readinessPending?'review_required':'ready',revision:readinessPending?0:1})),history:[]};if(q.table==='aqari_properties')return duplicateName?[{id:'other',name:content.property_name},{id:'p',name:content.property_name}]:[{id:'p',name:content.property_name}];if(omitInitialSource&&q.limitCount===100)return [];if(failInitial&&q.limitCount===100)throw Error("initial read failed");if(q.table==='aqari_statement_links'){if(failLinks)throw Error('failed');return [];}if(q.table==='aqari_property_statements'&&q.limitCount===1){if(failLatest)throw Error('failed');return noSource?[]:[record];}return !q.filters.period||q.filters.period==='2026-08-01'?[record]:[];}}};
 const tasks=[];
 dialog.run=(fn)=>{const p=Promise.resolve().then(fn).catch(()=>{dialog.status.textContent='read failed';});tasks.push(p);return p;};
 globalThis.__statementFixture={t,message,createDialog:()=>dialog,node:(...args)=>new Element(...args),field:(_label,el)=>el};
 try{
  const source=(await readFile(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8')).replace("import {t,message} from '../components/locale.js';","const {t,message}=globalThis.__statementFixture;").replace("import {createDialog,node,field} from '../components/dialog.js';","const {createDialog,node,field}=globalThis.__statementFixture;");
  const linked=source.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_match,_quote,path)=>'from '+JSON.stringify(new URL(path,new URL('../src/v267/pages/property-statements.js',import.meta.url)).href));
  const mod=await import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
  mod.openPropertyStatements();await tasks[0];await Promise.resolve();
  const [property,month,refresh,pdf,link,readinessReview,result]=dialog.body.children;
  assert.equal(pdf.disabled,false);assert.equal(month.value,'2026-08');
  const cards=result.children.filter(el=>el.tag==='details');
  assert.ok(cards[0].children.some(el=>el.textContent==='التأمين: 50'));
  assert.ok(cards[1].children.some(el=>el.textContent==='التأمين: 75 — معلق'));
  month.value='2026-09';await month.onchange();
  assert.equal(result.children.length,0);assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف/);
  const latest=dialog.body.children.at(-1);assert.equal(latest.textContent,t('عرض آخر كشف محفوظ'));
  await latest.onclick();assert.equal(month.value,'2026-08');assert.equal(pdf.disabled,false);
  const lookup=queries.find(q=>q.limitCount===1);assert.equal(lookup.filters.property_id,'p');assert.equal(lookup.filters.workspace_id,'w');assert.equal(lookup.orderBy.ascending,false);
  noSource=true;await latest.onclick();assert.equal(pdf.disabled,true);assert.equal(result.children.length,0);assert.match(dialog.status.textContent,/لا يوجد كشف مصدر محفوظ لهذا العقار/);noSource=false;
  failLatest=true;await latest.onclick();assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);failLatest=false;
  month.value='2026-08';await month.onchange();
  assert.equal(pdf.disabled,false);assert.equal(link.disabled,false);assert.equal(readinessReview.hidden,true);
  readinessPending=true;await refresh.onclick();assert.equal(link.disabled,false,'historical source draft linking remains available');assert.equal(readinessReview.hidden,false);
  assert.ok(result.children.some(el=>/تحتاج معاينة موثقة قبل تفعيل عقد تشغيلي/.test(el.textContent||'')));
  readinessPending=false;await refresh.onclick();assert.equal(link.disabled,false);assert.equal(readinessReview.hidden,true);
  assert.ok(queries.some(q=>q.filters?.period==='2026-09-01'&&q.filters.property_id==='p'&&q.filters.workspace_id==='w'));
  failLinks=true;await refresh.onclick();
  assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);assert.equal(result.children.length,0);
  failLinks=false;await refresh.onclick();assert.equal(pdf.disabled,false);
  failReadiness=true;await refresh.onclick();assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);assert.equal(readinessReview.hidden,true);assert.equal(result.children.length,0);
  failReadiness=false;await refresh.onclick();assert.equal(pdf.disabled,false);
  const count=queries.length;month.value='';await month.onchange();assert.equal(queries.length,count);assert.equal(pdf.disabled,true);
  dialog.body.replaceChildren();let next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-09'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[1].value,'2026-09');assert.equal(dialog.body.children[3].disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف مصدر محفوظ لهذا الشهر/);
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:'عقار آخر',period:'2026-08'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'');assert.equal(dialog.body.children[3].disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد عقار مطابق ضمن صلاحيتك/);
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-08'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'p');assert.equal(dialog.body.children[3].disabled,false);
  const handoff=[];dialog.session.check=()=>handoff.push('check');dialog.close=()=>handoff.push('close');
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-08',onBack:()=>handoff.push('back')});await tasks[next];
  const back=dialog.body.children[0];assert.equal(back.textContent,t('العودة للعقود / Back'));back.onclick();
  assert.deepEqual(handoff,['check','close','back']);
  content.property_key='dhahawi-tower';content.source_notes=['Archived source — review required'];content.rows[0].source_note='Original name discrepancy';
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-08'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[3].disabled,false);
  assert.equal(dialog.body.children[4].disabled,true);
  const archived=dialog.body.children[6];
  assert.ok(archived.children.some(el=>el.textContent==='Archived source — review required'));
  assert.ok(archived.children.find(el=>el.tag==='details').children.some(el=>el.textContent==='Original name discrepancy'));
  const before=queries.length;await dialog.body.children[4].onclick();assert.equal(queries.length,before);
  dialog.body.replaceChildren();next=tasks.length;failInitial=true;
  mod.openPropertyStatements();await tasks[next];await Promise.resolve();
  const retry=dialog.body.children[2];assert.equal(dialog.body.children[0].children.length,0);
  failInitial=false;await retry.onclick();
  assert.equal(dialog.body.children[0].value,'p','retry must reload the missing property choices');
  assert.equal(dialog.body.children[3].disabled,false,'retry must recover the saved statement');
  assert.equal(dialog.body.children[0].children.length,1,'retry must not duplicate property choices');

  dialog.body.replaceChildren();next=tasks.length;duplicateName=true;omitInitialSource=true;
  mod.openPropertyStatements({propertyId:'p',propertyName:'اسم سابق'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'p');assert.equal(dialog.body.children[1].value,'2026-08');assert.equal(dialog.body.children[3].disabled,false);
  assert.ok(queries.some(q=>q.limitCount===1&&q.filters.property_id==='p'&&q.filters.workspace_id==='w'));
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyId:'unavailable',propertyName:content.property_name});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'');assert.equal(dialog.body.children[3].disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد عقار مطابق ضمن صلاحيتك/);
 }finally{delete globalThis.__statementFixture;}
});
