const names={received:'تم الاستلام',assigned:'تم التكليف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى',awaiting_configuration:'بانتظار إعداد الإرسال',queued:'في الانتظار',sending:'جارٍ الإرسال',sent:'تم الإرسال',failed:'تعذر الإرسال'};
const transitions={received:['received','assigned','in_progress','cancelled'],assigned:['assigned','in_progress','cancelled'],in_progress:['in_progress','completed','cancelled'],completed:['completed'],cancelled:['cancelled']};
function scope(){const c=window.AQARI_SUPABASE?.context,g=window.AQARI_DATA_GATE?.scope;if(!document.documentElement.classList.contains('aqari-auth-unlocked')||!c?.user?.id||!c?.workspace?.id||c.membership?.is_active!==true||c.membership?.user_id!==c.user.id||c.membership?.workspace_id!==c.workspace.id||!['general_manager','property_manager','accountant'].includes(c.membership.role)||g?.userId!==c.user.id||g?.workspaceId!==c.workspace.id)throw Error('صلاحية الإدارة مطلوبة.');return {user:c.user.id,workspace:c.workspace.id};}
const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
let opened=false;
export async function openDesk(mode='maintenance'){
 if(opened)return;if(!['maintenance','notifications'].includes(mode))return;
 const bound=scope();opened=true;const dialog=node('dialog'),jobs=new Set();let page=0,busy=false,closed=false;
 const check=()=>{if(closed||JSON.stringify(scope())!==JSON.stringify(bound))throw Error('تغيرت جلسة الدخول. أغلق النافذة وسجل الدخول من جديد.');};
 const style=node('style');style.textContent='.v267-desk{width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 32px);border:1px solid #dfd4ba;border-radius:20px;padding:20px;background:#fff;color:#292820;direction:rtl;font:16px/1.7 system-ui;overscroll-behavior:contain}.v267-desk::backdrop{background:#26221977}.v267-desk article{border:1px solid #ebe5d9;padding:16px;margin:16px 0;border-radius:14px;overflow-wrap:anywhere}.v267-desk button,.v267-desk input,.v267-desk select{box-sizing:border-box;display:block;width:100%;font:inherit;min-height:48px;border:1px solid #d8c9a6;border-radius:10px;padding:10px;margin:8px 0;background:#fff;color:#6e521f}.v267-desk button{background:#8a6a32;color:#fff}.v267-desk button:disabled{opacity:.55}.v267-desk p{white-space:pre-line}.v267-desk label{display:block}';
 dialog.className='v267-desk';dialog.setAttribute('aria-label',mode==='maintenance'?'متابعة طلبات المستأجرين':'سجل التنبيهات');
 const close=node('button','إغلاق'),title=node('h2',mode==='maintenance'?'طلبات المستأجرين':'التنبيهات المحفوظة'),status=node('p'),list=node('div'),reload=node('button','تحديث السجلات'),previous=node('button','السابق'),next=node('button','التالي');status.setAttribute('role','status');close.onclick=()=>dialog.close();
 dialog.append(style,close,title,status);
 const lock=value=>{busy=value;for(const el of dialog.querySelectorAll('input,select,button'))if(el!==close)el.disabled=value;};
 async function request(query){check();const controller=new AbortController();jobs.add(controller);const timer=setTimeout(()=>controller.abort(),20000);try{const result=await query.abortSignal(controller.signal);check();if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);jobs.delete(controller);}}
 let client;
 async function load(){
  check();list.replaceChildren();
  const table=mode==='maintenance'?'aqari_maintenance_requests':'aqari_notification_outbox';
  const rows=await request(client.from(table).select(mode==='maintenance'?'id,request_no,workspace_id,description,status,cost,revision,lease:aqari_leases(contract_no,snapshot),tenant:aqari_tenants(full_name)':'id,kind,channel,status,scheduled_at,period,lease:aqari_leases(contract_no,snapshot)').eq('workspace_id',bound.workspace).order(mode==='maintenance'?'request_no':'scheduled_at',{ascending:false}).range(page*50,page*50+49));
  if(!rows.length)list.append(node('p','لا توجد سجلات محفوظة في هذه الصفحة.'));
  for(const row of rows){
   const card=node('article');card.append(node('h3',mode==='maintenance'?'طلب '+row.request_no:row.kind==='rent_reminder'?'تذكير الإيجار':'شكر على السداد'));
   card.append(node('p',`العقد ${row.lease?.contract_no||''} • ${row.lease?.snapshot?.property||''} • الوحدة ${row.lease?.snapshot?.unit||''}`));
   if(mode==='notifications'){card.append(node('p',`${row.channel==='email'?'البريد الإلكتروني':'واتساب'} • ${names[row.status]||'غير معروف'}\nالفترة ${row.period} • ${row.scheduled_at.slice(0,10)}`));}
   else{
    card.append(node('p',row.tenant?.full_name||''),node('p',row.description));
    const stateLabel=node('label','حالة الطلب'),state=node('select'),costLabel=node('label','التكلفة — د.ك'),cost=node('input'),save=node('button','حفظ الحالة والتكلفة');
    for(const value of transitions[row.status]||[]){const option=node('option',names[value]);option.value=value;state.append(option);}state.value=row.status;stateLabel.append(state);cost.type='text';cost.inputMode='decimal';cost.value=String(row.cost);costLabel.append(cost);card.append(stateLabel,costLabel);
    if(!['completed','cancelled'].includes(row.status)){
     card.append(save);save.onclick=async()=>{
      if(busy)return;lock(true);let sent=false;
      try{
       const value=cost.value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');if(!/^\d{1,12}(\.\d{1,3})?$/.test(value))throw Error('أدخل تكلفة صحيحة بدقة ثلاثة منازل.');
       const newStatus=state.value;sent=true;
       const saved=await request(client.from('aqari_maintenance_requests').update({status:newStatus,cost:value}).eq('workspace_id',bound.workspace).eq('id',row.id).eq('revision',row.revision).select('id,revision,status,cost').maybeSingle());
       if(!saved)throw Error('تغير الطلب لدى مستخدم آخر.');
       const verified=await request(client.from('aqari_maintenance_requests').select('id,revision,status,cost').eq('workspace_id',bound.workspace).eq('id',row.id).single());
       if(verified.revision!==saved.revision||verified.status!==newStatus||Number(verified.cost)!==Number(value))throw Error('لم تتأكد إعادة القراءة.');
       await load();status.textContent='تم حفظ الطلب وإعادة قراءته من قاعدة البيانات.';
      }catch(e){status.textContent=sent?'لم يتأكد الحفظ. حدّث السجلات وتحقق قبل إعادة الحفظ.':e.message;}
      finally{if(!closed){lock(false);if(sent&&card.isConnected)save.disabled=true;}}
     };
    }
   }
   list.append(card);
  }
  previous.hidden=page===0;next.hidden=rows.length<50;
 }
 async function refresh(){if(busy)return;lock(true);status.textContent='جارٍ استرجاع السجلات…';try{await load();status.textContent=mode==='maintenance'?'السجلات من قاعدة المعاينة المستقلة.':'الإرسال غير مفعّل. هذه سجلات تجهيز وإلغاء، وليست رسائل مرسلة.';}catch(e){status.textContent=e.message||'تعذر استرجاع السجلات.';}finally{lock(false);}}
 if(mode==='notifications'){
  const label=node('label','آخر يوم في مهلة السداد من الشهر'),grace=node('input'),prepare=node('button','تجهيز تنبيهات اليوم');grace.type='number';grace.min='1';grace.max='27';grace.value='5';label.append(grace);dialog.append(node('p','التجهيز يحفظ التنبيهات المستحقة فقط. تفعيل الإرسال يحتاج إعداد المزود والجدولة وموافقة التكلفة أولاً.'),label,prepare);
  prepare.onclick=async()=>{if(busy)return;const day=Number(grace.value);if(!Number.isInteger(day)||day<1||day>27){status.textContent='حدد آخر يوم بين ١ و٢٧.';return;}lock(true);try{const count=await request(client.rpc('aqari_prepare_rent_reminders',{p_workspace_id:bound.workspace,p_as_of:new Date(Date.now()+10800000).toISOString().slice(0,10),p_grace_day:day}));page=0;await load();status.textContent=`تم تجهيز ${count} تنبيه مستحق. لم تُرسل رسائل. إذا كان العدد صفراً فلا توجد تنبيهات جديدة مستحقة اليوم.`;}catch(e){status.textContent=e.message||'تعذر تأكيد التجهيز. حدّث السجلات.';}finally{lock(false);}};
 }
 reload.onclick=refresh;previous.onclick=()=>{if(!busy&&page>0){page--;refresh();}};next.onclick=()=>{if(!busy){page++;refresh();}};dialog.append(reload,list,previous,next);
 dialog.addEventListener('close',()=>{closed=true;for(const job of jobs)job.abort();opened=false;dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();
 try{client=await window.AQARI_SUPABASE.getClient();check();await refresh();}catch(e){status.textContent=e.message;}
}
