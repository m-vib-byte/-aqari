// Form validation only: a Civil ID format check is not identity verification.
export const pdfFieldRequired=field=>field.required!==false;
export function pdfSelectOptions(text){
 const options=String(text).split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 if(!options.length||options.length>50||new Set(options).size!==options.length||options.some(v=>v.length>100||/[\x00-\x1f\x7f]/.test(v)))throw Error('INVALID_FIELD_OPTIONS');
 return options;
}
export function pdfFieldValueError(field,value){
 if(typeof value!=='string'||value.length>1000||/[\x00-\x1f\x7f]/.test(value))return 'INVALID_FIELD_VALUE';
 const v=value.trim();
 if(!v)return pdfFieldRequired(field)?'FIELD_VALUES_REQUIRED':null;
 if(field.type==='select'&&!(field.options||[]).includes(v))return 'INVALID_FIELD_OPTION';
 if(field.type==='civil_id'&&!/^[0-9٠-٩۰-۹]{12}$/.test(v))return 'INVALID_CIVIL_ID_FORMAT';
 if(['number','money'].includes(field.type)&&! /^-?[0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,3})?$/.test(v))return 'INVALID_FIELD_VALUE';
 if(field.type==='date'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return 'INVALID_FIELD_VALUE';
  const date=new Date(v+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v||v.startsWith('0000'))return 'INVALID_FIELD_VALUE';
 }
 return null;
}
export function pdfFieldsCompatible(a,b){return a.type===b.type&&(a.type!=='select'||JSON.stringify(a.options)===JSON.stringify(b.options));}
