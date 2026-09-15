export const EXIT_NOTICE_PATCH_MARKER='/* AQARI_V267_EXIT_NOTICE_FORM */';
const replaceOnce=(source,from,to,label)=>{const count=source.split(from).length-1;if(count!==1)throw Error(label+'_ANCHOR_CHANGED');return source.replace(from,to);};
export function patchOfficialExitNotice(source){
 if(typeof source!=='string'||!source.trim())throw Error('EXIT_NOTICE_SOURCE_REQUIRED');
 if(source.includes(EXIT_NOTICE_PATCH_MARKER))return source;
 let next=source;
 next=replaceOnce(next,"import {officialFields,validateOfficialValues} from '../components/official-form-fields.js';","import {officialFields,validateOfficialValues} from '../components/official-form-fields.js';\nimport {EXTRA_OFFICIAL_FORM_TEMPLATES,extraOfficialFields,validateExtraOfficialValues,renderExtraOfficialForm} from '../components/official-extra-forms.js';\n"+EXIT_NOTICE_PATCH_MARKER,"EXIT_NOTICE_IMPORT");
 next=replaceOnce(next,"for(const [key,spec] of Object.entries(OFFICIAL_FORM_TEMPLATES))kind.append(option(key,spec.title));","for(const [key,spec] of Object.entries({...OFFICIAL_FORM_TEMPLATES,...EXTRA_OFFICIAL_FORM_TEMPLATES}))kind.append(option(key,spec.title));","EXIT_NOTICE_OPTIONS");
 next=replaceOnce(next,"for(const spec of officialFields(kind.value)){","for(const spec of (EXTRA_OFFICIAL_FORM_TEMPLATES[kind.value]?extraOfficialFields(kind.value):officialFields(kind.value))){","EXIT_NOTICE_FIELDS");
 next=replaceOnce(next,"const values=validateOfficialValues(kind.value,{...raw(),documentNo:replacement?.document_no||'رقم سيصدر آلياً'});","const values=(EXTRA_OFFICIAL_FORM_TEMPLATES[kind.value]?validateExtraOfficialValues:validateOfficialValues)(kind.value,{...raw(),documentNo:replacement?.document_no||'رقم سيصدر آلياً'});","EXIT_NOTICE_VALIDATE");
 next=replaceOnce(next,"const rendered=renderOfficialForm(kind.value,payload),id=replacement?.id||numberRequest.id,versionId=uuid();","const rendered=(EXTRA_OFFICIAL_FORM_TEMPLATES[kind.value]?renderExtraOfficialForm:renderOfficialForm)(kind.value,payload),id=replacement?.id||numberRequest.id,versionId=uuid();","EXIT_NOTICE_RENDER");
 return next;
}
