import {node} from './dialog.js';
import {uiText} from './ui-text.js';

export function partnerFils(value){
 const amount=BigInt(value),absolute=amount<0n?-amount:amount;
 return (amount<0n?'-':'')+(absolute/1000n).toString()+'.'+(absolute%1000n).toString().padStart(3,'0');
}

// The partner endpoint returns this account's allocation only. Never load staff
// summaries, the source approval, owner mappings or another owner's allocation.
export function partnerDistributionView(data){
 const section=node('section');section.id='partnerDistributions';
 section.append(uiText('h2','مستحقاتي المعتمدة'),uiText('p','توزيعات الإيجارات والمصروفات والاحتياطي التي اعتمدتها الإدارة؛ لا تعني تنفيذ تحويل بنكي.'));
 if(!data){section.append(uiText('p','تعذر استرجاع التوزيعات حاليًا. أعد تحديث البيانات.'));return section;}
 if(!data.entries.length){section.append(uiText('p','لا توجد توزيعات معتمدة لحسابك في هذا الشهر.'));return section;}
 const total=node('dl');total.append(uiText('dt','صافي مستحقاتي المسجلة — د.ك'),node('dd',partnerFils(data.balance_fils)));section.append(total);
 for(const row of data.entries){
  const card=node('article'),details=node('dl');
  card.append(uiText('h3',row.kind==='reversal'?'عكس توزيع سابق':'توزيع معتمد'));
  for(const [label,value] of [['اسم صاحب الحصة',row.name],['نسبة الحصة في النسخة المعتمدة',(row.bps/100).toFixed(2)+'%'],['تاريخ التسجيل',row.occurred_on],['المبلغ بالدينار الكويتي',partnerFils(row.amount_fils)],['مرجع القيد',row.id]])details.append(uiText('dt',label),node('dd',value));
  if(row.reverses_id)details.append(uiText('dt','مرجع التوزيع الأصلي'),node('dd',row.reverses_id));
  card.append(details);section.append(card);
 }
 return section;
}
