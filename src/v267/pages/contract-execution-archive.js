import {createPage} from '../components/page.js';
import {node} from '../components/dialog.js';
import {t} from '../components/locale.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {readContractExecutionPdf} from './contract-execution.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Reopen the immutable execution copies. This path never submits a settlement,
// reserves a number, or changes the lease state.
export function openContractExecutionArchive({contractRef,contractNo,workspaceId,userId,onBack}){
 const d=createPage(t('مستندات الإبرام المؤرشفة'));if(!d)return false;
 const urls=createPrivateUrls(d),choices=node('section'),output=node('section');let current=null;
 function check(){
  d.session.check();
  if(d.closed||d.session.bound.workspace!==workspaceId||d.session.bound.user!==userId)throw Object.assign(Error('ACCESS_DENIED'),{status:403});
  if(typeof contractRef!=='string'||!contractRef.trim()||typeof contractNo!=='string'||!contractNo.trim())throw Error('تعذر تأكيد ربط مستندات الإبرام بهذا العقد.');
 }
 const clear=()=>{urls.clear();output.replaceChildren();};
 function button(label,task){const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(task);return b;}
 async function read(){
  check();
  const row=await d.session.request(d.session.client.rpc('aqari_contract_execution_artifacts',{p_workspace_id:workspaceId,p_contract_ref:contractRef}));check();
  const receipt=row?.rent_receipt_no??'',sequence=row?.contract_receipt_sequence??null;
  if(row?.contract_no!==contractNo||!uuid(row?.settlement_id)||!uuid(row?.tenant_document_id)||!uuid(row?.owner_document_id)||row.tenant_document_id===row.owner_document_id||
   (receipt?(!/^AQ-R-\d{4}-\d{8,}$/.test(receipt)||!Number.isSafeInteger(sequence)||sequence<1):sequence!==null))throw Error('تعذر تأكيد ربط مستندات الإبرام بهذا العقد.');
  return {settlement:row.settlement_id,contract:row.contract_no,tenant:row.tenant_document_id,owner:row.owner_document_id,receipt,sequence};
 }
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function prepare(key,label){
  clear();check();const expected=current;if(!expected||!expected[key])throw Error('تعذر تأكيد ربط مستندات الإبرام بهذا العقد.');
  if(!same(await read(),expected))throw Error('تغير ربط مستندات العقد؛ أعد تحميل الأرشيف.');
  const path=key==='receipt'?'/api/rent-receipt':'/api/official-document';
  const body=key==='receipt'?{workspaceId,receiptNo:expected.receipt}:{workspaceId,documentId:expected[key],version:1};
  const {blob}=await readContractExecutionPdf(d.session,path,body);check();
  if(!same(await read(),expected))throw Error('تغير ربط مستندات العقد؛ أعد تحميل الأرشيف.');
  const link=node('a',t(label));link.href=urls.create(blob);link.download=key==='receipt'?'rent-receipt-'+expected.receipt+'.pdf':'contract-'+contractRef+'-'+key+'.pdf';link.rel='noopener';link.className='is-primary';output.append(link);
  d.status.textContent=t('تم التحقق من الملف المؤرشف. يمكنك تنزيله.');
 }
 async function load(){
  clear();choices.replaceChildren();current=null;current=await read();
  for(const [key,label]of [['tenant','نسخة المستأجر — PDF رسمي مؤرشف'],['owner','نسخة المالك / الإدارة — PDF رسمي مؤرشف']])choices.append(button(label,()=>prepare(key,label)));
  if(current.receipt){choices.append(node('p',t('وصل الإيجار الرسمي: ')+current.receipt),button('تنزيل وصل الإيجار المؤرشف',()=>prepare('receipt','تنزيل وصل الإيجار المؤرشف')));}
  else choices.append(node('p',t('لا يوجد وصل إيجار ضمن مستندات إبرام هذا العقد.')));
 }
 d.body.append(node('p',t('العقد: ')+contractNo),node('p',t('استرجاع نسختي المالك والمستأجر ووصل الإبرام المحفوظ عند وجوده.')));
 if(typeof onBack==='function')d.body.append(button('العودة إلى العقد',()=>{check();d.close();return onBack();}));
 d.body.append(button('إعادة تحميل مستندات الإبرام',load),choices,output);
 d.run(load);return true;
}
