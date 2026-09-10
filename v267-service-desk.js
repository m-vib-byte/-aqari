import {createDialog,node,field} from './src/v267/components/dialog.js';
import {t,message} from './src/v267/components/locale.js';
import {currentScope} from './src/v267/api/session.js';

const names={received:'تم الاستلام',assigned:'تم التكليف',in_progress:'قيد التنفيذ',completed:'مكتمل',cancelled:'ملغى',awaiting_configuration:'بانتظار إعداد الإرسال',queued:'في الانتظار',sending:'جارٍ الإرسال',sent:'تم الإرسال',failed:'تعذر الإرسال'};
const transitions={received:['received','assigned','in_progress','cancelled'],assigned:['assigned','in_progress','cancelled'],in_progress:['in_progress','completed','cancelled'],completed:['completed'],cancelled:['cancelled']};
const loadedText=mode=>mode==='maintenance'?'تمت قراءة طلبات الصيانة المحفوظة.':'الإرسال غير مفعّل. هذه سجلات تجهيز وإلغاء، وليست رسائل مرسلة.';
const uncertainSave='لم يتأكد الحفظ. حدّث السجلات وتحقق قبل إعادة الحفظ.';

export async function openDesk(mode='maintenance'){
 if(!['maintenance','notifications'].includes(mode))return;
 if(!['general_manager','property_manager','accountant'].includes(currentScope().role))throw Error(t('صلاحية الإدارة مطلوبة.'));
 const d=createDialog(t(mode==='maintenance'?'متابعة طلبات المستأجرين':'سجل التنبيهات'),{localized:true});if(!d)return;
 d.el.classList.add('v267-desk');
 // The legacy shell can open this desk before workspace styles are loaded.
 const style=node('style');style.textContent='.v267-desk{box-sizing:border-box;width:min(720px,calc(100vw - 24px));max-height:calc(100dvh - 32px);border:1px solid #dfd4ba;border-radius:20px;padding:20px;background:#fff;color:#292820;font:16px/1.7 system-ui;overscroll-behavior:contain}.v267-desk::backdrop{background:#26221977}.v267-desk article{border:1px solid #ebe5d9;padding:16px;margin:16px 0;border-radius:14px;overflow-wrap:anywhere}.v267-desk button,.v267-desk input,.v267-desk select{box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;font:inherit;min-height:48px;border:1px solid #d8c9a6;border-radius:10px;padding:10px;margin:8px 0;background:#fff;color:#6e521f}.v267-desk button{background:#8a6a32;color:#fff;white-space:normal;overflow-wrap:anywhere}.v267-desk button:disabled{opacity:.55}.v267-desk [hidden]{display:none!important}.v267-desk p{white-space:pre-line;overflow-wrap:anywhere}.v267-desk label{display:block}';
 d.body.append(style);
 const {session,status}=d,list=node('div'),reload=node('button',t('تحديث السجلات')),previous=node('button',t('السابق')),next=node('button',t('التالي'));
 let page=0,prepare;
 const drafts=new Map();let editors=new Map();
 function clearPrivate(){drafts.clear();editors.clear();list.replaceChildren();previous.hidden=next.hidden=true;}
 d.onDispose(clearPrivate);
 function checkReadAccess(){try{session.check();}catch(error){clearPrivate();throw error;}}
 async function read(query){
  try{const rows=await session.request(query);checkReadAccess();return rows;}
  catch(error){
   checkReadAccess();
   if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED')clearPrivate();
   throw error;
  }
 }
 function remember(){for(const [id,editor]of editors){const prior=drafts.get(id),{row,state,cost}=editor;
  if(prior?.uncertain||state.value!==row.status||cost.value!==String(row.cost??''))drafts.set(id,{row,status:state.value,cost:cost.value,uncertain:prior?.uncertain===true});
  else drafts.delete(id);
 }}
 previous.hidden=true;next.hidden=true;
 async function load(wanted=page){
  checkReadAccess();remember();
  const table=mode==='maintenance'?'aqari_maintenance_requests':'aqari_notification_outbox';
  const rows=await read(session.client.from(table).select(mode==='maintenance'?'id,request_no,workspace_id,description,status,cost,revision,tenant:aqari_tenants(full_name)':'id,kind,channel,status,scheduled_at,period,lease:aqari_leases(contract_no,snapshot)').eq('workspace_id',session.bound.workspace).order(mode==='maintenance'?'request_no':'scheduled_at',{ascending:false}).range(wanted*50,wanted*50+49));
  const locations=new Map();
  if(mode==='maintenance'&&rows.length){
   // Maintenance staff cannot read leases. Resolve only the location metadata
   // through the same maintenance/property ACL, without loading contract snapshots.
   const savedLocations=await read(session.client.rpc('aqari_maintenance_locations',{p_workspace_id:session.bound.workspace,p_request_ids:rows.map(row=>row.id)}));
   if(!Array.isArray(savedLocations)||savedLocations.length!==rows.length)throw Error('لم تتأكد إعادة القراءة.');
   for(const location of savedLocations){
    if(!rows.some(row=>row.id===location.request_id)||locations.has(location.request_id)||typeof location.property_name!=='string'||typeof location.unit_no!=='string')throw Error('لم تتأكد إعادة القراءة.');
    locations.set(location.request_id,location);
   }
  }
  const cards=[],nextEditors=new Map();
  if(!rows.length)cards.push(node('p',t('لا توجد سجلات محفوظة في هذه الصفحة.')));
  for(const fresh of rows){
   const draft=drafts.get(fresh.id),row=draft?.row||fresh;
   const card=node('article');
   card.append(node('h3',mode==='maintenance'?message('طلب {number}',{number:row.request_no}):t(row.kind==='rent_reminder'?'تذكير الإيجار':row.kind==='payment_thanks'?'شكر على السداد':'غير معروف')));
   if(mode==='maintenance'){
    const location=locations.get(fresh.id);
    card.append(node('p',message('العقار: {property} • الوحدة: {unit}',{property:location.property_name,unit:location.unit_no})));
   }else card.append(node('p',message('العقد {contract} • {property} • الوحدة {unit}',{contract:row.lease?.contract_no||'',property:row.lease?.snapshot?.property||'',unit:row.lease?.snapshot?.unit||''})));
   if(mode==='notifications'){
    card.append(node('p',message('{channel} • {status}\nالفترة {period} • {date}',{channel:t(row.channel==='email'?'البريد الإلكتروني':row.channel==='whatsapp'?'واتساب':'غير معروف'),status:t(names[row.status]||'غير معروف'),period:row.period??'',date:String(row.scheduled_at??'').slice(0,10)})));
   }else{
    card.append(node('p',row.tenant?.full_name||''),node('p',row.description||''));
    const state=node('select'),cost=node('input'),save=node('button',t('حفظ الحالة والتكلفة')),allowed=transitions[row.status]||[];
    for(const value of allowed){const option=node('option',t(names[value]));option.value=value;state.append(option);}
    if(!allowed.length){const option=node('option',t('غير معروف'));option.value=row.status;state.append(option);}
    state.value=draft?.status??row.status;cost.type='text';cost.inputMode='decimal';cost.value=draft?.cost??String(row.cost??'');
    const editable=allowed.length>1;state.disabled=!editable;cost.disabled=!editable;
    nextEditors.set(row.id,{row,state,cost});
    card.append(field(t('حالة الطلب'),state),field(t('التكلفة — د.ك'),cost));
    const stale=!!draft&&fresh.revision!==row.revision;
    if(draft){
     card.append(node('p',t(draft.uncertain?uncertainSave:stale?'تغير الطلب لدى مستخدم آخر.':'تم الاحتفاظ بالتغييرات غير المحفوظة.')));
     const discard=node('button',t('تجاهل التعديل المحلي واسترجاع المحفوظ'));discard.type='button';
     discard.onclick=()=>{editors.delete(row.id);drafts.delete(row.id);return refresh();};card.append(discard);
    }
    if(editable){
     card.append(save);save.onclick=async()=>{
      if(save.disabled||drafts.get(row.id)?.uncertain||stale)return;
      let sent=false,confirmed=false;
      await d.run(async()=>{
       const value=cost.value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');
       if(!/^\d{1,12}(\.\d{1,3})?$/.test(value))throw Error('أدخل تكلفة صحيحة بدقة ثلاثة منازل.');
       const newStatus=state.value;if(!allowed.includes(newStatus))throw Error('تغير الطلب لدى مستخدم آخر.');
       sent=true;
       try{
        const saved=await session.request(session.client.from('aqari_maintenance_requests').update({status:newStatus,cost:value}).eq('workspace_id',session.bound.workspace).eq('id',row.id).eq('revision',row.revision).select('id,revision,status,cost').maybeSingle());
        if(!saved||saved.id!==row.id)throw Error('تغير الطلب لدى مستخدم آخر.');
        const verified=await read(session.client.from('aqari_maintenance_requests').select('id,revision,status,cost').eq('workspace_id',session.bound.workspace).eq('id',row.id).single());
        if(verified.id!==row.id||verified.revision!==saved.revision||verified.status!==newStatus||Number(verified.cost)!==Number(value))throw Error('لم تتأكد إعادة القراءة.');
        editors.delete(row.id);drafts.delete(row.id);
        await load();confirmed=true;status.textContent=t('تم حفظ الطلب وإعادة قراءته من قاعدة البيانات.');
       }catch(error){
        if([401,403].includes(error?.status)||error?.code==='42501'||error?.message==='ACCESS_DENIED'){clearPrivate();throw error;}
        checkReadAccess();throw Error(uncertainSave);
       }
      });
      // run restores controls; uncertain writes require an explicit saved-state reload.
      if(sent&&!confirmed&&!d.closed&&card.isConnected){drafts.set(row.id,{row,status:state.value,cost:cost.value,uncertain:true});save.disabled=true;}
     };
     save.disabled=stale||draft?.uncertain===true;
    }
   }
   cards.push(card);
  }
  list.replaceChildren(...cards);editors=nextEditors;page=wanted;
  previous.hidden=page===0;next.hidden=rows.length<50;
 }
 async function refresh(wanted=page){
  let loaded=false;
  await d.run(async()=>{await load(wanted);loaded=true;status.textContent=t(loadedText(mode));});
  if(loaded&&prepare&&!d.closed)prepare.disabled=false;
 }
 if(mode==='notifications'){
  const grace=node('input');prepare=node('button',t('تجهيز تنبيهات اليوم'));grace.type='number';grace.min='1';grace.max='27';grace.value='5';
  d.body.append(node('p',t('التجهيز يحفظ التنبيهات المستحقة فقط. تفعيل الإرسال يحتاج إعداد المزود والجدولة وموافقة التكلفة أولاً.')),field(t('آخر يوم في مهلة السداد من الشهر'),grace),prepare);
  prepare.onclick=async()=>{
   let sent=false,confirmed=false;
   await d.run(async()=>{
    const day=Number(grace.value);if(!Number.isInteger(day)||day<1||day>27)throw Error('حدد آخر يوم بين ١ و٢٧.');
    sent=true;
    try{
     const count=await session.request(session.client.rpc('aqari_prepare_rent_reminders',{p_workspace_id:session.bound.workspace,p_as_of:new Date(Date.now()+10800000).toISOString().slice(0,10),p_grace_day:day}));
     await load(0);confirmed=true;status.textContent=message('تم تجهيز {count} تنبيه مستحق. لم تُرسل رسائل. إذا كان العدد صفراً فلا توجد تنبيهات جديدة مستحقة اليوم.',{count});
    }catch{throw Error('تعذر تأكيد التجهيز. حدّث السجلات.');}
   });
   if(sent&&!confirmed&&!d.closed)prepare.disabled=true;
  };
 }
 reload.onclick=()=>refresh();previous.onclick=()=>{if(page>0)return refresh(page-1);};next.onclick=()=>refresh(page+1);
 d.body.append(reload,list,previous,next);await refresh();
}
