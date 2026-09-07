export const SECTIONS = ['home','collections','properties','tenants','contracts','maintenance','finance','employees','partners','documents','notifications','reports'];
export const LANGUAGES = {ar:'العربية',en:'English',hi:'हिन्दी',ur:'اردو',ml:'മലയാളം'};
export const LABELS = {
 ar:['الرئيسية','التحصيل','العقارات','المستأجرون','العقود','الصيانة','الحسابات','الموظفون والرواتب','الشركاء والحصص','المستندات','التنبيهات','التقارير','المزيد','مركز تحكم المدير','مسح مستند'],
 en:['Home','Collections','Properties','Tenants','Contracts','Maintenance','Accounts','Staff and payroll','Partners and shares','Documents','Notifications','Reports','More','Manager controls','Scan document'],
 hi:['होम','वसूली','संपत्तियाँ','किरायेदार','अनुबंध','रखरखाव','खाते','कर्मचारी और वेतन','साझेदार और हिस्से','दस्तावेज़','सूचनाएँ','रिपोर्ट','अधिक','प्रबंधक नियंत्रण','दस्तावेज़ स्कैन'],
 ur:['ہوم','وصولیاں','املاک','کرایہ دار','معاہدے','دیکھ بھال','حسابات','ملازمین اور تنخواہیں','شراکت دار اور حصص','دستاویزات','اطلاعات','رپورٹس','مزید','منتظم کنٹرول','دستاویز اسکین'],
 ml:['ഹോം','വസൂൽ','വസ്തുക്കൾ','വാടകക്കാർ','കരാറുകൾ','അറ്റകുറ്റപ്പണി','അക്കൗണ്ടുകൾ','ജീവനക്കാരും ശമ്പളവും','പങ്കാളികളും ഓഹരികളും','രേഖകൾ','അറിയിപ്പുകൾ','റിപ്പോർട്ടുകൾ','കൂടുതൽ','മാനേജർ നിയന്ത്രണം','രേഖ സ്കാൻ']
};
export const LABEL_KEYS = [...SECTIONS,'more','control_center','scan_document'];
export const ROUTES = {home:'home',collections:'collections',collectionProPage:'collections',properties:'properties',tenants:'tenants',smartContractsPage:'contracts',leases:'contracts',maintenance:'maintenance',maintenanceProPage:'maintenance',financeSuitePage:'finance',expenses:'finance',services:'finance',employees:'employees',payroll:'employees',documentsHub:'documents',documentsCenterPage:'documents',notificationCenterPage:'notifications',reports:'reports'};
export function label(key,locale='ar',custom={}) {
 const index=LABEL_KEYS.indexOf(key);if(index<0)throw Error('Unknown label key');
 const value=custom[locale]?.[key];
 return typeof value==='string' && value.trim() && value.length<=80 && !/[<>\x00-\x1f]/.test(value) ? value : (LABELS[locale]||LABELS.ar)[index];
}
export function validateSettings(settings) {
 if(!settings||Object.keys(settings).sort().join()!=='labels,permissions,sections')throw Error('إعدادات غير مكتملة.');
 for(const [section,enabled]of Object.entries(settings.sections))if(!SECTIONS.includes(section)||typeof enabled!=='boolean')throw Error('قسم غير صالح.');
 for(const [locale,labels]of Object.entries(settings.labels))for(const [key,value]of Object.entries(labels))if(!LANGUAGES[locale]||!LABEL_KEYS.includes(key)||typeof value!=='string'||!value.trim()||value.length>80||/[<>\x00-\x1f]/.test(value))throw Error('راجع المسميات.');
 return settings;
}
