const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/financial-archive.js'),'utf8');

class Element{
 constructor(tag,text){this.tag=tag;this.children=[];this.parent=null;this._text=text===undefined?'':String(text);this.value='';this.disabled=false;this.style={};this.attributes={};}
 append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
 replaceChildren(...items){for(const item of this.children)item.parent=null;this.children=[];this._text='';this.append(...items);}
 setAttribute(key,value){this.attributes[key]=String(value);}
 set textContent(value){this.replaceChildren();this._text=String(value);}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}}
 click(){if(!this.disabled)return this.onclick?.();}
}
const all=(root,predicate)=>[...(predicate(root)?[root]:[]),...root.children.flatMap(x=>all(x,predicate))];
function expense(overrides={}){return {id:'expense-1',workspace_id:'workspace-a',on_date:'2026-09-01',property_id:'property-a',stream:'expense',reference:'EXP-401',description:'شركة الصيانة — صيانة المصعد',direction:'paid',amount:'120.500',status:'approved',...overrides};}
function record(overrides={}){return {month:'2026-09',scope:'scoped_sources_not_consolidated_profit',summary:{approved_expenses:'120.500',count:1},entries:[expense()],history:[],period:null,properties:[{id:'property-a',name:'برج الاختبار'}],...overrides};}
function harness(initial=record()){
 const root=new Element('body'),body=new Element('div'),status=new Element('p');root.append(body,status);
 const cleanup=[],requests=[],tasks=[],downloads=[],blobs=new Map(),timers=new Map(),revoked=[];let serial=0,closed=false,denied=false,responder=()=>initial;
 function dispose(){if(closed)return;closed=true;cleanup.forEach(fn=>fn());}
 const session={bound:{workspace:'workspace-a'},check(){if(denied){const e=new Error('ACCESS_DENIED');e.status=403;throw e;}if(closed)throw Error('closed');},client:{rpc(name,args){requests.push({name,args:JSON.parse(JSON.stringify(args))});return responder(args);}},request:async promise=>await promise};
 const d={body,status,session,onDispose:fn=>cleanup.push(fn),get closed(){return closed;},run(fn){const p=Promise.resolve().then(()=>{session.check();return fn();}).catch(e=>{if([401,403].includes(e.status))dispose();else if(!closed)status.textContent=e.message;});tasks.push(p);return p;}};
 const node=(tag,text)=>{const el=new Element(tag,text);if(tag==='a')el.onclick=()=>{downloads.push({name:el.download,blob:blobs.get(el.href),connected:el.parent===root});};return el;};
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-09-12T06:00:00Z']));}}
 const context={createDialog:()=>d,node,field:(label,control)=>{const group=node('div');group.append(node('label',label),control);return group;},document:{body:root},Date:Clock,Intl,Blob,URL:{createObjectURL(blob){const id=`blob:fixture-${++serial}`;blobs.set(id,blob);return id;},revokeObjectURL(url){revoked.push(url);blobs.delete(url);}},setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(source.replace(/^import[^\n]*\n/,'').replace(/^export /gm,'')+'\nglobalThis.api={openFinancialArchive,monthValue,money,archiveCsvCell};',context);
 const find=(tag,text)=>all(root,x=>x.tag===tag&&(text===undefined||x.textContent===text))[0];
 return {api:context.api,open:()=>context.api.openFinancialArchive(),root,d,requests,downloads,revoked,timers,find,all:tag=>all(root,x=>x.tag===tag),setResponder:fn=>{responder=fn;},deny:()=>{denied=true;},dispose,async wait(){while(tasks.length)await tasks.shift();},get month(){return all(root,x=>x.tag==='input'&&x.type==='month')[0];},get search(){return all(root,x=>x.tag==='input'&&x.type==='search')[0];}};
}
async function ready(value){const h=harness(value);h.open();await h.wait();return h;}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('month boundary uses Kuwait rather than UTC or the operator device zone',()=>{const h=harness();assert.equal(h.api.monthValue(new Date('2026-08-31T21:30:00Z')),'2026-09');assert.equal(h.api.monthValue(new Date('2026-08-31T20:59:59Z')),'2026-08');assert.equal(h.api.monthValue(new Date('2026-12-31T21:00:00Z')),'2027-01');});
test('money does not invent zero for missing or malformed values',()=>{const h=harness();for(const x of [undefined,null,'',NaN,Infinity,'bad','1,000','-1','1.0001',{},true])assert.equal(h.api.money(x),'غير متاح');assert.equal(h.api.money('0'),'0.000 د.ك');assert.equal(h.api.money('120.500'),'120.500 د.ك');});
test('loads only the canonical read action and captured workspace/month',async()=>{const h=await ready();assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0],{name:'aqari_financial_archive',args:{p_workspace_id:'workspace-a',p_month:'2026-09'}});assert.match(h.d.status.textContent,/تم استرجاع/);});
test('renders a labelled expense table and three decimal currency',async()=>{const h=await ready();assert.equal(h.find('caption').textContent,'حركات الشهر المسترجع');assert.match(h.find('tbody').textContent,/شركة الصيانة/);assert.match(h.find('tbody').textContent,/برج الاختبار/);assert.match(h.find('tbody').textContent,/120\.500 د\.ك/);assert.equal(h.all('th').length,8);});
test('changing the selection invalidates results and prevents an old export',async()=>{const h=await ready(),old=h.find('button','تصدير السجل للتدقيق');h.month.value='2026-10';h.month.oninput();old.click();assert.equal(h.downloads.length,0);assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/تغيّر الشهر/);});
test('export still refuses a changed month even without an input event',async()=>{const h=await ready();h.month.value='2026-10';h.find('button','تصدير السجل للتدقيق').click();assert.equal(h.downloads.length,0);assert.equal(h.all('table').length,0);});
test('pending response cannot render against a subsequently selected month',async()=>{const h=harness(),p=deferred();h.setResponder(()=>p.promise);h.open();await Promise.resolve();h.month.value='2026-10';h.month.onchange();p.resolve(record());await h.wait();assert.equal(h.all('table').length,0);assert.equal(h.find('button','تصدير السجل للتدقيق'),undefined);});
test('request captures selection before the asynchronous session task',async()=>{const h=harness();h.open();h.month.value='2026-10';await h.wait();assert.equal(h.requests[0].args.p_month,'2026-09');assert.equal(h.all('table').length,0);});
test('failed reload clears old financial records and export controls',async()=>{const h=await ready();h.setResponder(()=>Promise.reject(Error('offline')));h.find('button','استرجاع الشهر').click();await h.wait();assert.equal(h.all('table').length,0);assert.equal(h.find('button','تصدير السجل للتدقيق'),undefined);assert.equal(h.d.status.textContent,'offline');});
test('invalid and zero-year month never reaches the backend',async()=>{const h=await ready();for(const month of ['','0000-01','2026-13','2026-00','26-09']){h.month.value=month;h.find('button','استرجاع الشهر').click();await h.wait();}assert.equal(h.requests.length,1);assert.equal(h.all('table').length,0);});
test('rejects an archived snapshot for the wrong month',async()=>{const h=await ready(record({period:{month:'2026-08-01',snapshot:{}}}));assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/شهر لقطة/);});
test('rejects entries from another month or workspace',async()=>{for(const overrides of [{on_date:'2026-08-01'},{workspace_id:'workspace-b'}]){const h=await ready(record({entries:[expense(overrides)]}));assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/نطاق سجلات/);}});
test('rejects malformed RPC shapes instead of showing successful empty data',async()=>{for(const value of [null,{},record({summary:[]}),record({history:null}),record({entries:[null]})]){const h=await ready(value);assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/تعذر/);}});
test('original close snapshot overrides live summary and is described accurately',async()=>{const h=await ready(record({period:{month:'2026-09-01',closed_at:'2026-10-02',snapshot:{approved_expenses:'55.000',approved_expense_count:2,rent_payments:'400.000'}}}));assert.match(h.find('dl').textContent,/55\.000/);assert.match(h.find('dl').textContent,/400\.000/);assert.match(h.root.textContent,/الملخص من لقطة الإقفال/);});
test('a closed period without snapshot permission is not mislabelled an original snapshot',async()=>{const h=await ready(record({period:{month:'2026-09-01',closed_at:'2026-10-02'}}));assert.match(h.root.textContent,/لقطة الإقفال غير متاحة لهذا الحساب/);assert.match(h.find('dl').textContent,/120\.500/);});
test('search normalizes Arabic and Persian voucher digits',async()=>{const h=await ready();for(const query of ['٤٠١','۴۰۱','EXP-401','برج الاختبار','المصعد']){h.search.value=query;h.search.oninput();assert.match(h.find('tbody').textContent,/EXP-401/);}h.search.value='not-found';h.search.oninput();assert.match(h.find('tbody').textContent,/لا توجد حركات تطابق/);});
test('status filter selects only the requested entry state',async()=>{const h=await ready(record({entries:[expense(),expense({id:'draft',reference:'DRAFT-2',status:'draft'})]}));const select=h.find('select');select.value='draft';select.onchange();assert.match(h.find('tbody').textContent,/DRAFT-2/);assert.doesNotMatch(h.find('tbody').textContent,/EXP-401/);});
test('pagination bounds the rendered rows and resets after filtering',async()=>{const h=await ready(record({entries:Array.from({length:51},(_,i)=>expense({id:`x-${i}`,reference:`VOUCHER-${i}`}))}));assert.equal(h.find('tbody').children.length,50);assert.equal(h.find('button','السابق').disabled,true);h.find('button','التالي').click();assert.equal(h.find('tbody').children.length,1);assert.match(h.find('tbody').textContent,/VOUCHER-50/);assert.equal(h.find('button','التالي').disabled,true);h.search.value='VOUCHER-0';h.search.oninput();assert.match(h.find('span').textContent,/الصفحة 1 من 1/);});
test('JSON export retains the loaded month and full returned evidence despite filtering',async()=>{const h=await ready();h.search.value='no-match';h.search.oninput();h.find('button','تصدير السجل للتدقيق').click();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'AQARI-finance-2026-09.json');assert.equal(h.downloads[0].connected,true);const data=JSON.parse(await h.downloads[0].blob.text());assert.equal(data.month,'2026-09');assert.equal(data.entries.length,1);assert.equal(data.workspace_id,'workspace-a');assert.equal(data.audit_history_limit,100);assert.match(data.retrieved_at,/^2026-09-12T/);assert.equal(h.all('a').length,0);});
test('mutating a returned object after rendering cannot alter audit export',async()=>{const original=record(),h=await ready(original);original.entries[0].amount='999.000';h.find('button','تصدير السجل للتدقيق').click();assert.equal(JSON.parse(await h.downloads[0].blob.text()).entries[0].amount,'120.500');});
test('local permission loss prevents private audit download',async()=>{const h=await ready();h.deny();h.find('button','تصدير السجل للتدقيق').click();await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.d.closed,true);assert.equal(h.all('table').length,0);});
test('closing the dialog revokes object URLs and blocks detached export buttons',async()=>{const h=await ready(),button=h.find('button','تصدير السجل للتدقيق');button.click();assert.equal(h.timers.size,1);h.dispose();button.click();assert.equal(h.revoked.length,1);assert.equal(h.timers.size,0);assert.equal(h.downloads.length,1);assert.equal(h.all('table').length,0);});
test('late responses after disposal do not restore private records',async()=>{const h=harness(),p=deferred();h.setResponder(()=>p.promise);h.open();await Promise.resolve();h.dispose();p.resolve(record());await h.wait();assert.equal(h.all('table').length,0);});
test('server text is displayed as text, not inserted as HTML',async()=>{const h=await ready(record({entries:[expense({description:'<img src=x onerror=alert(1)>'})]}));assert.equal(h.all('img').length,0);assert.match(h.find('tbody').textContent,/<img src=x/);assert.doesNotMatch(source,/innerHTML|insertAdjacentHTML/);});
test('audit limit is explicit even when the API returns fewer events',async()=>{const h=await ready(record({history:[{id:1,action:'expense.approve'}]}));assert.match(h.root.textContent,/أحداث التدقيق المعادة: 1 \(بحد أقصى أحدث 100 حدثاً\)/);});

test('rejects a close snapshot explicitly associated with a different workspace',async()=>{const h=await ready(record({period:{month:'2026-09-01',workspace_id:'workspace-b',snapshot:{}}}));assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/شهر لقطة/);});

test('all canonical movement streams are preserved and filter independently',async()=>{
 const streams=['rent','expense','deposit','adjustment','opening','tenant_ledger','credit_allocation','petty_cash'];
 const h=await ready(record({entries:streams.map((stream,i)=>expense({id:`stream-${i}`,stream,reference:`STREAM-${i}`,status:stream==='rent'?'cancelled':'recorded'}))}));
 assert.equal(h.find('tbody').children.length,8);assert.match(h.find('tbody').textContent,/رصيد افتتاحي/);assert.match(h.find('tbody').textContent,/ملغى/);
 const selector=h.all('select')[1];selector.value='credit_allocation';selector.onchange();assert.equal(h.find('tbody').children.length,1);assert.match(h.find('tbody').textContent,/تخصيص رصيد سابق/);
 h.find('button','تصدير السجل للتدقيق').click();assert.equal(JSON.parse(await h.downloads[0].blob.text()).entries.length,8);
});
test('CSV escaping preserves text and prevents formula-leading references',()=>{
 const h=harness();for(const v of ['=SUM(A1)','+cmd','-1+2','@SUM(A1)','\t=1','\r\n=1'])assert.match(h.api.archiveCsvCell(v),/^"'/);
 assert.equal(h.api.archiveCsvCell('مرجع "١"'),'"مرجع ""١"""');assert.equal(h.api.archiveCsvCell('100.125'),'"100.125"');
});
test('CSV download contains every returned row, correct month and escaped cells',async()=>{
 const h=await ready(record({entries:[expense({reference:'=CMD()'}),expense({id:'second',stream:'opening',reference:'OPEN-2',amount:'20.000'})]}));
 h.search.value='no-match';h.search.oninput();h.find('button','تنزيل جدول CSV').click();assert.equal(h.downloads[0].name,'AQARI-finance-2026-09.csv');
 const text=await h.downloads[0].blob.text();assert.equal(text.split('\r\n').length,3);assert.ok(text.includes('"\'=CMD()"'));assert.ok(text.includes('"20.000"'));assert.ok(text.includes('رصيد افتتاحي'));
 const old=h.find('button','تنزيل جدول CSV');h.month.value='2026-10';old.click();assert.equal(h.downloads.length,1);
});
test('server history and reconciliation warnings remain visible without new accounting totals',async()=>{
 const h=await ready(record({history_truncated:true,history:[{actor_name:'مدقق الاختبار',reason:'سبب التدقيق'}],period:{month:'2026-09-01',closed_at:'2026-10-02',snapshot:{approved_expenses:'10.000',approved_expense_count:1,legacy_finance_reconciled:false}}}));
 assert.match(h.root.textContent,/مطابقة السجلات المالية القديمة ما زالت غير معتمدة/);assert.match(h.root.textContent,/آخر ١٠٠ حدث/);assert.match(h.root.textContent,/مدقق الاختبار/);assert.match(h.root.textContent,/سبب التدقيق/);
});
