import {createPage} from '../components/page.js';
import {node,field} from '../components/dialog.js';
import {createTemplateLogoContext} from '../components/template-property-logo.js';
import {createOriginalDocumentUpload,originalDocument} from '../components/original-document-upload.js';
import {listPropertyContractArchive} from '../components/property-contract-archive.js';
import {appendPdfViewer} from '../components/pdf-viewer.js';
import {documentFieldCatalog} from '../domain/rental-document-cycle.js';
import {t} from '../components/locale.js';

const errors={ACCESS_DENIED:'تعذر التحقق من صلاحية الملف. أعد فتح الصفحة.',PDF_LIMIT:'اختر PDF غير محمي من صفحة إلى ٣٠ صفحة.',PDF_EXISTING_FORM:'الملف يحتوي حقولًا أو توقيعًا إلكترونيًا. ارفع نموذجًا فارغًا بدون توقيع إلكتروني.',PDF_PAGE_SIZE:'أبعاد صفحات الملف غير مدعومة.',FIELD_OVERLAP:'يوجد تداخل بين الحقول. حرّك الحقول أو قلّل حجمها.',FIELD_TEXT_TOO_LONG:'النص أكبر من مساحة أحد الحقول. وسّع الحقل أو قلّل حجم الخط.',FIELD_VALUES_REQUIRED:'أكمل جميع الحقول قبل المعاينة.',FIELDS_REQUIRED:'حدد حقلًا واحدًا على الأقل.',TEMPLATE_TITLE_REQUIRED:'اكتب اسم النموذج.',PDF_OUTPUT_LIMIT:'النسخة الناتجة كبيرة. استخدم PDF أصغر من ٤ ميجابايت.',INVALID_FIELD_VALUE:'راجع القيم المدخلة والتواريخ والمبالغ.'};
export function openPdfFieldTemplate({propertyId=null,onBack}={}){
 const d=createPage(t('رفع نموذج PDF وتحديد الحقول'));if(!d)return false;
 d.el.classList.add('aq267-pdf-map');
 if(!document.getElementById('aq267-pdf-map-css')){const css=node('link');css.id='aq267-pdf-map-css';css.rel='stylesheet';css.href='/src/v267/styles/pdf-field-template.css';document.head.append(css);}
 let property=null,documentId=null,mapping=null,pages=[],page=1,selected=null,dirty=false,epoch=0,imageUrl=null,previewUrl=null,filled=null;
 const uploader=createOriginalDocumentUpload(d.session),templateUploader=createOriginalDocumentUpload(d.session),filledUploader=createOriginalDocumentUpload(d.session);
 const button=(text,fn)=>{const b=node('button',t(text));b.type='button';b.onclick=()=>d.run(fn);return b;};
 const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value;return el;};
 const choose=(pairs,value)=>{const el=node('select');for(const [v,label]of pairs){const o=node('option',t(label));o.value=v;el.append(o);}el.value=value;return el;};
 const clearPreview=()=>{filled=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
 d.onDispose(()=>{epoch++;if(imageUrl)URL.revokeObjectURL(imageUrl);clearPreview();});
 d.setBeforeClose(()=>!dirty||window.confirm(t('مواضع الحقول غير محفوظة. هل تريد الخروج؟')));
 async function request(action,extra={}){
  d.session.check();const session=(await d.session.client.auth.getSession())?.data?.session;
  if(!session?.access_token||session.user?.id!==d.session.bound.user)throw Error(t('أعد تسجيل الدخول.'));
  const response=await fetch('/api/pdf-field-template',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({workspaceId:d.session.bound.workspace,propertyId:property.id,documentId,action,...extra})});d.session.check();
  if(!response.ok){let info={};try{info=await response.json();}catch{}throw Error(t(errors[info.error]||'تعذر معالجة النموذج. راجع الملف والحقول ثم أعد المحاولة.'));}
  const latest=(await d.session.client.auth.getSession())?.data?.session;d.session.check();if(latest?.user?.id!==d.session.bound.user)throw Error(t('تغيرت جلسة الدخول.'));
  const expected=action==='inspect'?'application/json':action==='page'?'image/png':'application/pdf';if(response.headers.get('Content-Type')?.split(';')[0]!==expected)throw Error(t('استجابة الملف غير صالحة.'));
  return action==='inspect'?response.json():response.blob();
 }
 function target(title,pdfFieldTemplate=false){return {type:'property',ref:property.externalRef,propertyId:property.id,category:'property_contract',title,pdfFieldTemplate};}
 function change(){dirty=true;clearPreview();d.status.textContent=t('مواضع الحقول لم تُحفظ بعد.');}
 async function openDocument(id){documentId=id;const info=await request('inspect');pages=info.pages;if(!Array.isArray(pages)||!pages.length)throw Error(t('تعذر قراءة صفحات الملف.'));mapping=info.mapping||{version:1,title:'',propertyId:property.id,fields:[]};page=1;selected=null;dirty=false;await editor();}
 async function home(){
  if(d.session.bound.role!=='general_manager')throw Error(t('اعتماد المدير العام مطلوب.'));
  const props=await createTemplateLogoContext(d.session).listProperties();d.session.check();property=props.find(p=>p.id===propertyId)||null;
  const choice=choose([['','اختر العقار'],...props.map(p=>[p.id,p.name])],propertyId||'');choice.onchange=()=>d.run(async()=>{propertyId=choice.value;await home();});
  const file=input('file');file.accept='application/pdf';const title=node('h3',t('١. ارفع النموذج الأصلي'));
  const upload=button('رفع النموذج وتحديد الحقول',async()=>{if(!property)throw Error(t('اختر العقار أولًا.'));const f=file.files?.[0];if(!f||f.size>4*1024*1024)throw Error(t('اختر ملف PDF بحجم حتى ٤ ميجابايت.'));const blob=await originalDocument(f);if(blob.type!=='application/pdf')throw Error(t('اختر ملف PDF.'));const row=await uploader(f,target(f.name.slice(0,160)));await openDocument(row.id);});
  d.body.replaceChildren(field(t('العقار'),choice),title,node('p',t('ترفع النموذج مرة، ثم تضغط على أماكن الفراغات لتسمية الحقول. يحفظ الأصل دون تغيير.')),field(t('ملف PDF — حتى ٣٠ صفحة و٤ ميجابايت'),file),upload);
  if(onBack)d.body.prepend(button('العودة للعقود',()=>{d.close();return onBack();}));
  if(!property)return;
  const list=node('section');d.body.append(node('h3',t('نماذج PDF المحفوظة')),list);let offset=0;
  const more=button('عرض المزيد',loadMore);d.body.append(more);
  async function loadMore(){const result=await listPropertyContractArchive(d.session,property,offset);for(const row of result.items.filter(r=>r.metadata?.pdf_field_template===true)){const card=node('div');card.append(node('strong',row.title),button('فتح النموذج وتعبئته',()=>openDocument(row.id)));list.append(card);}offset=result.nextOffset;more.hidden=!result.hasMore;if(!list.children.length&&!result.hasMore)list.append(node('p',t('لا توجد نماذج حقول محفوظة لهذا العقار.')));}
  await loadMore();
 }
 async function editor(){
  const heading=node('h3',t('٢. اضغط على الفراغ وحدد الحقل')),name=input('text',mapping.title);name.maxLength=160;name.oninput=()=>{mapping.title=name.value;change();};
  const pageChoice=choose(pages.map((_,i)=>[String(i+1),t('صفحة ')+(i+1)]),String(page));
  const canvas=node('div'),image=node('img'),layer=node('div'),controls=node('section'),allFields=node('div');canvas.className='aq267-pdf-map-page';image.alt=t('صفحة النموذج الأصلي');image.draggable=false;layer.className='aq267-pdf-map-layer';canvas.append(image,layer);controls.className='aq267-pdf-map-controls';
  const tools=node('div');tools.className='aq267-pdf-map-actions';tools.append(button('حفظ النموذج والحقول',save),button('تعبئة النموذج',()=>{if(dirty)throw Error(t('احفظ النموذج والحقول أولًا.'));if(!mapping.fields.length)throw Error(t('حدد الحقول أولًا.'));return fill();}),button('النماذج المحفوظة',async()=>{if(dirty&&!window.confirm(t('الخروج دون حفظ مواضع الحقول؟')))return;dirty=false;await home();}));
  d.body.replaceChildren(heading,field(t('اسم النموذج'),name),node('p',t('اضغط على الفراغ لإضافة حقل. اضغط الحقل لتعديل اسمه وحجمه، أو اسحبه لتغيير مكانه.')),tools,field(t('الصفحة'),pageChoice),canvas,controls,node('h4',t('الحقول المحددة')),allFields);
  async function drawPage(){const ticket=++epoch;image.removeAttribute('src');layer.replaceChildren();const blob=await request('page',{page});if(ticket!==epoch)return;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);image.src=imageUrl;draw();}
  pageChoice.onchange=()=>d.run(async()=>{page=Number(pageChoice.value);selected=null;controls.replaceChildren();await drawPage();});
  canvas.onclick=event=>{if(event.target!==canvas&&event.target!==image&&event.target!==layer)return;if(!image.complete||!image.naturalWidth)return;if(mapping.fields.length>=100){d.status.textContent=t('الحد الأقصى ١٠٠ حقل.');return;}const r=canvas.getBoundingClientRect();const f={id:crypto.randomUUID(),label:t('حقل جديد'),type:'text',page,x:Math.max(0,Math.min(.8,(event.clientX-r.left)/r.width-.1)),y:Math.max(0,Math.min(.975,(event.clientY-r.top)/r.height-.0125)),width:.2,height:.025,fontSize:10,align:'right'};mapping.fields.push(f);selected=f.id;change();draw();editField(f);};
  function draw(){layer.replaceChildren();allFields.replaceChildren();for(const f of mapping.fields){const item=button(f.label+' · '+t('صفحة ')+f.page,async()=>{selected=f.id;if(page!==f.page){page=f.page;pageChoice.value=String(page);await drawPage();}editField(f);draw();});allFields.append(item);if(f.page!==page)continue;const box=node('button',f.label);box.type='button';box.className='aq267-pdf-map-field'+(selected===f.id?' is-selected':'');box.style.left=f.x*100+'%';box.style.top=f.y*100+'%';box.style.width=f.width*100+'%';box.style.height=f.height*100+'%';box.setAttribute('aria-label',f.label);box.onclick=event=>{event.stopPropagation();selected=f.id;editField(f);draw();};let drag=null;box.onpointerdown=event=>{event.stopPropagation();drag={x:event.clientX,y:event.clientY,fx:f.x,fy:f.y};box.setPointerCapture(event.pointerId);};box.onpointermove=event=>{if(!drag)return;const r=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)/r.width,dy=(event.clientY-drag.y)/r.height;if(Math.abs(dx)+Math.abs(dy)<.002)return;f.x=Math.max(0,Math.min(1-f.width,drag.fx+dx));f.y=Math.max(0,Math.min(1-f.height,drag.fy+dy));box.style.left=f.x*100+'%';box.style.top=f.y*100+'%';change();};box.onpointerup=event=>{drag=null;box.releasePointerCapture(event.pointerId);selected=f.id;editField(f);};box.onpointercancel=()=>{drag=null;};layer.append(box);}}
  function editField(f){
   const label=input('text',f.label);label.maxLength=100;label.oninput=()=>{f.label=label.value;change();draw();};
   const preset=choose([['','اختر اسم الحقل'],...Object.values(documentFieldCatalog).map(f=>[f.key,f.label])],'');preset.onchange=()=>{const spec=documentFieldCatalog[preset.value];if(spec){f.label=spec.label;f.type=spec.type;label.value=f.label;type.value=f.type;change();draw();}};
   const type=choose([['text','نص'],['date','تاريخ'],['number','رقم'],['money','مبلغ']],f.type);type.onchange=()=>{f.type=type.value;change();};const align=choose([['right','يمين'],['left','يسار'],['center','وسط']],f.align);align.onchange=()=>{f.align=align.value;change();};
   controls.replaceChildren(node('h4',t('تعديل الحقل')),field(t('اسم جاهز'),preset),field(t('اسم الحقل'),label),field(t('نوع الحقل'),type),field(t('محاذاة الكتابة'),align));
   for(const [key,text,min,max]of [['x','المسافة من يسار الصفحة ٪',0,99],['y','المسافة من أعلى الصفحة ٪',0,99],['width','عرض الحقل ٪',1,100],['height','ارتفاع الحقل ٪',.6,100],['fontSize','حجم الخط',6,30]]){const scale=key==='fontSize'?1:100,c=input('number',Math.round(f[key]*scale*100)/100);c.min=min;c.max=max;c.step=.1;c.onchange=()=>{const value=Number(c.value)/scale;if(!Number.isFinite(value)||value<min/scale||value>max/scale){c.value=f[key]*scale;return;}f[key]=value;f.width=Math.min(f.width,1-f.x);f.height=Math.min(f.height,1-f.y);change();draw();};controls.append(field(t(text),c));}
   controls.append(button('حذف هذا الحقل',()=>{mapping.fields=mapping.fields.filter(x=>x.id!==f.id);selected=null;change();controls.replaceChildren();draw();}));controls.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  async function save(){if(!mapping.title.trim())throw Error(t('اكتب اسم النموذج.'));if(!mapping.fields.length)throw Error(t('حدد حقلًا واحدًا على الأقل.'));const snapshot=JSON.stringify(mapping),blob=await request('save',{mapping});const row=await templateUploader(new File([blob],'aqari-field-template.pdf',{type:'application/pdf'}),target(mapping.title,true));if(snapshot!==JSON.stringify(mapping))throw Error(t('حُفظت النسخة السابقة؛ احفظ التعديلات الجديدة أيضًا.'));documentId=row.id;dirty=false;d.status.textContent=t('تم حفظ النموذج ومواضع الحقول. يمكنك تعبئته الآن أو فتحه لاحقًا.');}
  await drawPage();
 }
 async function fill(){
  clearPreview();const form=node('form'),values={},preview=node('section');
  form.append(node('h3',mapping.title),node('p',t('٣. عبّئ البيانات وراجع النسخة. هذه الخطوة لا تنشئ عقدًا تشغيليًا أو دفعة.')));
  for(const f of mapping.fields){const control=input(f.type==='date'?'date':'text');control.required=true;control.maxLength=1000;if(['number','money'].includes(f.type))control.inputMode='decimal';values[f.id]=control;control.oninput=()=>{clearPreview();preview.replaceChildren();};form.append(field(f.label,control));}
  const create=node('button',t('معاينة النسخة المعبأة'));create.type='submit';form.append(create);d.body.replaceChildren(button('تعديل مواضع الحقول',editor),form,preview);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;d.run(async()=>{const entered=Object.fromEntries(Object.entries(values).map(([k,c])=>[k,c.value])),snapshot=JSON.stringify(entered),blob=await request('fill',{values:entered});if(snapshot!==JSON.stringify(Object.fromEntries(Object.entries(values).map(([k,c])=>[k,c.value]))))throw Error(t('تغيرت البيانات؛ أعد المعاينة.'));clearPreview();filled=blob;previewUrl=URL.createObjectURL(blob);preview.replaceChildren(node('p',t('راجع البيانات ومواضعها قبل استخدام النسخة.')));appendPdfViewer(preview,previewUrl,{title:mapping.title,filename:'filled-contract.pdf'});preview.append(button('حفظ النسخة المعبأة في أرشيف العقار',async()=>{if(!filled)throw Error(t('أعد معاينة النسخة.'));await filledUploader(new File([filled],'filled-contract.pdf',{type:'application/pdf'}),target((mapping.title+' — نسخة معبأة للمراجعة').slice(0,180)));d.status.textContent=t('تم حفظ النسخة المعبأة في أرشيف العقار.');}));});};
 }
 d.body.append(button('إعادة المحاولة',home));d.run(home);return true;
}
