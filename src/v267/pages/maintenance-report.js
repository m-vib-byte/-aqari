import {createDialog,node,field} from '../components/dialog.js';
import {uiText} from '../components/ui-text.js';
import {t,message} from '../components/locale.js';

const statusLabel={received:'مستلم',assigned:'مكلّف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى'};
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const amount=value=>Number.isFinite(Number(value))?Number(value):null;
const minutes=value=>value===null||value===undefined?null:(Number.isFinite(Number(value))&&Number(value)>=0?Number(value):NaN);
const dateValue=value=>value===null||value===undefined||value===''?null:String(value);
const money=value=>Number(value).toFixed(3);

export function mountMaintenanceReport(d){
 const form=node('form'),from=node('input'),to=node('input'),submit=uiText('button','عرض التقرير'),summary=node('section'),statuses=node('section'),rows=node('section'),note=node('p');
 from.type=to.type='date';submit.type='submit';form.className='aq267-grid';form.append(field(t('من تاريخ'),from),field(t('إلى تاريخ'),to),submit);note.setAttribute('role','status');
 d.body.append(uiText('p','يعرض طلبات الصيانة المحفوظة ضمن صلاحياتك، مع الحالة والتكلفة وزمن أول استجابة والإغلاق. التصفية بالتاريخ حسب توقيت الكويت.'),form,note,summary,statuses,rows);
 let loaded=null;
 const selected=()=>({from:from.value||null,to:to.value||null});
 function valid(result,filters){
  if(!result||typeof result!=='object'||Array.isArray(result)||!result.summary||typeof result.statuses!=='object'||Array.isArray(result.statuses)||!Array.isArray(result.requests)||typeof result.truncated!=='boolean'||result.requests.length>500)return false;
  if(dateValue(result.from)!==filters.from||dateValue(result.to)!==filters.to)return false;
  const s=result.summary;
  for(const key of ['total_requests','open_requests','completed_requests','cancelled_requests'])if(count(s[key])===null)return false;
  if(amount(s.total_cost)===null)return false;
  for(const key of ['average_response_minutes','average_resolution_minutes'])if(Number.isNaN(minutes(s[key])))return false;
  if(result.requests.length>count(s.total_requests))return false;
  for(const r of result.requests){
   if(!r||typeof r!=='object'||!r.id||!r.request_no||!r.status||amount(r.cost)===null||!r.property_name||!r.unit_no||Number.isNaN(minutes(r.response_minutes))||Number.isNaN(minutes(r.resolution_minutes)))return false;
  }
  for(const [key,value] of Object.entries(result.statuses)){if(!key||!value||count(value.count)===null||amount(value.cost)===null)return false;}
  return true;
 }
 function render(result){
  const s=result.summary;summary.replaceChildren(uiText('h2','الملخص'));
  const grid=node('div');grid.className='aq267-report-summary';
  for(const [label,value]of [['إجمالي الطلبات',s.total_requests],['مفتوحة',s.open_requests],['مكتملة',s.completed_requests],['ملغاة',s.cancelled_requests],['إجمالي التكلفة',money(s.total_cost)+' د.ك'],['متوسط أول استجابة',s.average_response_minutes==null?'—':s.average_response_minutes+' دقيقة'],['متوسط الإغلاق',s.average_resolution_minutes==null?'—':s.average_resolution_minutes+' دقيقة']]){const card=node('article');card.append(uiText('strong',label),node('p',String(value)));grid.append(card);}summary.append(grid);
  statuses.replaceChildren(uiText('h2','الحالات'));
  const entries=Object.entries(result.statuses);if(!entries.length)statuses.append(uiText('p','لا توجد حالات ضمن الفترة المحددة.'));
  for(const [status,value]of entries){const card=node('article');card.append(uiText('h3',statusLabel[status]||status),uiText('p','الطلبات: {count} • التكلفة: {cost} د.ك',{count:value.count,cost:money(value.cost)}));statuses.append(card);}
  rows.replaceChildren(uiText('h2','طلبات الصيانة'));
  if(!result.requests.length)rows.append(uiText('p','لا توجد طلبات صيانة تطابق الفترة المحددة.'));
  for(const r of result.requests){const card=node('article');card.append(uiText('h3','طلب {number}',{number:r.request_no}),node('p',`${r.property_name} • ${r.unit_no}`),uiText('p','الحالة: {status}',{status:statusLabel[r.status]||r.status}),uiText('p','النوع: {type}',{type:r.request_type||'—'}),uiText('p','المستأجر: {name}',{name:r.tenant_name||'—'}),uiText('p','التكلفة: {amount} د.ك',{amount:money(r.cost)}),uiText('p','أول استجابة: {time}',{time:r.response_minutes==null?'—':r.response_minutes+' دقيقة'}),uiText('p','زمن الإغلاق: {time}',{time:r.resolution_minutes==null?'—':r.resolution_minutes+' دقيقة'}));rows.append(card);}
  note.textContent=result.truncated?t('يُعرض آخر 500 طلب فقط ضمن الفترة. ضيّق نطاق التاريخ لرؤية بقية النتائج.'):message('تم استرجاع {count} طلب صيانة من السجلات المحفوظة.',{count:s.total_requests});
 }
 async function load(filters=selected()){
  summary.replaceChildren();statuses.replaceChildren();rows.replaceChildren();note.textContent='';loaded=null;
  if(filters.from&&filters.to&&filters.to<filters.from)throw Error(t('تاريخ النهاية يجب ألا يسبق تاريخ البداية.'));
  const result=await d.session.request(d.session.client.rpc('aqari_maintenance_status_report',{p_workspace_id:d.session.bound.workspace,p_from:filters.from,p_to:filters.to}));
  if(!valid(result,filters))throw Error(t('تعذر التحقق من نتائج تقرير الصيانة. أعد الاسترجاع.'));
  loaded={filters:structuredClone(filters),result};render(result);d.status.textContent=t('تم استرجاع تقرير الصيانة والتحقق من البيانات المحفوظة.');return result;
 }
 form.onsubmit=e=>{e.preventDefault();return d.run(()=>load());};
 d.onDispose(()=>{loaded=null;from.value=to.value='';summary.replaceChildren();statuses.replaceChildren();rows.replaceChildren();note.textContent='';});
 return {load,get loaded(){return loaded;}};
}

export async function mountAvailableMaintenanceReport(d){
 const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
 if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.features?.maintenance_report!==true||access?.permissions?.reports?.read!==true||access?.permissions?.maintenance?.read!==true){d.body.append(uiText('p','تقرير الصيانة غير متاح لهذا الحساب.'));return;}
 await mountMaintenanceReport(d).load();
}

export function openMaintenanceReport(){const d=createDialog('تقرير الصيانة — الحالة والتكلفة والزمن');if(d)d.run(()=>mountAvailableMaintenanceReport(d));}
