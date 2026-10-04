import {node,field} from './dialog.js';
import {t} from './locale.js';
import {createPdfContractSource} from '../api/pdf-contract-source.js';
import {planPdfContractValues} from '../domain/pdf-contract-source.js';

export function mountPdfContractAutofill(d,target,{property,read,apply}){
 if(d.session.bound.role!=='general_manager')return;
 const source=createPdfContractSource(d.session,property),panel=node('details'),body=node('div'),preview=node('div'),status=node('p');status.setAttribute('role','status');
 const button=(label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(fn);return b;};
 const select=node('select'),query=node('input'),confirmed=node('input');query.type='search';query.maxLength=100;confirmed.type='checkbox';
 let offset=0,revision=0,review=null;
 const reset=()=>{revision++;review=null;confirmed.checked=false;commit.disabled=true;preview.replaceChildren();};
 select.onchange=reset;confirmed.onchange=()=>{commit.disabled=!review||!confirmed.checked;};
 d.onDispose(()=>{reset();select.replaceChildren();});
 async function list(clear){
  if(clear){reset();offset=0;select.replaceChildren(Object.assign(node('option',t('اختر العقد')),{value:''}));}
  const result=await source.list(query.value.trim(),offset);d.session.check();
  for(const row of result.items.slice(0,50))select.append(Object.assign(node('option',[row.contract_no,row.unit_no,row.tenant].filter(Boolean).join(' · ')),{value:row.external_ref}));
  offset=result.next_offset;more.hidden=!result.has_more;
 }
 const more=button('عرض عقود إضافية',()=>list(false));more.hidden=true;
 const commit=button('تعبئة الحقول من البيانات المعروضة',async()=>{
  const current=review;if(!current||!confirmed.checked)return;
  const unchanged=()=>!d.closed&&review===current&&select.value===current.ref&&JSON.stringify(read())===current.baseline;
  if(!unchanged()){reset();throw Error(t('تغيرت الحقول أو القيم. أعد معاينة بيانات العقد.'));}
  const fresh=await source.read(current.ref);d.session.check();
  if(!unchanged()||JSON.stringify(fresh)!==current.source){reset();throw Error(t('تغيرت بيانات العقد. أعد معاينتها قبل التعبئة.'));}
  apply(current.changes);reset();status.textContent=t('عُبئت الحقول المرتبطة. راجع النموذج ثم احفظ وعاين PDF. المعلومات الناقصة بقيت فارغة.');
 });commit.disabled=true;
 const inspect=button('معاينة بيانات العقد للتعبئة',async()=>{
  reset();if(!select.value)throw Error(t('اختر العقد أولًا.'));
  const ref=select.value,token=revision,state=read(),baseline=JSON.stringify(state);
  const context=await source.read(ref);d.session.check();
  if(d.closed||token!==revision||select.value!==ref||JSON.stringify(read())!==baseline)return;
  const changes=planPdfContractValues(state.fields,state.values,context);
  preview.append(node('p',[context.values.property_name,context.values.unit_no,context.values.tenant_name,context.values.contract_no].filter(Boolean).join(' · ')));
  const table=node('table');table.style.width='100%';
  const head=node('tr');for(const label of ['الحقل','القيمة الحالية','من العقد'])head.append(node('th',t(label)));table.append(head);
  for(const change of changes){const row=node('tr');for(const value of [change.label,change.before||'—',change.missing?t('غير موجود — سيُفرغ الحقل'):change.value]){const cell=node('td',value);cell.style.overflowWrap='anywhere';row.append(cell);}table.append(row);}
  preview.append(table);review={ref,baseline,changes,source:JSON.stringify(context)};
 });
 panel.append(node('summary',t('تعبئة الحقول من عقد محفوظ')),body);
 body.append(node('p',t('حدد مصدر كل حقل من إعداداته، ثم اختر العقد. بعد موافقتك تستبدل القيم المرتبطة فقط، وتفرغ المعلومة الناقصة لمنع بقاء بيانات عقد سابق.')),field(t('بحث عقود التعبئة'),query),button('تحميل عقود التعبئة',()=>list(true)),field(t('العقد مصدر التعبئة'),select),more,inspect,preview,field(t('راجعت القيم وأوافق على تعبئة الحقول المرتبطة'),confirmed),commit,status);
 target.append(panel);
}
