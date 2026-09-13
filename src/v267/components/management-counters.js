import {node} from './dialog.js';

const sections = ['properties', 'tenants', 'contracts', 'maintenance'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function kuwaitDay(value = new Date()) {
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) throw Error('تعذر التحقق من تاريخ العدادات.');
 const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kuwait', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(date);
 return ['year','month','day'].map(type => parts.find(part => part.type === type).value).join('-');
}

function dayAfter(day, days) {
 const date = new Date(day + 'T00:00:00Z');
 if (!datePattern.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== day) throw Error('تعذر التحقق من تاريخ العدادات.');
 date.setUTCDate(date.getUTCDate() + days);
 return date.toISOString().slice(0,10);
}

function permitted(access, bound) {
 if (!access || access.user_id !== bound.user || access.workspace_id !== bound.workspace || access.role !== bound.role || access.role !== 'general_manager' || access.features?.kpi_dashboard !== true || access.permissions?.finance?.read !== true) {
  throw Object.assign(Error('ACCESS_DENIED'), {code:'42501'});
 }
 return Object.fromEntries(sections.map(section => [section, access.permissions?.[section]?.read === true]));
}

// HEAD requests obtain the complete RLS-scoped count, not the length of a page.
// Only counts leave the tables; names, contract contents and attachments are not loaded.
async function exactCount(session, query) {
 const count = await session.request({abortSignal(signal) {
  return query.abortSignal(signal).then(response => ({...response, data:response.count}));
 }});
 if (!Number.isSafeInteger(count) || count < 0) throw Error('تعذر التحقق من عدد السجلات. حدّث العدادات.');
 return count;
}

export async function readManagementCounters(session, asOf) {
 dayAfter(asOf, 0);
 const access = () => session.request(session.client.rpc('aqari_workspace_access', {p_workspace_id:session.bound.workspace}));
 const permissions = permitted(await access(), session.bound);
 const jobs = [];
 const add = (id, label, section, table, filter = query => query) => {
  if (!permissions[section]) return;
  jobs.push({id, label, section, run:() => exactCount(session, filter(session.client.from(table).select('id', {count:'exact', head:true}).eq('workspace_id', session.bound.workspace)))});
 };
 add('properties', 'العقارات المسجلة', 'properties', 'aqari_properties');
 add('tenants', 'ملفات المستأجرين المحفوظة', 'tenants', 'aqari_tenants');
 const active = query => query.eq('status','signed').lte('start_date',asOf).gte('end_date',asOf);
 add('active_contracts', 'العقود الفعّالة اليوم', 'contracts', 'aqari_leases', active);
 add('review_contracts', 'عقود قيد التجهيز والمراجعة', 'contracts', 'aqari_leases', query => query.in('status',['draft','ready']));
 add('signature_contracts', 'عقود بانتظار التوقيع', 'contracts', 'aqari_leases', query => query.in('status',['approved','signing']));
 add('expired_contracts', 'عقود منتهية', 'contracts', 'aqari_leases', query => query.in('status',['signed','expired']).lt('end_date',asOf));
 for (const [start,end,label] of [[0,30,'تنتهي خلال 30 يومًا'],[31,60,'تنتهي خلال 31–60 يومًا'],[61,90,'تنتهي خلال 61–90 يومًا']]) {
  add('expiry_' + end, label, 'contracts', 'aqari_leases', query => active(query).gte('end_date',dayAfter(asOf,start)).lte('end_date',dayAfter(asOf,end)));
 }
 add('open_maintenance', 'طلبات الصيانة المفتوحة', 'maintenance', 'aqari_maintenance_requests', query => query.in('status',['received','assigned','in_progress']));
 add('unassigned_maintenance', 'صيانة بانتظار التكليف', 'maintenance', 'aqari_maintenance_requests', query => query.eq('status','received'));
 const items = [];
 // Bound concurrency; this runs only when the user opens or refreshes the report.
 for (let index=0; index<jobs.length; index+=4) {
  const batch = await Promise.all(jobs.slice(index,index+4).map(async ({run,...item}) => ({...item, value:await run()})));
  items.push(...batch);
 }
 const verified = permitted(await access(), session.bound);
 if (sections.some(section => permissions[section] !== verified[section])) throw Object.assign(Error('ACCESS_DENIED'), {code:'42501'});
 session.check();
 return {asOf, items};
}

export function managementCountersView(report) {
 const root=node('section');root.className='aq267-management-counters';root.setAttribute('aria-label','عدادات المتابعة');
 root.append(node('h2','عدادات المتابعة'),node('p','حالة السجلات بتاريخ ' + report.asOf + ' بتوقيت الكويت. فترات الانتهاء الثلاث منفصلة، وتشمل العقود الفعّالة اليوم فقط.'));
 const groups=[['المحفظة',['properties','tenants']],['متابعة العقود',['contracts']],['متابعة الصيانة',['maintenance']]];
 for (const [title,groupSections] of groups) {
  const items=report.items.filter(item => groupSections.includes(item.section));
  if (!items.length) continue;
  const group=node('section'),grid=node('dl');grid.className='aq267-counter-grid';group.append(node('h3',title),grid);
  for (const item of items) {
   const card=node('div');card.className='aq267-counter-card';card.dataset.counter=item.id;
   card.append(node('dt',item.label),node('dd',item.value.toLocaleString('ar-KW')));grid.append(card);
  }
  root.append(group);
 }
 root.append(node('p','ملفات المستأجرين تشمل الملفات المؤرشفة. الصيانة بانتظار التكليف جزء من الصيانة المفتوحة. تظهر العدادات المتاحة لصلاحياتك فقط.'));
 return root;
}
