import {node} from './dialog.js';
import {t} from './locale.js';
import {createReportFilters} from '../api/report-filters.js';
// Save only choices. Every report still reloads authorized current data.
export function reportFilterControls(dialog,key,readControls){
 const store=createReportFilters(dialog.session,key),bar=node('div'),save=node('button',t('حفظ الفلاتر / Save filters')),clear=node('button',t('مسح الفلاتر المحفوظة / Clear saved filters'));
 save.type=clear.type='button';bar.append(save,clear);
 save.onclick=()=>dialog.run(async()=>{await store.save(readControls());dialog.status.textContent=t('تم حفظ اختيارات التقرير لحسابك، ويمكنك استرجاعها من أجهزتك. / Report filters saved for your account across devices.');});
 clear.onclick=()=>dialog.run(async()=>{await store.clear();dialog.status.textContent=t('تم مسح الاختيارات المحفوظة. / Saved filters cleared.');});
 return {bar,read:()=>store.read()};
}
