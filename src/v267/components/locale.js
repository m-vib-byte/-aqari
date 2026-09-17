import {MESSAGES} from './translations.js';
import {WORKSPACE_MESSAGES} from './workspace-translations.js';

export const LANGUAGES = Object.freeze({ar:'العربية',en:'English',hi:'हिन्दी',ur:'اردو',ml:'മലയാളം'});
const DATE_LOCALES = {ar:'ar-KW',en:'en-KW',hi:'hi-IN',ur:'ur-PK',ml:'ml-IN'};
let scopeKey=null,locale='ar';
const valid=value=>Object.hasOwn(LANGUAGES,value);

// Store only a language code, separately for each verified account/workspace.
// Storage failures must never prevent the user from using the application.
export function bindLocale(scope,storage=defaultStorage()) {
 const key=scope?.user&&scope?.workspace?'aqari:v267:locale:'+JSON.stringify([scope.workspace,scope.user]):null;
 if(key!==null&&key===scopeKey)return locale;
 scopeKey=key;locale='ar';
 if(key)try{const saved=storage?.getItem(key);if(valid(saved))locale=saved;}catch{}
 return locale;
}
function defaultStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function setLocale(value,storage=defaultStorage()) {
 if(!valid(value))throw new RangeError('Unsupported interface language');
 locale=value;
 if(scopeKey)try{storage?.setItem(scopeKey,value);}catch{}
 return locale;
}
export const getLocale=()=>locale;
export const direction=(value=locale)=>value==='ar'||value==='ur'?'rtl':'ltr';
export const dateLocale=()=>DATE_LOCALES[locale];

// Call only for source-code UI strings. Do not pass tenant names or record values.
export function t(source,value=locale) {
 if(!valid(value)||value==='ar')return source;
 return MESSAGES[source]?.[value]||WORKSPACE_MESSAGES[source]?.[value]||source;
}

// Interpolate source-code templates once. Record values remain literal text,
// even when they contain another placeholder or match an interface message.
export function message(source,values,value=locale) {
 return t(source,value).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(token,key)=>
  Object.hasOwn(values,key)?String(values[key]??''):token);
}
