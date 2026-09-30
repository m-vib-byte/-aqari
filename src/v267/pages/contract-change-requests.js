import {createDialog,node,field} from '../components/dialog.js';
import {contractAdministration} from '../components/contract-administration.js';
import {t} from '../components/locale.js';
export function openContractChangeRequests(){
 const d=createDialog(t('طلبات تعديل العقود'));if(!d)return false;
 const retry=node('button',t('إعادة المحاولة'));retry.type='button';retry.onclick=()=>d.run(load);d.body.append(retry);
 async function load(){
  const rows=await contractAdministration(d,'requests');d.body.replaceChildren(node('p',t('اعتماد الطلب يسجل قرار المدير. تنفيذ التعديل يتم من ملف العقد مع بقاء السجل السابق.')));
  if(!rows.length)d.body.append(node('p',t('لا توجد طلبات تعديل.')));
  for(const row of rows){const card=node('section');card.append(node('p',row.proposed_change),node('p',t({pending:'بانتظار المدير',approved:'طلب معتمد',rejected:'طلب مرفوض'}[row.status])));
   if(d.session.bound.role==='general_manager'&&row.status==='pending'){const reason=node('textarea');reason.maxLength=500;card.append(field(t('سبب القرار'),reason));for(const [state,label]of [['approved','اعتماد الطلب'],['rejected','رفض الطلب']]){const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(async()=>{if(reason.value.trim().length<3)throw Error('اكتب سبب القرار.');const saved=await contractAdministration(d,'decide_request',{id:row.id,status:state,reason:reason.value.trim()});if(saved.id!==row.id||saved.status!==state)throw Error('لم يتأكد القرار.');await load();});card.append(b);}}
   d.body.append(card);
  }
 }
 d.run(load);return true;
}
