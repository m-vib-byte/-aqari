const cfg=window.AQARI_PUBLIC_CONFIG;
const form=document.getElementById('maintenanceForm');
const category=document.getElementById('maintenanceCategory');
const leaseSelect=document.getElementById('maintenanceLease');
const description=document.getElementById('maintenanceDescription');
const notice=document.getElementById('notice');
const requestList=document.getElementById('tenantRequests');

const CATEGORY_LABELS={
 electrical:'كهرباء',
 plumbing:'سباكة',
 air_conditioning:'تكييف',
 elevator:'مصعد',
 doors_windows:'أبواب ونوافذ',
 cleaning:'نظافة',
 other:'أخرى',
 legacy_unclassified:'قديم — غير مصنف'
};

if(!cfg||cfg.releaseStage!=='preview'||!form||!category||!leaseSelect||!description||!requestList)throw Error('MAINTENANCE_CATEGORY_UI_REQUIRED');

const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
let submitting=false,decorating=false,timer=null;

function status(text){if(notice)notice.textContent=text;}
function validCategory(value){return Object.hasOwn(CATEGORY_LABELS,value)&&value!=='legacy_unclassified';}
function todayKuwait(){return new Date(Date.now()+10800000).toISOString().slice(0,10);}
async function session(){const {data,error}=await client.auth.getSession();if(error)throw Error('تعذر التحقق من جلسة الدخول.');return data.session;}
async function snapshot(){const {data,error}=await client.rpc('aqari_tenant_portal_snapshot');if(error)throw Error('تعذر تأكيد ملف المستأجر.');return data;}

async function decorateCategories(){
 if(decorating||document.getElementById('content')?.hidden)return;
 decorating=true;
 try{
  const auth=await session();if(!auth)return;
  const data=await snapshot();if(data?.account?.user_id!==auth.user.id||!Array.isArray(data.maintenance))return;
  observer.disconnect();
  const cards=[...requestList.children];
  for(let i=0;i<cards.length;i++){
   cards[i].querySelector('.maintenance-category-label')?.remove();
   const row=data.maintenance[i];if(!row)continue;
   const badge=document.createElement('strong');badge.className='maintenance-category-label';badge.textContent='النوع: '+(CATEGORY_LABELS[row.category_code]||'غير معروف')+' • ';
   cards[i].prepend(badge);
  }
 }catch{}
 finally{observer.observe(requestList,{childList:true,subtree:true});decorating=false;}
}
function scheduleDecorate(){clearTimeout(timer);timer=setTimeout(decorateCategories,120);}
const observer=new MutationObserver(scheduleDecorate);observer.observe(requestList,{childList:true,subtree:true});
window.addEventListener('load',()=>setTimeout(decorateCategories,500),{once:true});

form.addEventListener('submit',async event=>{
 event.preventDefault();event.stopImmediatePropagation();
 if(submitting)return;
 const categoryCode=category.value,descriptionText=description.value.trim(),leaseId=leaseSelect.value;
 if(!validCategory(categoryCode)){status('اختر نوع العطل قبل إرسال الطلب.');category.focus();return;}
 if(descriptionText.length<5||descriptionText.length>3000){status('أدخل وصفاً من ٥ إلى ٣٠٠٠ حرف.');description.focus();return;}
 submitting=true;const save=document.getElementById('maintenanceSave');if(save)save.disabled=true;
 let inserted=false;
 try{
  const auth=await session();if(!auth)throw Error('انتهت جلسة الدخول. أعد تسجيل الدخول.');
  const before=await snapshot();
  if(before?.account?.user_id!==auth.user.id||before.account.is_active!==true)throw Error('تعذر تأكيد حساب المستأجر.');
  const lease=(before.leases||[]).find(item=>item.id===leaseId),today=todayKuwait();
  if(!lease||lease.status!=='signed'||lease.start_date>today||lease.end_date<today)throw Error('اختر عقداً فعالاً.');
  const id=crypto.randomUUID();
  const {error}=await client.from('aqari_maintenance_requests').insert({id,workspace_id:before.account.workspace_id,tenant_id:before.account.tenant_id,lease_id:lease.id,category_code:categoryCode,description:descriptionText});
  if(error)throw Error(error.code==='23514'?'اختر نوع عطل صالحاً.':'تعذر حفظ طلب الصيانة.');
  inserted=true;
  const after=await snapshot();
  const saved=(after.maintenance||[]).find(item=>item.id===id);
  if(!saved||saved.category_code!==categoryCode)throw Error('تم الإرسال لكن لم يتأكد الاسترجاع. حدّث الصفحة قبل إعادة الإرسال.');
  status('تم حفظ طلب الصيانة بنوع «'+CATEGORY_LABELS[categoryCode]+'» وظهوره في السجل.');
  window.location.reload();
 }catch(error){status(inserted?'تم الإرسال لكن لم يتأكد الاسترجاع. حدّث الصفحة قبل إعادة الإرسال.':(error?.message||'تعذر حفظ طلب الصيانة.'));}
 finally{submitting=false;if(save)save.disabled=false;}
},true);
