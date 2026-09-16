import {LANGUAGES,getLocale} from './locale.js';
export {LANGUAGES};
export const SECTIONS = ['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports'];
export const LABELS = {
 ar:['الرئيسية','التحصيل','العقارات','المستأجرون','العقود','الصيانة','الحسابات','الموظفون والرواتب','الشركاء والحصص','المستندات','التنبيهات','التقارير','المزيد','مركز تحكم المدير','مسح مستند'],
 en:['Home','Collections','Properties','Tenants','Contracts','Maintenance','Accounts','Staff and payroll','Partners and shares','Documents','Notifications','Reports','More','Manager controls','Scan document'],
 hi:['होम','वसूली','संपत्तियाँ','किरायेदार','अनुबंध','रखरखाव','खाते','कर्मचारी और वेतन','साझेदार और हिस्से','दस्तावेज़','सूचनाएँ','रिपोर्ट','अधिक','प्रबंधक नियंत्रण','दस्तावेज़ स्कैन'],
 ur:['ہوم','وصولیاں','املاک','کرایہ دار','معاہدے','دیکھ بھال','حسابات','ملازمین اور تنخواہیں','شراکت دار اور حصص','دستاویزات','اطلاعات','رپورٹس','مزید','منتظم کنٹرول','دستاویز اسکین'],
 ml:['ഹോം','വസൂൽ','വസ്തുക്കൾ','വാടകക്കാർ','കരാറുകൾ','അറ്റകുറ്റപ്പണി','അക്കൗണ്ടുകൾ','ജീവനക്കാരും ശമ്പളവും','പങ്കാളികളും ഓഹരികളും','രേഖകൾ','അറിയിപ്പുകൾ','റിപ്പോർട്ടുകൾ','കൂടുതൽ','മാനേജർ നിയന്ത്രണം','രേഖ സ്കാൻ']
};
export const CORE_LABEL_KEYS=[...SECTIONS,'more','control_center','scan_document'];
export const GROUP_LABEL_KEYS=['group_finance','group_contracts','group_properties','group_maintenance','group_staff','group_account'];
export const SERVICE_LABEL_KEYS=[
 'rental_contracts','contract_scan','property_statements','maintenance_utilities','data_quality','lease_review','partner_access','employees_payroll','property_notices','staff_circulars','staff_access','financial_register','opening_balances','partner_distributions','commercial_collections','deposit_ledger','vacating_settlement','exit_review','user_guide','compliance_center','kpi_dashboard','maintenance_plans','maintenance_report','security_center','operations_center','final_gap_center','official_documents','integration_center','financial_archive','lease_expiry_report','unit_readiness','original_documents','vacating_review'
];
export const LABEL_KEYS=[...CORE_LABEL_KEYS,...GROUP_LABEL_KEYS,...SERVICE_LABEL_KEYS];
const DISPLAY_LABELS={
 ar:{
  group_finance:'التحصيل والحسابات',group_contracts:'العقود والمستندات',group_properties:'العقارات والمستأجرون',group_maintenance:'الصيانة والخدمات',group_staff:'الموظفون والإدارة',group_account:'الحساب والمساعدة',
  rental_contracts:'عقود الإيجار',contract_scan:'مسح عقد الإيجار',property_statements:'كشوف العقارات',maintenance_utilities:'عدادات وخدمات العقارات',data_quality:'مركز جودة البيانات',lease_review:'اعتماد عقود المصدر',partner_access:'صلاحيات الشركاء حسب العقار',employees_payroll:'الموظفون والرواتب',property_notices:'إعلانات العقارات وإرشادات المستأجرين',staff_circulars:'تعاميم الموظفين وإثبات الاطلاع',staff_access:'صلاحيات الموظفين حسب العقار',financial_register:'سجل المصروفات وإقفال الفترة المالية',opening_balances:'مطابقة الأرصدة الافتتاحية',partner_distributions:'اعتماد وتوزيع مستحقات الشركاء',commercial_collections:'التحصيل التجاري والمستحقات',deposit_ledger:'دفتر التأمين — القبض والرد',vacating_settlement:'تسوية الإخلاء وبراءة الذمة',exit_review:'طلب إخلاء ومراجعة التسوية',user_guide:'دليل استخدام عقاري',compliance_center:'العقود التجارية والخدمات وفحص الوحدات',kpi_dashboard:'لوحة مؤشرات الأداء',maintenance_plans:'الصيانة الدورية وتنبيهات 30/60/90',maintenance_report:'تقرير الصيانة — الحالة والتكلفة والزمن',security_center:'الأمان والتوثيق الثنائي',operations_center:'مركز العمليات — الشيكات والموردون والقضايا والعهدة',final_gap_center:'الذمم والحسابات والتواصل والتقييم',official_documents:'النماذج الرسمية وPDF والأرشيف',integration_center:'التكاملات الخارجية وWebhooks',financial_archive:'الأرشيف المالي التاريخي',lease_expiry_report:'العقود المنتهية والقريبة من الانتهاء',unit_readiness:'جاهزية الوحدات قبل التأجير',original_documents:'المستندات الأصلية — الأطراف والعقار والعقد والإخلاء',vacating_review:'مراجعات الإخلاء المؤرشفة'
 },
 en:{
  group_finance:'Collections & accounts',group_contracts:'Contracts & documents',group_properties:'Properties & tenants',group_maintenance:'Maintenance & services',group_staff:'Staff & management',group_account:'Account & help',
  rental_contracts:'Rental contracts',contract_scan:'Scan rental contract',property_statements:'Property statements',maintenance_utilities:'Property meters & services',data_quality:'Data quality center',lease_review:'Source contract approval',partner_access:'Partner access by property',employees_payroll:'Staff & payroll',property_notices:'Property notices & tenant guidance',staff_circulars:'Staff circulars & acknowledgement',staff_access:'Staff access by property',financial_register:'Expenses & financial period closing',opening_balances:'Opening balance reconciliation',partner_distributions:'Partner entitlement distribution',commercial_collections:'Commercial collections & dues',deposit_ledger:'Deposit ledger — collect & refund',vacating_settlement:'Vacating settlement & clearance',exit_review:'Vacating request & settlement review',user_guide:'AQARI user guide',compliance_center:'Commercial contracts, services & unit checks',kpi_dashboard:'Performance dashboard',maintenance_plans:'Periodic maintenance & 30/60/90 alerts',maintenance_report:'Maintenance report — status, cost & time',security_center:'Security & two-factor authentication',operations_center:'Operations — cheques, suppliers, cases & custody',final_gap_center:'Balances, communication & evaluation',official_documents:'Official forms, PDF & archive',integration_center:'External integrations & Webhooks',financial_archive:'Historical financial archive',lease_expiry_report:'Expired & expiring contracts',unit_readiness:'Unit readiness before leasing',original_documents:'Original documents — parties, property, contract & vacating',vacating_review:'Archived vacating reviews'
 },
 hi:{group_finance:'वसूली और खाते',group_contracts:'अनुबंध और दस्तावेज़',group_properties:'संपत्तियाँ और किरायेदार',group_maintenance:'रखरखाव और सेवाएँ',group_staff:'कर्मचारी और प्रबंधन',group_account:'खाता और सहायता'},
 ur:{group_finance:'وصولیاں اور حسابات',group_contracts:'معاہدے اور دستاویزات',group_properties:'املاک اور کرایہ دار',group_maintenance:'دیکھ بھال اور خدمات',group_staff:'ملازمین اور انتظام',group_account:'اکاؤنٹ اور مدد'},
 ml:{group_finance:'വസൂലും അക്കൗണ്ടുകളും',group_contracts:'കരാറുകളും രേഖകളും',group_properties:'വസ്തുക്കളും വാടകക്കാരും',group_maintenance:'അറ്റകുറ്റപ്പണിയും സേവനങ്ങളും',group_staff:'ജീവനക്കാരും നടത്തിപ്പും',group_account:'അക്കൗണ്ടും സഹായവും'}
};
export const ROUTES = {home:'home',collections:'collections',collectionProPage:'collections',properties:'properties',tenants:'tenants',smartContractsPage:'contracts',leases:'contracts',maintenance:'maintenance',maintenanceProPage:'maintenance',financeSuitePage:'finance',expenses:'finance',services:'finance',employees:'employees',payroll:'employees',documentsHub:'documents',documentsCenterPage:'documents',notificationCenterPage:'notifications',reports:'reports'};
export function label(key,locale=getLocale(),custom={}) {
 const index=CORE_LABEL_KEYS.indexOf(key);
 const fallback=index>=0?(LABELS[locale]||LABELS.ar)[index]:(DISPLAY_LABELS[locale]?.[key]||DISPLAY_LABELS.ar[key]);
 if(!fallback)throw Error('Unknown label key');
 const value=custom[locale]?.[key];
 return typeof value==='string' && value.trim() && value.length<=80 && !/[<>\x00-\x1f]/.test(value) ? value : fallback;
}
export function validateSettings(settings) {
 if(!settings||Object.keys(settings).sort().join()!=='labels,permissions,sections')throw Error('إعدادات غير مكتملة.');
 for(const [section,enabled]of Object.entries(settings.sections))if(!SECTIONS.includes(section)||typeof enabled!=='boolean')throw Error('قسم غير صالح.');
 for(const [locale,labels]of Object.entries(settings.labels))for(const [key,value]of Object.entries(labels))if(!LANGUAGES[locale]||!LABEL_KEYS.includes(key)||typeof value!=='string'||!value.trim()||value.length>80||/[<>\x00-\x1f]/.test(value))throw Error('راجع المسميات.');
 return settings;
}
