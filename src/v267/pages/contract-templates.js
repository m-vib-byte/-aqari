import {node,field} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {mountPropertyContractUpload} from '../components/property-contract-upload.js';
import {createTemplateLogoContext} from '../components/template-property-logo.js';
import {t} from '../components/locale.js';

export function openContractTemplates({propertyId=null,onBack,initialSection='contracts',initialDocumentKind=null}={}){
 const d=createPage(t('العقود والمستندات'));if(!d)return false;
 d.el.classList.add('aq267-contract-template-dialog','aq267-contract-workspace');
 for(const [id,name]of [['aq267-contract-template-css','contract-template-studio'],['aq267-contract-workspace-css','contract-workspace']]){
  if(!document.getElementById(id)){const css=node('link');css.id=id;css.rel='stylesheet';css.href=`/src/v267/styles/${name}.css?release=V267`;document.head.append(css);}
 }
 let logoUrl=null,epoch=0;d.onDispose(()=>{epoch++;if(logoUrl)URL.revokeObjectURL(logoUrl);});
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';
 async function load(){
  try{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const service=createTemplateLogoContext(d.session),properties=await service.listProperties();d.session.check();
  if(propertyId&&!properties.some(p=>p.id===propertyId))throw Error('العقار المحدد غير متاح ضمن مساحة العمل الحالية.');
  const chrome=node('section'),identity=node('header'),names=node('div'),name=node('h3',t('اختر العقار')),select=node('select'),logo=node('button'),logoInput=node('input'),tabs=node('nav'),upload=node('button',t('رفع عقد جاهز')),hint=node('p',t('تصوير أو صور أو PDF')),area=node('section'),files=node('section'),archive=node('button',t('العقود المحفوظة'));
  chrome.className='aq267-contract-chrome';identity.className='aq267-contract-identity';names.className='aq267-contract-property';select.name='contract_property';logo.className='aq267-contract-logo';logo.type='button';logo.textContent=t('إضافة شعار العقار');logoInput.type='file';logoInput.accept='image/png,image/jpeg,image/webp';logoInput.hidden=true;
  for(const p of [{id:'',name:t('اختر العقار')},...properties]){const option=node('option',p.name);option.value=p.id;select.append(option);}select.value=propertyId||'';const propertyChoice=field(t('العقار'),select);propertyChoice.className+=' aq267-contract-property-choice';names.append(name,propertyChoice);identity.append(logo,names,logoInput);tabs.className='aq267-contract-tabs';tabs.setAttribute('aria-label',t('العقود والمستندات'));upload.type=archive.type='button';upload.className='aq267-contract-upload';hint.className='aq267-contract-upload-hint';archive.className='aq267-contract-archive-link';files.className='aq267-contract-files';files.hidden=true;
  chrome.append(identity,tabs,upload,hint);d.body.replaceChildren(chrome,area,files,archive);
  const manager=await mountRentalTemplateManager(d,area,{propertyId,section:'contracts',referenceLayout:true,onBack:onBack?()=>{d.close();return onBack();}:undefined});
  let mode='contracts';const tabButtons=[];
  const show=async(value)=>{
   mode=value;for(const button of tabButtons)button.setAttribute('aria-current',button.dataset.section===value?'page':'false');
   area.hidden=value==='archive'||value==='upload';files.hidden=!area.hidden;archive.hidden=area.hidden;
   if(!area.hidden){manager.setSection(value);return;}
   const ticket=++epoch;files.replaceChildren(node('p',t('جارٍ التحميل…')));
   const content=node('div');await mountPropertyContractUpload(d,content,{propertyId,archiveOnly:value==='archive',onBack:()=>d.run(()=>show('contracts'))});d.session.check();if(ticket===epoch)files.replaceChildren(content);
  };
  for(const [value,label]of [['contracts','العقود'],['documents','المستندات'],['archive','الأرشيف']]){const button=node('button',t(label));button.type='button';button.dataset.section=value;button.onclick=()=>d.run(()=>show(value));tabs.append(button);tabButtons.push(button);}
  async function refreshIdentity(){
   const ticket=++epoch;name.textContent=properties.find(p=>p.id===propertyId)?.name||t('اختر العقار');logo.replaceChildren(node('span',t('إضافة شعار العقار')));logo.disabled=!propertyId;
   if(logoUrl){URL.revokeObjectURL(logoUrl);logoUrl=null;}if(!propertyId)return;
   const saved=await service.loadLogo(propertyId);d.session.check();if(ticket!==epoch)return;
   if(saved){logoUrl=URL.createObjectURL(saved.blob);const image=node('img');image.src=logoUrl;image.alt=t('شعار العقار');logo.replaceChildren(image,node('span',t('تغيير الشعار')));}
  }
  select.onchange=()=>d.run(async()=>{propertyId=select.value||null;manager.setProperty(propertyId);await refreshIdentity();await show(mode);});
  logo.onclick=()=>logoInput.click();logoInput.onchange=()=>d.run(async()=>{const file=logoInput.files?.[0],id=propertyId;if(!file||!id)return;logo.disabled=select.disabled=true;try{await service.uploadLogo(id,file);logoInput.value='';await refreshIdentity();d.status.textContent=t('تم حفظ شعار العقار.');}finally{logo.disabled=!propertyId;select.disabled=false;}});
  upload.onclick=()=>d.run(()=>show('upload'));archive.onclick=()=>d.run(()=>show('archive'));
  await refreshIdentity();await show(initialSection==='documents'?'documents':'contracts');if(initialDocumentKind)manager.openStarter(initialDocumentKind);
  }catch(error){if(!Array.from(d.body.children).includes(retry))d.body.prepend(retry);throw error;}
 }
 retry.onclick=()=>d.run(load);d.body.append(retry);d.run(load);return true;
}
