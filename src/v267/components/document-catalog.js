// Categories describe the document; they never infer authenticity, payment, legal approval or delivery.
export const DOCUMENT_CATEGORIES=Object.freeze({
 owner_identity:{label:'هوية المالك',entities:['property']},
 landlord_identity:{label:'هوية المؤجر',entities:['property','lease']},
 tenant_identity:{label:'هوية المستأجر',entities:['tenant','lease']},
 company_registration:{label:'السجل التجاري',entities:['property','tenant','lease','vendor']},
 power_of_attorney:{label:'وكالة أو توكيل رسمي',entities:['property','tenant','lease']},
 title_deed:{label:'وثيقة الملكية',entities:['property']},
 site_plan:{label:'مخطط المسح أو كروكي العقار',entities:['property']},
 floor_plan:{label:'مخطط معماري أو مخطط وحدة',entities:['property','unit']},
 building_license:{label:'رخصة البناء',entities:['property']},
 fire_certificate:{label:'شهادة أنظمة الإطفاء والسلامة',entities:['property']},
 elevator_certificate:{label:'شهادة فحص المصعد',entities:['property']},
 commercial_license:{label:'رخصة النشاط التجاري',entities:['tenant','lease']},
 electricity_service:{label:'اشتراك أو فاتورة الكهرباء',entities:['property','lease']},
 water_service:{label:'اشتراك أو فاتورة المياه',entities:['property','lease']},
 gas_service:{label:'اشتراك أو فاتورة الغاز',entities:['property','lease']},
 internet_service:{label:'اشتراك أو فاتورة الإنترنت',entities:['property','lease']},
 meter_reading:{label:'صورة وقراءة عداد',entities:['property','unit','lease']},
 signed_lease:{label:'عقد إيجار موقع',entities:['lease']},
 lease_addendum:{label:'ملحق عقد الإيجار',entities:['lease']},
 payment_receipt:{label:'وصل إيجار',entities:['lease']},
 deposit_receipt:{label:'وصل تأمين',entities:['lease']},
 deposit_refund:{label:'سند رد تأمين',entities:['lease']},
 cheque:{label:'صورة شيك',entities:['lease']},
 bank_transfer:{label:'إيصال تحويل بنكي',entities:['lease']},
 payment_gateway_receipt:{label:'إثبات دفع إلكتروني',entities:['lease']},
 tenant_statement:{label:'كشف حساب مستأجر',entities:['tenant','lease']},
 debt_notice:{label:'إشعار مديونية',entities:['tenant','lease']},
 renewal_notice:{label:'إشعار تجديد',entities:['tenant','lease']},
 nonrenewal_notice:{label:'إشعار عدم تجديد',entities:['tenant','lease']},
 exit_inspection:{label:'محضر معاينة واستلام عند الإخلاء',entities:['unit','lease']},
 key_handover:{label:'محضر تسليم واستلام مفاتيح',entities:['unit','lease']},
 utility_clearance:{label:'براءة ذمة خدمات الكهرباء والمياه والصرف الصحي',entities:['lease']},
 exit_notice:{label:'إشعار إخلاء رسمي',entities:['lease']},
 final_settlement:{label:'تسوية نهائية',entities:['lease']},
 clearance:{label:'براءة ذمة',entities:['tenant','lease']},
 amicable_settlement:{label:'اتفاقية تصفية ودية',entities:['lease','legal_case']},
 damage_report:{label:'محضر أضرار',entities:['unit','lease']},
 damage_invoice:{label:'فاتورة أو سند صيانة أضرار الإخلاء',entities:['lease','work_order']},
 vendor_contract:{label:'عقد مورد أو مقاول',entities:['property','vendor']},
 work_order:{label:'أمر شغل',entities:['property','work_order']},
 work_invoice:{label:'فاتورة إنجاز أمر شغل',entities:['property','work_order']},
 expense_approval:{label:'اعتماد مصروف',entities:['property','work_order']},
 legal_filing:{label:'مذكرة أو مستند قضية',entities:['lease','legal_case']},
 judgment:{label:'حكم قضائي',entities:['lease','legal_case']},
 salary_slip:{label:'كشف أو سند راتب',entities:['employee']},
 daily_collection:{label:'كشف التحصيل اليومي',entities:['property']},
 inspection_signature:{label:'توقيع نموذج المعاينة',entities:['unit','lease']}
});

const TEMPLATES={
 rent_receipt:{title:'وصل إيجار',prefix:'RENT',required:['documentNo','issuedAt','tenantName','propertyName','unitNo','contractNo','period','amount','paymentMethod','paymentReference','collectorName'],body:'نشهد باستلام مبلغ {{amount}} د.ك من السيد/السيدة {{tenantName}} عن إيجار الوحدة {{unitNo}} في {{propertyName}} عن الفترة {{period}}، بموجب العقد رقم {{contractNo}} وطريقة السداد {{paymentMethod}} والمرجع {{paymentReference}}.'},
 deposit_receipt:{title:'وصل تأمين',prefix:'DEPOSIT',required:['documentNo','issuedAt','tenantName','propertyName','unitNo','contractNo','amount','paymentMethod','collectorName'],body:'نشهد باستلام مبلغ {{amount}} د.ك كتأمين مستقل عن الأجرة للوحدة {{unitNo}} في {{propertyName}}، مرتبطاً بالعقد رقم {{contractNo}}.'},
 deposit_refund:{title:'سند رد تأمين',prefix:'DEP-REF',required:['documentNo','issuedAt','tenantName','contractNo','amount','reason','approvedBy'],body:'تم رد مبلغ التأمين وقدره {{amount}} د.ك إلى {{tenantName}} عن العقد رقم {{contractNo}}، بعد اعتماد التسوية، وسبب الحركة: {{reason}}.'},
 tenant_statement:{title:'كشف حساب مستأجر',prefix:'STMT',required:['documentNo','issuedAt','tenantName','contractNo','fromDate','toDate','openingBalance','charges','payments','credits','closingBalance'],body:'كشف حساب للفترة من {{fromDate}} إلى {{toDate}}. الرصيد الافتتاحي {{openingBalance}} د.ك، المطلوب {{charges}} د.ك، المدفوع {{payments}} د.ك، والتسويات الدائنة {{credits}} د.ك، والمتبقي {{closingBalance}} د.ك.'},
 debt_notice:{title:'إشعار مديونية',prefix:'DEBT',required:['documentNo','issuedAt','tenantName','contractNo','dueAmount','dueDate','graceDeadline'],body:'يرجى سداد المبلغ المستحق وقدره {{dueAmount}} د.ك عن العقد رقم {{contractNo}}، المستحق بتاريخ {{dueDate}}، في موعد أقصاه {{graceDeadline}}. هذا الإشعار مبني على الرصيد الفعلي وقت الإصدار.'},
 renewal_notice:{title:'إشعار تجديد عقد',prefix:'RENEW',required:['documentNo','issuedAt','tenantName','contractNo','currentEndDate','responseDeadline'],body:'نفيدكم بقرب انتهاء العقد رقم {{contractNo}} بتاريخ {{currentEndDate}}. يرجى تسجيل قرار التجديد قبل {{responseDeadline}}، ولا يعد هذا الإشعار عقداً جديداً.'},
 nonrenewal_notice:{title:'إشعار عدم تجديد',prefix:'NONRENEW',required:['documentNo','issuedAt','tenantName','contractNo','currentEndDate','vacateDate'],body:'نفيدكم بعدم تجديد العقد رقم {{contractNo}} بعد انتهائه بتاريخ {{currentEndDate}}، ويرجى استكمال إجراءات التسليم والإخلاء في موعد {{vacateDate}} وفق التسوية النهائية.'},
 receipt_voucher:{title:'سند قبض',prefix:'RV',required:['documentNo','issuedAt','receivedFrom','amount','reason','paymentMethod','reference','collectorName'],body:'استلمنا من {{receivedFrom}} مبلغاً وقدره {{amount}} د.ك، وذلك عن {{reason}}، بطريقة {{paymentMethod}}، مرجع {{reference}}.'},
 payment_voucher:{title:'سند صرف',prefix:'PV',required:['documentNo','issuedAt','paidTo','amount','reason','expenseCategory','approvedBy'],body:'صُرف إلى {{paidTo}} مبلغ وقدره {{amount}} د.ك عن {{reason}}، تحت بند {{expenseCategory}}، بعد اعتماد {{approvedBy}}.'},
 work_order:{title:'أمر شغل',prefix:'WO',required:['documentNo','issuedAt','propertyName','vendorName','description','approvedAmount','approvedBy'],body:'يُكلف المقاول {{vendorName}} بتنفيذ الأعمال التالية في {{propertyName}}: {{description}}. الحد المالي المعتمد {{approvedAmount}} د.ك، ولا تعتمد الفاتورة قبل إثبات الإنجاز.'},
 expense_approval:{title:'اعتماد مصروف',prefix:'EXP',required:['documentNo','issuedAt','propertyName','expenseCategory','amount','invoiceReference','approvedBy'],body:'اعتمد المصروف بمبلغ {{amount}} د.ك على العقار {{propertyName}}، بند {{expenseCategory}}، فاتورة/مرجع {{invoiceReference}}، واعتماد {{approvedBy}}.'},
 key_handover:{title:'محضر تسليم واستلام مفاتيح',prefix:'KEYS',required:['documentNo','issuedAt','tenantName','propertyName','unitNo','keyCount','deliveredBy','receivedBy'],body:'تم تسليم واستلام عدد {{keyCount}} مفتاحاً للوحدة {{unitNo}} في {{propertyName}} بين {{deliveredBy}} و{{receivedBy}}.'},
 damage_report:{title:'محضر أضرار',prefix:'DMG',required:['documentNo','issuedAt','tenantName','propertyName','unitNo','inspectionReference','damageSummary','estimatedAmount'],body:'بناء على المعاينة رقم {{inspectionReference}}، سُجلت الأضرار التالية في الوحدة {{unitNo}}: {{damageSummary}}. التقدير الأولي {{estimatedAmount}} د.ك ولا يصبح ذمة نهائية قبل الاعتماد.'},
 final_settlement:{title:'التسوية النهائية',prefix:'SETTLE',required:['documentNo','issuedAt','tenantName','contractNo','rentBalance','damageBalance','utilityBalance','legalBalance','depositBalance','netBalance','approvedBy'],body:'التسوية النهائية للعقد رقم {{contractNo}}: إيجار {{rentBalance}} د.ك، أضرار {{damageBalance}} د.ك، خدمات {{utilityBalance}} د.ك، قضائي {{legalBalance}} د.ك، تأمين {{depositBalance}} د.ك، والصافي {{netBalance}} د.ك.'},
 clearance:{title:'براءة ذمة',prefix:'CLEAR',required:['documentNo','issuedAt','tenantName','contractNo','settlementReference','approvedBy'],body:'تشهد الإدارة بإقفال الالتزامات المعتمدة للعقد رقم {{contractNo}} وفق التسوية النهائية رقم {{settlementReference}}. لا تصدر هذه الوثيقة عند وجود التزام مفتوح إلا باستثناء رسمي محفوظ.'},
 daily_collection:{title:'كشف التحصيل اليومي',prefix:'DAILY',required:['documentNo','issuedAt','collectionDate','propertyName','receiptCount','totalAmount','preparedBy'],body:'كشف تحصيل العقار {{propertyName}} ليوم {{collectionDate}}: عدد الوصولات {{receiptCount}}، وإجمالي التحصيل الفعلي {{totalAmount}} د.ك، أعده {{preparedBy}}.'}
};
export const OFFICIAL_FORM_TEMPLATES=Object.freeze(Object.fromEntries(Object.entries(TEMPLATES).map(([key,value])=>[key,Object.freeze({...value,required:Object.freeze(value.required),immutableAfterIssue:true,version:key==='tenant_statement'?2:1})])));

export function documentCategory(category,entity){
 const spec=DOCUMENT_CATEGORIES[category];
 if(!spec||!spec.entities.includes(entity))throw Error('اختر نوع مستند مناسباً للسجل المرتبط.');
 return {category,documentType:category==='signed_lease'?'signed_contract':'supporting_document',label:spec.label};
}
export function renderOfficialForm(kind,data){
 const spec=OFFICIAL_FORM_TEMPLATES[kind];
 if(!spec)throw Error('نوع النموذج الرسمي غير معتمد.');
 const missing=spec.required.filter(key=>data?.[key]===undefined||data[key]===null||String(data[key]).trim()==='');
 if(missing.length)throw Error(`حقول النموذج المطلوبة ناقصة: ${missing.join(', ')}`);
 const body=spec.body.replace(/{{([A-Za-z0-9_]+)}}/g,(_,key)=>String(data[key]));
 return Object.freeze({kind,title:spec.title,documentNo:String(data.documentNo),version:spec.version,issuedAt:String(data.issuedAt),body,snapshot:Object.freeze({...data})});
}
