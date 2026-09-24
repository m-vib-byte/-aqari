import {client as tenantClient} from '../../v267-tenant-portal.js';
import {uiText,setText} from './components/ui-text.js';
import {normalizeTenantPropertySupport} from './domain/tenant-property-technicians.js';

const section=document.getElementById('tenantTechniciansSection');
const list=document.getElementById('tenantTechnicians');
const status=document.getElementById('tenantTechniciansStatus');
const cfg=window.AQARI_PUBLIC_CONFIG;
const previewReady=Boolean(section&&list&&status&&window.supabase&&cfg?.supabaseUrl==='https://ofgmcsmxmdswlovsckqs.supabase.co'&&cfg?.releaseStage==='preview'&&cfg?.supabasePublishableKey&&cfg?.supabaseAuthStorageKey);
const client=previewReady?tenantClient:null;
let generation=0;
function clear(){generation++;if(list)list.replaceChildren();if(status)status.textContent='';if(section)section.hidden=true;}
function text(tag,value,className=''){const n=document.createElement(tag);if(className)n.className=className;n.textContent=value;return n;}
function action(label,href){const link=document.createElement('a');link.className='tenant-technician-action';if(label==='WhatsApp')link.textContent=label;else setText(link,label);link.href=href;if(href.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}return link;}
function render(payload){if(!section||!list||!status)return;list.replaceChildren();let visible=0;for(const property of payload.properties){if(!property.techniciansEnabled||!property.technicians.length)continue;const card=document.createElement('article');card.className='item tenant-technician-property';card.append(property.propertyName?text('h3',property.propertyName):uiText('h3','العقار'));for(const technician of property.technicians){const row=document.createElement('div');row.className='tenant-technician-row';row.append(technician.nameAr||technician.nameEn?text('strong',technician.nameAr||technician.nameEn):uiText('strong','فني معتمد'));if(technician.jobAr)row.append(text('span',` — ${technician.jobAr}`));const actions=document.createElement('div');actions.className='tenant-technician-actions';if(technician.tel)actions.append(action('اتصال',technician.tel));if(technician.whatsappUrl)actions.append(action('WhatsApp',technician.whatsappUrl));if(actions.childNodes.length)row.append(actions);card.append(row);visible++;}list.append(card);}section.hidden=visible===0;setText(status,visible?'يظهر لك {count} فني/فنيين معتمدين للعقار المرتبط بعقدك الحالي.':'',{count:visible});}
async function refresh(){if(!client)return clear();const current=++generation;try{const first=await client.auth.getSession();const userId=first?.data?.session?.user?.id;if(current!==generation||!userId)return clear();const result=await client.rpc('aqari_tenant_property_support');if(current!==generation)return;if(result.error)throw Error('TENANT_PROPERTY_SUPPORT_UNAVAILABLE');const verified=await client.auth.getSession();if(current!==generation||verified?.data?.session?.user?.id!==userId)return clear();render(normalizeTenantPropertySupport(result.data));}catch{if(current===generation){list.replaceChildren();section.hidden=false;setText(status,'تعذر تحميل فنيي العقار المصرح لهم حالياً.');}}}
if(client){client.auth.onAuthStateChange(()=>queueMicrotask(refresh));window.addEventListener('pageshow',refresh);refresh();}else clear();

