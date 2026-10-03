import {createPage} from '../components/page.js';
import {node,field} from '../components/dialog.js';
import {createTemplateLogoContext} from '../components/template-property-logo.js';
import {createOriginalDocumentUpload,originalDocument} from '../components/original-document-upload.js';
import {listPropertyContractArchive} from '../components/property-contract-archive.js';
import {appendPdfViewer} from '../components/pdf-viewer.js';
import {documentFieldCatalog} from '../domain/rental-document-cycle.js';
import {t} from '../components/locale.js';
import {recognizePdfPage} from '../components/pdf-local-ocr.js';

const errors={ACCESS_DENIED:'تعذر التحقق من صلاحية الملف. أعد فتح الصفحة.',PDF_LIMIT:'اختر PDF غير محمي من صفحة إلى ٣٠ صفحة.',PDF_EXISTING_FORM:'الملف يحتوي حقولًا أو توقيعًا إلكترونيًا. ارفع نموذجًا فارغًا بدون توقيع إلكتروني.',PDF_PAGE_SIZE:'أبعاد صفحات الملف غير مدعومة.',FIELD_OVERLAP:'يوجد تداخل بين الحقول. حرّك الحقول أو قلّل حجمها.',FIELD_TEXT_TOO_LONG:'النص أكبر من مساحة أحد الحقول. وسّع الحقل أو قلّل حجم الخط.',FIELD_VALUES_REQUIRED:'أكمل جميع الحقول قبل المعاينة.',FIELDS_REQUIRED:'حدد حقلًا واحدًا على الأقل.',TEMPLATE_TITLE_REQUIRED:'اكتب اسم النموذج.',PDF_OUTPUT_LIMIT:'النسخة الناتجة كبيرة. استخدم PDF أصغر من ٤ ميجابايت.',INVALID_FIELD_VALUE:'راجع القيم المدخلة والتواريخ والمبالغ.'};
export function openPdfFieldTemplate({propertyId=null,onBack}={}){
 const d=createPage(t('رفع نموذج PDF وتحديد الحقول'));if(!d)return false;
 d.el.classList.add('aq267-pdf-map');
 d.el.id='aq267-pdf-field-workspace';
 if(!document.getElementById('aq267-pdf-map-css')){const css=node('link');css.id='aq267-pdf-map-css';css.rel='stylesheet';css.href='/src/v267/styles/pdf-field-template.css';document.head.append(css);}
 let property=null,documentId=null,mapping=null,pages=[],page=1,selected=null,dirty=false,epoch=0,imageUrl=null,previewUrl=null,filled=null;
 let stopText=()=>{};
 const uploader=createOriginalDocumentUpload(d.session),templateUploader=createOriginalDocumentUpload(d.session),filledUploader=createOriginalDocumentUpload(d.session);
 const button=(text,fn)=>{const b=node('button',t(text));b.type='button';b.onclick=()=>d.run(fn);return b;};
 const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value;return el;};
 const choose=(pairs,value)=>{const el=node('select');for(const [v,label]of pairs){const o=node('option',t(label));o.value=v;el.append(o);}el.value=value;return el;};
 const clearPreview=()=>{filled=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
 d.onDispose(()=>{stopText();epoch++;if(imageUrl)URL.revokeObjectURL(imageUrl);clearPreview();});
 d.setBeforeClose(()=>!dirty||window.confirm(t('مواضع الحقول غير محفوظة. هل تريد الخروج؟')));
 async function request(action,extra={}){
  d.session.check();const session=(await d.session.client.auth.getSession())?.data?.session;
  if(!session?.access_token||session.user?.id!==d.session.bound.user)throw Error(t('أعد تسجيل الدخول.'));
  const response=await fetch('/api/pdf-field-template',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({workspaceId:d.session.bound.workspace,propertyId:property.id,documentId,action,...extra})});d.session.check();
  if(!response.ok){let info={};try{info=await response.json();}catch{}throw Error(t(errors[info.error]||'تعذر معالجة النموذج. راجع الملف والحقول ثم أعد المحاولة.'));}
  const latest=(await d.session.client.auth.getSession())?.data?.session;d.session.check();if(latest?.user?.id!==d.session.bound.user)throw Error(t('تغيرت جلسة الدخول.'));
  const expected=['inspect','text'].includes(action)?'application/json':action==='page'?'image/png':'application/pdf';if(response.headers.get('Content-Type')?.split(';')[0]!==expected)throw Error(t('استجابة الملف غير صالحة.'));
  return ['inspect','text'].includes(action)?response.json():response.blob();
 }
 function target(title,pdfFieldTemplate=false){return {type:'property',ref:property.externalRef,propertyId:property.id,category:'property_contract',title,pdfFieldTemplate};}
 function change(){dirty=true;clearPreview();d.status.textContent=t('مواضع الحقول لم تُحفظ بعد.');}
 async function openDocument(id){documentId=id;const info=await request('inspect');pages=info.pages;if(!Array.isArray(pages)||!pages.length)throw Error(t('تعذر قراءة صفحات الملف.'));mapping=info.mapping||{version:1,title:'',propertyId:property.id,fields:[]};page=1;selected=null;dirty=false;await editor();}
 async function home(){
  stopText();
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
  stopText();
  const heading=node('h3',t('٢. اضغط على الفراغ وحدد الحقل')),name=input('text',mapping.title);name.maxLength=160;name.oninput=()=>{mapping.title=name.value;change();};
  const pageChoice=choose(pages.map((_,i)=>[String(i+1),t('صفحة ')+(i+1)]),String(page));
  const canvas=node('div'),image=node('img'),layer=node('div'),controls=node('section'),allFields=node('div');canvas.className='aq267-pdf-map-page';image.alt=t('صفحة النموذج الأصلي');image.draggable=false;layer.className='aq267-pdf-map-layer';canvas.append(image,layer);const viewport=node('div');viewport.className='aq267-pdf-map-viewport';viewport.append(canvas);controls.className='aq267-pdf-map-controls';
  let zoom=1;
  const zoomTools=node('div'),zoomLabel=node('output');zoomTools.className='aq267-pdf-map-actions aq267-pdf-map-zoom';zoomLabel.setAttribute('aria-live','polite');
  function setZoom(value){zoom=Math.max(1,Math.min(4,value));canvas.style.width=(zoom*100)+'%';zoomLabel.textContent=Math.round(zoom*100)+'%';}
  zoomTools.append(button('تصغير −',()=>setZoom(zoom-.5)),zoomLabel,button('تكبير +',()=>setZoom(zoom+.5)),button('ملاءمة الشاشة',()=>setZoom(1)));setZoom(1);
  const textPanel=node('details'),textTools=node('div'),textStatus=node('p'),textResult=node('textarea');textPanel.className='aq267-pdf-map-text';textResult.readOnly=true;textResult.rows=10;textResult.setAttribute('aria-label',t('النص المستخرج'));textStatus.setAttribute('role','status');textPanel.append(node('summary',t('استخراج نص الصفحة')),node('p',t('استخرج النص للمراجعة والنسخ. OCR يعمل على جهازك وقد يخطئ؛ لا يغيّر العقد الأصلي.')),textTools,textStatus,textResult);
  let textController=null;
  stopText=()=>{textController?.abort();textController=null;};
  const extract=node('button',t('استخراج النص')),ocr=node('button',t('قراءة الصورة OCR')),cancel=node('button',t('إلغاء القراءة'));
  for(const b of [extract,ocr,cancel])b.type='button';cancel.hidden=true;textTools.className='aq267-pdf-map-actions';textTools.append(extract,ocr,cancel);
  cancel.onclick=()=>{stopText();extract.disabled=false;ocr.disabled=false;cancel.hidden=true;textStatus.textContent=t('أُلغيت القراءة.');};
  async function readText(forceOcr){
   stopText();const controller=new AbortController();textController=controller;const readingPage=page;extract.disabled=true;ocr.disabled=true;cancel.hidden=false;textResult.value='';textStatus.textContent=t('جارٍ قراءة الصفحة…');
   try{d.session.check();let text='';if(!forceOcr){const result=await request('text',{page:readingPage});text=result.text||'';}if(controller.signal.aborted)return;
    if(!text.trim()){if(!image.complete||!image.naturalWidth)throw Error('IMAGE_NOT_READY');text=await recognizePdfPage(image,{signal:controller.signal,onProgress:n=>{if(!controller.signal.aborted)textStatus.textContent=t('قراءة الصورة على جهازك: ')+n+'%';}});}
    d.session.check();if(controller.signal.aborted||page!==readingPage)return;textResult.value=text;textStatus.textContent=t(text.trim()?'اكتملت القراءة. راجع النص قبل نسخه أو استخدامه.':'لم يُعثر على نص واضح في هذه الصفحة.');
   }catch(error){if(!controller.signal.aborted)textStatus.textContent=t('تعذرت القراءة. حاول مجددًا أو استخدم صورة أوضح.');}
   finally{if(textController===controller){textController=null;extract.disabled=false;ocr.disabled=false;cancel.hidden=true;}}
  }
  extract.onclick=()=>readText(false);ocr.onclick=()=>readText(true);
  const tools=node('div');tools.className='aq267-pdf-map-actions';tools.append(button('إضافة حقل',()=>addField(.4,.2)),button('حفظ النموذج والحقول',save),button('تعبئة النموذج',()=>{if(dirty)throw Error(t('احفظ النموذج والحقول أولًا.'));if(!mapping.fields.length)throw Error(t('حدد الحقول أولًا.'));return fill();}),button('النماذج المحفوظة',async()=>{if(dirty&&!window.confirm(t('الخروج دون حفظ مواضع الحقول؟')))return;dirty=false;await home();}));
  d.body.replaceChildren(heading,field(t('اسم النموذج'),name),node('p',t('اضغط على الفراغ لإضافة حقل، واسحبه لتحريكه. اسحب المقبض الدائري لتغيير حجمه. كبّر الصفحة لوضع الحقول بدقة.')),tools,field(t('الصفحة'),pageChoice),zoomTools,viewport,controls,textPanel,node('h4',t('الحقول المحددة')),allFields);
  async function drawPage(){stopText();extract.disabled=false;ocr.disabled=false;cancel.hidden=true;textResult.value='';textStatus.textContent='';const ticket=++epoch;image.removeAttribute('src');layer.replaceChildren();const blob=await request('page',{page});if(ticket!==epoch)return;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);image.src=imageUrl;draw();}
  pageChoice.onchange=()=>d.run(async()=>{page=Number(pageChoice.value);selected=null;controls.replaceChildren();await drawPage();});
  function addField(x,y){if(!image.complete||!image.naturalWidth){d.status.textContent=t('انتظر اكتمال ظهور صفحة العقد.');return;}if(mapping.fields.length>=100){d.status.textContent=t('الحد الأقصى ١٠٠ حقل.');return;}const f={id:crypto.randomUUID(),label:t('حقل جديد'),type:'text',page,x:Math.max(0,Math.min(.8,x)),y:Math.max(0,Math.min(.975,y)),width:.2,height:.025,fontSize:10,align:'right'};mapping.fields.push(f);selected=f.id;change();draw();editField(f);}
  // Bind the hit surface itself: touch browsers need a directly interactive target.
  layer.onclick=event=>{if(event.target!==layer)return;event.stopPropagation();const r=image.getBoundingClientRect();if(!r.width||!r.height)return;addField((event.clientX-r.left)/r.width-.1,(event.clientY-r.top)/r.height-.0125);};

  function draw(){
   layer.replaceChildren();allFields.replaceChildren();
   for(const f of mapping.fields){
    const item=button(f.label+' · '+t('صفحة ')+f.page,async()=>{selected=f.id;if(page!==f.page){page=f.page;pageChoice.value=String(page);await drawPage();}editField(f,true);draw();});allFields.append(item);if(f.page!==page)continue;
    const box=node('div'),label=node('span',f.label),handle=node('span');box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label',f.label);box.className='aq267-pdf-map-field'+(selected===f.id?' is-selected':'');label.className='aq267-pdf-map-label';handle.className='aq267-pdf-map-resize';handle.setAttribute('aria-hidden','true');box.append(label,handle);
    const position=()=>{box.style.left=f.x*100+'%';box.style.top=f.y*100+'%';box.style.setProperty('--pdf-field-width',f.width*100+'%');box.style.setProperty('--pdf-field-height',f.height*100+'%');};position();
    let drag=null,suppressClick=false;
    const select=()=>{selected=f.id;layer.querySelectorAll('.is-selected').forEach(e=>e.classList.remove('is-selected'));box.classList.add('is-selected');editField(f);};
    box.onclick=event=>{event.stopPropagation();if(!suppressClick)select();suppressClick=false;};
    box.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();select();drag={x:event.clientX,y:event.clientY,fx:f.x,fy:f.y,w:f.width,h:f.height,resize:event.target===handle};suppressClick=false;box.setPointerCapture(event.pointerId);};
    box.onpointermove=event=>{if(!drag)return;event.preventDefault();const r=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)/r.width,dy=(event.clientY-drag.y)/r.height;if(Math.abs(dx)+Math.abs(dy)<.002)return;suppressClick=true;
     if(drag.resize){f.width=Math.max(.01,Math.min(1-f.x,drag.w+dx));f.height=Math.max(.006,Math.min(1-f.y,drag.h+dy));}else{f.x=Math.max(0,Math.min(1-f.width,drag.fx+dx));f.y=Math.max(0,Math.min(1-f.height,drag.fy+dy));}position();change();};
    const finish=event=>{if(!drag)return;drag=null;if(box.hasPointerCapture(event.pointerId))box.releasePointerCapture(event.pointerId);editField(f);};box.onpointerup=finish;box.onpointercancel=finish;
    box.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();return;}const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const delta=directions[event.key];if(!delta)return;event.preventDefault();const step=event.shiftKey ? .01 : .002;
     if(event.altKey){f.width=Math.max(.01,Math.min(1-f.x,f.width+delta[0]*step));f.height=Math.max(.006,Math.min(1-f.y,f.height+delta[1]*step));}else{f.x=Math.max(0,Math.min(1-f.width,f.x+delta[0]*step));f.y=Math.max(0,Math.min(1-f.height,f.y+delta[1]*step));}position();change();editField(f);};
    layer.append(box);
   }
  }
  function editField(f,scroll=false){
   const label=input('text',f.label);label.maxLength=100;label.oninput=()=>{f.label=label.value;change();draw();};
   const preset=choose([['','اختر اسم الحقل'],...Object.values(documentFieldCatalog).map(f=>[f.key,f.label])],'');preset.onchange=()=>{const spec=documentFieldCatalog[preset.value];if(spec){f.label=spec.label;f.type=spec.type;label.value=f.label;type.value=f.type;change();draw();}};
   const type=choose([['text','نص'],['date','تاريخ'],['number','رقم'],['money','مبلغ']],f.type);type.onchange=()=>{f.type=type.value;change();};const align=choose([['right','يمين'],['left','يسار'],['center','وسط']],f.align);align.onchange=()=>{f.align=align.value;change();};
   controls.replaceChildren(node('h4',t('تعديل الحقل')),field(t('اسم جاهز'),preset),field(t('اسم الحقل'),label),field(t('نوع الحقل'),type),field(t('محاذاة الكتابة'),align));
   const advanced=node('details');advanced.className='aq267-pdf-map-advanced';advanced.append(node('summary',t('إعدادات دقيقة (اختياري)')));controls.append(advanced);
   for(const [key,text,min,max]of [['x','المسافة من يسار الصفحة ٪',0,99],['y','المسافة من أعلى الصفحة ٪',0,99],['width','عرض الحقل ٪',1,100],['height','ارتفاع الحقل ٪',.6,100],['fontSize','حجم الخط',6,30]]){const scale=key==='fontSize'?1:100,c=input('number',Math.round(f[key]*scale*100)/100);c.min=min;c.max=max;c.step=.1;c.onchange=()=>{const value=Number(c.value)/scale;if(!Number.isFinite(value)||value<min/scale||value>max/scale){c.value=f[key]*scale;return;}f[key]=value;f.width=Math.min(f.width,1-f.x);f.height=Math.min(f.height,1-f.y);change();draw();};(key==='fontSize'?controls:advanced).append(field(t(text),c));}
   controls.append(button('حذف هذا الحقل',()=>{mapping.fields=mapping.fields.filter(x=>x.id!==f.id);selected=null;change();controls.replaceChildren();draw();}));if(scroll)controls.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  async function save(){if(!mapping.title.trim())throw Error(t('اكتب اسم النموذج.'));if(!mapping.fields.length)throw Error(t('حدد حقلًا واحدًا على الأقل.'));const snapshot=JSON.stringify(mapping),blob=await request('save',{mapping});const row=await templateUploader(new File([blob],'aqari-field-template.pdf',{type:'application/pdf'}),target(mapping.title,true));if(snapshot!==JSON.stringify(mapping))throw Error(t('حُفظت النسخة السابقة؛ احفظ التعديلات الجديدة أيضًا.'));documentId=row.id;dirty=false;d.status.textContent=t('تم حفظ النموذج ومواضع الحقول. يمكنك تعبئته الآن أو فتحه لاحقًا.');}
  await drawPage();
 }
 async function fill(){
  stopText();
  clearPreview();const form=node('form'),values={},preview=node('section');
  form.append(node('h3',mapping.title),node('p',t('٣. عبّئ البيانات وراجع النسخة. هذه الخطوة لا تنشئ عقدًا تشغيليًا أو دفعة.')));
  for(const f of mapping.fields){const control=input(f.type==='date'?'date':'text');control.required=true;control.maxLength=1000;if(['number','money'].includes(f.type))control.inputMode='decimal';values[f.id]=control;control.oninput=()=>{clearPreview();preview.replaceChildren();};form.append(field(f.label,control));}
  const create=node('button',t('معاينة النسخة المعبأة'));create.type='submit';form.append(create);d.body.replaceChildren(button('تعديل مواضع الحقول',editor),form,preview);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;d.run(async()=>{const entered=Object.fromEntries(Object.entries(values).map(([k,c])=>[k,c.value])),snapshot=JSON.stringify(entered),blob=await request('fill',{values:entered});if(snapshot!==JSON.stringify(Object.fromEntries(Object.entries(values).map(([k,c])=>[k,c.value]))))throw Error(t('تغيرت البيانات؛ أعد المعاينة.'));clearPreview();filled=blob;previewUrl=URL.createObjectURL(blob);preview.replaceChildren(node('p',t('راجع البيانات ومواضعها قبل استخدام النسخة.')));appendPdfViewer(preview,previewUrl,{title:mapping.title,filename:'filled-contract.pdf'});preview.append(button('حفظ النسخة المعبأة في أرشيف العقار',async()=>{if(!filled)throw Error(t('أعد معاينة النسخة.'));await filledUploader(new File([filled],'filled-contract.pdf',{type:'application/pdf'}),target((mapping.title+' — نسخة معبأة للمراجعة').slice(0,180)));d.status.textContent=t('تم حفظ النسخة المعبأة في أرشيف العقار.');}));});};
 }
 d.body.append(button('إعادة المحاولة',home));d.run(home);return true;
}
