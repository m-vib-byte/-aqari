import {node} from './dialog.js';
import {getLocale,direction} from './locale.js';

const copy={
 ar:['خدمات عقاري','ابحث عن خدمة','مثلاً: عقد، تأمين، راتب','مسح البحث','لم نجد خدمة بهذا الاسم. جرّب كلمة أخرى.','هذه الخدمة غير متاحة حالياً لحسابك.','نتائج البحث','التحصيل والحسابات','العقود والمستندات','العقارات والمستأجرون','الصيانة والخدمات','الموظفون والإدارة','الحساب والمساعدة','التأمين، المصروفات والأرشيف','إبرام، طباعة وإخلاء','الوحدات، الجاهزية وبيانات العقار','العدادات، الطلبات والمتابعة','الرواتب، الصلاحيات والتعاميم','الأمان، الإعدادات ودليل الاستخدام'],
 en:['AQARI services','Find a service','Try: contract, deposit, payroll','Clear search','No matching service. Try another word.','This service is currently unavailable for your account.','Search results','Collections and accounts','Contracts and documents','Properties and tenants','Maintenance and services','Staff and management','Account and help','Deposits, expenses and archive','Create, print and vacate','Units, readiness and property records','Meters, requests and follow-up','Payroll, permissions and circulars','Security, settings and user guide'],
 hi:['AQARI सेवाएँ','सेवा खोजें','जैसे: अनुबंध, जमा, वेतन','खोज साफ करें','कोई सेवा नहीं मिली। दूसरा शब्द खोजें।','यह सेवा अभी आपके खाते के लिए उपलब्ध नहीं है।','खोज परिणाम','वसूली और खाते','अनुबंध और दस्तावेज़','संपत्तियाँ और किरायेदार','रखरखाव और सेवाएँ','कर्मचारी और प्रबंधन','खाता और सहायता','जमा, खर्च और संग्रह','बनाएँ, प्रिंट करें और खाली करें','इकाइयाँ, तैयारी और संपत्ति रिकॉर्ड','मीटर, अनुरोध और अनुवर्ती','वेतन, अनुमतियाँ और परिपत्र','सुरक्षा, सेटिंग्स और उपयोगकर्ता गाइड'],
 ur:['AQARI خدمات','خدمت تلاش کریں','مثلاً: معاہدہ، ضمانت، تنخواہ','تلاش صاف کریں','کوئی خدمت نہیں ملی۔ دوسرا لفظ آزمائیں۔','یہ خدمت فی الحال آپ کے اکاؤنٹ کے لیے دستیاب نہیں۔','تلاش کے نتائج','وصولیاں اور حسابات','معاہدے اور دستاویزات','املاک اور کرایہ دار','دیکھ بھال اور خدمات','ملازمین اور انتظام','اکاؤنٹ اور مدد','ضمانت، اخراجات اور محفوظ ریکارڈ','بنائیں، پرنٹ کریں اور خالی کریں','یونٹس، تیاری اور جائیداد کے ریکارڈ','میٹر، درخواستیں اور پیروی','تنخواہیں، اجازتیں اور تعامیم','سیکیورٹی، ترتیبات اور رہنما'],
 ml:['AQARI സേവനങ്ങൾ','സേവനം തിരയുക','ഉദാ: കരാർ, നിക്ഷേപം, ശമ്പളം','തിരച്ചിൽ മായ്ക്കുക','സേവനം കണ്ടെത്തിയില്ല. മറ്റൊരു വാക്ക് പരീക്ഷിക്കുക.','ഈ സേവനം ഇപ്പോൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ ലഭ്യമല്ല.','തിരച്ചിൽ ഫലങ്ങൾ','വസൂലും അക്കൗണ്ടുകളും','കരാറുകളും രേഖകളും','വസ്തുക്കളും വാടകക്കാരും','അറ്റകുറ്റപ്പണിയും സേവനങ്ങളും','ജീവനക്കാരും നടത്തിപ്പും','അക്കൗണ്ടും സഹായവും','നിക്ഷേപം, ചെലവുകൾ, ആർക്കൈവ്','തയ്യാറാക്കൽ, അച്ചടി, ഒഴിയൽ','യൂണിറ്റുകൾ, സജ്ജത, വസ്തു രേഖകൾ','മീറ്ററുകൾ, അപേക്ഷകൾ, തുടർനടപടി','ശമ്പളം, അനുമതികൾ, സർക്കുലറുകൾ','സുരക്ഷ, ക്രമീകരണങ്ങൾ, സഹായം']
};
const text=i=>(copy[getLocale()]||copy.ar)[i];
export const serviceSearch=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();

// Original controls retain their handlers, IDs and server authorization. Search
// never changes their hidden state and cannot reveal an unavailable feature.
export function organizeServices({tools,groups,allowed,home=()=>document.getElementById('v205SimpleHome')}){
 const menuGroups=[];let root=null,search,grid,status,clear,title,label,lastScope=null;
 const expanded=new Set();
 for(const [index,group] of groups.entries()){
  const box=node('details'),summary=node('summary'),name=node('span');box.className='aq267-menu-group';box.open=true;
  summary.append(name);box.append(summary);
  for(const item of group.items)if(item.menu!==false)box.append(item.source);
  tools.append(box);menuGroups.push({box,name,index});
 }
 function available(item){return allowed(item)===true&&!item.source.hidden&&!item.source.disabled;}
 function titleOf(item){return String(item.source.textContent||'').trim();}
 function mount(){
  const host=home();if(!host)return false;if(root?.parentNode===host)return true;
  root=node('section');root.id='aq267-service-directory';root.className='aq267-service-directory';
  const head=node('header'),searchBox=node('div');title=node('h2');title.id='aq267-services-title';root.setAttribute('aria-labelledby',title.id);
  label=node('label');label.htmlFor='aq267-service-search';search=node('input');search.id=label.htmlFor;search.type='search';search.autocomplete='off';search.maxLength=100;
  clear=node('button');clear.type='button';clear.onclick=()=>{search.value='';render();search.focus();};
  search.oninput=render;search.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();search.value='';render();}};
  searchBox.className='aq267-service-search';searchBox.append(label,search,clear);head.append(title,searchBox);
  status=node('p');status.className='aq267-service-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  grid=node('div');grid.className='aq267-service-groups';root.append(head,status,grid);
  host.insertBefore(root,host.querySelector('details,.v205-home-footer'));return true;
 }
 function render(){
  if(!root)return;const query=serviceSearch(search.value),words=query.split(' ').filter(Boolean);let total=0;
  root.lang=getLocale();root.dir=direction();title.textContent=text(0);label.textContent=text(1);search.placeholder=text(2);clear.textContent=text(3);clear.hidden=!query;
  grid.replaceChildren();
  for(const [index,group] of groups.entries()){
   const items=group.items.filter(available).filter(item=>{const haystack=serviceSearch(titleOf(item)+' '+text(7+index)+' '+(item.keywords||''));return words.every(word=>haystack.includes(word));});
   if(!items.length)continue;total+=items.length;
   const box=node('details'),summary=node('summary'),caption=node('span'),name=node('strong',text(7+index)),hint=node('small',text(13+index)),count=node('span',String(items.length)),list=node('div');
   box.className='aq267-service-group';box.dataset.group=group.key;box.open=!!query||expanded.has(group.key);count.className='aq267-service-count';caption.append(name,hint);summary.append(caption,count);box.append(summary,list);list.className='aq267-service-links';
   box.ontoggle=()=>{if(!search.value){if(box.open)expanded.add(group.key);else expanded.delete(group.key);}};
   for(const item of items){
    const button=node('button',titleOf(item));button.type='button';button.dataset.service=group.key;
    button.onclick=()=>{if(!available(item)){render();status.textContent=text(5);status.hidden=false;return;}item.source.click();};list.append(button);
   }
   grid.append(box);
  }
  status.textContent=query?(total?text(6)+': '+total:text(4)):'';status.hidden=!query;
 }
 return {refresh(scope){
  if(scope!==lastScope){lastScope=scope;expanded.clear();if(search)search.value='';}
  for(const {box,name,index} of menuGroups){name.textContent=text(7+index);box.hidden=!groups[index].items.some(item=>item.menu!==false&&available(item));}
  if(mount()){root.hidden=!scope;if(scope)render();else{grid.replaceChildren();search.value='';status.textContent='';}}
 }};
}
