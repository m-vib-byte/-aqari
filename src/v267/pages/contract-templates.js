import {createDialog,node} from '../components/dialog.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {t} from '../components/locale.js';

// Dedicated manager entry. The RPC independently verifies current membership.
export function openContractTemplates(){
 const d=createDialog(t('نماذج العقود — المدير العام'));if(!d)return false;
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';
 const load=async()=>{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  d.body.replaceChildren(retry);
  await mountRentalTemplateManager(d,d.body);
 };retry.onclick=()=>d.run(load);d.body.append(retry);d.run(load);return true;
}
