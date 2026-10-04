import {documentFieldCatalog} from './rental-document-cycle.js';
import {linkedPdfFields} from './pdf-linked-fields.js';
import {pdfFieldsCompatible,pdfFieldValueError} from './pdf-field-values.js';

// Reuse the persisted dataKey grouping contract, with an explicit namespace.
// A label or a similarly named field never opts into saved-record autofill.
const prefix='aqari_source_';
export const pdfContractSources=Object.freeze(Object.values(documentFieldCatalog).filter(f=>f.source==='linked'&&!['receipt_no','receipt_date','rent_period','amount','payment_date','payment_method','payment_reference','accountant_name','receiver_name'].includes(f.key)));
const keys=new Set(pdfContractSources.map(f=>f.key));
export const pdfContractSourceKey=field=>field.dataKey?.startsWith(prefix)&&keys.has(field.dataKey.slice(prefix.length))?field.dataKey.slice(prefix.length):'';
export function setPdfContractSource(fields,field,key,values={}){
 if(!key){delete field.dataKey;return;}
 if(!keys.has(key))throw Error('اختر مصدرًا معروفًا من بيانات العقد.');
 const peers=linkedPdfFields(fields,field),target=prefix+key;
 if(fields.some(f=>f.dataKey===target&&!pdfFieldsCompatible(f,field)))throw Error('حقول المصدر نفسه يجب أن تكون من النوع نفسه.');
 const merged=fields.filter(f=>f.dataKey===target||peers.includes(f));
 if(new Set(merged.map(f=>values[f.id]||'')).size>1)throw Error('القيم مختلفة. أفرغ الحقول أو وحّدها قبل ربطها بالمصدر نفسه.');
 for(const f of peers)f.dataKey=target;
}
export function planPdfContractValues(fields,values,context){
 const changes=[];
 for(const f of fields){
  const key=pdfContractSourceKey(f);if(!key)continue;
  const raw=context.values[key],value=raw==null?'':String(raw).trim();
  const error=value?pdfFieldValueError(f,value):null;
  if(error)throw Error('قيمة «'+f.label+'» لا تناسب نوع الحقل. راجع إعداد الحقل والسجل الأصلي.');
  changes.push({id:f.id,label:f.label,key,before:values[f.id]||'',value,missing:!value});
 }
 if(!changes.length)throw Error('حدد «مصدر التعبئة من العقد» لحقل واحد على الأقل.');
 return changes;
}
