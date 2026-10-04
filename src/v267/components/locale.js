import {REPORT_FILTER_MESSAGES} from './report-filter-translations.js';
import {MESSAGES} from './translations.js';
import {WORKSPACE_MESSAGES} from './workspace-translations.js';
import {OPERATIONAL_MESSAGES} from './operational-translations.js';
import {VISIBLE_MESSAGES_A} from './visible-translations-a.js';
import {VISIBLE_MESSAGES_A2} from './visible-translations-a2.js';
import {VISIBLE_MESSAGES_B} from './visible-translations-b.js';
import {VISIBLE_MESSAGES_B2} from './visible-translations-b2.js';
import {VISIBLE_MESSAGES_GUIDE} from './visible-translations-guide.js';
import {PORTAL_MESSAGES} from './portal-translations.js';
import {SHELL_MESSAGES} from './shell-translations.js';
import {ARABIC_UI_ALIASES} from './arabic-ui-aliases.js';
const CATALOGS=[REPORT_FILTER_MESSAGES,MESSAGES,WORKSPACE_MESSAGES,OPERATIONAL_MESSAGES,VISIBLE_MESSAGES_A,VISIBLE_MESSAGES_A2,VISIBLE_MESSAGES_B,VISIBLE_MESSAGES_B2,VISIBLE_MESSAGES_GUIDE,PORTAL_MESSAGES,SHELL_MESSAGES];

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
 if(key)try{const saved=storage?.getItem(key),login=storage?.getItem('aqari_login_language');if(valid(saved))locale=saved;else if(valid(login))locale=login;}catch{}
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
export function hasTranslation(source,value=locale){
 if(!valid(value))return false;
 if(value==='ar')return true;
 return CATALOGS.some(messages=>typeof messages[source]?.[value]==='string'&&messages[source][value].trim().length>0);
}

// Call only for source-code UI strings. Do not pass tenant names or record values.
export function t(source,value=locale) {
 if(!valid(value))return source;
 if(value==='ar'&&Object.hasOwn(ARABIC_UI_ALIASES,source))return ARABIC_UI_ALIASES[source];
 for(const catalog of CATALOGS){if(catalog[source]?.[value])return catalog[source][value];}
 return source;
}

// Interpolate source-code templates once. Record values remain literal text,
// even when they contain another placeholder or match an interface message.
export function message(source,values,value=locale) {
 return t(source,value).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(token,key)=>
  Object.hasOwn(values,key)?String(values[key]??''):token);
}
