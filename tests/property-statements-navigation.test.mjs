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
 const content={property_name:'اختبار معزول',period:'2026-08',summary:{printed_totals:{rent_kd:195,advance_kd:50,cleaning_kd:5}},rows:[{unit:'101',contract_no_raw:'C-101',contract_rent_kd:250,current_rent_kd:195,insurance_kd:50},{unit:'102',contract_no_raw:'C-102',contract_rent_kd:195,current_rent_kd:195,insurance_kd:75,insurance_status:'pending_reconciliation'}]};
 const record={workspace_id:'w',property_id:'p',period:'2026-08-01',source_sha256:'fixture',content};
 const collectionReport={properties:[{property_id:'p',gross_contract_rent:445,discounts:55,due:390,paid_total:195,allocated_paid:195,remaining:195,collection_rate_pct:50,rate_denominator:390,overpayment:0}],lines:[{property_id:'p',unit_no:'101',contract_no:'C-101',due:195,allocated_paid:195,remaining:0,discount:55,overpayment:0,status:'paid'},{property_id:'p',unit_no:'102',contract_no:'C-102',due:195,allocated_paid:0,remaining:195,discount:0,overpayment:0,status:'due'}]};
 let failLinks=false,failCollection=false,collectionReads=0;
 const queries=[];
 const dialog={onDispose(){return ()=>{};},body:new Element('div'),el:new Element('dialog'),status:new Element('p'),session:{bound:{workspace:'w'},client:{from(table){const q={table,filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},order(){return q;},limit(){return q;}};return q;},rpc(name,args){return {rpc:name,args};}},async request(q){queries.push(q);if(q.rpc==='aqari_monthly_collection_report'){collectionReads++;assert.equal(q.args.p_workspace_id,'w');assert.equal(q.args.p_property_id,'p');assert.equal(q.args.p_period,'2026-08-01');if(failCollection)throw Error('collection failed');return collectionReport;}if(q.table==='aqari_statement_links'){if(failLinks)throw Error('failed');return [];}return !q.filters.period||q.filters.period==='2026-08-01'?[record]:[];}}};
 const tasks=[];
 dialog.run=(fn)=>{const p=Promise.resolve().then(fn).catch(()=>{dialog.status.textContent='read failed';});tasks.push(p);return p;};
 globalThis.__statementFixture={t,message,createDialog:()=>dialog,node:(...args)=>new Element(...args),field:(_label,el)=>el};
 try{
  const source=(await readFile(new URL('../src/v267/pages/property-statements.js',import.meta.url),'utf8')).replace("import {t,message} from '../components/locale.js';","const {t,message}=globalThis.__statementFixture;").replace("import {createDialog,node,field} from '../components/dialog.js';","const {createDialog,node,field}=globalThis.__statementFixture;");
  const linked=source.replace("'../components/private-urls.js'",JSON.stringify(new URL('../src/v267/components/private-urls.js',import.meta.url).href)).replace("'../api/protected-pdf.js'",JSON.stringify(new URL('../src/v267/api/protected-pdf.js',import.meta.url).href));
  const mod=await import('data:text/javascript;base64,'+Buffer.from(linked).toString('base64'));
  mod.openPropertyStatements();await tasks[0];await Promise.resolve();
  const [property,month,refresh,pdf,link,result,collection,collectionResult]=dialog.body.children;
  assert.equal(pdf.disabled,false);assert.equal(month.value,'2026-08');
  const cards=result.children.filter(el=>el.tag==='details');
  assert.ok(cards[0].children.some(el=>el.textContent==='التأمين: 50'));
  assert.ok(cards[1].children.some(el=>el.textContent==='التأمين: 75 — معلق'));
  assert.equal(collectionReads,1,'successful saved statement auto-reads the protected collection report once');
  assert.ok(collectionResult.children.some(el=>String(el.textContent).includes('المدفوع: 195')));
  assert.ok(collectionResult.children.some(el=>String(el.textContent).includes('المتبقي: 195')));
  month.value='2026-09';await month.onchange();
  assert.equal(result.children.length,0);assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);
  assert.match(dialog.status.textContent,/لا يوجد كشف/);assert.equal(collectionReads,1,'missing source statement does not fabricate collection readback');
  month.value='2026-08';await month.onchange();
  assert.equal(pdf.disabled,false);assert.equal(link.disabled,false);assert.equal(collectionReads,2);
  assert.ok(queries.some(q=>q.filters?.period==='2026-09-01'&&q.filters.property_id==='p'&&q.filters.workspace_id==='w'));
  failLinks=true;await refresh.onclick();
  assert.equal(pdf.disabled,true);assert.equal(link.disabled,true);assert.equal(result.children.length,0);assert.equal(collectionReads,2,'failed statement-link read stops before collection readback');
  failLinks=false;failCollection=true;await refresh.onclick();assert.equal(pdf.disabled,false);assert.equal(collectionReads,3);
  assert.ok(collectionResult.children.some(el=>String(el.textContent).includes('تعذر تحميل المدفوع والمتبقي تلقائياً')),'collection read failure stays explicit and does not hide the saved source statement');
  failCollection=false;
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
