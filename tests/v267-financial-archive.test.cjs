const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const vm=require('node:vm');
const source=readFileSync(resolve(__dirname,'../src/v267/pages/financial-archive.js'),'utf8');
const xlsxSource=readFileSync(resolve(__dirname,'../src/v267/reports/financial-archive-xlsx.js'),'utf8');

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
 context.TextEncoder=TextEncoder;
 vm.runInNewContext(xlsxSource.replace(/^export /gm,'')+'\n'+source.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.api={openFinancialArchive,monthValue,money,archiveCsvCell};',context);
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
test('Arabic stored payment states remain readable and share the canonical status filters without changing source evidence',async()=>{
 const statuses=['مدفوع','paid','جزئي','partial','ملغى','cancelled'];
 const original=record({entries:statuses.map((status,i)=>expense({id:'legacy-'+i,stream:'rent',status,reference:'LEGACY-'+i}))});
 const h=await ready(original);assert.doesNotMatch(h.find('tbody').textContent,/غير محددة/);
 for(const [status,refs] of [['paid',['LEGACY-0','LEGACY-1']],['partial',['LEGACY-2','LEGACY-3']],['cancelled',['LEGACY-4','LEGACY-5']]]){
  h.find('select').value=status;h.find('select').onchange();assert.equal(h.find('tbody').children.length,2);
  for(const ref of refs)assert.ok(h.find('tbody').textContent.includes(ref));
 }
 h.find('button','تصدير السجل للتدقيق').click();assert.deepEqual(JSON.parse(await h.downloads[0].blob.text()).entries.map(x=>x.status),statuses);
 h.find('button','تنزيل جدول CSV').click();const csv=await h.downloads[1].blob.text();assert.equal((csv.match(/"مسدد"/g)||[]).length,2);assert.equal((csv.match(/"جزئي"/g)||[]).length,2);h.dispose();
});
test('Excel includes both Arabic and canonical paid records in the selected paid filter',async()=>{
 const h=await ready(record({entries:['مدفوع','paid','جزئي'].map((status,i)=>expense({id:'paid-'+i,stream:'rent',status,reference:'PAY-'+i}))}));
 h.find('select').value='paid';h.find('select').onchange();h.find('button','تنزيل Excel للنتائج').click();await h.wait();
 const xml=await xlsxPart(h.downloads[0],'xl/worksheets/sheet1.xml');assert.match(xml,/PAY-0/);assert.match(xml,/PAY-1/);assert.doesNotMatch(xml,/PAY-2/);assert.equal((xml.match(/>مسدد</g)||[]).length,2);h.dispose();
});
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

async function xlsxPart(download,path){
 const bytes=Buffer.from(await download.blob.arrayBuffer());let at=0;
 while(bytes.readUInt32LE(at)===0x04034b50){const size=bytes.readUInt32LE(at+18),length=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),name=bytes.subarray(at+30,at+30+length).toString();const start=at+30+length+extra;if(name===path)return bytes.subarray(start,start+size).toString();at=start+size;}
 throw Error('Missing ZIP part: '+path);
}
test('Excel rechecks the scoped RPC and exports every filtered page as numeric money and dates',async()=>{
 const h=await ready(record({entries:[...Array.from({length:53},(_,i)=>expense({id:`a-${i}`,reference:`KEEP-${i}`})),expense({id:'draft',reference:'OMIT',status:'draft'})]}));
 h.find('select').value='approved';h.find('select').onchange();assert.equal(h.find('tbody').children.length,50);
 h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.requests.length,2);assert.deepEqual(h.requests[1],h.requests[0]);assert.equal(h.downloads.length,1);
 const file=h.downloads[0];assert.equal(file.name,'AQARI-finance-2026-09.xlsx');assert.equal(file.blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const xml=await xlsxPart(file,'xl/worksheets/sheet1.xml');assert.equal((xml.match(/<row /g)||[]).length,54);assert.match(xml,/KEEP-52/);assert.doesNotMatch(xml,/OMIT/);assert.match(xml,/<c r="E2" s="2"><v>120\.500<\/v>/);assert.match(xml,/rightToLeft="1"/);
 const metadata=await xlsxPart(file,'xl/worksheets/sheet2.xml');assert.match(metadata,/معتمد/);assert.match(metadata,/workspace-a/);assert.match(metadata,/2026-09-12T/);h.dispose();
});
test('Excel captures combined Arabic search, status and stream filters, including zero matches',async()=>{
 const h=await ready(record({entries:[expense(),expense({id:'second',stream:'opening',reference:'EXP-401'})]}));
 h.search.value='٤٠١';h.search.oninput();h.all('select')[1].value='opening';h.all('select')[1].onchange();
 h.find('button','تنزيل Excel للنتائج').click();await h.wait();let xml=await xlsxPart(h.downloads[0],'xl/worksheets/sheet1.xml');assert.equal((xml.match(/<row /g)||[]).length,2);assert.match(xml,/رصيد افتتاحي/);assert.doesNotMatch(xml,/>مصروف</);
 h.search.value='لا توجد مطابقة';h.search.oninput();h.find('button','تنزيل Excel للنتائج').click();await h.wait();xml=await xlsxPart(h.downloads[1],'xl/worksheets/sheet1.xml');assert.equal((xml.match(/<row /g)||[]).length,1);h.dispose();
});
test('Excel preserves cancelled and opening entries separately with inert formula-like references',async()=>{
 const h=await ready(record({entries:[expense({stream:'rent',status:'cancelled',reference:'=HYPERLINK("https://invalid")'}),expense({id:'opening',stream:'opening',direction:'credit',amount:'20.000',reference:'0012'})]}));
 h.find('button','تنزيل Excel للنتائج').click();await h.wait();const xml=await xlsxPart(h.downloads[0],'xl/worksheets/sheet1.xml');assert.match(xml,/ملغى/);assert.match(xml,/رصيد افتتاحي/);assert.match(xml,/0012/);assert.match(xml,/t="inlineStr"/);assert.doesNotMatch(xml,/<f[ >]/);assert.match(xml,/20\.000/);h.dispose();
});
test('Excel rejects a server-side authorization revocation and clears private cached rows',async()=>{
 const h=await ready();h.setResponder(()=>Promise.reject(Object.assign(Error('FORBIDDEN'),{status:403})));
 h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.d.closed,true);assert.equal(h.all('table').length,0);
});
test('Excel rejects changed records or narrower property scope instead of exporting the old snapshot',async()=>{
 for(const next of [record({entries:[]}),record({properties:[]}),record({entries:[expense({amount:'1.000'})]})]){
  const h=await ready();h.setResponder(()=>next);h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.all('table').length,0);assert.match(h.d.status.textContent,/تغيّرت سجلات/);
 }
});
test('Excel refuses a selection change during the authorization readback',async()=>{
 const h=await ready(),pending=deferred();h.setResponder(()=>pending.promise);h.find('button','تنزيل Excel للنتائج').click();await Promise.resolve();h.month.value='2026-10';h.month.oninput();pending.resolve(record());await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.all('table').length,0);
});
test('Excel refuses a filter change during the readback',async()=>{
 const h=await ready(),pending=deferred();h.setResponder(()=>pending.promise);h.find('button','تنزيل Excel للنتائج').click();await Promise.resolve();h.search.value='new-filter';pending.resolve(record());await h.wait();assert.equal(h.downloads.length,0);assert.match(h.d.status.textContent,/تغيّرت المرشحات/);
});
test('closing the dialog during Excel readback prevents a late private download',async()=>{
 const h=await ready(),pending=deferred();h.setResponder(()=>pending.promise);h.find('button','تنزيل Excel للنتائج').click();await Promise.resolve();h.dispose();pending.resolve(record());await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.all('table').length,0);
});
test('Excel refuses malformed amounts, impossible dates and lost local permission',async()=>{
 for(const change of [{amount:null},{amount:'100.0001'},{on_date:'2026-09-31'}]){
  const h=await ready(record({entries:[expense(change)]}));h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.downloads.length,0);assert.match(h.d.status.textContent,/تعذر/);
 }
 const h=await ready();h.deny();h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.requests.length,1);
});
test('Excel readback failure does not turn cached data into an authorized download',async()=>{
 const h=await ready();h.setResponder(()=>Promise.reject(Error('offline')));h.find('button','تنزيل Excel للنتائج').click();await h.wait();assert.equal(h.downloads.length,0);assert.equal(h.d.status.textContent,'offline');
});
