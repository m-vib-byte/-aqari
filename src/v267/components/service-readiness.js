import {t} from './locale.js';
import {uiError} from './ui-error.js';

// Only known schema failures get a setup message. Authentication, network and
// business errors retain their original identity and normal session handling.
export function serviceReadinessError(error,rpc){
 const message=String(error?.message||'');
 const missingFunction=['PGRST202','42883'].includes(error?.code)&&
  new RegExp('\\b'+rpc+'\\b').test(message);
 const missingColumn=error?.code==='42703'&&(
  (rpc==='aqari_property_cost_allocation'&&/^column m\.area_sqm does not exist$/.test(message))||
  (rpc==='aqari_property_controls'&&/^column m\.type does not exist$/.test(message)));
 if(missingFunction||missingColumn)return uiError(t('هذه الخدمة تحتاج استكمال تهيئتها قبل الاستخدام. أعد المحاولة بعد اكتمال التهيئة.'));
 return error;
}
