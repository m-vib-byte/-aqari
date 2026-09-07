(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function fail(message){throw new Error(message)}
function digits(value){return String(value).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.').trim()}
function scaled(value,places){
 const s=digits(value);if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(s))fail('أدخل رقماً موجباً بدقة صحيحة.');
 const [a,b='']=s.split('.');const n=Number(a)*10**places+Number(b.padEnd(places,'0'));if(!Number.isSafeInteger(n))fail('المبلغ أكبر من الحد المسموح.');return n;
}
function owners(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>100)fail('أضف شريكاً واحداً على الأقل.');
 const ids=new Set();const out=rows.map(r=>{
 const id=String(r.id||'').trim(),name=String(r.name||'').trim(),role=String(r.role||'').trim();
 if(!id||ids.has(id)||!name||name.length>150||!role||role.length>80)fail('راجع اسم وصفة كل شريك.');ids.add(id);
 const bps=scaled(r.percent,2);if(bps<=0||bps>10000)fail('نسبة كل شريك يجب أن تكون أكبر من صفر.');return {id,name,role,bps};
 });
 if(out.reduce((n,r)=>n+r.bps,0)!==10000)fail('يجب أن يكون مجموع الحصص ١٠٠٪ بالضبط.');return out;
}
function allocate(total,list){
 if(!Number.isSafeInteger(total))fail('قيمة مالية غير صالحة.');
 if(!list.length||list.reduce((n,r)=>n+r.bps,0)!==10000||list.some(r=>!Number.isInteger(r.bps)||r.bps<=0))fail('الحصص غير مكتملة.');
 const sign=total<0?-1:1,n=BigInt(Math.abs(total));let rows=list.map((r,i)=>({i,value:Number(n*BigInt(r.bps)/10000n),remainder:n*BigInt(r.bps)%10000n}));
 let left=Math.abs(total)-rows.reduce((s,r)=>s+r.value,0);
 const ranked=rows.slice().sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0;i<left;i++)ranked[i].value++;
 return rows.map(r=>r.value*sign);
}
function empty(){return {version:0,enabled:false,owners:[],events:[]}}
function balance(state,id){return state.events.reduce((n,e)=>n+(e.type==='distribution'?(e.rows.find(r=>r.id===id)?.net||0):e.type==='payment'&&e.partnerId===id?-e.amount:0),0)}
function transition(old,action,actor,at,id){
 const s=clone(old||empty());const event={id,actor,at};
 if(action.type==='owners'){
  const list=owners(action.rows);
  s.events.push({...event,type:'owners',before:s.owners,after:list});s.owners=list;s.enabled=true;
 }else if(action.type==='disable'){
  s.enabled=false;s.events.push({...event,type:'disable'});
 }else if(action.type==='distribution'){
  if(!s.enabled)fail('فعّل الشركاء والحصص أولاً.');
  const {income,expenses,due}=action.basis;
  if([income,expenses,due].some(n=>!Number.isSafeInteger(n)||n<0))fail('راجع مصادر الأرقام قبل التوزيع.');
  const last=s.events.filter(e=>e.type==='distribution').at(-1);
  const previous=last?.basis||{income:0,expenses:0};
  const revenue=income-previous.income,cost=expenses-previous.expenses;
  if(revenue===0&&cost===0)fail('لا توجد مبالغ جديدة للتوزيع.');
  const revenues=allocate(revenue,s.owners),costs=allocate(cost,s.owners),dues=allocate(due,s.owners);
  s.events.push({...event,type:'distribution',basis:{income,expenses,due},rows:s.owners.map((r,i)=>({...r,income:revenues[i],expenses:costs[i],net:revenues[i]-costs[i],receivable:dues[i]}))});
 }else if(action.type==='payment'){
  if(!s.owners.some(r=>r.id===action.partnerId)&&!s.events.some(e=>e.rows?.some(r=>r.id===action.partnerId)))fail('الشريك غير موجود.');
  const amount=scaled(action.amount,3);if(amount<=0||amount>balance(s,action.partnerId))fail('المبلغ يتجاوز الرصيد المستحق للشريك.');
  if(!String(action.reference||'').trim())fail('أدخل مرجع التحويل أو السند.');
  s.events.push({...event,type:'payment',partnerId:action.partnerId,amount,reference:String(action.reference).trim().slice(0,150)});
 }else fail('إجراء غير معروف.');
 s.version++;return s;
}
const api={scaled,owners,allocate,empty,balance,transition};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.AQARI_SHARES=Object.freeze(api);
})(typeof window!=='undefined'?window:globalThis);
