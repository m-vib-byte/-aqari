import {normalizeTenantPropertySupport} from './domain/tenant-property-technicians.js';

const section=document.getElementById('tenantTechniciansSection');
const list=document.getElementById('tenantTechnicians');
const status=document.getElementById('tenantTechniciansStatus');
const cfg=window.AQARI_PUBLIC_CONFIG;
let generation=0;

function clear(){
 generation++;
 if(list)list.replaceChildren();
 if(status)status.textContent='';
 if(section)section.hidden=true;
}

function text(tag,value,className=''){
 const node=document.createElement(tag);
 if(className)node.className=className;
 node.textContent=value;
 return node;
}

function action(label,href){
 const link=document.createElement('a');
 link.className='tenant-technician-action';
 link.textContent=label;
 link.href=href;
 if(href.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}
 return link;
}

function render(payload){
 if(!section||!list||!status)return;
 list.replaceChildren();
 let visible=0;
 for(const property of payload.properties){
  if(!property.techniciansEnabled||!property.technicians.length)continue;
  const card=document.createElement('article');card.className='item tenant-technician-property';
  card.append(text('h3',property.propertyName||'العقار'));
  for(const technician of property.technicians){
   const row=document.createElement('div');row.className='tenant-technician-row';
   row.append(text('strong',technician.nameAr||technician.nameEn||'فني معتمد'));
   if(technician.jobAr)row.append(text('span',` — ${technician.jobAr}`));
   const actions=document.createElement('div');actions.className='tenant-technician-actions';
   if(technician.tel)actions.append(action('اتصال',technician.tel));
   if(technician.whatsappUrl)actions.append(action('WhatsApp',technician.whatsappUrl));
   if(actions.childNodes.length)row.append(actions);
   card.append(row);visible++;
  }
  list.append(card);
 }
 section.hidden=visible===0;
 status.textContent=visible?`يظهر لك ${visible} فني/فنيين معتمدين للعقار المرتبط بعقدك الحالي.`:'';
}

async function refresh(){
 if(!section||!list||!status||cfg?.supabaseUrl!=='https://ofgmcsmxmdswlovsckqs.supabase.co'||cfg?.releaseStage!=='preview')return clear();
 const current=++generation;
 const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
 try{
  const first=await client.auth.getSession();
  const userId=first?.data?.session?.user?.id;
  if(current!==generation||!userId)return clear();
  const result=await client.rpc('aqari_tenant_property_support');
  if(current!==generation)return;
  if(result.error)throw Error('TENANT_PROPERTY_SUPPORT_UNAVAILABLE');
  const verified=await client.auth.getSession();
  if(current!==generation||verified?.data?.session?.user?.id!==userId)return clear();
  render(normalizeTenantPropertySupport(result.data));
 }catch{
  if(current===generation){list.replaceChildren();section.hidden=false;status.textContent='تعذر تحميل فنيي العقار المصرح لهم حالياً.';}
 }
}

if(section&&list&&status&&window.supabase){
 const watcher=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storageKey:cfg.supabaseAuthStorageKey+'-tenant'}});
 watcher.auth.onAuthStateChange(()=>queueMicrotask(refresh));
 window.addEventListener('pageshow',refresh);
 refresh();
}else clear();
