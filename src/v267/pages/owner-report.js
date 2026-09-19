import {dateLocale} from '../components/locale.js';
import {t as visibleText,message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {readManagementCounters,managementCountersView,kuwaitDay} from '../components/management-counters.js';

const money=value=>Number(value||0).toLocaleString(dateLocale(),{minimumFractionDigits:3,maximumFractionDigits:3})+visibleText(' د.ك');
const text=(tag,value)=>node(tag,String(value??''));
function monthStart(){const day=kuwaitDay();return day.slice(0,8)+'01';}
function summaryCard(label,value,detail=''){const card=node('article');card.className='aq-owner-report-card';card.append(text('span',label),text('strong',value));if(detail)card.append(text('small',detail));return card;}

export function openOwnerReport(){
 const d=createDialog(translateStatic('تقرير المالك التلقائي'));if(!d)return false;
 d.el.classList.add('aq-owner-center-dialog','aq-owner-report-dialog');
 const filters=node('form'),from=node('input'),to=node('input'),refresh=node('button',translateStatic('تحديث التقرير')),print=node('button',translateStatic('طباعة / حفظ PDF')),content=node('section');
 from.type=to.type='date';from.value=monthStart();to.value=kuwaitDay();from.required=to.required=true;refresh.type='submit';print.type='button';print.className='aq-owner-print';
 filters.className='aq-owner-report-filters';filters.append(field(translateStatic('من'),from),field(translateStatic('إلى'),to),refresh,print);content.className='aq-owner-report-content';d.body.append(text('p',visibleText('يُنشأ التقرير تلقائيًا من السجلات المصرح بها عند فتحه أو تحديث الفترة؛ المتوقع يبقى منفصلًا عن الفعلي.')),filters,content);
 async function load(){
  const period={from:from.value,to:to.value};if(!period.from||!period.to||period.from>period.to)throw Error('راجع تاريخ البداية والنهاية.');
  const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
  if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.role!=='general_manager'||access?.features?.kpi_dashboard!==true||access?.permissions?.finance?.read!==true)throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const data=await d.session.request(d.session.client.rpc('aqari_kpi_dashboard',{p_workspace_id:d.session.bound.workspace,p_from:period.from,p_to:period.to}));
  if(!data?.units||!data?.collections||!data?.profit||!Array.isArray(data.sources)||!data.generated_at)throw Error('تعذر التحقق من بيانات تقرير المالك.');
  const counters=await readManagementCounters(d.session,kuwaitDay(data.generated_at));d.session.check();
  const headline=node('section');headline.className='aq-owner-report-headline';headline.append(
   summaryCard(visibleText('الوحدات'),Number(data.units.total||0).toLocaleString(dateLocale()),visibleMessage("مشغول {v0} • شاغر {v1}",{v0:(Number(data.units.occupied||0).toLocaleString(dateLocale())),v1:(Number(data.units.vacant||0).toLocaleString(dateLocale()))})),
   summaryCard(visibleText('التحصيل الفعلي'),money(data.collections.actual),visibleMessage("نسبة التحصيل {v0}٪",{v0:(data.collections.rate??'—')})),
   summaryCard(visibleText('المتوقع الشهري'),money(data.collections.expected_monthly_snapshot),visibleText('من العقود النشطة')),
   summaryCard(visibleText('صافي التشغيل'),money(data.profit.actual_net),visibleMessage("دخل {v0} • مصروف {v1}",{v0:(money(data.profit.actual_income)),v1:(money(data.profit.approved_expenses))}))
  );
  const narrative=node('section');narrative.className='aq-owner-report-narrative';narrative.append(text('h3',visibleText('ملخص الفترة')),text('p',visibleMessage("الفترة من {v0} إلى {v1}. متوسط التأخر {v2} يوم. نسبة الشاغر {v3}٪. الصافي المتوقع {v4}.",{v0:(period.from),v1:(period.to),v2:(data.collections.average_days??visibleText('غير متاح')),v3:(data.units.vacancy_rate??visibleText('غير قابلة للحساب')),v4:(money(data.profit.projected_net))})),text('p',visibleText('المصادر: ')+data.sources.join('، ')));
  content.replaceChildren(headline,narrative,managementCountersView(counters));
  d.status.textContent=translateStatic('تم إنشاء تقرير المالك من البيانات الحالية وإعادة التحقق من الصلاحية.');
 }
 filters.onsubmit=event=>{event.preventDefault();d.run(load);};
 print.onclick=()=>window.print();
 d.onDispose(()=>content.replaceChildren());d.run(load);return true;
}

