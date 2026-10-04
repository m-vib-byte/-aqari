import {pdfFieldsCompatible} from './pdf-field-values.js';
// Explicit, document-local bindings. Labels alone never link values.
export function linkedPdfFields(fields,field){
 return field.dataKey?fields.filter(item=>item.dataKey===field.dataKey):[field];
}
export function writeLinkedPdfValue(fields,values,field,value){
 for(const item of linkedPdfFields(fields,field))values[item.id]=value;
}
export function linkPdfField(fields,values,field,targetId){
 if(!targetId){delete field.dataKey;return;}
 const target=fields.find(item=>item.id===targetId);
 if(!target||target===field||!pdfFieldsCompatible(target,field))throw Error('PDF_LINK_TYPE');
 const group=linkedPdfFields(fields,target);
 const entered=new Set([...group,field].map(item=>values[item.id]||'').filter(value=>value!==''));
 if(entered.size>1)throw Error('PDF_LINK_CONFLICT');
 const key=target.dataKey||target.id;
 for(const item of [...group,field])item.dataKey=key;
 writeLinkedPdfValue(fields,values,field,[...entered][0]||'');
}
