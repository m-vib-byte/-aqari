export const PROPERTY_STATEMENT_DISCOUNT_MARKER='v267StatementOwnerDiscount';
export const PROPERTY_STATEMENT_COLLECTION_MARKER='v267StatementCollectionReadback';
export const PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER='v267StatementSourceDetail';
export const PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER='v267StatementSourceBalance';
export const PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER='v267StatementSourceProfile';

function statementMoney(value){
  if(value===null||value===undefined||value==='')return null;
  const amount=Number(value);
  return Number.isFinite(amount)&&amount>=0?Math.round(amount*1000)/1000:null;
}

export function statementOwnerApprovedDiscount(contractValue,currentValue){
  const contract=statementMoney(contractValue),current=statementMoney(currentValue);
  if(contract===null||current===null)return null;
  return Math.max(0,Math.round((contract-current)*1000)/1000);
}

export function statementSourceRemaining(currentValue,paidValue){
  const current=statementMoney(currentValue),paid=statementMoney(paidValue);
  if(current===null||paid===null)return null;
  return Math.max(0,Math.round((current-paid)*1000)/1000);
}

export function statementRentTotals(rows){
  if(!Array.isArray(rows)||!rows.length)return null;
  let contractRent=0,currentRent=0,ownerDiscount=0;
  for(const row of rows){
    const contract=statementMoney(row?.contract_rent_kd),current=statementMoney(row?.current_rent_kd);
    if(contract===null||current===null)return null;
    contractRent+=contract;currentRent+=current;ownerDiscount+=Math.max(0,contract-current);
  }
  return {
    contractRent:Math.round(contractRent*1000)/1000,
    ownerDiscount:Math.round(ownerDiscount*1000)/1000,
    currentRent:Math.round(currentRent*1000)/1000
  };
}

export function patchPropertyStatementDiscountUi(source){
  let next=String(source||'');
  if(next.includes(PROPERTY_STATEMENT_DISCOUNT_MARKER)&&next.includes(PROPERTY_STATEMENT_COLLECTION_MARKER)&&next.includes(PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER)&&next.includes(PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER)&&next.includes(PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER))return next;

  if(!next.includes(PROPERTY_STATEMENT_DISCOUNT_MARKER)){
    const showAnchor=` function show(content){`;
    const helper=` // ${PROPERTY_STATEMENT_DISCOUNT_MARKER}\n function v267StatementMoney(value){\n  if(value===null||value===undefined||value==='')return null;\n  const amount=Number(value);\n  return Number.isFinite(amount)&&amount>=0?Math.round(amount*1000)/1000:null;\n }\n function v267OwnerApprovedDiscount(row){\n  const contract=v267StatementMoney(row?.contract_rent_kd),current=v267StatementMoney(row?.current_rent_kd);\n  if(contract===null||current===null)return null;\n  return Math.max(0,Math.round((contract-current)*1000)/1000);\n }\n function v267SourceRemaining(row){\n  const current=v267StatementMoney(row?.current_rent_kd),paid=v267StatementMoney(row?.paid_amount_kd);\n  if(current===null||paid===null)return null;\n  return Math.max(0,Math.round((current-paid)*1000)/1000);\n }\n function v267StatementRentTotals(rows){\n  if(!Array.isArray(rows)||!rows.length)return null;\n  let contractRent=0,currentRent=0,ownerDiscount=0;\n  for(const row of rows){\n   const contract=v267StatementMoney(row?.contract_rent_kd),current=v267StatementMoney(row?.current_rent_kd);\n   if(contract===null||current===null)return null;\n   contractRent+=contract;currentRent+=current;ownerDiscount+=Math.max(0,contract-current);\n  }\n  return {contractRent:Math.round(contractRent*1000)/1000,ownerDiscount:Math.round(ownerDiscount*1000)/1000,currentRent:Math.round(currentRent*1000)/1000};\n }\n`;
    if(!next.includes(showAnchor))throw Error('V267 property statement discount show anchor not found.');
    next=next.replace(showAnchor,helper+showAnchor);

    const fieldsAnchor=`[t('إيجار العقد'),'contract_rent_kd'],[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd']`;
    const fieldsReplacement=`[t('إيجار العقد'),'contract_rent_kd'],[t('خصم معتمد من المالك'),'__owner_discount'],[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd']`;
    if(!next.includes(fieldsAnchor))throw Error('V267 property statement discount fields anchor not found.');
    next=next.replace(fieldsAnchor,fieldsReplacement);

    const valueAnchor=`let v=key==='__payment_reference'?(paymentReference.value??t('غير مدون')):(row[key]??t('غير مدون'));`;
    const valueReplacement=`let v=key==='__payment_reference'?(paymentReference.value??t('غير مدون')):key==='__owner_discount'?(v267OwnerApprovedDiscount(row)??t('غير مدون')):key==='__source_remaining'?(v267SourceRemaining(row)??t('غير مدون')):(row[key]??t('غير مدون'));`;
    if(!next.includes(valueAnchor))throw Error('V267 property statement discount value anchor not found.');
    next=next.replace(valueAnchor,valueReplacement);

    const sourceNote=`كشف المصدر المحفوظ. مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    const sourceReplacement=`كشف المصدر المحفوظ. إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة؛ الخصم خاص بصف المستأجر وفترة هذا الكشف ولا يغيّر الوحدة أو عقد مستأجر لاحق؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    if(!next.includes(sourceNote))throw Error('V267 property statement discount source note anchor not found.');
    next=next.replace(sourceNote,sourceReplacement);

    const summaryAnchor=`const s=content.summary.printed_totals;result.append(node('p',message('الإيجار الحالي: {rent} د.ك • العربون: {advance} د.ك • النظافة: {cleaning} د.ك',{rent:s.rent_kd,advance:s.advance_kd,cleaning:s.cleaning_kd})),node('p',t('تُعرض ملاحظات كل وحدة من سجل مصدرها؛ لا تُعتمد القيم المعلقة تلقائياً.')));`;
    const summaryReplacement=`const s=content.summary.printed_totals,rentTotals=v267StatementRentTotals(content.rows);result.append(node('p',rentTotals?message('إجمالي إيجار العقود: {contract} د.ك • إجمالي خصم المالك: {discount} د.ك • إجمالي الإيجار الحالي: {current} د.ك',{contract:rentTotals.contractRent,discount:rentTotals.ownerDiscount,current:rentTotals.currentRent}):t('مجاميع إيجار العقد والخصم المعتمد والإيجار الحالي غير مكتملة بالمصدر؛ لم تُفترض أي قيمة بديلة.')),node('p',message('الإيجار الحالي المطبوع بالمصدر: {rent} د.ك • العربون: {advance} د.ك • النظافة: {cleaning} د.ك',{rent:s.rent_kd,advance:s.advance_kd,cleaning:s.cleaning_kd})),node('p',t('تُعرض ملاحظات كل وحدة من سجل مصدرها؛ لا تُعتمد القيم المعلقة تلقائياً.')));`;
    if(!next.includes(summaryAnchor))throw Error('V267 property statement rent totals anchor not found.');
    next=next.replace(summaryAnchor,summaryReplacement);
  }

  if(!next.includes(PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER)||!next.includes(PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER)){
    const sourceDetailAnchor=`const paymentReference=statementPaymentReference(row);\n   for(const [title,key]of [`;
    const sourceDetailReplacement=`const paymentReference=statementPaymentReference(row);\n   // ${PROPERTY_STATEMENT_SOURCE_DETAIL_MARKER}\n   // ${PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER}\n   for(const [title,key]of [`;
    if(!next.includes(sourceDetailAnchor))throw Error('V267 property statement source-detail marker anchor not found.');
    next=next.replace(sourceDetailAnchor,sourceDetailReplacement);

    const paidAnchor=`[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd']`;
    const paidReplacement=`[t('الإيجار الحالي'),'current_rent_kd'],[t('المدفوع بالمصدر'),'paid_amount_kd'],[t('المتبقي بالمصدر'),'__source_remaining'],[t('العربون'),'advance_kd']`;
    if(!next.includes(paidAnchor))throw Error('V267 property statement paid-source anchor not found.');
    next=next.replace(paidAnchor,paidReplacement);

    const nationalityAnchor=`[t('الهاتف بالمصدر'),'phone_raw'],[t('المدني بالمصدر'),'civil_id_raw']`;
    const nationalityReplacement=`[t('الهاتف بالمصدر'),'phone_raw'],[t('الجنسية بالمصدر'),'nationality_raw'],[t('المدني بالمصدر'),'civil_id_raw']`;
    if(!next.includes(nationalityAnchor))throw Error('V267 property statement nationality anchor not found.');
    next=next.replace(nationalityAnchor,nationalityReplacement);

    const detailNoteAnchor=`كشف المصدر المحفوظ. إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة؛ الخصم خاص بصف المستأجر وفترة هذا الكشف ولا يغيّر الوحدة أو عقد مستأجر لاحق؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    const detailNoteReplacement=`كشف المصدر المحفوظ. إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة؛ الخصم خاص بصف المستأجر وفترة هذا الكشف ولا يغيّر الوحدة أو عقد مستأجر لاحق؛ المدفوع بالمصدر والمتبقي بالمصدر قراءة من الكشف المحفوظ، والمتبقي مشتق فقط من الإيجار الحالي ناقص المدفوع بالمصدر ولا يحسب فرق الخصم كمتأخرات؛ هذه القيم لا تستبدل التحصيل الفعلي المحمي؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    if(!next.includes(detailNoteAnchor))throw Error('V267 property statement source-detail note anchor not found.');
    next=next.replace(detailNoteAnchor,detailNoteReplacement);
  }

  if(!next.includes(PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER)){
    const markerAnchor=`// ${PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER}\n   for(const [title,key]of [`;
    const markerReplacement=`// ${PROPERTY_STATEMENT_SOURCE_BALANCE_MARKER}\n   // ${PROPERTY_STATEMENT_SOURCE_PROFILE_MARKER}\n   for(const [title,key]of [`;
    if(!next.includes(markerAnchor))throw Error('V267 property statement source-profile marker anchor not found.');
    next=next.replace(markerAnchor,markerReplacement);

    const profileAnchor=`[t('الهاتف بالمصدر'),'phone_raw'],[t('الجنسية بالمصدر'),'nationality_raw'],[t('المدني بالمصدر'),'civil_id_raw']`;
    const profileReplacement=`[t('رسوم النظافة بالمصدر'),'cleaning_kd'],[t('استلام العقد بالمصدر'),'contract_received_raw'],[t('الهاتف بالمصدر'),'phone_raw'],[t('البريد الإلكتروني بالمصدر'),'email_raw'],[t('الجنسية بالمصدر'),'nationality_raw'],[t('المدني بالمصدر'),'civil_id_raw'],[t('رقم الجواز بالمصدر'),'passport_no_raw'],[t('الشهر المجاني بالمصدر'),'free_month_raw'],[t('تنبيه الإخلاء بالمصدر'),'eviction_notice_raw'],[t('ملاحظات المصدر'),'notes_raw']`;
    if(!next.includes(profileAnchor))throw Error('V267 property statement source-profile fields anchor not found.');
    next=next.replace(profileAnchor,profileReplacement);

    const profileNoteAnchor=`هذه القيم لا تستبدل التحصيل الفعلي المحمي؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    const profileNoteReplacement=`هذه القيم لا تستبدل التحصيل الفعلي المحمي؛ بيانات التواصل والجواز واستلام العقد والشهر المجاني وتنبيه الإخلاء والملاحظات تعرض فقط إذا كانت محفوظة في صف المصدر نفسه، وأي قيمة مفقودة تبقى غير مدونة دون افتراض بديل؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    if(!next.includes(profileNoteAnchor))throw Error('V267 property statement source-profile note anchor not found.');
    next=next.replace(profileNoteAnchor,profileNoteReplacement);
  }

  if(!next.includes(PROPERTY_STATEMENT_COLLECTION_MARKER)){
    const loadAnchor=`pdf.disabled=false;d.status.textContent=t('تم استرجاع الكشف المحفوظ من قاعدة البيانات.');`;
    const loadReplacement=`pdf.disabled=false; // ${PROPERTY_STATEMENT_COLLECTION_MARKER}\n  try{const collectionReport=await d.session.request(d.session.client.rpc('aqari_monthly_collection_report',{p_workspace_id:d.session.bound.workspace,p_period:month.value+'-01',p_property_id:select.value}));showCollection(collectionReport);d.status.textContent=t('تم استرجاع الكشف المحفوظ وإظهار المدفوع والمتبقي من التحصيل الفعلي.');}\n  catch{collectionResult.replaceChildren(node('p',t('تعذر تحميل المدفوع والمتبقي تلقائياً؛ استخدم كشف التحصيل الفعلي لإعادة المحاولة.')));d.status.textContent=t('تم استرجاع الكشف المحفوظ من قاعدة البيانات؛ تعذر تحديث التحصيل الفعلي.');}`;
    if(!next.includes(loadAnchor))throw Error('V267 property statement collection readback anchor not found.');
    next=next.replace(loadAnchor,loadReplacement);
  }

  return next;
}
