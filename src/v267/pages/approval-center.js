import {t as translateStatic} from '../components/locale.js';
import {createDialog,node} from '../components/dialog.js';
import {readManagementCounters,kuwaitDay} from '../components/management-counters.js';

const text=(tag,value)=>node(tag,String(value??''));
function card(title,description,count,run){
 const button=node('button');button.type='button';button.className='aq-owner-approval-card';button.append(text('strong',title),text('small',description));if(count!==null&&count!==undefined)button.append(text('b',Number(count).toLocaleString('ar-KW')));button.onclick=run;return button;
}
async function launch(d,path,exportName){d.close();const mod=await import(path+'?release=V267');if(typeof mod?.[exportName]!=='function')throw Error('مسار الموافقة غير متاح.');return mod[exportName]();}

export function openApprovalCenter(){
 const d=createDialog(translateStatic('مركز الموافقات'));if(!d)return false;d.el.classList.add('aq-owner-center-dialog');
 d.run(async()=>{
  const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
  if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access?.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  let counters={items:[]};try{counters=await readManagementCounters(d.session,kuwaitDay());}catch(error){if(error?.code==='42501')throw error;}
  const count=id=>counters.items.find(item=>item.id===id)?.value??null;
  const grid=node('section');grid.className='aq-owner-approval-grid';
  if(access.permissions?.contracts?.read===true)grid.append(card(translateStatic('مراجعة واعتماد العقود'),translateStatic('يفتح مسار اعتماد عقود المصدر نفسه؛ لا تنشأ موافقة موازية.'),count('review_contracts'),()=>launch(d,'./lease-review.js','openLeaseReview')));
  if(access.permissions?.finance?.read===true)grid.append(card(translateStatic('اعتماد المصروفات والفترة المالية'),translateStatic('يفتح السجل المالي الحالي بمراجعاته وإقفاله وتدقيقه.'),null,()=>launch(d,'./financial-register.js','openFinancialRegister')));
  if(access.features?.partner_distribution_register===true&&access.permissions?.partners?.read===true)grid.append(card(translateStatic('توزيعات الشركاء'),translateStatic('اعتماد التوزيع من السجل الحالي فقط.'),null,()=>launch(d,'./partner-distributions.js','openPartnerDistributions')));
  if(access.features?.vacating_review===true)grid.append(card(translateStatic('مراجعة الإخلاء'),translateStatic('يفتح مراجعة الإخلاء والتسوية المرتبطة.'),null,()=>launch(d,'./vacating-review.js','openVacatingReview')));
  if(!grid.childElementCount)grid.append(text('p',translateStatic('لا توجد مسارات موافقات متاحة لصلاحية هذا الحساب.')));
  d.body.replaceChildren(text('p',translateStatic('يجمع هذا المركز مسارات الاعتماد الموجودة فعليًا. التنفيذ النهائي يبقى داخل كل سجل وبنفس سجل التدقيق والصلاحيات.')),grid);
  d.status.textContent=translateStatic('تم التحقق من الصلاحيات وتجميع مسارات الموافقات المتاحة.');
 });return true;
}

