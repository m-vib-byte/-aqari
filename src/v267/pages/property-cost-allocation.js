import {createDialog,node,field} from '../components/dialog.js';
const labels={financial_expense:'مصروف مالي معتمد',payroll:'راتب مصروف',utility:'كهرباء / ماء / خدمة مدفوعة'};
const methods={amount:'مبالغ ثابتة',percentage:'نسب مئوية',unit_count:'حسب عدد الوحدات',area:'حسب المساحة',custom:'قاعدة/وزن مخصص'};
const frequencies={one_time:'مرة واحدة',monthly:'شهري',annual:'سنوي — تأثير تحليلي ÷ 12',invoice:'حسب الفاتورة'};
const input=(type='text',value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
const money=value=>Number(value||0).toFixed(3)+' د.ك';
const clean=value=>String(value??'').trim();
const fils=value=>{const raw=clean(value);if(!/^\d{1,12}(\.\d{1,3})?$/.test(raw))throw Error('أدخل مبلغاً صحيحاً حتى ثلاث منازل عشرية.');return Math.round(Number(raw)*1000);};
function button(label,fn){const el=node('button',label);el.type='button';el.onclick=fn;return el;}
function select(rows,value=''){const el=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;el.append(o);}el.value=value;return el;}
export function openPropertyCostAllocation(options={}){
 const d=createDialog('توزيع التكاليف حسب العقار');if(!d)return false;
 const initialPropertyId=options?.propertyId||null;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_cost_allocation',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 let state={properties:[],sources:[],manager:false};
 const clear=title=>d.body.replaceChildren(node('h3',title));
 const propertyName=id=>state.properties.find(p=>p.id===id)?.name||id;
 async function load(){const result=await rpc('list',{});d.session.check();if(result?.workspace_id!==d.session.bound.workspace||result?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق سجل التوزيع.');state=result;return result;}
 function automaticText(source){const defaults=Array.isArray(source.propertyIds)?source.propertyIds:[];if(Number(source.revision||0)>0)return `${methods[source.method]||source.method} · Revision ${source.revision} · ${frequencies[source.frequency]||source.frequency}`;if(defaults.length===1)return '100% تلقائي على '+propertyName(defaults[0])+' ما لم تعتمد توزيعًا آخر.';if(source.kind==='payroll'&&defaults.length>1)return 'راتب مشترك غير موزع — لا يدخل صافي أي عقار حتى اعتماد التوزيع.';return 'يتطلب مراجعة التوزيع.';}
 const sourceMatchesProperty=(s,p)=>!p||(s.propertyIds||[]).includes(p)||(s.allocations||[]).some(x=>x.propertyId===p);
 async function edit(source){
  clear('توزيع — '+(labels[source.kind]||source.kind));d.body.append(button('رجوع',home),node('p',source.label||''),node('p','إجمالي المصدر الأصلي: '+money(source.total)),node('p','لا ينشئ النظام حركات مالية جديدة عند التوزيع؛ يسجل فقط طريقة تحميل المصدر الأصلي على العقارات.'));
  const form=node('form'),method=select(Object.entries(methods),source.method||'amount'),frequency=select(Object.entries(frequencies),source.frequency||({payroll:'monthly',utility:'invoice'}[source.kind]||'one_time')),box=node('div'),reason=node('textarea'),total=node('strong');reason.required=true;reason.minLength=3;reason.maxLength=1000;reason.placeholder='سبب التوزيع أو تعديله';
  form.append(field('طريقة التوزيع',method),field('دورية التحليل',frequency),box,total,field('سبب التوزيع *',reason));const save=node('button','اعتماد التوزيع وإعادة القراءة');save.type='submit';form.append(save);d.body.append(form);
  let controls=[];
  function draw(){box.replaceChildren();controls=[];const existing=new Map((source.allocations||[]).map(x=>[x.propertyId,x])),defaults=new Set(source.propertyIds||[]),allowed=source.kind==='payroll'?state.properties.filter(p=>defaults.has(p.id)):state.properties;
   for(const property of allowed){const row=node('fieldset'),saved=existing.get(property.id),metric=node('p',`الوحدات ${property.unitCount??0} · المساحة ${Number(property.areaSqm||0).toFixed(3)} م²${property.areaComplete?'':' · المساحة غير مكتملة'}`),active=input('checkbox');active.checked=Boolean(saved)||defaults.has(property.id)||initialPropertyId===property.id;let control=null,label='';
    if(method.value==='amount'){control=input('text',saved?.amount??(Number(source.revision||0)===0&&defaults.size===1&&defaults.has(property.id)?source.total:''));control.inputMode='decimal';label='المبلغ د.ك';}
    else if(method.value==='percentage'){control=input('text',saved?.shareBps?Number(saved.shareBps)/100:'');control.inputMode='decimal';label='النسبة %';}
    else if(method.value==='custom'){control=input('text',saved?.weight??'');control.inputMode='decimal';label='الوزن المخصص';}
    row.append(field(property.name+' — مشمول',active),metric);if(control)row.append(field(label,control));box.append(row);controls.push({property,active,control});
   }
   refreshTotal();
  }
  function rows(){return controls.filter(x=>x.active.checked).map(({property,control})=>{if(method.value==='amount')return {propertyId:property.id,amount:(fils(control.value)/1000).toFixed(3)};if(method.value==='percentage'){const raw=clean(control.value);if(!/^\d{1,3}(\.\d{1,2})?$/.test(raw)||Number(raw)<=0||Number(raw)>100)throw Error('النسبة يجب أن تكون أكبر من صفر وحتى 100% بمنزلتين عشريتين.');return {propertyId:property.id,shareBps:Math.round(Number(raw)*100)};}if(method.value==='custom'){const raw=clean(control.value);if(!/^\d{1,18}(\.\d{1,6})?$/.test(raw)||Number(raw)<=0)throw Error('الوزن المخصص يجب أن يكون رقمًا موجبًا.');return {propertyId:property.id,weight:raw};}return {propertyId:property.id};});}
  function refreshTotal(){try{const r=controls.filter(x=>x.active.checked);if(method.value==='amount'){const sum=r.reduce((s,x)=>s+(clean(x.control?.value)&&/^\d+(\.\d{1,3})?$/.test(clean(x.control.value))?Number(x.control.value):0),0);total.textContent=`المجموع الحالي ${sum.toFixed(3)} من ${money(source.total)}`;}else if(method.value==='percentage'){const sum=r.reduce((s,x)=>s+(Number(x.control?.value)||0),0);total.textContent=`مجموع النسب الحالي ${sum.toFixed(2)}%`;}else total.textContent=`العقارات المشمولة: ${r.length}`;}catch{total.textContent='راجع قيم التوزيع.';}}
  method.onchange=draw;draw();box.addEventListener('input',refreshTotal);box.addEventListener('change',refreshTotal);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const allocations=rows();if(!allocations.length)throw Error('اختر عقارًا واحدًا على الأقل.');if(method.value==='amount'&&allocations.reduce((s,x)=>s+fils(x.amount),0)!==fils(source.total))throw Error('مجموع المبالغ يجب أن يساوي المصدر الأصلي بالضبط.');if(method.value==='percentage'&&allocations.reduce((s,x)=>s+Number(x.shareBps),0)!==10000)throw Error('مجموع النسب يجب أن يساوي 100%.');if(method.value==='area'&&allocations.some(x=>state.properties.find(p=>p.id===x.propertyId)?.areaComplete!==true))throw Error('التوزيع حسب المساحة يحتاج مساحة مكتملة لكل وحدات العقارات المحددة.');const saved=await rpc('save',{sourceKind:source.kind,sourceId:source.id,revision:Number(source.revision||0),method:method.value,frequency:frequency.value,allocations,reason:reason.value.trim()});if(saved?.sourceId!==source.id||Number(saved.revision)!==Number(source.revision||0)+1||saved.method!==method.value)throw Error('لم تتأكد إعادة قراءة Revision وطريقة التوزيع.');await load();const verified=state.sources.find(x=>x.id===source.id&&x.kind===source.kind);if(!verified||Number(verified.revision)!==Number(saved.revision)||verified.method!==method.value)throw Error('فشل Readback للتوزيع المعتمد.');await home();d.status.textContent='تم اعتماد التوزيع وإعادة قراءته من الخادم.';});};
 }
 async function ownerStatement(property){d.close();const m=await import('./property-owner-statement.js');return m.openPropertyOwnerStatement(property.id);}
 async function home(){
  await load();clear('مركز تكلفة العقارات');d.body.append(node('p','المصادر فعلية فقط: مصروف معتمد، راتب مدفوع، أو فاتورة خدمة موثقة. التوزيع لا يكرر الحركة الأصلية. المصروف السنوي يبقى حركة واحدة ويظهر أثره الشهري تحليليًا فقط.'));
  const filter=select([['','كل العقارات'],...state.properties.map(p=>[p.id,p.name])],initialPropertyId||''),kind=select([['','كل المصادر'],...Object.entries(labels)]),list=node('div'),owners=node('section');owners.append(node('h3','كشوف الملاك المحسوبة'));for(const p of state.properties)owners.append(button('كشف '+p.name,()=>d.run(()=>ownerStatement(p))));d.body.append(field('العقار',filter),field('نوع المصدر',kind),list,owners);
  function draw(){list.replaceChildren();const sources=(state.sources||[]).filter(s=>(!kind.value||s.kind===kind.value)&&sourceMatchesProperty(s,filter.value));for(const source of sources){const card=node('article');card.append(node('h4',(labels[source.kind]||source.kind)+' — '+(source.label||source.id)),node('p',source.date+' · '+money(source.total)),node('p',automaticText(source)));if(state.manager)card.append(button('فتح / تعديل التوزيع',()=>d.run(()=>edit(source))));list.append(card);}if(!sources.length)list.append(node('p','لا توجد مصادر مالية نهائية مطابقة.'));}filter.onchange=kind.onchange=draw;draw();d.status.textContent='تمت قراءة مصادر التكاليف وتوزيعاتها من الخادم.';
 }
 d.run(home);return true;
}
