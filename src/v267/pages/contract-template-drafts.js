import {createDialog,node,field} from '../components/dialog.js';
import {TEMPLATE_KEYS,TEMPLATE_FIELDS,DRAFT_NOTICE,defaultTemplate,loadTemplateDraft,draftRequest,saveTemplateDraft} from '../domain/contract-template-drafts.js';

export function openContractTemplateDrafts({onBack}={}){
 const d=createDialog('قوالب العقود والإقرارات — مسودات');if(!d)return false;
 const view=mountContractTemplateDrafts(d,{onBack});view.run(view.start);return true;
}
export function mountContractTemplateDrafts(d,{onBack,confirmDiscard=()=>window.confirm('توجد تعديلات غير محفوظة. هل تريد تركها؟'),newId=()=>crypto.randomUUID()}={}){
 let original=null,selected='apartment',pending=null,busy=false;
 const form=node('form'),kind=node('select'),title=node('input'),body=node('textarea'),token=node('select'),insert=node('button','إدراج الحقل'),save=node('button','حفظ مسودة جديدة'),refresh=node('button','استرجاع آخر نسخة محفوظة'),meta=node('p'),preview=node('div');
 title.type='text';title.required=true;title.maxLength=200;body.required=true;body.maxLength=30000;body.rows=18;body.spellcheck=false;body.style.minHeight='40vh';body.style.width='100%';body.style.boxSizing='border-box';title.style.width='100%';title.style.boxSizing='border-box';save.type='submit';refresh.type=insert.type='button';
 for(const key of TEMPLATE_KEYS){const option=node('option',defaultTemplate(key).title);option.value=key;kind.append(option);}kind.value=selected;
 for(const [key,label]of Object.entries(TEMPLATE_FIELDS)){const option=node('option',label);option.value=key;token.append(option);}
 const notice=node('p',DRAFT_NOTICE);notice.setAttribute('role','note');meta.setAttribute('aria-live','polite');preview.style.whiteSpace='pre-wrap';preview.style.overflowWrap='anywhere';preview.setAttribute('aria-label','معاينة نص المسودة');
 form.append(field('نوع القالب',kind),meta,field('عنوان القالب',title),field('نص القالب — عدّل البنود هنا',body),field('إضافة خانة متغيرة إلى النص',token),insert,save,refresh);
 d.body.append(notice,node('p','هذه صفحة إعداد الصيغ فقط. تعديل القالب لا يعتمد عقداً ولا يغيّر عقداً موقّعاً. الرقم الآلي يُدخل كما هو، وتاريخ الاستلام مستقل عن تاريخ تحرير العقد.'),form,node('h3','معاينة المسودة'),preview);
 const dirty=()=>!!original&&(title.value!==original.title||body.value!==original.body);
 const discard=()=>!dirty()&&!pending||confirmDiscard();
 function sync(){if(d.closed)return;const locked=busy||!original||!!pending;title.disabled=body.disabled=token.disabled=insert.disabled=locked;kind.disabled=busy||!!pending;save.disabled=busy||!original||(!dirty()&&!pending);refresh.disabled=busy;save.textContent=pending?'إعادة التحقق من الحفظ':'حفظ مسودة جديدة';}
 function draw(){preview.textContent=title.value+'\n\n'+body.value;meta.textContent=original?(original.revision?'الإصدار المحفوظ: '+original.revision:'قالب أولي — لم يُحفظ تعديل عليه بعد')+(dirty()?' · توجد تعديلات غير محفوظة':''):'';sync();}
 function run(task){if(busy||d.closed)return Promise.resolve();busy=true;sync();return d.run(task).finally(()=>{busy=false;sync();});}
 async function load(){original=null;pending=null;title.value=body.value='';preview.textContent='';meta.textContent='';sync();const row=await loadTemplateDraft(d.session,selected);if(d.closed)return;original=row;title.value=row.title;body.value=row.body;draw();d.status.textContent=row.revision?'تم استرجاع المسودة المحفوظة من قاعدة البيانات.':'القالب الأولي جاهز للتعديل. الحفظ ينشئ مسودة في قاعدة البيانات.';}
 kind.onchange=()=>{const next=kind.value;if(!discard()){kind.value=selected;return;}selected=next;return run(load);};
 title.oninput=body.oninput=draw;
 insert.onclick=()=>{if(busy||!original||pending)return;const value='{{'+token.value+'}}',start=body.selectionStart,end=body.selectionEnd;const next=body.value.slice(0,start)+value+body.value.slice(end);if(next.length>30000){d.status.textContent='بلغ النص الحد الأقصى؛ اختصر النص قبل إدراج حقل.';return;}body.value=next;body.focus();body.setSelectionRange(start+value.length,start+value.length);draw();};
 refresh.onclick=()=>{if(discard())return run(load);};
 form.onsubmit=event=>{event.preventDefault();if(busy||!original||(!dirty()&&!pending))return;return run(async()=>{
  pending ||= draftRequest(d.session,original,{template_key:selected,title:title.value,body:body.value},newId());sync();
  try{const saved=await saveTemplateDraft(d.session,pending);if(d.closed)return;original=saved;pending=null;title.value=saved.title;body.value=saved.body;draw();d.status.textContent='حُفظت المسودة وتمت قراءتها مجدداً من قاعدة البيانات. النسخ السابقة والعقود الموقّعة لم تتغير.';}
  catch(e){if(e?.code==='TEMPLATE_CONFLICT')pending=null;if(e?.code==='42501'||[401,403].includes(e?.status)||e?.message==='ACCESS_DENIED')throw e;if(!d.closed)d.status.textContent=e?.code==='TEMPLATE_CONFLICT'?e.message:'لم نؤكد الحفظ بعد. احتفظنا بالتعديل هنا؛ استخدم إعادة التحقق من الحفظ.';}
 });};
 if(onBack){const back=node('button','العودة إلى العقود');back.type='button';back.onclick=()=>{if(!busy&&discard())run(async()=>{d.session.check();d.close();onBack();});};d.body.prepend(back);}
 const beforeUnload=event=>{if(dirty()||pending){event.preventDefault();event.returnValue='';}};
 const closing=event=>{const requested=event.type==='cancel'||event.target?.closest?.('.aq267-close');if(requested&&!discard()){event.preventDefault();event.stopImmediatePropagation();}};
 window.addEventListener('beforeunload',beforeUnload);d.el.addEventListener('click',closing,true);d.el.addEventListener('cancel',closing,true);
 d.onDispose(()=>{original=null;pending=null;title.value=body.value='';preview.replaceChildren();window.removeEventListener('beforeunload',beforeUnload);d.el.removeEventListener('click',closing,true);d.el.removeEventListener('cancel',closing,true);});
 sync();return {start:load,run};
}
