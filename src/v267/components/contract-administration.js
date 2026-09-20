import {node,field} from './dialog.js';
import {t} from './locale.js';
export async function contractAdministration(d,action,data={}){
 const response=await d.session.request(d.session.client.rpc('aqari_contract_administration',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));d.session.check();
 if(response?.workspace_id!==d.session.bound.workspace||response?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد صلاحية ونتيجة العملية.');
 return response.result;
}
export const signatureLabel=status=>t({complete:'مكتمل التواقيع',missing_signature:'ناقص توقيع',unverified:'التواقيع غير موثقة',outdated_copy:'يلزم رفع نسخة موقعة للتعديل الحالي'}[status]||'التواقيع غير موثقة');
export async function mountSignatureReview(d,target,documentId){
 const state=await contractAdministration(d,'signature_status',{document_id:documentId});
 const status=node('p',t('حالة التواقيع')+': '+signatureLabel(state.status));target.append(status);
 if(d.session.bound.role!=='general_manager')return;
 const form=node('form'),required=node('textarea'),checks=node('div'),save=node('button',t('حفظ مراجعة التواقيع'));let signers=state.required_signers||['tenant','landlord'],controls=[],pending=null;
 required.value=signers.filter(x=>!['tenant','landlord'].includes(x)).join('\n');required.maxLength=1500;
 function draw(){checks.replaceChildren();controls=signers.map(key=>{const check=node('input');check.type='checkbox';check.checked=(state.signed_by||[]).includes(key);check.onchange=()=>{pending=null;};checks.append(field(t(key==='tenant'?'توقيع المستأجر موجود':key==='landlord'?'توقيع المؤجر موجود':key),check));return {key,check};});}
 required.oninput=()=>{pending=null;signers=[...new Set(['tenant','landlord',...required.value.split('\n').map(x=>x.trim()).filter(Boolean)])];draw();};draw();save.type='submit';
 form.append(node('p',t('راجع التواقيع الفعلية في الملف. رفع الملف أو تأكيد خانة لا ينشئ توقيعًا.')),field(t('أطراف إضافية يلزم توقيعها — طرف في كل سطر'),required),checks,save);target.append(form);
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  pending||={id:crypto.randomUUID(),document_id:documentId,required_signers:signers,signed_by:controls.filter(x=>x.check.checked).map(x=>x.key)};
  required.disabled=true;for(const x of controls)x.check.disabled=true;
  const saved=await contractAdministration(d,'review_signatures',pending);const verified=await contractAdministration(d,'signature_status',{document_id:documentId});
  if(saved.id!==pending.id||verified.id!==saved.id)throw Error('لم تتأكد إعادة قراءة مراجعة التواقيع.');
  pending=null;required.disabled=false;for(const x of controls)x.check.disabled=false;Object.assign(state,verified);status.textContent=t('حالة التواقيع')+': '+signatureLabel(verified.status);d.status.textContent=t('حُفظت مراجعة التواقيع.');
 });};
}
export function mountContractChangeRequest(d,target,contractRef){
 const form=node('form'),reason=node('textarea'),save=node('button',t('إرسال طلب تعديل إلى المدير'));let pending=null;
 reason.required=true;reason.minLength=3;reason.maxLength=4000;save.type='submit';reason.oninput=()=>{pending=null;};
 form.append(field(t('التعديل المطلوب وسببه'),reason),save);target.append(form);
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  pending||={id:crypto.randomUUID(),contract_ref:String(contractRef),proposed_change:reason.value.trim()};
  reason.disabled=true;
  const saved=await contractAdministration(d,'request_change',pending);
  if(saved.id!==pending.id||saved.proposed_change!==pending.proposed_change)throw Error('لم يتأكد حفظ طلب التعديل.');
  const requests=await contractAdministration(d,'requests');if(!requests.some(x=>x.id===pending.id))throw Error('لم تتأكد إعادة قراءة الطلب.');
  pending=null;reason.value='';reason.disabled=false;d.status.textContent=t('حُفظ الطلب بانتظار المدير. لم يتغير العقد.');
 });};
}
