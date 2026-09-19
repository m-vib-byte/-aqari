import {dateLocale as visibleDateLocale} from '../components/locale.js';
import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {readManagementCounters,managementCountersView,kuwaitDay} from '../components/management-counters.js';
const text=(tag,value)=>node(tag,String(value??''));const money=v=>Number(v||0).toLocaleString(visibleDateLocale(),{minimumFractionDigits:3,maximumFractionDigits:3});
function today(){return kuwaitDay();}
export function openKpiDashboard(){
 if(!document.getElementById('aq267-management-counters-css')){const css=node('link');css.id='aq267-management-counters-css';css.rel='stylesheet';css.href='/src/v267/styles/management-counters.css?release=V267';document.head.append(css);}
 const d=createDialog(translateStatic('مؤشرات الأداء الفعلية'));if(!d)return;const view=mountKpiDashboard(d);d.run(view.load);
}
export function mountKpiDashboard(d){
 const filters=node('form'),from=node('input'),to=node('input'),content=node('section');from.type=to.type='date';to.value=today();from.value=to.value.slice(0,8)+'01';from.required=to.required=true;filters.append(field(translateStatic('من'),from),field(translateStatic('إلى'),to),Object.assign(node('button',translateStatic('عرض المؤشرات')),{type:'submit'}));d.body.append(text('p',translateStatic('تُحسب المؤشرات مباشرة من الوحدات والعقود والتحصيلات غير الملغاة والمصروفات المعتمدة. المتوقع منفصل عن الفعلي.')),filters,content);
 const load=async()=>{
  content.replaceChildren();
  if(!from.value||!to.value||from.value>to.value)throw Error('راجع تاريخ البداية وتاريخ النهاية.');
  const period={from:from.value,to:to.value};
  const data=await d.session.request(d.session.client.rpc('aqari_kpi_dashboard',{p_workspace_id:d.session.bound.workspace,p_from:period.from,p_to:period.to}));
  if(!data?.units||!data.collections||!data.profit||!Array.isArray(data.sources)||!data.generated_at)throw Error('تعذر استرجاع مصادر مؤشرات الأداء.');
  const counters=await readManagementCounters(d.session,kuwaitDay(data.generated_at));
  d.session.check();if(d.closed||from.value!==period.from||to.value!==period.to)return;
  content.replaceChildren(text('h2',translateStatic('الإشغال خلال الفترة المحددة')),text('p',visibleMessage("إجمالي الوحدات: {value0} • المشغول: {value1} • الشاغر: {value2} • نسبة الشاغر: {value3}٪",{value0:(data.units.total),value1:(data.units.occupied),value2:(data.units.vacant),value3:(data.units.vacancy_rate??translateStatic('غير قابلة للحساب'))})),text('h2',translateStatic('التحصيل')),text('p',visibleMessage("المتوقع الشهري حسب العقود النشطة: {value0} د.ك • المحصل فعلياً: {value1} د.ك • النسبة: {value2}٪ • متوسط التأخر: {value3} يوم",{value0:(money(data.collections.expected_monthly_snapshot)),value1:(money(data.collections.actual)),value2:(data.collections.rate??translateStatic('غير قابلة للحساب')),value3:(data.collections.average_days??translateStatic('غير متاح'))})),text('h2',translateStatic('صافي الأداء')),text('p',visibleMessage("الدخل الفعلي: {value0} د.ك • المصروفات المعتمدة: {value1} د.ك • الصافي الفعلي: {value2} د.ك • الصافي المتوقع: {value3} د.ك",{value0:(money(data.profit.actual_income)),value1:(money(data.profit.approved_expenses)),value2:(money(data.profit.actual_net)),value3:(money(data.profit.projected_net))})),text('p',translateStatic('المصادر: ')+data.sources.join('، ')),managementCountersView(counters));
  d.status.textContent=translateStatic('تم تحديث المؤشرات وعدادات المتابعة من السجلات المحفوظة.');
 };
 filters.onsubmit=e=>{e.preventDefault();return d.run(load);};d.onDispose(()=>content.replaceChildren());return {load};
}

