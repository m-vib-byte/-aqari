import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {uiText} from '../components/ui-text.js';
import {t,message} from '../components/locale.js';

export function mountLeaseExpiryReport(d){
 const form=node('form'),status=node('select'),days=node('select'),property=node('select'),search=node('input'),submit=uiText('button','عرض التقرير'),summary=node('p'),rows=node('div'),pages=node('nav'),previous=uiText('button','السابق'),next=uiText('button','التالي'),pageLabel=node('p');let loaded=null;
 for(const [value,label]of [['upcoming','العقود القريبة من الانتهاء'],['expired','العقود المنتهية']]){const option=uiText('option',label);option.value=value;status.append(option);}status.value='upcoming';
 for(const value of [30,60,90]){const option=uiText('option','خلال {days} يومًا',{days:value});option.value=String(value);days.append(option);}days.value='30';
 const all=uiText('option','كل العقارات المتاحة');all.value='';property.append(all);property.value='';search.type='search';search.maxLength=120;search.autocomplete='off';submit.type='submit';previous.type=next.type='button';previous.disabled=next.disabled=true;
 form.className='aq267-grid';form.append(field(t('نوع التقرير'),status),field(t('الفترة القادمة'),days),field(t('العقار'),property),field(t('بحث بالاسم أو الوحدة أو رقم العقد'),search),submit);
 summary.setAttribute('role','status');pages.setAttribute('aria-label',t('صفحات التقرير'));pages.append(previous,pageLabel,next);
 d.body.append(uiText('p','يعرض التقرير العقود المحفوظة ضمن صلاحيتك. التواريخ بتوقيت الكويت، ولا يشمل المسودات أو العقود الملغاة أو التي لم يبدأ سريانها.'),form,summary,rows,pages);
 status.onchange=()=>{days.disabled=status.value==='expired';};
 const filters=()=>({status:status.value,days:Number(days.value),property_id:property.value||null,search:search.value.trim()});
 async function load(selected=filters(),offset=0){
  rows.replaceChildren();summary.textContent='';pageLabel.textContent='';previous.disabled=next.disabled=true;loaded=null;
  const result=await d.session.request(d.session.client.rpc('aqari_lease_expiry_report',{p_workspace_id:d.session.bound.workspace,p_status:selected.status,p_days:selected.days,p_property_id:selected.property_id,p_search:selected.search,p_offset:offset}));
  if(!result||!Array.isArray(result.rows)||!Array.isArray(result.properties)||result.rows.length>50||result.page_size!==50||result.offset!==offset||result.status!==selected.status||result.days!==selected.days||result.property_id!==selected.property_id||result.search!==selected.search||!Number.isSafeInteger(result.total)||result.total<0||!/^\d{4}-\d{2}-\d{2}$/.test(result.as_of)||result.timezone!=='Asia/Kuwait')throw Error(t('تعذر التحقق من نتائج التقرير. أعد الاسترجاع.'));
  loaded={filters:structuredClone(selected),offset,total:result.total};property.replaceChildren(all);
  for(const p of result.properties){const option=node('option',p.name);option.value=p.id;property.append(option);}property.value=selected.property_id||'';
  summary.textContent=message('نتائج {kind} حتى {date}: {count} عقدًا',{kind:t(selected.status==='expired'?'العقود المنتهية':'العقود القريبة من الانتهاء'),date:result.as_of,count:result.total});
  if(!result.rows.length)rows.append(uiText('p','لا توجد عقود تطابق المرشحات المحددة.'));
  for(const r of result.rows){
   const card=node('article');card.append(uiText('h3','عقد {number}',{number:r.contract_no}),node('p',r.property_name+' • '+r.unit_no),uiText('p','المستأجر: {name}',{name:r.tenant_name}),uiText('p','مدة العقد: {from} إلى {to}',{from:r.start_date,to:r.end_date}),uiText('p','الإيجار الشهري: {amount} د.ك',{amount:r.monthly_rent}),uiText('p',r.days_remaining<0?'انتهى منذ {days} يومًا':r.days_remaining===0?'ينتهي اليوم':'متبقٍ {days} يومًا',{days:Math.abs(r.days_remaining)}));rows.append(card);
  }
  pageLabel.textContent=message('الصفحة {page} من {pages}',{page:Math.floor(offset/50)+1,pages:Math.max(1,Math.ceil(result.total/50))});previous.disabled=offset===0;next.disabled=offset+50>=result.total;
  d.status.textContent=t('تم استرجاع التقرير من السجلات المحفوظة.');
 }
 form.onsubmit=e=>{e.preventDefault();return d.run(()=>load());};previous.onclick=()=>d.run(()=>loaded&&load(loaded.filters,Math.max(0,loaded.offset-50)));next.onclick=()=>d.run(()=>loaded&&load(loaded.filters,loaded.offset+50));
 d.onDispose(()=>{loaded=null;search.value='';property.replaceChildren();rows.replaceChildren();summary.textContent=pageLabel.textContent='';});
 return {load};
}
export async function mountAvailableLeaseExpiryReport(d){
 const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
 if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.features?.lease_expiry_report!==true||access?.permissions?.reports?.read!==true||access?.permissions?.contracts?.read!==true){d.body.append(uiText('p','تقرير انتهاء العقود غير متاح لهذا الحساب.'));return;}
 await mountLeaseExpiryReport(d).load();
}
export function openLeaseExpiryReport(){const d=createDialog(translateStatic('العقود المنتهية والقريبة من الانتهاء'));if(d)d.run(()=>mountAvailableLeaseExpiryReport(d));}

