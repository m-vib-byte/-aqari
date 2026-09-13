import {node,field} from './dialog.js';

export const rentalTemplateKinds=[['apartment','عقد شقة'],['house','عقد بيت'],['shop','عقد محل'],['commercial_investment','عقد تجاري أو استثماري']];
const kindName=k=>rentalTemplateKinds.find(x=>x[0]===k)?.[1]||k;
const copy=x=>JSON.parse(JSON.stringify(x));
const same=(a,b)=>a===b||!!a&&!!b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same(a[k],b[k]));
function choice(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value;return x;}
export function validTemplate(r){return !!r&&typeof r.id==='string'&&rentalTemplateKinds.some(x=>x[0]===r.kind)&&Number.isSafeInteger(r.version)&&r.version>0&&typeof r.title==='string'&&Array.isArray(r.clauses)&&r.clauses.length>0&&r.clauses.every(c=>c&&typeof c.title==='string'&&typeof c.text==='string')&&/^[a-f0-9]{64}$/.test(r.content_sha256)&&typeof r.published_at==='string';}
export function templateForContract(r){if(!validTemplate(r))throw Error('اختر نسخة قالب منشورة قبل حفظ العقد.');return {contractTemplate:copy(r),clauses:copy(r.clauses)};}
export function requireContractIdentity(p){if(!p?.nameAr?.trim()||!p?.nameEn?.trim()||!/^\d{12}$/.test(p?.civilId||'')||!p?.passportNo?.trim()||!/^\+?\d{8,15}$/.test(p?.phone||'')||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p?.email||''))throw Error('أكمل الاسمين العربي والإنجليزي والرقم المدني والجواز والبريد والهاتف في ملف المستأجر قبل إبرام العقد.');}
export function templateClausesView(clauses){const box=node('div');for(const c of clauses){const article=node('article');article.append(node('h4',c.title),node('p',c.text));box.append(article);}return box;}
async function request(d,action,data={}){const r=await d.session.request(d.session.client.rpc('aqari_rental_templates',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));d.session.check();if(r?.workspace_id!==d.session.bound.workspace||r?.user_id!==d.session.bound.user)throw Error('تعذر التحقق من مساحة عمل القالب.');return r;}

export async function mountRentalTemplatePicker(d,target,{existing=null,onChange=()=>{},onManage}={}){
 if(existing){target.append(node('h3','نسخة القالب المحفوظة'),node('p',validTemplate(existing)?`${kindName(existing.kind)} · ${existing.title} · الإصدار ${existing.version}`:'عقد تاريخي محفوظ؛ لا تُنسب إليه نسخة قالب بأثر رجعي.'));if(validTemplate(existing))target.append(templateClausesView(existing.clauses));return {selected:()=>existing};}
 const result=await request(d,'context');
 if(!Array.isArray(result.items)||!result.items.every(validTemplate))throw Error('تعذر التحقق من نسخ القوالب المحفوظة.');
 const kind=choice([['','اختر نوع العقد'],...rentalTemplateKinds]),version=choice([['','اختر نسخة القالب']]),view=node('div'),note=node('p','بنود القالب المنشور للقراءة فقط. اعتماد القالب لا يغني عن مراجعة العقد وتوقيعه.');kind.required=version.required=true;version.disabled=true;
 target.append(node('h3','نوع العقد وقالب البنود'),field('نوع العقد',kind),field('النسخة المنشورة',version),note,view);
 if(result.can_publish===true&&onManage){const manage=node('button','إدارة واعتماد قوالب العقود');manage.type='button';manage.onclick=()=>d.run(onManage);target.append(manage);}
 if(!result.items.length){note.textContent='لا توجد قوالب منشورة. يلزم أن يراجع المدير العام قالبًا ويعتمده قبل إنشاء عقد جديد.';onChange(null);}
 function draw(){view.replaceChildren();const selected=result.items.find(r=>r.id===version.value&&r.kind===kind.value)||null;if(selected)view.append(node('p',`${selected.title} · الإصدار ${selected.version}`),templateClausesView(selected.clauses));onChange(selected);}
 kind.onchange=()=>{version.replaceChildren();for(const [value,label]of [['','اختر نسخة القالب'],...result.items.filter(r=>r.kind===kind.value).map(r=>[r.id,`${r.title} · الإصدار ${r.version}`])]){const o=node('option',label);o.value=value;version.append(o);}version.value='';version.disabled=!kind.value||!result.items.some(r=>r.kind===kind.value);note.textContent=kind.value&&version.disabled?'لا توجد نسخة منشورة لهذا النوع. اطلب من المدير العام اعتماد قالب له.':'راجع نص النسخة المختارة؛ لا يستطيع الموظف تعديل البنود.';draw();};version.onchange=draw;
 return {selected:()=>result.items.find(r=>r.id===version.value&&r.kind===kind.value)||null};
}

export async function mountRentalTemplateManager(d,target,{suggestion=[],onBack}={}){
 const result=await request(d,'context');if(result.can_publish!==true)throw Error('إدارة القوالب متاحة للمدير العام فقط.');
 if(!Array.isArray(result.items)||!result.items.every(validTemplate)||!Array.isArray(result.drafts))throw Error('تعذر استرجاع سجل القوالب.');
 target.replaceChildren(node('h3','قوالب العقود — اعتماد المدير العام'));
 if(onBack){const back=node('button','العودة للعقود');back.type='button';back.onclick=()=>d.run(onBack);target.append(back);}
 target.append(node('p','النسخ المنشورة ثابتة. أي تعديل ينشئ إصدارًا جديدًا، وتحتفظ العقود السابقة ببنودها. الاقتراحات والمسودات غير معتمدة حتى تراجعها وتنشرها بنفسك.'));
 const f=node('form'),kind=choice(rentalTemplateKinds,'apartment'),title=node('input'),source=choice([['','كتابة نص أو مراجعة الاقتراح الحالي']]),clauses=node('div'),why=node('textarea'),approve=node('input'),save=node('button','اعتماد ونشر نسخة جديدة'),add=node('button','إضافة بند'),preview=node('div'),published=node('div');let rows=[],sourceId=null,pending=null;
 title.required=true;title.maxLength=200;why.required=true;why.minLength=6;why.maxLength=500;approve.type='checkbox';approve.required=true;save.type='submit';add.type='button';
 const edited=()=>{approve.checked=false;};
 function clauseRow(value={title:'',text:''}){const wrap=node('fieldset'),name=node('input'),body=node('textarea'),remove=node('button','إزالة البند');name.value=value.title;body.value=value.text;name.required=body.required=true;name.maxLength=200;body.maxLength=30000;name.oninput=body.oninput=edited;remove.type='button';const row={wrap,name,body,remove};remove.onclick=()=>{if(rows.length===1)return;rows=rows.filter(x=>x!==row);wrap.remove();edited();};wrap.append(field('عنوان البند',name),field('نص البند',body),remove);clauses.append(wrap);rows.push(row);}
 function fill(values){clauses.replaceChildren();rows=[];for(const c of values.length?values:[{title:'',text:''}])clauseRow(c);edited();}
 function sources(){source.replaceChildren();for(const [v,label]of [['','كتابة نص أو مراجعة الاقتراح الحالي'],...result.drafts.filter(r=>r.kind===kind.value).map(r=>[r.id,`مسودة غير معتمدة: ${r.title} · المراجعة ${r.revision}`])]){const o=node('option',label);o.value=v;source.append(o);}source.value='';sourceId=null;title.value='';fill(suggestion);}
 source.onchange=()=>{const draft=result.drafts.find(r=>r.id===source.value&&r.kind===kind.value);sourceId=draft?.id||null;title.value=draft?.title||'';fill(draft?[{title:draft.title,text:draft.body}]:suggestion);};
 kind.onchange=sources;title.oninput=why.oninput=edited;add.onclick=()=>{if(rows.length>=50)return;clauseRow();edited();};sources();
 const review=node('button','معاينة نص النسخة قبل الاعتماد');review.type='button';review.onclick=()=>{preview.replaceChildren(node('h3',title.value||kindName(kind.value)),templateClausesView(rows.map(r=>({title:r.name.value,text:r.body.value}))));};
 f.append(field('نوع العقد',kind),field('مصدر المسودة المقترحة',source),field('عنوان القالب',title),clauses,add,review,preview,field('سبب اعتماد النسخة أو تعديل الصياغة',why),field('راجعت جميع البنود وأعتمد هذه النسخة لاختيارها في العقود الجديدة',approve),save);target.append(f,published);
 for(const r of result.items){const item=node('details'),revise=node('button','مراجعة نسخة جديدة من هذا القالب');revise.type='button';revise.onclick=()=>{if(pending)return;kind.value=r.kind;sources();title.value=r.title;sourceId=null;fill(r.clauses);why.value='';approve.checked=false;};item.append(node('summary',`${kindName(r.kind)} · ${r.title} · الإصدار ${r.version}`),templateClausesView(r.clauses),revise);published.append(item);}
 f.onsubmit=event=>{event.preventDefault();return d.run(async()=>{
  if(!pending){if(!approve.checked)throw Error('أكد مراجعة نص القالب واعتماده.');pending={id:crypto.randomUUID(),kind:kind.value,title:title.value.trim(),clauses:rows.map(r=>({title:r.name.value.trim(),text:r.body.value.trim()})),expected_version:Math.max(0,...result.items.filter(r=>r.kind===kind.value).map(r=>r.version)),source_draft_id:sourceId,reason:why.value.trim(),approved:true};}
  // A lost reply retries the same immutable request, never a second publication.
  let publicationReturned=false;
  try{
   const response=await request(d,'publish',pending);publicationReturned=true;
   if(!validTemplate(response.record))throw Error('لم يتأكد نشر النسخة. أعد التحقق بنفس الطلب.');
   const verified=await request(d,'get',{id:pending.id});
   if(!validTemplate(verified.record)||!same(response.record,verified.record)||verified.record.id!==pending.id||!same(verified.record.clauses,pending.clauses))throw Error('لم تؤكد إعادة القراءة نسخة القالب المنشورة.');
  }catch(error){
   if(!publicationReturned&&['22023','P0001','22P02'].includes(error?.code)){pending=null;throw error;}
   const retry=node('button','التحقق من نشر النسخة بنفس الطلب');retry.type='button';retry.onclick=()=>f.onsubmit({preventDefault(){}});
   f.replaceChildren(node('p','لم تتأكد نتيجة النشر. احتُفظ بالطلب كما هو؛ تحقق منه قبل إجراء تعديل جديد.'),retry);throw error;
  }
  pending=null;await mountRentalTemplateManager(d,target,{suggestion,onBack});d.status.textContent='نُشرت نسخة القالب وتأكدت إعادة قراءتها. العقود السابقة محفوظة كما هي.';
 });};
 return {form:f};
}
