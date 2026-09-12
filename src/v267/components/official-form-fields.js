import {OFFICIAL_FORM_TEMPLATES} from './document-catalog.js';

const labels={documentNo:'رقم المستند',issuedAt:'تاريخ الإصدار',tenantName:'اسم المستأجر',propertyName:'اسم العقار',unitNo:'رقم الوحدة',contractNo:'رقم العقد',period:'فترة الإيجار',amount:'المبلغ (د.ك)',paymentMethod:'طريقة الدفع',paymentReference:'مرجع الدفع',collectorName:'اسم المحصل',reason:'سبب الحركة',approvedBy:'اسم المعتمد',fromDate:'من تاريخ',toDate:'إلى تاريخ',openingBalance:'الرصيد الافتتاحي (د.ك)',charges:'المطلوب (د.ك)',payments:'المدفوع (د.ك)',credits:'التسويات الدائنة (د.ك)',closingBalance:'الرصيد الختامي (د.ك)',dueAmount:'المستحق الفعلي (د.ك)',dueDate:'تاريخ الاستحقاق',graceDeadline:'آخر مهلة للسداد',currentEndDate:'تاريخ انتهاء العقد',responseDeadline:'آخر موعد للرد',vacateDate:'تاريخ الإخلاء',receivedFrom:'استلمنا من',reference:'المرجع',paidTo:'المستفيد من الصرف',expenseCategory:'بند المصروف',vendorName:'اسم المقاول',description:'وصف الأعمال',approvedAmount:'المبلغ المعتمد (د.ك)',invoiceReference:'مرجع الفاتورة',keyCount:'عدد المفاتيح',deliveredBy:'اسم المسلّم',receivedBy:'اسم المستلم',inspectionReference:'مرجع المعاينة',damageSummary:'وصف الأضرار',estimatedAmount:'التكلفة التقديرية (د.ك)',rentBalance:'رصيد الإيجار (د.ك)',damageBalance:'رصيد الأضرار (د.ك)',utilityBalance:'رصيد الخدمات (د.ك)',legalBalance:'رصيد القضايا (د.ك)',depositBalance:'رصيد التأمين (د.ك)',netBalance:'صافي التسوية (د.ك)',settlementReference:'مرجع التسوية',collectionDate:'تاريخ التحصيل',receiptCount:'عدد الوصولات',totalAmount:'إجمالي التحصيل (د.ك)',preparedBy:'اسم معدّ الكشف'};
const dates=new Set(['issuedAt','fromDate','toDate','dueDate','graceDeadline','currentEndDate','responseDeadline','vacateDate','collectionDate']);
const money=new Set(['amount','openingBalance','charges','payments','credits','closingBalance','dueAmount','approvedAmount','estimatedAmount','rentBalance','damageBalance','utilityBalance','legalBalance','depositBalance','netBalance','totalAmount']);
const signed=new Set(['openingBalance','closingBalance','netBalance']);
export const OFFICIAL_FORM_FIELDS=Object.freeze(Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,Object.freeze({label,type:dates.has(key)?'date':key==='period'?'month':money.has(key)||['keyCount','receiptCount'].includes(key)?'decimal':'text',multiline:['description','damageSummary','reason'].includes(key),maxLength:5000})])));

export function officialFields(kind){
 const template=OFFICIAL_FORM_TEMPLATES[kind];if(!template)throw Error('نوع النموذج غير معتمد.');
 return template.required.map(key=>({key,...OFFICIAL_FORM_FIELDS[key]}));
}
export function validateOfficialValues(kind,values){
 const result={};
 for(const {key,label,type}of officialFields(kind)){
  const value=String(values[key]??'').trim();
  if(!value)throw Error('أكمل الحقل: '+label);
  if(value.length>5000)throw Error('تجاوز طول الحقل المسموح: '+label);
  if(type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw Error('التاريخ غير صحيح: '+label);
  if(type==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw Error('فترة الإيجار غير صحيحة.');
  if(money.has(key)&&(!(signed.has(key)?/^-?\d{1,12}(\.\d{1,3})?$/:/^\d{1,12}(\.\d{1,3})?$/).test(value)))throw Error('أدخل مبلغاً صحيحاً حتى ثلاث منازل عشرية: '+label);
  if(['keyCount','receiptCount'].includes(key)&&!/^\d{1,7}$/.test(value))throw Error('أدخل عدداً صحيحاً: '+label);
  result[key]=value;
 }
 if(result.fromDate&&result.toDate&&result.fromDate>result.toDate)throw Error('تاريخ بداية الكشف بعد نهايته.');
 if(result.dueDate&&result.graceDeadline&&result.dueDate>result.graceDeadline)throw Error('مهلة السداد تسبق الاستحقاق.');
 if(result.dueAmount&&Number(result.dueAmount)<=0)throw Error('لا يصدر إشعار مديونية دون مبلغ مستحق فعلي.');
 return result;
}
