// Interface labels only; preserve saved record values.
const rows=[
 ['مطابقة الأرصدة الافتتاحية','Opening balance reconciliation','आरंभिक शेष का मिलान','ابتدائی بیلنس کا ملاپ','പ്രാരംഭ ബാലൻസ് പൊരുത്തപ്പെടുത്തൽ'],
 ['اعتماد وتوزيع مستحقات الشركاء','Review and allocate partner entitlements','साझेदारों के हक की समीक्षा और आवंटन','شراکت داروں کے حصے کی منظوری اور تقسیم','പങ്കാളികളുടെ വിഹിതം പരിശോധിച്ച് അനുവദിക്കുക'],
 ['التحصيل التجاري والمستحقات','Commercial collections and balances','वाणिज्यिक वसूली और बकाया','تجارتی وصولیاں اور واجبات','വാണിജ്യ വസൂലും കുടിശ്ശികയും'],
 ['الموظفون والرواتب','Staff and payroll','कर्मचारी और वेतन','ملازمین اور تنخواہیں','ജീവനക്കാരും ശമ്പളവും'],
 ['عقود الإيجار','Rental contracts','किराया अनुबंध','کرایہ کے معاہدے','വാടകക്കരാറുകൾ']
];
export const SERVICE_LABEL_MESSAGES=Object.fromEntries(rows.map(([ar,en,hi,ur,ml])=>[ar,{en,hi,ur,ml}]));
