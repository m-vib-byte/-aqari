import {node} from './dialog.js';
import {t,getLocale,direction} from './locale.js';

const copy={
 ar:['خدمات عقاري','ابحث عن خدمة','مثلاً: عقد، تأمين، راتب','مسح البحث','لم نجد خدمة بهذا الاسم. جرّب كلمة أخرى.','هذه الخدمة غير متاحة حالياً لحسابك.','نتائج البحث','التحصيل والحسابات','العقود والمستندات','العقارات والمستأجرون','الصيانة والخدمات','الموظفون والإدارة','الحساب والمساعدة','التأمين، المصروفات والأرشيف','إبرام، طباعة وإخلاء','الوحدات، الجاهزية وبيانات العقار','العدادات، الطلبات والمتابعة','الرواتب، الصلاحيات والتعاميم','الأمان، الإعدادات ودليل الاستخدام','قيد الاستكمال','وضع الاستعراض الكامل: جميع خدمات V267 ظاهرة. الخدمات غير الجاهزة مميزة بعبارة «قيد الاستكمال» ولن تنفذ أي إجراء.','معاينة شاملة V267','متطلبات V267 — 155'],
 en:['AQARI services','Find a service','Try: contract, deposit, payroll','Clear search','No matching service. Try another word.','This service is currently unavailable for your account.','Search results','Collections and accounts','Contracts and documents','Properties and tenants','Maintenance and services','Staff and management','Account and help','Deposits, expenses and archive','Create, print and vacate','Units, readiness and property records','Meters, requests and follow-up','Payroll, permissions and circulars','Security, settings and user guide','In progress','Full preview mode: all V267 services are visible. Services not yet ready are marked “In progress” and cannot perform actions.','V267 full preview','V267 requirements — 155'],
 hi:['AQARI सेवाएँ','सेवा खोजें','जैसे: अनुबंध, जमा, वेतन','खोज साफ करें','कोई सेवा नहीं मिली। दूसरा शब्द खोजें।','यह सेवा अभी आपके खाते के लिए उपलब्ध नहीं है।','खोज परिणाम','वसूली और खाते','अनुबंध और दस्तावेज़','संपत्तियाँ और किरायेदार','रखरखाव और सेवाएँ','कर्मचारी और प्रबंधन','खाता और सहायता','जमा, खर्च और संग्रह','बनाएँ, प्रिंट करें और खाली करें','इकाइयाँ, तैयारी और संपत्ति रिकॉर्ड','मीटर, अनुरोध और अनुवर्ती','वेतन, अनुमतियाँ और परिपत्र','सुरक्षा, सेटिंग्स और उपयोगकर्ता गाइड','कार्य प्रगति पर','पूर्ण पूर्वावलोकन: सभी V267 सेवाएँ दिखाई देती हैं। जो सेवाएँ तैयार नहीं हैं वे कार्य प्रगति पर के रूप में दिखाई देंगी और कोई कार्रवाई नहीं करेंगी।','V267 पूर्ण पूर्वावलोकन','V267 आवश्यकताएँ — 155'],
 ur:['AQARI خدمات','خدمت تلاش کریں','مثلاً: معاہدہ، ضمانت، تنخواہ','تلاش صاف کریں','کوئی خدمت نہیں ملی۔ دوسرا لفظ آزمائیں۔','یہ خدمت فی الحال آپ کے اکاؤنٹ کے لیے دستیاب نہیں۔','تلاش کے نتائج','وصولیاں اور حسابات','معاہدے اور دستاویزات','املاک اور کرایہ دار','دیکھ بھال اور خدمات','ملازمین اور انتظام','اکاؤنٹ اور مدد','ضمانت، اخراجات اور محفوظ ریکارڈ','بنائیں، پرنٹ کریں اور خالی کریں','یونٹس، تیاری اور جائیداد کے ریکارڈ','میٹر، درخواستیں اور پیروی','تنخواہیں، اجازتیں اور تعامیم','سیکیورٹی، ترتیبات اور رہنما','زیر تکمیل','مکمل پیش نظارہ: تمام V267 خدمات دکھائی جا رہی ہیں۔ جو خدمات تیار نہیں وہ زیر تکمیل دکھائی دیں گی اور کوئی کارروائی نہیں کریں گی۔','V267 مکمل پیش نظارہ','V267 تقاضے — 155'],
 ml:['AQARI സേവനങ്ങൾ','സേവനം തിരയുക','ഉദാ: കരാർ, നിക്ഷേപം, ശമ്പളം','തിരച്ചിൽ മായ്ക്കുക','സേവനം കണ്ടെത്തിയില്ല. മറ്റൊരു വാക്ക് പരീക്ഷിക്കുക.','ഈ സേവനം ഇപ്പോൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ ലഭ്യമല്ല.','തിരച്ചിൽ ഫലങ്ങൾ','വസൂലും അക്കൗണ്ടുകളും','കരാറുകളും രേഖകളും','വസ്തുക്കളും വാടകക്കാരും','അറ്റകുറ്റപ്പണിയും സേവനങ്ങളും','ജീവനക്കാരും നടത്തിപ്പും','അക്കൗണ്ടും സഹായവും','നിക്ഷേപം, ചെലവുകൾ, ആർക്കൈവ്','തയ്യാറാക്കൽ, അച്ചടി, ഒഴിയൽ','യൂണിറ്റുകൾ, സജ്ജത, വസ്തു രേഖകൾ','മീറ്ററുകൾ, അപേക്ഷകൾ, തുടർനടപടി','ശമ്പളം, അനുമതികൾ, സർക്കുലറുകൾ','സുരക്ഷ, ക്രമീകരണങ്ങൾ, സഹായം','പുരോഗതിയിൽ','പൂർണ്ണ പ്രിവ്യൂ: എല്ലാ V267 സേവനങ്ങളും കാണിക്കും. തയ്യാറാകാത്ത സേവനങ്ങൾ പുരോഗതിയിൽ എന്ന് അടയാളപ്പെടുത്തും; അവ പ്രവർത്തനങ്ങൾ നടത്തില്ല.','V267 പൂർണ്ണ പ്രിവ്യൂ','V267 ആവശ്യങ്ങൾ — 155']
};
const text=i=>(copy[getLocale()]||copy.ar)[i];
const directoryCopy={
 ar:['عرض جميع الخدمات','طي الأقسام','الخدمات','الأقسام','اختر القسم ثم افتح الخدمة المطلوبة.','الخدمات غير المتاحة تظهر بعلامة «قيد الاستكمال».'],
 en:['Show all services','Collapse sections','Services','Sections','Choose a section, then open the service you need.','Unavailable services are marked “In progress”.'],
 hi:['सभी सेवाएँ दिखाएँ','अनुभाग समेटें','सेवाएँ','अनुभाग','अनुभाग चुनें, फिर आवश्यक सेवा खोलें।','अनुपलब्ध सेवाएँ “कार्य प्रगति पर” के रूप में चिह्नित हैं।'],
 ur:['تمام خدمات دکھائیں','حصے سمیٹیں','خدمات','حصے','حصہ منتخب کریں، پھر مطلوبہ خدمت کھولیں۔','غیر دستیاب خدمات پر «زیر تکمیل» لکھا ہے۔'],
 ml:['എല്ലാ സേവനങ്ങളും കാണിക്കുക','വിഭാഗങ്ങൾ ചുരുക്കുക','സേവനങ്ങൾ','വിഭാഗങ്ങൾ','വിഭാഗം തിരഞ്ഞെടുക്കുക, തുടർന്ന് ആവശ്യമായ സേവനം തുറക്കുക.','ലഭ്യമല്ലാത്ത സേവനങ്ങൾ “പുരോഗതിയിൽ” എന്ന് അടയാളപ്പെടുത്തിയിരിക്കുന്നു.']
};
const directoryText=i=>(directoryCopy[getLocale()]||directoryCopy.ar)[i];
const documentCopy={
 ar:['رفع وثيقة أو مسح ورق','صورة أو PDF أو DOCX، مرتبط بالعقار أو المستأجر أو العقد.'],
 en:['Upload or scan a document','Image, PDF or DOCX, linked to a property, tenant or contract.'],
 hi:['दस्तावेज़ अपलोड या स्कैन करें','चित्र, PDF या DOCX को संपत्ति, किरायेदार या अनुबंध से जोड़ें।'],
 ur:['دستاویز اپ لوڈ یا اسکین کریں','تصویر، PDF یا DOCX کو جائیداد، کرایہ دار یا معاہدے سے جوڑیں۔'],
 ml:['രേഖ അപ്‌ലോഡ് ചെയ്യുക അല്ലെങ്കിൽ സ്കാൻ ചെയ്യുക','ചിത്രം, PDF അല്ലെങ്കിൽ DOCX വസ്തു, വാടകക്കാരൻ അല്ലെങ്കിൽ കരാറുമായി ബന്ധിപ്പിക്കുക.']
};
const documentTerms='رفع تحميل وثيقة وثائق وثايق مستند مستندات ورق ورقة اوراق تصوير كاميرا مسح عقد عقود PDF DOCX upload scan document paper camera contract दस्तावेज़ अपलोड स्कैन चित्र अनुबंध دستاویز اپ لوڈ اسکین تصویر معاہدہ രേഖ അപ്‌ലോഡ് സ്കാൻ ചിത്രം കരാർ';
const isDocumentEntry=item=>item.source.dataset?.aq267Label==='scan_document';
const termsOf=item=>(item.keywords||'')+(isDocumentEntry(item)?' '+documentTerms:'');

export const serviceSearch=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();

function fullPreview(){
 try{
  const current=globalThis.location;if(!current)return false;
  const hostname=String(current.hostname||'');return hostname==='myaqari.com'||hostname.endsWith('.vercel.app');
 }catch{return false;}
}

// Original controls retain their handlers, IDs and server authorization. The
// trial site can show unavailable services for visual review only; unavailable
// entries never bypass source visibility, feature discovery or authorization.
export function organizeServices({tools,groups,allowed,groupLabel=null,home=()=>document.getElementById('v205SimpleHome')}){
 const menuGroups=[];let dialog=null,dialogHome=null;let root=null,search,grid,status,clear,title,label,overview,expandAll,guide,documentShortcut,documentButton,documentHint,lastScope=null;
 const expanded=new Set(),reviewAll=fullPreview();
 const groupTitle=(group,index)=>{try{const value=groupLabel?.(group.key);if(typeof value==='string'&&value.trim())return value.trim();}catch{}return text(7+index);};
 for(const [index,group] of groups.entries()){
  const box=node('details'),summary=node('summary'),name=node('span');box.className='aq267-menu-group';box.open=true;
  summary.append(name);box.append(summary);
  for(const item of group.items)if(item.menu!==false)box.append(item.source);
  tools.append(box);menuGroups.push({box,name,index,group});
 }
 function available(item){return allowed(item)===true&&!item.source.hidden&&!item.source.disabled;}
 function listed(item){return item.menu!==false&&(reviewAll||available(item));}
 function titleOf(item){return String(item.source.textContent||'').trim();}
 function mount(){
  if(dialog?.open&&root?.parentNode===dialog)return true;
  const host=home();if(!host)return false;if(root?.parentNode===host)return true;
  root=node('section');root.id='aq267-service-directory';root.className='aq267-service-directory';if(reviewAll)root.dataset.preview='full';
  if(reviewAll){const banner=node('div'),copyBox=node('span'),badge=node('strong',text(21)),desc=node('span',directoryText(5)),link=node('a',text(22));banner.className='aq267-preview-banner';copyBox.className='aq267-preview-copy';link.className='aq267-preview-requirements';link.href='/v267-requirements.html';copyBox.append(badge,desc);banner.append(copyBox,link);root.append(banner);}
  const head=node('header'),heading=node('div'),searchBox=node('div');title=node('h2');title.id='aq267-services-title';root.setAttribute('aria-labelledby',title.id);
  overview=node('p');overview.className='aq267-service-overview';heading.append(title,overview);
  label=node('label');label.htmlFor='aq267-service-search';search=node('input');search.id=label.htmlFor;search.type='search';search.autocomplete='off';search.maxLength=100;
  clear=node('button');clear.type='button';clear.onclick=()=>{search.value='';render();search.focus();};
  search.oninput=render;search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();search.value='';render();}};
  searchBox.className='aq267-service-search';searchBox.append(label,search,clear);head.append(heading,searchBox);
  const toolbar=node('div');toolbar.className='aq267-service-toolbar';guide=node('p');expandAll=node('button');expandAll.type='button';expandAll.id='aq267-service-expand';expandAll.setAttribute('aria-controls','aq267-service-groups');
  expandAll.onclick=()=>{if(!lastScope||serviceSearch(search.value))return;const boxes=[...grid.children],collapse=boxes.length>0&&boxes.every(box=>box.open);for(const box of boxes){if(collapse)expanded.delete(box.dataset.group);else expanded.add(box.dataset.group);}render();};toolbar.append(guide,expandAll);
  documentShortcut=node('div');documentShortcut.className='aq267-document-shortcut';documentShortcut.id='aq267-document-shortcut';
  documentButton=node('button');documentButton.type='button';documentButton.id='aq267-document-upload-action';
  documentHint=node('p');documentHint.id='aq267-document-upload-hint';documentButton.setAttribute('aria-describedby',documentHint.id);
  documentButton.onclick=()=>{const item=groups.flatMap(group=>group.items).find(isDocumentEntry);if(!lastScope||!item||!available(item)){render();status.textContent=text(5);status.hidden=false;return;}closeDirectory();item.source.click();};
  documentShortcut.append(documentButton,documentHint);
  status=node('p');status.className='aq267-service-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  grid=node('div');grid.id='aq267-service-groups';grid.className='aq267-service-groups';root.append(head,toolbar,documentShortcut,status,grid);
  host.insertBefore(root,host.querySelector(':scope > details,:scope > .v205-home-footer'));return true;
 }
 function restoreDirectory(){
  if(dialog?.open||root?.parentNode!==dialog)return;
  const host=home();
  if(host===dialogHome)host.insertBefore(root,host.querySelector(':scope > details,:scope > .v205-home-footer'));
  else {root.remove();root=null;mount();if(lastScope)render();}
 }
 function closeDirectory(){if(dialog?.open)dialog.close();restoreDirectory();}
 function openDirectory(event){
  if(!lastScope||!mount())return false;
  if(!dialog){
   dialog=node('dialog');dialog.id='aq267-service-dialog';dialog.className='aq267-service-dialog';
   dialog.setAttribute('aria-labelledby','aq267-services-title');
   const close=node('button');close.type='button';close.className='aq267-service-dialog-close';close.onclick=closeDirectory;dialog.append(close);
   dialog.addEventListener('close',restoreDirectory);document.body.append(dialog);
  }
  dialog.dir=direction();dialog.lang=getLocale();dialog.children[0].textContent=t('إغلاق');
  if(!dialog.open){dialogHome=home();dialog.append(root);dialog.showModal();}
  render();dialog.children[0].focus({preventScroll:true});event?.preventDefault?.();return true;
 }
 document.addEventListener?.('aqari:open-services',openDirectory);
 function updateExpansion(){
  const boxes=[...grid.children],allOpen=boxes.length>0&&boxes.every(box=>box.open);
  expandAll.textContent=directoryText(allOpen?1:0);expandAll.setAttribute('aria-expanded',String(allOpen));expandAll.hidden=!!serviceSearch(search.value)||!boxes.length;
 }
 function render(){
  if(!root)return;
  if(!lastScope){grid.replaceChildren();documentShortcut.hidden=true;return;}
  const query=serviceSearch(search.value),words=query.split(' ').filter(Boolean),renderScope=lastScope,renderRoot=root;let total=0,sectionCount=0;
  root.lang=getLocale();root.dir=direction();title.textContent=text(0);label.textContent=text(1);search.placeholder=text(2);clear.textContent=text(3);clear.hidden=!query;
  const documentItem=groups.flatMap(group=>group.items).find(isDocumentEntry),documentText=documentCopy[getLocale()]||documentCopy.ar;
  documentButton.textContent=documentText[0];documentHint.textContent=documentText[1];
  documentShortcut.hidden=!documentItem||!available(documentItem)||!words.every(word=>serviceSearch(titleOf(documentItem)+' '+termsOf(documentItem)).includes(word));
  const banner=root.querySelector?.('.aq267-preview-banner');if(banner&&reviewAll){const copyBox=banner.children[0],link=banner.children[1];copyBox.children[0].textContent=text(21);copyBox.children[1].textContent=directoryText(5);link.textContent=text(22);}
  grid.replaceChildren();
  for(const [index,group] of groups.entries()){
   const groupName=groupTitle(group,index),items=group.items.filter(listed).filter(item=>{const haystack=serviceSearch(titleOf(item)+' '+groupName+' '+termsOf(item));return words.every(word=>haystack.includes(word));});
   if(!items.length)continue;total+=items.length;sectionCount++;
   const box=node('section'),summary=node('div'),caption=node('span'),name=node('strong',groupName),hint=node('small',text(13+index)),count=node('span',String(items.length)),list=node('div');
   summary.className='aq267-service-heading';box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);/* Native summary activation owns expansion for touch, mouse and keyboard. */count.className='aq267-service-count';count.setAttribute('aria-label',directoryText(2)+': '+items.length);caption.append(name,hint);const toggle=node('button');toggle.type='button';toggle.className='aq267-service-toggle';toggle.setAttribute('aria-label',groupName);toggle.setAttribute('aria-expanded',String(box.open));toggle.append(caption,count);summary.append(toggle);toggle.onclick=event=>{event?.preventDefault?.();event?.stopPropagation?.();box.open=true;list.hidden=false;if(!serviceSearch(search.value)){if(box.open)expanded.add(group.key);else expanded.delete(group.key);}toggle.setAttribute('aria-expanded',String(box.open));updateExpansion();};box.append(summary,list);list.className='aq267-service-links';list.hidden=!box.open;
   box.ontoggle=()=>{toggle.setAttribute('aria-expanded',String(box.open));if(box.parentNode!==grid||renderScope!==lastScope)return;if(!serviceSearch(search.value)){if(box.open)expanded.add(group.key);else expanded.delete(group.key);}updateExpansion();};
   for(const item of items){
    const ready=available(item),button=node('button',titleOf(item)+(reviewAll&&!ready?' — '+text(19):''));button.type='button';button.dataset.service=group.key;button.setAttribute('aria-label',titleOf(item));
    if(!ready){button.dataset.state='pending';button.setAttribute('aria-disabled','true');button.title=text(5);}
    button.onclick=()=>{if(!lastScope||renderScope!==lastScope||renderRoot!==root)return;if(!available(item)){render();status.textContent=text(5);status.hidden=false;return;}closeDirectory();item.source.click();};list.append(button);
   }
   grid.append(box);
  }
  overview.textContent=directoryText(2)+': '+total+' · '+directoryText(3)+': '+sectionCount;guide.textContent=directoryText(4);guide.hidden=!!query||!total;updateExpansion();
  if(query){status.textContent=total?text(6)+': '+total:text(4);status.hidden=false;}
  else if(!total){status.textContent=text(5);status.hidden=false;}
  else{status.textContent='';status.hidden=true;}
 }
 return {open:openDirectory,refresh(scope){
  if(scope!==lastScope){closeDirectory();lastScope=scope;expanded.clear();if(search)search.value='';}
  for(const {box,name,index,group} of menuGroups){name.textContent=groupTitle(group,index);box.hidden=!groups[index].items.some(listed);}
  if(mount()){root.hidden=!scope;if(scope)render();else{grid.replaceChildren();documentShortcut.hidden=true;search.value='';status.textContent='';}}
 }};
}

