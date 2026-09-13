const SENSITIVE_KEYS=new Set([
  'password','secret','token','apikey','civilid','accesstoken','refreshtoken','authorization','servicerolekey'
]);
const normalizeKey=value=>String(value).toLowerCase().replace(/[_\-\s]/g,'');

/**
 * Validate data that may be persisted as integration public_metadata.
 *
 * This is a client-side fail-fast guard only. The database constraint remains
 * authoritative so a caller cannot bypass the rule by invoking the RPC directly.
 */
export function assertSafeIntegrationPublicMetadata(value){
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('بيانات التكامل العامة يجب أن تكون كائن JSON.');
  const stack=[{value,depth:0}];let visited=0;
  while(stack.length){
    const current=stack.pop();
    if(current.depth>16)throw Error('بيانات التكامل العامة متداخلة أكثر من الحد المسموح.');
    visited+=1;if(visited>4096)throw Error('بيانات التكامل العامة أكبر من الحد الآمن.');
    if(Array.isArray(current.value)){
      for(const child of current.value)if(child&&typeof child==='object')stack.push({value:child,depth:current.depth+1});
      continue;
    }
    for(const [key,child] of Object.entries(current.value)){
      if(SENSITIVE_KEYS.has(normalizeKey(key)))throw Error('لا يجوز حفظ كلمات المرور أو الأسرار أو الرموز أو البيانات المدنية داخل البيانات العامة. استخدم مرجع السر بالخادم فقط.');
      if(child&&typeof child==='object')stack.push({value:child,depth:current.depth+1});
    }
  }
  return value;
}
