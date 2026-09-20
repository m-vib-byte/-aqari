import {createDialog} from '../components/dialog.js';
import {mountRentalTemplateManager} from '../components/rental-templates.js';
import {t} from '../components/locale.js';

// Dedicated manager entry. The RPC independently verifies current membership.
export function openContractTemplates(){
 const d=createDialog(t('نماذج العقود — المدير العام'));if(!d)return false;
 d.run(async()=>{
  if(d.session.bound.role!=='general_manager')throw Object.assign(Error('ACCESS_DENIED'),{code:'42501'});
  await mountRentalTemplateManager(d,d.body);
 });return true;
}
