import {node} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {mountPropertyContractUpload} from '../components/property-contract-upload.js';
import {t} from '../components/locale.js';

// Keep the editable template library separate from immutable property documents.
export function openContractTemplates({propertyId=null,onBack}={}){
 const d=createPage(t('نماذج العقود — المدير العام'));if(!d)return false;
 d.el.classList.add('aq267-contract-template-dialog');
 if(!document.getElementById('aq267-contract-template-css')){const css=document.createElement('link');css.id='aq267-contract-template-css';css.rel='stylesheet';css.href='/src/v267/styles/contract-template-studio.css?release=V267';document.head.append(css);}
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';
 const load=async(mode='library')=>{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  const area=node('section');
  if(mode==='property-file'){
   const library=node('button',t('العودة إلى مكتبة النماذج'));library.type='button';
   library.onclick=()=>d.run(()=>load('library'));
   d.body.replaceChildren(retry,library,area);
   await mountPropertyContractUpload(d,area,{propertyId,onBack:()=>d.run(()=>load('library'))});
  }else{
   const propertyFile=node('button',t('رفع ملف عقد للعقار — أرشفة فقط'));propertyFile.type='button';
   propertyFile.onclick=()=>d.run(()=>load('property-file'));
   d.body.replaceChildren(retry,propertyFile,area);
   await mountRentalTemplateManager(d,area,{propertyId,onBack:onBack?()=>{d.close();return onBack();}:undefined});
  }
 };
 retry.onclick=()=>d.run(()=>load());d.body.append(retry);d.run(()=>load());return true;
}
