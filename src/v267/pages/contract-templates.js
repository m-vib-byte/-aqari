import {node} from '../components/dialog.js';
import {createPage} from '../components/page.js';
import {mountPropertyContractUpload} from '../components/property-contract-upload.js';
import {t} from '../components/locale.js';

// Dedicated manager entry. The RPC independently verifies current membership.
export function openContractTemplates({propertyId=null,onBack}={}){
 const d=createPage(t('رفع عقد العقار'));if(!d)return false;
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';
 const load=async()=>{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  d.body.replaceChildren(retry);
  await mountPropertyContractUpload(d,d.body,{propertyId,onBack:onBack?()=>{d.close();return onBack();}:undefined});
 };retry.onclick=()=>d.run(load);d.body.append(retry);d.run(load);return true;
}
