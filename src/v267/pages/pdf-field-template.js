import {linkedPdfFields,linkPdfField,writeLinkedPdfValue} from '../domain/pdf-linked-fields.js';
import {createPage} from '../components/page.js';
import {node,field} from '../components/dialog.js';
import {createTemplateLogoContext} from '../components/template-property-logo.js';
import {createOriginalDocumentUpload,originalDocument} from '../components/original-document-upload.js';
import {listPropertyContractArchive} from '../components/property-contract-archive.js';
import {appendPdfViewer} from '../components/pdf-viewer.js';
import {appendPdfPagePreview} from '../components/pdf-page-preview.js';
import {documentFieldCatalog} from '../domain/rental-document-cycle.js';
import {t} from '../components/locale.js';
import {recognizePdfPage} from '../components/pdf-local-ocr.js';
import {requestPdfField} from '../api/pdf-field-request.js';
import {createPdfEditorHistory} from '../domain/pdf-editor-history.js';
import {createPdfEditorDraft,pdfEditorFingerprint} from '../domain/pdf-editor-draft.js';

const errors={FIELD_LINK_CONFLICT:'القيم المرتبطة مختلفة. راجع الحقول قبل المعاينة.',ACCESS_DENIED:'تعذر التحقق من صلاحية الملف. أعد فتح الصفحة.',PDF_LIMIT:'اختر PDF غير محمي من صفحة إلى ٣٠ صفحة.',PDF_EXISTING_FORM:'الملف يحتوي حقولًا أو توقيعًا إلكترونيًا. ارفع نموذجًا فارغًا بدون توقيع إلكتروني.',PDF_PAGE_SIZE:'أبعاد صفحات الملف غير مدعومة.',FIELD_OVERLAP:'يوجد تداخل بين الحقول. حرّك الحقول أو قلّل حجمها.',FIELD_TEXT_TOO_LONG:'النص أكبر من مساحة أحد الحقول. وسّع الحقل أو قلّل حجم الخط.',FIELD_VALUES_REQUIRED:'أكمل جميع الحقول قبل المعاينة.',FIELDS_REQUIRED:'حدد حقلًا واحدًا على الأقل.',TEMPLATE_TITLE_REQUIRED:'اكتب اسم النموذج.',PDF_OUTPUT_LIMIT:'النسخة الناتجة كبيرة. استخدم PDF أصغر من ٤ ميجابايت.',INVALID_FIELD_VALUE:'راجع القيم المدخلة والتواريخ والمبالغ.'};
export function openPdfFieldTemplate({propertyId=null,onBack}={}){
 const d=createPage(t('رفع نموذج PDF وتحديد الحقول'));if(!d)return false;
 d.el.classList.add('aq267-pdf-map');
 d.el.id='aq267-pdf-field-workspace';
 if(!document.getElementById('aq267-pdf-map-css')){const css=node('link');css.id='aq267-pdf-map-css';css.rel='stylesheet';css.href='/src/v267/styles/pdf-field-template.css';document.head.append(css);}
 let property=null,documentId=null,mapping=null,pages=[],page=1,selected=null,dirty=false,epoch=0,imageUrl=null,previewUrl=null,filled=null;
 let draft=null,draftStatus=null,draftFork=null;
 let history=null,refreshHistory=()=>{},savedMapping='',savedValues='{}';
 let stopText=()=>{},stopEditor=()=>{},stopPreview=()=>{},invalidatePreview=()=>{},values={},valuesDirty=false;
 const uploader=createOriginalDocumentUpload(d.session),templateUploader=createOriginalDocumentUpload(d.session),filledUploader=createOriginalDocumentUpload(d.session);
 const button=(text,fn)=>{const b=node('button',t(text));b.type='button';b.onclick=()=>d.run(fn);return b;};
 const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value;return el;};
 // Keep the same native file control when the property selection reloads home.
 // Recreating it silently discards the user's selected file on mobile.
 const uploadFile=input('file');uploadFile.accept='application/pdf';
 const choose=(pairs,value)=>{const el=node('select');for(const [v,label]of pairs){const o=node('option',t(label));o.value=v;el.append(o);}el.value=value;return el;};
 const clearPreview=()=>{stopPreview();stopPreview=()=>{};filled=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
 d.onDispose(()=>{draft?.dispose();window.removeEventListener('beforeunload',warnUnsaved);history?.clear();stopText();stopEditor();values={};epoch++;if(imageUrl)URL.revokeObjectURL(imageUrl);clearPreview();});
 const warnUnsaved=event=>{if(draft?.dirty){event.preventDefault();event.returnValue='';}};
 window.addEventListener('beforeunload',warnUnsaved);
 const canLeave=async()=>{try{await draft?.flush();return true;}catch{return window.confirm(t('لم يتأكد حفظ آخر التعديلات. الخروج قد يفقدها. هل تريد الخروج؟'));}};
 const draftRpc=(action,data)=>d.session.request(d.session.client.rpc('aqari_pdf_editor_drafts',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{property_id:property.id,...data}}));
 function showDraftStatus(state,error){
  if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED'){d.close();return;}
  const messages={dirty:'تعديلات المسودة بانتظار الحفظ…',saving:'جارٍ حفظ المسودة…',saved:'حُفظت المسودة وبيانات التعبئة. يمكنك استعادتها من مسوداتي المحفوظة.',conflict:'توجد نسخة أحدث في تبويب آخر. تعديلاتك باقية؛ احفظها كمسودة مستقلة.',error:'لم يتأكد حفظ المسودة. تعديلاتك باقية؛ اضغط حفظ المسودة الآن لإعادة المحاولة.'};
  if(draftStatus)draftStatus.textContent=t(error?.message==='INVALID_PDF_DRAFT'?'راجع مقاسات الحقول وأطوال البيانات، ثم احفظ المسودة مجددًا.':messages[state]);
  if(draftFork)draftFork.hidden=state!=='conflict';
 }
 function startDraft(initial){
  draft?.dispose();draft=createPdfEditorDraft({propertyId:property.id,initial,read:()=>({document_id:documentId,snapshot:snapshot()}),write:data=>draftRpc('save',data),onStatus:showDraftStatus});
 }
 d.setBeforeClose(canLeave);
 const request=(action,extra={},signal)=>requestPdfField(d,{body:{workspaceId:d.session.bound.workspace,propertyId:property.id,documentId,action,...extra},signal,errors,translate:t});
 function target(title,pdfFieldTemplate=false){return {type:'property',ref:property.externalRef,propertyId:property.id,category:'property_contract',title,pdfFieldTemplate};}
 const snapshot=()=>({mapping,values,page,selected});
 function remember(group=''){history?.record(snapshot(),{group});refreshHistory();}
 function change(group=''){remember(group);draft?.changed();dirty=pdfEditorFingerprint(mapping)!==savedMapping;valuesDirty=pdfEditorFingerprint(values)!==savedValues;clearPreview();invalidatePreview();d.status.textContent=t('مواضع الحقول لم تُحفظ بعد.');}
 async function openDocument(id,restored=null){
  draft?.dispose();draft=null;values={};valuesDirty=false;clearPreview();documentId=id;
  const info=await request('inspect');pages=info.pages;if(!Array.isArray(pages)||!pages.length)throw Error(t('تعذر قراءة صفحات الملف.'));
  mapping=info.mapping||{version:1,title:'',propertyId:property.id,fields:[]};page=1;selected=null;dirty=false;savedMapping=pdfEditorFingerprint(mapping);savedValues='{}';
  if(restored){
   const snap=restored.snapshot;
   if(restored.property_id!==property.id||restored.document_id!==id||snap.mapping.propertyId!==property.id||snap.page>pages.length||snap.mapping.fields.some(f=>f.page>pages.length))throw Error(t('تعذر مطابقة المسودة مع صفحات أصلها.'));
   mapping=snap.mapping;values=snap.values;page=snap.page;selected=snap.selected;dirty=pdfEditorFingerprint(mapping)!==savedMapping;valuesDirty=pdfEditorFingerprint(values)!==savedValues;
  }
  history?.clear();history=createPdfEditorHistory(snapshot());startDraft(restored);await editor();
 }
 async function home(){
  draft?.dispose();draft=null;draftStatus=null;draftFork=null;
  history?.clear();history=null;refreshHistory=()=>{};stopText();stopEditor();clearPreview();values={};valuesDirty=false;invalidatePreview=()=>{};
  if(d.session.bound.role!=='general_manager')throw Error(t('اعتماد المدير العام مطلوب.'));
  const props=await createTemplateLogoContext(d.session).listProperties();d.session.check();property=props.find(p=>p.id===propertyId)||null;
  const choice=choose([['','اختر العقار'],...props.map(p=>[p.id,p.name])],propertyId||'');choice.onchange=()=>d.run(async()=>{propertyId=choice.value;await home();});
  const file=uploadFile;const title=node('h3',t('١. ارفع النموذج الأصلي'));
  const upload=button('رفع النموذج وتحديد الحقول',async()=>{if(!property)throw Error(t('اختر العقار أولًا.'));const f=file.files?.[0];if(!f||f.size>4*1024*1024)throw Error(t('اختر ملف PDF بحجم حتى ٤ ميجابايت.'));const blob=await originalDocument(f);if(blob.type!=='application/pdf')throw Error(t('اختر ملف PDF.'));const row=await uploader(f,target(f.name.slice(0,160)));await openDocument(row.id);});
  const uploadStatus=node('p');uploadStatus.className='aq267-pdf-upload-status';uploadStatus.setAttribute('role','status');
  function updateUpload(){const f=file.files?.[0];upload.disabled=!property||!f||f.size>4*1024*1024;uploadStatus.textContent=t(!props.length?'لا توجد عقارات متاحة لهذا الحساب. أعد تحميل القائمة أو راجع صلاحيات العقارات.':!property?'اختر العقار للمتابعة.':!f?'اختر ملف العقد من جهازك للمتابعة.':f.size>4*1024*1024?'اختر ملف PDF بحجم حتى ٤ ميجابايت.':'الملف جاهز. اضغط رفع النموذج وتحديد الحقول.');}
  file.onchange=updateUpload;updateUpload();
  d.body.replaceChildren(field(t('العقار'),choice),title,node('p',t('ترفع النموذج مرة، ثم تضغط على أماكن الفراغات لتسمية الحقول. يحفظ الأصل دون تغيير.')),field(t('ملف PDF — حتى ٣٠ صفحة و٤ ميجابايت'),file),uploadStatus,upload);
  if(!props.length)d.body.append(button('إعادة تحميل العقارات',home));
  if(onBack)d.body.prepend(button('العودة للعقود',()=>{d.close();return onBack();}));
  if(!property)return;
  const drafts=node('section'),draftList=node('div'),draftListStatus=node('p');draftListStatus.setAttribute('role','status');let draftOffset=0;
  const draftMore=button('عرض مسودات أخرى',loadDrafts);
  const retryDrafts=button('إعادة تحميل المسودات',async()=>{draftOffset=0;draftList.replaceChildren();await loadDrafts();});retryDrafts.hidden=true;
  drafts.append(node('h3',t('مسوداتي المحفوظة')),node('p',t('مسوداتك الخاصة تشمل مواضع الحقول وبيانات التعبئة؛ لا تُصدر عقدًا ولا تسجل دفعة.')),draftList,draftListStatus,retryDrafts,draftMore);d.body.append(drafts);
  async function loadDrafts(){
   try{const result=await draftRpc('list',{offset:draftOffset});d.session.check();
    for(const row of result.items){const card=node('div');card.append(node('strong',row.title),node('p',new Date(row.updated_at).toLocaleString()),button('استعادة المسودة',async()=>{const restored=await draftRpc('get',{id:row.id});await openDocument(restored.document_id,restored);}));draftList.append(card);}
    draftOffset=result.next_offset;draftMore.hidden=!result.has_more;retryDrafts.hidden=true;draftListStatus.textContent=draftList.children.length?'':t('لا توجد مسودات محفوظة لك في هذا العقار.');
   }catch(error){if(error?.code==='42501'||error?.message==='ACCESS_DENIED'||[401,403].includes(error?.status))throw error;draftMore.hidden=true;retryDrafts.hidden=false;draftListStatus.textContent=t('تعذر تحميل المسودات. أعد المحاولة.');}
  }
  await loadDrafts();
  const list=node('section');d.body.append(node('h3',t('نماذج PDF المحفوظة')),list);let offset=0;
  const more=button('عرض المزيد',loadMore);d.body.append(more);
  async function loadMore(){const result=await listPropertyContractArchive(d.session,property,offset);for(const row of result.items.filter(r=>r.metadata?.pdf_field_template===true)){const card=node('div');card.append(node('strong',row.title),button('فتح النموذج وتعبئته',()=>openDocument(row.id)));list.append(card);}offset=result.nextOffset;more.hidden=!result.hasMore;if(!list.children.length&&!result.hasMore)list.append(node('p',t('لا توجد نماذج حقول محفوظة لهذا العقار.')));}
  await loadMore();
 }
 async function editor(){
  stopText();stopEditor();
  if(!selected){selected=mapping.fields.find(f=>f.page===page)?.id||null;}
  const heading=node('h3',t('٢. حدّد الحقول واكتب بيانات العقد')),name=input('text',mapping.title);name.maxLength=160;name.oninput=()=>{mapping.title=name.value;change('title');};
  const pageChoice=choose(pages.map((_,i)=>[String(i+1),t('صفحة ')+(i+1)]),String(page));
  const canvas=node('div'),image=node('img'),layer=node('div'),controls=node('section'),allFields=node('div');canvas.className='aq267-pdf-map-page';image.alt=t('صفحة النموذج الأصلي');image.draggable=false;layer.className='aq267-pdf-map-layer';canvas.append(image,layer);const viewport=node('div');viewport.className='aq267-pdf-map-viewport';viewport.append(canvas);controls.className='aq267-pdf-map-controls';
  const preview=node('section');preview.className='aq267-pdf-map-preview';
  let editorScrollTop=0;
  const previewMode=active=>{
   if(d.el.classList.contains('is-pdf-previewing')===active)return;
   if(active)editorScrollTop=d.el.scrollTop;
   d.el.classList.toggle('is-pdf-previewing',active);
   d.el.scrollTop=active?0:editorScrollTop;
  };
  invalidatePreview=()=>{previewMode(false);preview.replaceChildren();};
  d.onDispose(()=>d.el.classList.remove('is-pdf-previewing'));
  const updateScale=()=>canvas.style.setProperty('--pdf-page-scale',String(canvas.clientWidth/pages[page-1].width));
  const observer=new ResizeObserver(updateScale);observer.observe(canvas);stopEditor=()=>observer.disconnect();image.onload=()=>{updateScale();draw();};
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
   try{d.session.check();let text='';if(!forceOcr){const result=await request('text',{page:readingPage},controller.signal);text=result.text||'';}if(controller.signal.aborted)return;
    if(!text.trim()){if(!image.complete||!image.naturalWidth)throw Error('IMAGE_NOT_READY');text=await recognizePdfPage(image,{signal:controller.signal,onProgress:n=>{if(!controller.signal.aborted)textStatus.textContent=t('قراءة الصورة على جهازك: ')+n+'%';}});}
    d.session.check();if(controller.signal.aborted||page!==readingPage)return;textResult.value=text;textStatus.textContent=t(text.trim()?'اكتملت القراءة. راجع النص قبل نسخه أو استخدامه.':'لم يُعثر على نص واضح في هذه الصفحة.');
   }catch(error){if(!controller.signal.aborted)textStatus.textContent=t('تعذرت القراءة. حاول مجددًا أو استخدم صورة أوضح.');}
   finally{if(textController===controller){textController=null;extract.disabled=false;ocr.disabled=false;cancel.hidden=true;}}
  }
  extract.onclick=()=>readText(false);ocr.onclick=()=>readText(true);
  const undo=button('تراجع',()=>restoreHistory(-1)),redo=button('إعادة',()=>restoreHistory(1));
  refreshHistory=()=>{undo.disabled=!history?.canUndo;redo.disabled=!history?.canRedo;};refreshHistory();
  async function restoreHistory(direction){
   const restored=direction<0?history.undo():history.redo();if(!restored)return;
   clearPreview();invalidatePreview();const scrollTop=d.el.scrollTop,previousPage=page;
   mapping=restored.mapping;values=restored.values;page=restored.page;selected=restored.selected;
   dirty=pdfEditorFingerprint(mapping)!==savedMapping;valuesDirty=pdfEditorFingerprint(values)!==savedValues;
   draft?.changed();name.value=mapping.title;pageChoice.value=String(page);controls.replaceChildren();refreshHistory();
   if(page!==previousPage)await drawPage();else draw();
   const chosen=mapping.fields.find(f=>f.id===selected&&f.page===page)||mapping.fields.find(f=>f.page===page);
   if(chosen){selected=chosen.id;editField(chosen);draw();}
   d.el.scrollTop=scrollTop;d.status.textContent=t(direction<0?'تم التراجع عن التعديل.':'تمت إعادة التعديل.');
  }
  const historyKeys=event=>{if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;event.preventDefault();d.run(()=>restoreHistory(key==='y'||event.shiftKey?1:-1));};
  d.el.addEventListener('keydown',historyKeys);const stopObserver=stopEditor;stopEditor=()=>{stopObserver();d.el.removeEventListener('keydown',historyKeys);};
  const tools=node('div');tools.className='aq267-pdf-map-actions';tools.append(undo,redo,button('إضافة حقل',()=>addField(.4,.2)),button('حفظ النموذج والحقول',save),button('حفظ ومعاينة العقد',previewFilled),button('النماذج المحفوظة',async()=>{if(!await canLeave())return;dirty=false;await home();}));
  draftStatus=node('p',t(draft.revision?'حُفظت المسودة وبيانات التعبئة. يمكنك استعادتها من مسوداتي المحفوظة.':'يبدأ حفظ المسودة تلقائيًا عند التعديل.'));draftStatus.setAttribute('role','status');draftStatus.className='aq267-pdf-draft-status';
  const draftSave=node('button',t('حفظ المسودة الآن'));draftSave.type='button';draftSave.onclick=()=>draft.flush().catch(()=>{});
  draftFork=node('button',t('حفظ كمسودة مستقلة'));draftFork.type='button';draftFork.hidden=true;draftFork.onclick=()=>draft.fork().catch(()=>{});
  const draftTools=node('div');draftTools.className='aq267-pdf-map-actions';draftTools.append(draftSave,draftFork);
  d.body.replaceChildren(heading,draftStatus,draftTools,field(t('اسم النموذج'),name),node('p',t('اضغط على الفراغ لإضافة حقل، ثم اكتب بياناته أسفل العقد. تظهر الكتابة فورًا، ويمكنك سحب الحقل وتغيير حجمه في نفس الشاشة.')),tools,field(t('الصفحة'),pageChoice),zoomTools,viewport,controls,textPanel,node('h4',t('الحقول المحددة')),allFields,preview);
  async function drawPage(){stopText();extract.disabled=false;ocr.disabled=false;cancel.hidden=true;textResult.value='';textStatus.textContent='';const ticket=++epoch;image.removeAttribute('src');layer.replaceChildren();const blob=await request('page',{page});if(ticket!==epoch)return;if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(blob);image.src=imageUrl;draw();}
  pageChoice.onchange=()=>d.run(async()=>{page=Number(pageChoice.value);selected=null;controls.replaceChildren();await drawPage();});
  function addField(x,y){if(!image.complete||!image.naturalWidth){d.status.textContent=t('انتظر اكتمال ظهور صفحة العقد.');return;}if(mapping.fields.length>=100){d.status.textContent=t('الحد الأقصى ١٠٠ حقل.');return;}const f={id:crypto.randomUUID(),label:t('حقل جديد'),type:'text',page,x:Math.max(0,Math.min(.8,x)),y:Math.max(0,Math.min(.975,y)),width:.2,height:.025,fontSize:10,align:'right',color:'#000000'};mapping.fields.push(f);selected=f.id;change();draw();editField(f);}
  // Bind the hit surface itself: touch browsers need a directly interactive target.
  layer.onclick=event=>{if(event.target!==layer)return;event.stopPropagation();const r=image.getBoundingClientRect();if(!r.width||!r.height)return;addField((event.clientX-r.left)/r.width-.1,(event.clientY-r.top)/r.height-.0125);};

  let refreshFieldNavigation=()=>{};
  // Read in page order, top to bottom, then right to left on the same line.
  const orderedFields=()=>mapping.fields.slice().sort((a,b)=>a.page-b.page||a.y-b.y||b.x-a.x);
  async function selectField(f){
   if(!f)return;
   const previousPage=page,previousSelected=selected;
   try{selected=f.id;if(page!==f.page){page=f.page;pageChoice.value=String(page);await drawPage();}editField(f,true);draw();
    setTimeout(()=>{if(!d.closed&&selected===f.id)controls.querySelector('.aq267-pdf-map-entry input')?.focus({preventScroll:true});},0);
   }catch(error){page=previousPage;selected=previousSelected;pageChoice.value=String(page);if(imageUrl)image.src=imageUrl;draw();throw error;}
  }
  function draw(){
   refreshFieldNavigation();
   layer.replaceChildren();allFields.replaceChildren();
   for(const f of mapping.fields){
    const item=button(f.label+' · '+t('صفحة ')+f.page+((values[f.id]||'').trim()?'':' · '+t('غير معبأ')),()=>selectField(f));allFields.append(item);if(f.page!==page)continue;
    const box=node('div'),label=node('span',f.label),valueText=node('span',values[f.id]||''),handle=node('span');valueText.className='aq267-pdf-map-value';valueText.dir='auto';valueText.style.color=f.color||'#000000';valueText.style.webkitTextFillColor=f.color||'#000000';valueText.style.textAlign=f.align;valueText.style.justifyContent=f.align;valueText.style.setProperty('--pdf-field-font',f.fontSize+'px');box.tabIndex=0;box.setAttribute('role','button');box.setAttribute('aria-label',f.label);box.className='aq267-pdf-map-field'+(selected===f.id?' is-selected':'');label.className='aq267-pdf-map-label';handle.className='aq267-pdf-map-resize';handle.setAttribute('aria-hidden','true');box.append(label,valueText,handle);
    const position=()=>{box.style.left=f.x*100+'%';box.style.top=f.y*100+'%';box.style.setProperty('--pdf-field-width',f.width*100+'%');box.style.setProperty('--pdf-field-height',f.height*100+'%');};position();
    let drag=null,suppressClick=false;
    const select=()=>{selected=f.id;layer.querySelectorAll('.is-selected').forEach(e=>e.classList.remove('is-selected'));box.classList.add('is-selected');editField(f);};
    box.onclick=event=>{event.stopPropagation();if(!suppressClick)select();suppressClick=false;};
    box.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();select();drag={x:event.clientX,y:event.clientY,fx:f.x,fy:f.y,w:f.width,h:f.height,resize:event.target===handle,group:crypto.randomUUID()};suppressClick=false;box.setPointerCapture(event.pointerId);};
    box.onpointermove=event=>{if(!drag)return;event.preventDefault();const r=canvas.getBoundingClientRect(),dx=(event.clientX-drag.x)/r.width,dy=(event.clientY-drag.y)/r.height;if(Math.abs(dx)+Math.abs(dy)<.002)return;suppressClick=true;
     if(drag.resize){f.width=Math.max(.01,Math.min(1-f.x,drag.w+dx));f.height=Math.max(.006,Math.min(1-f.y,drag.h+dy));}else{f.x=Math.max(0,Math.min(1-f.width,drag.fx+dx));f.y=Math.max(0,Math.min(1-f.height,drag.fy+dy));}position();change(drag.group);};
    const finish=event=>{if(!drag)return;drag=null;if(box.hasPointerCapture(event.pointerId))box.releasePointerCapture(event.pointerId);editField(f);};box.onpointerup=finish;box.onpointercancel=finish;
    box.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();return;}const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const delta=directions[event.key];if(!delta)return;event.preventDefault();const step=event.shiftKey ? .01 : .002;
     if(event.altKey){f.width=Math.max(.01,Math.min(1-f.x,f.width+delta[0]*step));f.height=Math.max(.006,Math.min(1-f.y,f.height+delta[1]*step));}else{f.x=Math.max(0,Math.min(1-f.width,f.x+delta[0]*step));f.y=Math.max(0,Math.min(1-f.height,f.y+delta[1]*step));}position();change('geometry:'+f.id);editField(f);};
    layer.append(box);
   }
  }
  function editField(f,scroll=false){
   const value=input(f.type==='date'?'date':'text',values[f.id]||'');value.maxLength=1000;value.placeholder=t('اكتب البيانات التي ستظهر في العقد');value.inputMode=['number','money'].includes(f.type)?'decimal':'text';value.oninput=()=>{controls.querySelector('[role=alert]')?.remove();writeLinkedPdfValue(mapping.fields,values,f,value.value);valuesDirty=pdfEditorFingerprint(values)!==savedValues;remember('value:'+f.id);draft?.changed();clearPreview();invalidatePreview();draw();d.status.textContent=t('البيانات ظاهرة على العقد. اضغط حفظ ومعاينة العقد للمراجعة.');};
   value.required=true;value.setAttribute('aria-required','true');
   const navigation=node('div'),progress=node('p');navigation.className='aq267-pdf-field-navigation';progress.setAttribute('aria-live','polite');
   const move=direction=>{const ordered=orderedFields(),index=ordered.findIndex(item=>item.id===f.id);return selectField(ordered[index+direction]);};
   const previous=button('الحقل السابق',()=>move(-1)),next=button('الحقل التالي',()=>move(1));
   const missing=button('أول حقل غير معبأ',()=>selectField(orderedFields().find(item=>!(values[item.id]||'').trim())));
   refreshFieldNavigation=()=>{const ordered=orderedFields(),index=ordered.findIndex(item=>item.id===f.id),remaining=ordered.filter(item=>!(values[item.id]||'').trim()).length;previous.disabled=index<=0;next.disabled=index<0||index>=ordered.length-1;missing.disabled=!remaining;value.setAttribute('enterkeyhint',next.disabled?'done':'next');progress.textContent=t('الحقل')+' '+(index+1)+' / '+ordered.length+' · '+t('غير معبأ')+': '+remaining;};
   refreshFieldNavigation();navigation.append(previous,next,missing,progress);
   value.onkeydown=event=>{if(event.key!=='Enter'||event.isComposing)return;event.preventDefault();if(!next.disabled)d.run(()=>move(1));else value.blur();};
   const valueField=field(t('بيانات الحقل'),value);valueField.classList.add('aq267-pdf-map-entry');
   const syncValueType=()=>{value.type=f.type==='date'?'date':'text';value.inputMode=['number','money'].includes(f.type)?'decimal':'text';value.value=values[f.id]||'';};
   const color=input('color',f.color||'#000000');color.oninput=()=>{f.color=color.value;change('color:'+f.id);draw();};
   const font=input('number',f.fontSize);font.min=6;font.max=48;font.step=1;
   font.onchange=()=>{const size=Number(font.value);if(!Number.isFinite(size)||size<6||size>48){font.value=f.fontSize;return;}f.fontSize=size;f.height=Math.min(1-f.y,Math.max(f.height,size/.75/pages[f.page-1].height));change();draw();};
   const label=input('text',f.label);label.maxLength=100;label.oninput=()=>{f.label=label.value;change('label:'+f.id);draw();};
   const preset=choose([['','اختر اسم الحقل'],...Object.values(documentFieldCatalog).map(f=>[f.key,f.label])],'');preset.onchange=()=>{const spec=documentFieldCatalog[preset.value];if(spec){f.label=spec.label;f.type=spec.type;label.value=f.label;type.value=f.type;syncValueType();change();draw();}};
   const type=choose([['text','نص'],['date','تاريخ'],['number','رقم'],['money','مبلغ']],f.type);type.onchange=()=>{f.type=type.value;syncValueType();change();draw();};const align=choose([['right','يمين'],['left','يسار'],['center','وسط']],f.align);align.onchange=()=>{f.align=align.value;change();draw();};
   const peers=linkedPdfFields(mapping.fields,f),linked=peers.length>1;
   type.disabled=linked;preset.disabled=linked;
   const binding=choose([['','حقل مستقل'],...mapping.fields.filter(item=>item.id!==f.id&&item.type===f.type).map(item=>[item.id,item.label+' · '+t('صفحة ')+item.page])],peers.find(item=>item.id!==f.id)?.id||'');
   binding.onchange=()=>{try{linkPdfField(mapping.fields,values,f,binding.value);change();draw();editField(f);}catch(error){binding.value=peers.find(item=>item.id!==f.id)?.id||'';d.status.textContent=t(error.message==='PDF_LINK_CONFLICT'?'القيم مختلفة. وحّد القيم أو أفرغ أحد الحقلين قبل الربط.':'اختر حقلًا من النوع نفسه.');}};
   controls.replaceChildren(node('h4',t('الحقل وبياناته')),navigation,valueField,field(t('تكرار البيانات من حقل'),binding),node('p',t(linked?'تعديل البيانات يحدّث جميع الحقول المرتبطة. افصل الحقل لتغيير نوعه.':'اختر حقلًا لتكرار المعلومة نفسها في هذا الموضع.')),field(t('لون الكتابة'),color),field(t('حجم الخط'),font),field(t('اسم جاهز'),preset),field(t('اسم الحقل'),label),field(t('نوع الحقل'),type),field(t('محاذاة الكتابة'),align));
   const advanced=node('details');advanced.className='aq267-pdf-map-advanced';advanced.append(node('summary',t('إعدادات دقيقة (اختياري)')));controls.append(advanced);
   for(const [key,text,min,max]of [['x','المسافة من يسار الصفحة ٪',0,99],['y','المسافة من أعلى الصفحة ٪',0,99],['width','عرض الحقل ٪',1,100],['height','ارتفاع الحقل ٪',.6,100]]){const scale=key==='fontSize'?1:100,c=input('number',Math.round(f[key]*scale*100)/100);c.min=min;c.max=max;c.step=.1;c.onchange=()=>{const value=Number(c.value)/scale;if(!Number.isFinite(value)||value<min/scale||value>max/scale){c.value=f[key]*scale;return;}f[key]=value;f.width=Math.min(f.width,1-f.x);f.height=Math.min(f.height,1-f.y);change();draw();};(key==='fontSize'?controls:advanced).append(field(t(text),c));}
   controls.append(button('حذف هذا الحقل',()=>{mapping.fields=mapping.fields.filter(x=>x.id!==f.id);delete values[f.id];selected=null;change();controls.replaceChildren();draw();}));if(scroll)controls.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
  async function save(){if(!mapping.title.trim())throw Error(t('اكتب اسم النموذج.'));if(!mapping.fields.length)throw Error(t('حدد حقلًا واحدًا على الأقل.'));const snapshot=pdfEditorFingerprint(mapping),blob=await request('save',{mapping});const row=await templateUploader(new File([blob],'aqari-field-template.pdf',{type:'application/pdf'}),target(mapping.title,true));if(snapshot!==pdfEditorFingerprint(mapping))throw Error(t('حُفظت النسخة السابقة؛ احفظ التعديلات الجديدة أيضًا.'));documentId=row.id;draft?.changed();dirty=false;savedMapping=pdfEditorFingerprint(mapping);d.status.textContent=t('تم حفظ النموذج ومواضع الحقول. لحفظ بيانات التعبئة، عاين العقد ثم احفظ نسخته.');}
  async function previewFilled(){
   if(!mapping.fields.length)throw Error(t('حدد حقلًا واحدًا على الأقل.'));
   const missing=mapping.fields.find(f=>!(values[f.id]||'').trim());
   if(missing){selected=missing.id;if(page!==missing.page){page=missing.page;pageChoice.value=String(page);await drawPage();}draw();editField(missing,true);const warning=node('p',t('أكمل بيانات الحقل قبل المعاينة: ')+missing.label);warning.setAttribute('role','alert');warning.className='aq267-pdf-field-warning';controls.prepend(warning);setTimeout(()=>{if(controls.isConnected){controls.scrollIntoView?.({block:'start'});controls.querySelector('input')?.focus({preventScroll:true});}},0);throw Error(t('أكمل بيانات الحقل: ')+missing.label);}
   if(dirty)await save();
   const entered=Object.fromEntries(mapping.fields.map(f=>[f.id,values[f.id]||''])),snapshot=JSON.stringify([mapping,entered]);
   const blob=await request('fill',{values:entered});
   if(snapshot!==JSON.stringify([mapping,Object.fromEntries(mapping.fields.map(f=>[f.id,values[f.id]||'']))]))throw Error(t('تغيرت البيانات؛ أعد المعاينة.'));
   clearPreview();filled=blob;previewUrl=URL.createObjectURL(blob);preview.replaceChildren(button('العودة لتعديل البيانات',()=>previewMode(false)),node('h3',t('معاينة العقد المعبأ')),node('p',t('راجع البيانات ومواضعها ثم احفظ النسخة. يمكنك تعديل الحقول والبيانات أعلاه.')));
   const previewDocumentId=documentId;
   const viewer=appendPdfPagePreview(preview,{pageCount:pages.length,renderPage:(number,signal)=>request('filled_page',{documentId:previewDocumentId,page:number,values:entered},signal)});stopPreview=viewer.dispose;
   appendPdfViewer(preview,previewUrl,{title:mapping.title,filename:'filled-contract.pdf',embed:false,downloadLabel:'تحميل العقد المعبأ PDF'});
   preview.append(button('حفظ نسخة العقد في الأرشيف',async()=>{
    if(!filled)throw Error(t('أعد معاينة النسخة.'));
    const current=filled;await filledUploader(new File([current],'filled-contract.pdf',{type:'application/pdf'}),target((mapping.title+' — نسخة معبأة للمراجعة').slice(0,180)));
    if(filled===current){valuesDirty=false;savedValues=pdfEditorFingerprint(values);}d.status.textContent=t('تم حفظ النسخة المعبأة في أرشيف العقار.');
   }));
   d.status.textContent=t('العقد جاهز للمراجعة. احفظ النسخة بعد التأكد من البيانات.');previewMode(true);
  }
  await drawPage();
  const activeField=mapping.fields.find(f=>f.id===selected&&f.page===page);if(activeField){draw();editField(activeField);}
 }
 d.body.append(button('إعادة المحاولة',home));d.run(home);return true;
}
