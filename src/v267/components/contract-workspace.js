import {node,field} from './dialog.js';

const labels={draft:'مسودة',ready:'جاهز للمراجعة',approved:'معتمد',signing:'بانتظار التوقيع',signed:'موقّع',cancelled:'ملغى',expired:'منتهي'};
const stages=[['all','كل العقود'],['preparing','التجهيز والمراجعة'],['signing','الطباعة والتوقيع'],['signed','العقود الموقّعة'],['imported','مراجعة المصدر'],['archived','المنتهية والملغاة'],['unknown','حالة تحتاج مراجعة']];
export const contractSearchKey=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').trim();
export function contractGroup(c){
 if(c.source==='statement-import')return 'imported';
 if(['draft','ready'].includes(c.status))return 'preparing';
 if(['approved','signing'].includes(c.status))return 'signing';
 if(c.status==='signed')return 'signed';
 if(['cancelled','expired'].includes(c.status))return 'archived';
 return 'unknown';
}
export function filterContracts(rows,{query='',property='',stage='all'}={}){
 const words=contractSearchKey(query).split(/\s+/).filter(Boolean);
 return rows.filter(c=>(!property||c.property===property)&&(stage==='all'||contractGroup(c)===stage)&&words.every(word=>contractSearchKey([c.contract_no,c.tenant,c.tenantProfile?.nameAr,c.tenantProfile?.nameEn,c.property,c.unit].join(' ')).includes(word)));
}
export function contractNextStep(c){
 if(c.source==='statement-import')return 'راجع الأصل في اعتماد عقود المصدر.';
 return {draft:'استكمل البيانات ثم أرسل العقد للمراجعة.',ready:'راجع البيانات قبل اعتماد المدير العام.',approved:'جهّز نسختين مع الملاحق ثم تابع توقيع الطرفين.',signing:'ارفع الأصل بعد توقيع الطرفين ثم وثّق اكتمال التوقيع.',signed:'افتح الأصل الموقّع أو راجع سجل العقد.',cancelled:'راجع العقد الملغى وسجل نسخه.',expired:'راجع العقد المنتهي قبل إعداد عقد جديد.'}[c.status]||'راجع حالة العقد المحفوظة قبل أي إجراء.';
}
export function mountContractWorkspace(d,rows,{open,create,refresh}){
 const root=node('section');root.className='aq267-contract-workspace';root.setAttribute('aria-label','متابعة عقود الإيجار');
 const overview=node('dl');overview.className='aq267-contract-overview';
 for(const [label,count]of [['العقود المحفوظة',rows.length],['قيد التجهيز',rows.filter(c=>contractGroup(c)==='preparing').length],['للطباعة والتوقيع',rows.filter(c=>contractGroup(c)==='signing').length],['موقّعة',rows.filter(c=>contractGroup(c)==='signed').length]]){const item=node('div');item.append(node('dt',label),node('dd',count.toLocaleString('ar-KW')));overview.append(item);}
 const actions=node('div');actions.className='aq267-contract-actions';
 for(const [label,task]of [['إبرام عقد جديد / New rental contract',create],['تحديث العقود / Refresh',refresh]]){const b=node('button',label);b.type='button';b.onclick=()=>d.run(task);actions.append(b);}
 if(d.session?.bound?.role==='general_manager'){
  const templates=node('button','قوالب العقود والإقرارات — تعديل المسودات');templates.type='button';
  templates.onclick=()=>d.run(async()=>{const [editor,rental]=await Promise.all([import('../pages/contract-template-drafts.js'),import('../pages/rental-contracts.js')]);d.session.check();d.close();editor.openContractTemplateDrafts({onBack:()=>rental.openRentalContracts()});});actions.append(templates);
 }
 const search=node('input');search.type='search';search.maxLength=300;search.placeholder='اسم، رقم عقد، عقار أو وحدة';
 const property=node('select'),stage=node('select'),filters=node('div');filters.className='aq267-contract-filters';
 const option=(value,label)=>Object.assign(node('option',label),{value});
 property.append(option('','كل العقارات'),...[...new Set(rows.map(c=>c.property).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')).map(p=>option(p,p)));property.value='';
 for(const [value,label]of stages){const count=value==='all'?rows.length:rows.filter(c=>contractGroup(c)===value).length;if(count||value==='all')stage.append(option(value,label+' ('+count.toLocaleString('ar-KW')+')'));}stage.value='all';
 filters.append(field('البحث في العقود',search),field('تصفية بالعقار',property),field('مرحلة العقد',stage));
 const result=node('p'),list=node('div'),pager=node('nav'),previous=node('button','السابق'),next=node('button','التالي'),pageLabel=node('span');
 result.setAttribute('role','status');result.setAttribute('aria-live','polite');list.className='aq267-contract-list';pager.className='aq267-contract-pager';pager.setAttribute('aria-label','صفحات العقود');previous.type=next.type='button';pager.append(previous,pageLabel,next);
 let page=0;const pageSize=20;
 function draw(reset=true){if(d.closed)return;if(reset)page=0;const matching=filterContracts(rows,{query:search.value,property:property.value,stage:stage.value});page=Math.min(page,Math.max(0,Math.ceil(matching.length/pageSize)-1));list.replaceChildren();result.textContent='عرض '+matching.length.toLocaleString('ar-KW')+' من '+rows.length.toLocaleString('ar-KW')+' عقد محفوظ';
  for(const c of matching.slice(page*pageSize,(page+1)*pageSize)){
   const card=node('article'),top=node('div'),badge=node('span',c.source==='statement-import'?'مراجعة المصدر':labels[c.status]||'حالة غير معروفة');card.className='aq267-contract-card';top.className='aq267-contract-card-top';badge.className='aq267-contract-badge';badge.dataset.stage=contractGroup(c);
   top.append(node('h4',c.contract_no||'رقم العقد غير مدون'),badge);card.append(top,node('p',c.tenant||c.tenantProfile?.nameAr||'اسم المستأجر غير مدون'),node('p',(c.property||'العقار غير مدون')+' · وحدة '+(c.unit??'غير مدونة')),node('p',(c.start_date||'بداية غير مثبتة')+' — '+(c.end_date||'نهاية غير مثبتة')),node('p',contractNextStep(c)));
   const button=node('button','فتح ملف العقد');button.type='button';button.setAttribute('aria-label','فتح عقد '+(c.contract_no||c.id));button.onclick=()=>d.run(()=>open(c.id));card.append(button);list.append(card);
  }
  if(!matching.length)list.append(node('p',rows.length?'لا توجد عقود مطابقة. غيّر البحث أو التصفية.':'لا توجد عقود محفوظة. ابدأ بإبرام عقد مرتبط بمستأجر ووحدة.'));
  previous.hidden=page===0;next.hidden=(page+1)*pageSize>=matching.length;pageLabel.textContent='الصفحة '+(page+1).toLocaleString('ar-KW')+' من '+Math.max(1,Math.ceil(matching.length/pageSize)).toLocaleString('ar-KW');pager.hidden=matching.length<=pageSize;
 }
 search.oninput=property.onchange=stage.onchange=()=>draw();previous.onclick=()=>{if(page>0){page--;draw(false);}};next.onclick=()=>{page++;draw(false);};
 root.append(overview,actions,filters,result,list,pager);d.body.append(root);draw();d.onDispose(()=>{rows=[];root.replaceChildren();});return root;
}
export function mountContractJourney(d,c,{hasSignedDocument=false}={}){
 const root=node('section');root.className='aq267-contract-journey';root.setAttribute('aria-label','مراحل العقد');root.append(node('h3','خطوات العقد'),node('p',contractNextStep(c)));
 if(c.source==='statement-import'||['cancelled','expired'].includes(c.status)||!Object.hasOwn(labels,c.status)){d.body.append(root);return;}
 const states=['draft','ready','approved','signing','signed'],current=states.indexOf(c.status),list=node('ol');
 for(const [index,label]of ['إعداد البيانات','مراجعة العقد','اعتماد المدير','توقيع الطرفين','حفظ العقد الموقّع'].entries()){const item=node('li'),state=index<current?'تم الانتقال عنها':index===current?'المرحلة الحالية':'لاحقاً';item.append(node('strong',label),node('span',state));item.dataset.progress=index<current?'done':index===current?'current':'next';if(index===current)item.setAttribute('aria-current','step');list.append(item);}
 root.append(list,node('p',hasSignedDocument?'يوجد أصل موقّع مرفوع. راجعه من المستندات المرتبطة.':'الأصل الموقّع لم يُرفع بعد. ارفع نسخة واضحة بعد توقيع الطرفين.'),node('p','التوقيع الورقي: طباعة نسختين، توقيع الطرفين، ثم رفع الأصل. التوقيع الإلكتروني بانتظار تفعيل الربط.'));
 if(c.status==='signed'&&!hasSignedDocument)root.append(node('p','حالة العقد موقّع، لكن الأصل غير ظاهر ضمن المستندات المتاحة. يلزم التحقق قبل الاعتماد عليه.'));
 d.body.append(root);
}
