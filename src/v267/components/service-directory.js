import {node} from './dialog.js';
import {getLocale,direction} from './locale.js';

const copy={
 ar:['خدمات عقاري','ابحث عن خدمة','مثلاً: عقد، تأمين، راتب','مسح البحث','لم نجد خدمة بهذا الاسم. جرّب كلمة أخرى.','هذه الخدمة غير متاحة حالياً لحسابك.','نتائج البحث','التحصيل والحسابات','العقود والمستندات','العقارات والمستأجرون','الصيانة والخدمات','الموظفون والإدارة','الحساب والمساعدة','التأمين، المصروفات والأرشيف','إبرام، طباعة وإخلاء','الوحدات، الجاهزية وبيانات العقار','العدادات، الطلبات والمتابعة','الرواتب، الصلاحيات والتعاميم','الأمان، الإعدادات ودليل الاستخدام','قيد الاستكمال','وضع الاستعراض الكامل: جميع خدمات V267 ظاهرة. الخدمات غير الجاهزة مميزة بعبارة «قيد الاستكمال» ولن تنفذ أي إجراء.','معاينة شاملة V267','متطلبات V267 — 155'],
 en:['AQARI services','Find a service','Try: contract, deposit, payroll','Clear search','No matching service. Try another word.','This service is currently unavailable for your account.','Search results','Collections and accounts','Contracts and documents','Properties and tenants','Maintenance and services','Staff and management','Account and help','Deposits, expenses and archive','Create, print and vacate','Units, readiness and property records','Meters, requests and follow-up','Payroll, permissions and circulars','Security, settings and user guide','In progress','Full preview mode: all V267 services are visible. Services not yet ready are marked “In progress” and cannot perform actions.','V267 full preview','V267 requirements — 155'],
 hi:['AQARI सेवाएँ','सेवा खोजें','जैसे: अनुबंध, जमा, वेतन','खोज साफ करें','कोई सेवा नहीं मिली। दूसरा शब्द खोजें।','यह सेवा अभी आपके खाते के लिए उपलब्ध नहीं है।','खोज परिणाम','वसूली और खाते','अनुबंध और दस्तावेज़','संपत्तियाँ और किरायेदार','रखरखाव और सेवाएँ','कर्मचारी और प्रबंधन','खाता और सहायता','जमा, खर्च और संग्रह','बनाएँ, प्रिंट करें और खाली करें','इकाइयाँ, तैयारी और संपत्ति रिकॉर्ड','मीटर, अनुरोध और अनुवर्ती','वेतन, अनुमतियाँ और परिपत्र','सुरक्षा, सेटिंग्स और उपयोगकर्ता गाइड','कार्य प्रगति पर','पूर्ण पूर्वावलोकन: सभी V267 सेवाएँ दिखाई देती हैं। जो सेवाएँ तैयार नहीं हैं वे कार्य प्रगति पर के रूप में दिखाई देंगी और कोई कार्रवाई नहीं करेंगी।','V267 पूर्ण पूर्वावलोकन','V267 आवश्यकताएँ — 155'],
 ur:['AQARI خدمات','خدمت تلاش کریں','مثلاً: معاہدہ، ضمانت، تنخواہ','تلاش صاف کریں','کوئی خدمت نہیں ملی۔ دوسرا لفظ آزمائیں۔','یہ خدمت فی الحال آپ کے اکاؤنٹ کے لیے دستیاب نہیں۔','تلاش کے نتائج','وصولیاں اور حسابات','معاہدے اور دستاویزات','املاک اور کرایہ دار','دیکھ بھال اور خدمات','ملازمین اور انتظام','اکاؤنٹ اور مدد','ضمانت، اخراجات اور محفوظ ریکارڈ','بنائیں، پرنٹ کریں اور خالی کریں','یونٹس، تیاری اور جائیداد کے ریکارڈ','میٹر، درخواستیں اور پیروی','تنخواہیں، اجازتیں اور تعامیم','سیکیورٹی، ترتیبات اور رہنما','زیر تکمیل','مکمل پیش نظارہ: تمام V267 خدمات دکھائی جا رہی ہیں۔ جو خدمات تیار نہیں وہ زیر تکمیل دکھائی دیں گی اور کوئی کارروائی نہیں کریں گی۔','V267 مکمل پیش نظارہ','V267 تقاضے — 155'],
 ml:['AQARI സേവനങ്ങൾ','സേവനം തിരയുക','ഉദാ: കരാർ, നിക്ഷേപം, ശമ്പളം','തിരച്ചിൽ മായ്ക്കുക','സേവനം കണ്ടെത്തിയില്ല. മറ്റൊരു വാക്ക് പരീക്ഷിക്കുക.','ഈ സേവനം ഇപ്പോൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ ലഭ്യമല്ല.','തിരച്ചിൽ ഫലങ്ങൾ','വസൂലും അക്കൗണ്ടുകളും','കരാറുകളും രേഖകളും','വസ്തുക്കളും വാടകക്കാരും','അറ്റകുറ്റപ്പണിയും സേവനങ്ങളും','ജീവനക്കാരും നടത്തിപ്പും','അക്കൗണ്ടും സഹായവും','നിക്ഷേപം, ചെലവുകൾ, ആർക്കൈവ്','തയ്യാറാക്കൽ, അച്ചടി, ഒഴിയൽ','യൂണിറ്റുകൾ, സജ്ജത, വസ്തു രേഖകൾ','മീറ്ററുകൾ, അപേക്ഷകൾ, തുടർനടപടി','ശമ്പളം, അനുമതികൾ, സർക്കുലറുകൾ','സുരക്ഷ, ക്രമീകരണങ്ങൾ, സഹായം','പുരോഗതിയിൽ','പൂർണ്ണ പ്രിവ്യൂ: എല്ലാ V267 സേവനങ്ങളും കാണിക്കും. തയ്യാറാകാത്ത സേവനങ്ങൾ പുരോഗതിയിൽ എന്ന് അടയാളപ്പെടുത്തും; അവ പ്രവർത്തനങ്ങൾ നടത്തില്ല.','V267 പൂർണ്ണ പ്രിവ്യൂ','V267 ആവശ്യങ്ങൾ — 155']
};
const text=i=>(copy[getLocale()]||copy.ar)[i];
export const serviceSearch=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();

function fullPreview(){
 try{
  const current=globalThis.location;if(!current)return false;
  return String(current.hostname||'').endsWith('.vercel.app');
 }catch{return false;}
}

// Original controls retain their handlers, IDs and server authorization. The
// Vercel preview can show unavailable services for visual review only;
// unavailable entries never bypass source visibility, feature discovery or
// authorization and never invoke their original handlers.
export function organizeServices({tools,groups,allowed,home=()=>document.getElementById('v205SimpleHome')}){
 const menuGroups=[];let root=null,search,grid,status,clear,title,label,lastScope=null;
 const expanded=new Set(),reviewAll=fullPreview();
 for(const [index,group] of groups.entries()){
  const box=node('details'),summary=node('summary'),name=node('span');box.className='aq267-menu-group';box.open=true;
  summary.append(name);box.append(summary);
  for(const item of group.items)if(item.menu!==false)box.append(item.source);
  tools.append(box);menuGroups.push({box,name,index});
 }
 function available(item){return allowed(item)===true&&!item.source.hidden&&!item.source.disabled;}
 function listed(item){return item.menu!==false&&(reviewAll||available(item));}
 function titleOf(item){return String(item.source.textContent||'').trim();}
 function mount(){
  const host=home();if(!host)return false;if(root?.parentNode===host)return true;
  root=node('section');root.id='aq267-service-directory';root.className='aq267-service-directory';if(reviewAll)root.dataset.preview='full';
  if(reviewAll){const banner=node('div'),copyBox=node('span'),badge=node('strong',text(21)),desc=node('span',text(20)),link=node('a',text(22));banner.className='aq267-preview-banner';copyBox.className='aq267-preview-copy';link.className='aq267-preview-requirements';link.href='/v267-requirements.html';copyBox.append(badge,desc);banner.append(copyBox,link);root.append(banner);}
  const head=node('header'),searchBox=node('div');title=node('h2');title.id='aq267-services-title';root.setAttribute('aria-labelledby',title.id);
  label=node('label');label.htmlFor='aq267-service-search';search=node('input');search.id=label.htmlFor;search.type='search';search.autocomplete='off';search.maxLength=100;
  clear=node('button');clear.type='button';clear.onclick=()=>{search.value='';render();search.focus();};
  search.oninput=render;search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();search.value='';render();}};
  searchBox.className='aq267-service-search';searchBox.append(label,search,clear);head.append(title,searchBox);
  status=node('p');status.className='aq267-service-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  grid=node('div');grid.className='aq267-service-groups';root.append(head,status,grid);
  host.insertBefore(root,host.querySelector(':scope > details,:scope > .v205-home-footer'));return true;
 }
 function render(){
  if(!root)return;const query=serviceSearch(search.value),words=query.split(' ').filter(Boolean);let total=0;
  root.lang=getLocale();root.dir=direction();title.textContent=text(0);label.textContent=text(1);search.placeholder=text(2);clear.textContent=text(3);clear.hidden=!query;
  const banner=root.querySelector?.('.aq267-preview-banner');if(banner&&reviewAll){const copyBox=banner.children[0],link=banner.children[1];copyBox.children[0].textContent=text(21);copyBox.children[1].textContent=text(20);link.textContent=text(22);}
  grid.replaceChildren();
  for(const [index,group] of groups.entries()){
   const items=group.items.filter(listed).filter(item=>{const haystack=serviceSearch(titleOf(item)+' '+text(7+index)+' '+(item.keywords||''));return words.every(word=>haystack.includes(word));});
   if(!items.length)continue;total+=items.length;
   const box=node('details'),summary=node('summary'),caption=node('span'),name=node('strong',text(7+index)),hint=node('small',text(13+index)),count=node('span',String(items.length)),list=node('div');
   box.className='aq267-service-group';box.dataset.group=group.key;box.open=reviewAll||!!query||expanded.has(group.key);count.className='aq267-service-count';caption.append(name,hint);summary.append(caption,count);box.append(summary,list);list.className='aq267-service-links';
   box.ontoggle=()=>{if(!search.value&&!reviewAll){if(box.open)expanded.add(group.key);else expanded.delete(group.key);}};
   for(const item of items){
    const ready=available(item),button=node('button',titleOf(item)+(reviewAll&&!ready?' — '+text(19):''));button.type='button';button.dataset.service=group.key;button.setAttribute('aria-label',titleOf(item));
    if(!ready){button.dataset.state='pending';button.setAttribute('aria-disabled','true');button.title=text(5);}
    button.onclick=()=>{if(!available(item)){status.textContent=text(5);status.hidden=false;return;}item.source.click();};list.append(button);
   }
   grid.append(box);
  }
  if(query){status.textContent=total?text(6)+': '+total:text(4);status.hidden=false;}
  else if(reviewAll){status.textContent=text(20);status.hidden=false;}
  else{status.textContent='';status.hidden=true;}
 }
 return {refresh(scope){
  if(scope!==lastScope){lastScope=scope;expanded.clear();if(search)search.value='';}
  for(const {box,name,index} of menuGroups){name.textContent=text(7+index);box.hidden=!groups[index].items.some(listed);}
  if(mount()){root.hidden=!scope;if(scope)render();else{grid.replaceChildren();search.value='';status.textContent='';}}
 }};
}
