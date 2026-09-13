import {node} from './dialog.js';
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
export function validRenewalSource(source){return !!source&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source.lease_id)&&['contract_ref','contract_no','tenant_ref','property','unit'].every(k=>typeof source[k]==='string'&&source[k].length>0)&&datePattern.test(source.start_date)&&datePattern.test(source.end_date)&&source.start_date<=source.end_date&&/^[0-9a-f]{64}$/.test(source.snapshot_sha256);}
export async function loadLeaseRenewal(d,contractRef){
 const result=await d.session.request(d.session.client.rpc('aqari_lease_renewal_context',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(contractRef)}));d.session.check();
 if(result?.workspace_id!==d.session.bound.workspace||result?.user_id!==d.session.bound.user)throw Error('تعذر التحقق من مساحة عمل التجديد.');
 if(result.can_prepare!==true)throw Error(result.reason||'العقد غير متاح لإعداد تجديد.');
 if(!validRenewalSource(result.source)||result.source.contract_ref!==String(contractRef)||!datePattern.test(result.suggestedStart)||result.suggestedStart<=result.source.end_date)throw Error('تعذر التحقق من بيانات العقد السابق.');
 return {source:structuredClone(result.source),suggestedStart:result.suggestedStart};
}
export function renewalSummary(context){
 if(!validRenewalSource(context?.source))throw Error('بيانات أصل التجديد غير مكتملة.');
 const section=node('section');section.append(node('h3','تجديد بعقد جديد مرتبط بالأصل'),node('p','العقد السابق: '+context.source.contract_no+' · نهاية المدة: '+context.source.end_date),node('p','يبقى العقد السابق وسجله المالي والتأمين محفوظين عليه. لا تنقل هذه العملية أي رصيد أو دفعة أو تأمين. راجع المبالغ والاستحقاق والقالب الجديد قبل اعتماد العقد.'));
 return section;
}
