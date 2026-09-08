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
 const content={property_name:'اختبار معزول',period:'2026-08',summary:{printed_totals:{rent_kd:195,advance_kd:50,cleaning_kd:5}},rows:[{unit:'101',current_rent_kd:195,insurance_kd:50},{unit:'102',current_rent_kd:195,insurance_kd:75,insurance_status:'pending_reconciliation'}]};
 const record={workspace_id:'w',property_id:'p',period:'2026-08-01',source_sha256:'fixture',content};
 let failLinks=false;
 const queries=[];
 const dialog={body:new Element('div'),el:new Element('dialog'),status:new Element('p'),session:{bound:{workspace:'w'},client:{from(table){const q={table,filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},order(){return q;},limit(){return q;}};return q;}},async request(q){queries.push(q);if(q.table==='aqari_statement_links'){if(failLinks)throw Error('failed');return [];}return !q.filters.period||q.filters.period==='2026-08-01'?[record]:[];}}};
 const tasks=[];
 dialog.run=(fn)=>{const p=Promise.resolve().then(fn).catch(()=>{dialog.status.textContent='read failed';});tasks.push(p);return p;};
 globalThis.__statementFixture={t,message,createDialog:()=>dialog,node:(...args)=>new Element(...args),field:(_label,el)=>el};
 try{
  const source=(await readFile(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8')).replace("import {t,message} from '../components/locale.js';","const {t,message}=globalThis.__statementFixture;").replace("import {createDialog,node,field} from '../components/dialog.js';","const {createDialog,node,field}=globalThis.__statementFixture;");
  const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  mod.openPropertyStatements();await tasks[0];await Promise.resolve();
  const [property,month,refresh,pdf,link,result]=dialog.body.children;
  assert.equal(pdf.disabled,false);assert.equal(month.value,'2026-08');
  const cards=result.children.filter(el=>el.tag==='details');
  assert.ok(cards[0].children.some(el=>el.textContent==='التأمين: 50'));
  assert.ok(cards[1].children.some(el=>el.textContent==='التأمين: 75 — معلق'));
  month.value='2026-09';await month.onchange();
  assert.equal(result.children.length,0);assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف/);
  month.value='2026-08';await month.onchange();
  assert.equal(pdf.disabled,false);assert.equal(link.disabled,false);
  assert.ok(queries.some(q=>q.filters.period==='2026-09-01'&&q.filters.property_id==='p'&&q.filters.workspace_id==='w'));
  failLinks=true;await refresh.onclick();
  assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);assert.equal(result.children.length,0);
  failLinks=false;await refresh.onclick();assert.equal(pdf.disabled,false);
  const count=queries.length;month.value='';await month.onchange();assert.equal(queries.length,count);assert.equal(pdf.disabled,true);
  dialog.body.replaceChildren();let next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-09'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[1].value,'2026-09');assert.equal(dialog.body.children[3].disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف محفوظ لهذا الشهر/);
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:'عقار آخر',period:'2026-08'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'');assert.equal(dialog.body.children[3].disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف مصدر محفوظ لهذا العقار/);
  dialog.body.replaceChildren();next=tasks.length;
  mod.openPropertyStatements({propertyName:content.property_name,period:'2026-08'});await tasks[next];await Promise.resolve();
  assert.equal(dialog.body.children[0].value,'p');assert.equal(dialog.body.children[3].disabled,false);
 }finally{delete globalThis.__statementFixture;}
});
