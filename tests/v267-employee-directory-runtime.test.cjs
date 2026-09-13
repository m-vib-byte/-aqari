const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/pages/employees.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
function fixture(employees){
 const callbacks=[],calls=[];
 class Element{
  constructor(tag,text=''){this.tag=tag;this.children=[];this._text=text;this.value='';this.style={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=value;this.children=[];}
 }
 const node=(tag,text)=>new Element(tag,text),field=(label,control)=>{const group=node('div');group.label=label;group.append(control);return group;};
 const d={body:node('div'),status:node('p'),closed:false,onDispose:fn=>callbacks.push(fn),session:{bound:{workspace:'w'},client:{rpc(name,args){assert.equal(name,'aqari_hr');calls.push(args);return structuredClone({employees,properties:[],manager:false});}},request:query=>query},run(work){if(d.closed)return;d.pending=Promise.resolve().then(work).catch(error=>{d.status.textContent=error.message;});return d.pending;}};
 vm.runInNewContext(source+'\nopenEmployees();',{createDialog:()=>d,node,field,createPrivateUrls:()=>({clear(){}}),console});
 const descendants=el=>[el,...el.children.flatMap(descendants)];
 return {d,calls,search:()=>descendants(d.body).find(x=>x.tag==='input'&&x.type==='search'),cards:()=>descendants(d.body).filter(x=>x.tag==='article'),dispose(){d.closed=true;callbacks.forEach(fn=>fn());}};
}
const employee=overrides=>({id:'employee-one',status:'active',profile:{name_ar:'أحْمَد سالم',name_en:'Ahmed Salem',phone:'00965 5555-1234',job_ar:'محاسب'},...overrides});
test('employee search accepts Arabic digits, diacritics and formatted phone fragments without extra requests',async()=>{
 const f=fixture([employee(),employee({id:'two',profile:{name_ar:'سالم',name_en:'Salem',phone:'12340000',job_ar:'حارس'}})]);await f.d.pending;
 f.search().value='احمد';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);
 f.search().value='٥٥٥٥١٢٣٤';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);f.search().value='۵۵۵۵۱۲۳۴';f.search().oninput();assert.equal(f.cards().length,1);assert.match(f.cards()[0].textContent,/Ahmed Salem/);assert.equal(f.calls.length,1);
});
test('an incomplete returned employee profile cannot break the directory or render undefined values',async()=>{
 const f=fixture([employee({profile:{name_ar:'موظف محفوظ',phone:null}})]);await f.d.pending;assert.doesNotMatch(f.d.status.textContent,/Cannot read|undefined/);assert.equal(f.cards().length,1);assert.doesNotMatch(f.cards()[0].textContent,/undefined|null/);
 f.search().value='محفوظ';assert.doesNotThrow(()=>f.search().oninput());assert.equal(f.cards().length,1);
});
test('disposing the employee dialog removes private rows and queued search cannot restore them',async()=>{
 const f=fixture([employee()]);await f.d.pending;const search=f.search();assert.match(f.d.body.textContent,/Ahmed Salem/);f.dispose();assert.equal(f.d.body.children.length,0);search.oninput();assert.equal(f.d.body.children.length,0);assert.equal(f.calls.length,1);
});
