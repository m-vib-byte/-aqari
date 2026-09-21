import {node} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {t} from '../components/locale.js';

// Dedicated manager entry. The RPC independently verifies current membership.
export function openContractTemplates({propertyId=null,onBack}={}){
 const d=createPage(t('نماذج العقود — المدير العام'));if(!d)return false;
 d.el.classList.add('aq267-contract-template-dialog');
 if(!document.getElementById('aq267-contract-template-css')){const css=document.createElement('link');css.id='aq267-contract-template-css';css.rel='stylesheet';css.href='/src/v267/styles/contract-template-studio.css?release=V267';document.head.append(css);}
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';
 const load=async()=>{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  d.body.replaceChildren(retry);
  await mountRentalTemplateManager(d,d.body,{propertyId,onBack:onBack?()=>{d.close();return onBack();}:undefined});
 };retry.onclick=()=>d.run(load);d.body.append(retry);d.run(load);return true;
}
