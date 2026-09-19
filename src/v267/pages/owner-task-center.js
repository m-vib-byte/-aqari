import {dateLocale} from '../components/locale.js';
import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node} from '../components/dialog.js';
import {readManagementCounters,kuwaitDay} from '../components/management-counters.js';

const text=(tag,value)=>node(tag,String(value??''));
const byId=(report,id)=>report.items.find(item=>item.id===id)?.value??null;
function action(label,description,run){
 const button=node('button');button.type='button';button.className='aq-owner-center-action';
 const strong=text('strong',label),small=text('small',description);button.append(strong,small);button.onclick=run;return button;
}
async function openAfter(d,path,exportName){
 d.close();
 const mod=await import(path+'?release=V267');
 if(typeof mod?.[exportName]!=='function')throw Error('الخدمة المطلوبة غير متاحة.');
 return mod[exportName]();
}

export function openOwnerTaskCenter(){
 const d=createDialog(translateStatic('التنبيهات والمهام'));if(!d)return false;
 d.el.classList.add('aq-owner-center-dialog');
 d.run(async()=>{
  const report=await readManagementCounters(d.session,kuwaitDay());
  const cards=node('section');cards.className='aq-owner-task-cards';
  const metrics=[
   [visibleText('عقود قيد التجهيز والمراجعة'),byId(report,'review_contracts')],
   [visibleText('عقود بانتظار التوقيع'),byId(report,'signature_contracts')],
   [visibleText('تنتهي خلال 30 يومًا'),byId(report,'expiry_30')],
   [visibleText('تنتهي خلال 31–60 يومًا'),byId(report,'expiry_60')],
   [visibleText('تنتهي خلال 61–90 يومًا'),byId(report,'expiry_90')],
   [visibleText('صيانة مفتوحة'),byId(report,'open_maintenance')],
   [visibleText('صيانة بانتظار التكليف'),byId(report,'unassigned_maintenance')]
  ].filter(([,value])=>value!==null);
  for(const [label,value] of metrics){const card=node('article');card.append(text('span',label),text('strong',Number(value).toLocaleString(dateLocale())));cards.append(card);}
  const actions=node('section');actions.className='aq-owner-center-actions';
  actions.append(
   action(visibleText('العقود القريبة من الانتهاء'),visibleText('تقرير 30/60/90 من السجلات المحفوظة.'),()=>openAfter(d,'./lease-expiry-report.js','openLeaseExpiryReport')),
   action(visibleText('اعتماد عقود المصدر'),visibleText('مراجعة العقد والمستند الموقّع قبل الاعتماد.'),()=>openAfter(d,'./lease-review.js','openLeaseReview')),
   action(visibleText('خطط الصيانة والتنبيهات'),visibleText('متابعة الصيانة الدورية والتصعيد.'),()=>openAfter(d,'./maintenance-plans.js','openMaintenancePlans')),
   action(visibleText('إعلانات العقارات'),visibleText('تنبيهات وإرشادات المستأجرين مع إثبات الاطلاع.'),()=>openAfter(d,'./property-notices.js','openPropertyNotices'))
  );
  d.body.replaceChildren(text('p',visibleText('مركز موحّد للمتابعة فقط؛ كل إجراء يفتح الوظيفة الأصلية وصلاحياتها الحالية ولا ينشئ سجلاً موازيًا.')),cards,actions);
  d.status.textContent=translateStatic('تم تحديث المهام من العدادات المصرح بها بتاريخ ')+report.asOf+visibleText(' بتوقيت الكويت.');
 });
 return true;
}

