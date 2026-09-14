import {createDialog,node,field} from '../components/dialog.js';
const labels={financial_expense:'مصروف مالي معتمد',payroll:'راتب مصروف',utility:'كهرباء / ماء / خدمة مدفوعة'};
const input=(type='text',value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
const fils=value=>{const raw=String(value??'').trim();if(!/^\d{1,12}(\.\d{1,3})?$/.test(raw))throw Error('أدخل مبلغاً صحيحاً حتى ثلاث منازل عشرية.');return Math.round(Number(raw)*1000);};
const money=value=>Number(value||0).toFixed(3)+' د.ك';
function button(label,fn){const el=node('button',label);el.type='button';el.onclick=fn;return el;}
export function openPropertyCostAllocation(){
 const d=createDialog('توزيع الرواتب والمصاريف على العقارات');if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_cost_allocation',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 let state={properties:[],sources:[],manager:false};
 const clear=title=>d.body.replaceChildren(node('h3',title));
 const propertyName=id=>state.properties.find(p=>p.id===id)?.name||id;
 async function load(){const result=await rpc('list',{});d.session.check();if(result?.workspace_id!==d.session.bound.workspace||result?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق سجل التوزيع.');state=result;return result;}
 function automaticText(source){const defaults=Array.isArray(source.propertyIds)?source.propertyIds:[];if(Number(source.revision||0)>0)return 'توزيع يدوي موثق — Revision '+source.revision;if(defaults.length===1)return 'توزيع تلقائي 100% على '+propertyName(defaults[0]);if(source.kind==='payroll'&&defaults.length>1)return 'راتب مشترك غير موزع — لا يدخل صافي أي عقار حتى اعتماد التوزيع.';return 'يتطلب مراجعة التوزيع.';}
 async function edit(source){
  clear('توزيع — '+(labels[source.kind]||source.kind));d.body.append(button('رجوع',home),node('p',source.label||''),node('p','إجمالي المصدر الثابت: '+money(source.total)),node('p','لا يمكن حفظ التوزيع إلا إذا ساوى مجموع العقارات إجمالي المصدر بالضبط.'));
  const form=node('form'),box=node('div'),controls=[],existing=new Map((source.allocations||[]).map(x=>[x.propertyId,String(x.amount)])),defaults=new Set(source.propertyIds||[]);
  const allowed=source.kind==='payroll'?state.properties.filter(p=>defaults.has(p.id)):state.properties;
  for(const property of allowed){const amount=input('text',existing.get(property.id)??(Number(source.revision||0)===0&&defaults.size===1&&defaults.has(property.id)?String(source.total):''));amount.inputMode='decimal';box.append(field(property.name,amount));controls.push({property,amount});}
  const total=node('strong'),reason=node('textarea');reason.required=true;reason.minLength=3;reason.maxLength=1000;reason.placeholder='سبب التوزيع أو تعديله';
  const refreshTotal=()=>{let sum=0;for(const row of controls){const raw=row.amount.value.trim();if(raw&&/^\d{1,12}(\.\d{1,3})?$/.test(raw))sum+=Math.round(Number(raw)*1000);}total.textContent='المجموع الحالي: '+(sum/1000).toFixed(3)+' د.ك';};for(const row of controls)row.amount.oninput=refreshTotal;refreshTotal();
  const save=node('button','اعتماد التوزيع وإعادة القراءة');save.type='submit';form.append(box,total,field('سبب التوزيع *',reason),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const rows=controls.filter(x=>x.amount.value.trim()!=='').map(x=>({propertyId:x.property.id,amount:(fils(x.amount.value)/1000).toFixed(3)}));if(!rows.length)throw Error('أدخل حصة عقار واحد على الأقل.');const sum=rows.reduce((s,x)=>s+fils(x.amount),0),expected=fils(source.total);if(sum!==expected)throw Error(`مجموع التوزيع ${(sum/1000).toFixed(3)} لا يساوي إجمالي المصدر ${(expected/1000).toFixed(3)} د.ك.`);const saved=await rpc('save',{sourceKind:source.kind,sourceId:source.id,revision:Number(source.revision||0),allocations:rows,reason:reason.value.trim()});if(saved?.sourceId!==source.id||Number(saved.revision)!==Number(source.revision||0)+1)throw Error('لم تتأكد إعادة قراءة Revision التوزيع.');await home();d.status.textContent='تم اعتماد توزيع '+(source.label||source.id)+' وإعادة قراءته.';});};
 }
 async function home(){
  await load();clear('توزيع التكاليف حسب العقار');d.body.append(node('p','المصادر هنا فعلية فقط: مصروف معتمد، راتب حالته «مدفوع»، أو فاتورة خدمة لها إثبات دفع. أوامر الصيانة التي رُحّلت إلى سجل المصروفات لا تُجمع مرة ثانية.'));
  const kind=node('select');for(const [value,label]of [['','كل المصادر'],...Object.entries(labels)]){const option=node('option',label);option.value=value;kind.append(option);}const list=node('div');d.body.append(field('نوع المصدر',kind),list);
  function draw(){list.replaceChildren();const sources=(state.sources||[]).filter(s=>!kind.value||s.kind===kind.value);for(const source of sources){const card=node('article');card.append(node('h4',(labels[source.kind]||source.kind)+' — '+(source.label||source.id)),node('p',source.date+' · '+money(source.total)),node('p',automaticText(source)));if(state.manager)card.append(button('فتح / تعديل التوزيع',()=>d.run(()=>edit(source))));list.append(card);}if(!sources.length)list.append(node('p','لا توجد مصادر مالية نهائية مطابقة.'));}kind.onchange=draw;draw();d.status.textContent='تمت قراءة مصادر التكاليف وتوزيعاتها من الخادم.';
 }
 d.run(home);return true;
}
