// Categories describe the document; they never infer its authenticity or payment.
export const DOCUMENT_CATEGORIES=Object.freeze({
 owner_identity:{label:'هوية المالك',entities:['property']},
 landlord_identity:{label:'هوية المؤجر',entities:['property','lease']},
 tenant_identity:{label:'هوية المستأجر',entities:['tenant','lease']},
 company_registration:{label:'السجل التجاري',entities:['property','tenant','lease']},
 power_of_attorney:{label:'وكالة أو توكيل رسمي',entities:['property','tenant','lease']},
 title_deed:{label:'وثيقة الملكية',entities:['property']},
 site_plan:{label:'مخطط المسح أو كروكي العقار',entities:['property']},
 electricity_service:{label:'اشتراك أو فاتورة الكهرباء',entities:['property','lease']},
 water_service:{label:'اشتراك أو فاتورة المياه',entities:['property','lease']},
 gas_service:{label:'اشتراك أو فاتورة الغاز',entities:['property','lease']},
 internet_service:{label:'اشتراك أو فاتورة الإنترنت',entities:['property','lease']},
 signed_lease:{label:'عقد إيجار موقع',entities:['lease']},
 lease_addendum:{label:'ملحق عقد الإيجار',entities:['lease']},
 payment_receipt:{label:'سند قبض',entities:['lease']},
 cheque:{label:'صورة شيك',entities:['lease']},
 bank_transfer:{label:'إيصال تحويل بنكي',entities:['lease']},
 exit_inspection:{label:'محضر معاينة واستلام عند الإخلاء',entities:['lease']},
 utility_clearance:{label:'براءة ذمة خدمات الكهرباء والمياه والصرف الصحي',entities:['lease']},
 exit_notice:{label:'إشعار إخلاء رسمي',entities:['lease']},
 amicable_settlement:{label:'اتفاقية تصفية ودية',entities:['lease']},
 damage_invoice:{label:'فاتورة أو سند صيانة أضرار الإخلاء',entities:['lease']}
});
export function documentCategory(category,entity){
 const spec=DOCUMENT_CATEGORIES[category];if(!spec||!spec.entities.includes(entity))throw Error('اختر نوع مستند مناسباً للسجل المرتبط.');
 return {category,documentType:category==='signed_lease'?'signed_contract':'supporting_document',label:spec.label};
}
