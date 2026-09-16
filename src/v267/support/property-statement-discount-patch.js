export const PROPERTY_STATEMENT_DISCOUNT_MARKER='v267StatementOwnerDiscount';
export const PROPERTY_STATEMENT_COLLECTION_MARKER='v267StatementCollectionReadback';

export function statementOwnerApprovedDiscount(contractValue,currentValue){
  if(contractValue===null||contractValue===undefined||contractValue===''||currentValue===null||currentValue===undefined||currentValue==='')return null;
  const contract=Number(contractValue),current=Number(currentValue);
  if(!Number.isFinite(contract)||!Number.isFinite(current)||contract<0||current<0)return null;
  return Math.max(0,Math.round((contract-current)*1000)/1000);
}

export function patchPropertyStatementDiscountUi(source){
  let next=String(source||'');
  if(next.includes(PROPERTY_STATEMENT_DISCOUNT_MARKER)&&next.includes(PROPERTY_STATEMENT_COLLECTION_MARKER))return next;

  if(!next.includes(PROPERTY_STATEMENT_DISCOUNT_MARKER)){
    const showAnchor=` function show(content){`;
    const helper=` // ${PROPERTY_STATEMENT_DISCOUNT_MARKER}\n function v267StatementMoney(value){\n  if(value===null||value===undefined||value==='')return null;\n  const amount=Number(value);\n  return Number.isFinite(amount)&&amount>=0?Math.round(amount*1000)/1000:null;\n }\n function v267OwnerApprovedDiscount(row){\n  const contract=v267StatementMoney(row?.contract_rent_kd),current=v267StatementMoney(row?.current_rent_kd);\n  if(contract===null||current===null)return null;\n  return Math.max(0,Math.round((contract-current)*1000)/1000);\n }\n`;
    if(!next.includes(showAnchor))throw Error('V267 property statement discount show anchor not found.');
    next=next.replace(showAnchor,helper+showAnchor);

    const fieldsAnchor=`[t('إيجار العقد'),'contract_rent_kd'],[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd']`;
    const fieldsReplacement=`[t('إيجار العقد'),'contract_rent_kd'],[t('خصم معتمد من المالك'),'__owner_discount'],[t('الإيجار الحالي'),'current_rent_kd'],[t('العربون'),'advance_kd']`;
    if(!next.includes(fieldsAnchor))throw Error('V267 property statement discount fields anchor not found.');
    next=next.replace(fieldsAnchor,fieldsReplacement);

    const valueAnchor=`let v=key==='__payment_reference'?(paymentReference.value??t('غير مدون')):(row[key]??t('غير مدون'));`;
    const valueReplacement=`let v=key==='__payment_reference'?(paymentReference.value??t('غير مدون')):key==='__owner_discount'?(v267OwnerApprovedDiscount(row)??t('غير مدون')):(row[key]??t('غير مدون'));`;
    if(!next.includes(valueAnchor))throw Error('V267 property statement discount value anchor not found.');
    next=next.replace(valueAnchor,valueReplacement);

    const sourceNote=`كشف المصدر المحفوظ. مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    const sourceReplacement=`كشف المصدر المحفوظ. إيجار العقد والخصم المعتمد والإيجار الحالي تبقى قيماً منفصلة؛ مبالغ الإيجار لا تُرحّل تلقائياً كتحصيل جديد.`;
    if(!next.includes(sourceNote))throw Error('V267 property statement discount source note anchor not found.');
    next=next.replace(sourceNote,sourceReplacement);
  }

  if(!next.includes(PROPERTY_STATEMENT_COLLECTION_MARKER)){
    const loadAnchor=`pdf.disabled=false;d.status.textContent=t('تم استرجاع الكشف المحفوظ من قاعدة البيانات.');`;
    const loadReplacement=`pdf.disabled=false; // ${PROPERTY_STATEMENT_COLLECTION_MARKER}\n  try{const collectionReport=await d.session.request(d.session.client.rpc('aqari_monthly_collection_report',{p_workspace_id:d.session.bound.workspace,p_period:month.value+'-01',p_property_id:select.value}));showCollection(collectionReport);d.status.textContent=t('تم استرجاع الكشف المحفوظ وإظهار المدفوع والمتبقي من التحصيل الفعلي.');}\n  catch{collectionResult.replaceChildren(node('p',t('تعذر تحميل المدفوع والمتبقي تلقائياً؛ استخدم كشف التحصيل الفعلي لإعادة المحاولة.')));d.status.textContent=t('تم استرجاع الكشف المحفوظ من قاعدة البيانات؛ تعذر تحديث التحصيل الفعلي.');}`;
    if(!next.includes(loadAnchor))throw Error('V267 property statement collection readback anchor not found.');
    next=next.replace(loadAnchor,loadReplacement);
  }

  return next;
}
