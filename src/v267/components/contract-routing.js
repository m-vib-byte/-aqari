// Keep legacy navigation and property shortcuts on the same guarded V267 contract entry.
const MAX_ROUTE_REF=300;
const cleanText=(value,label)=>{
 if(typeof value!=='string'&&typeof value!=='number')throw Error(label+' غير صالح.');
 const text=String(value).trim();
 if(!text||text.length>MAX_ROUTE_REF||/[\u0000-\u001f\u007f]/.test(text))throw Error(label+' غير صالح.');
 return text;
};

export function normalizeContractIntent(value={}){
 if(value==null)return {};
 if(typeof value!=='object'||Array.isArray(value))throw Error('طلب فتح العقود غير صالح.');
 const create=value.create===true;
 const hasId=value.id!==undefined&&value.id!==null&&String(value.id).trim()!=='';
 const hasRenewal=value.renewalFrom!==undefined&&value.renewalFrom!==null&&String(value.renewalFrom).trim()!=='';
 if(Number(create)+Number(hasId)+Number(hasRenewal)>1)throw Error('طلب العقد يجمع إجراءات متعارضة.');
 const intent={};
 if(create)intent.create=true;
 if(hasId)intent.id=cleanText(value.id,'مرجع العقد');
 if(hasRenewal)intent.renewalFrom=cleanText(value.renewalFrom,'مرجع التجديد');
 if(value.property!==undefined&&value.property!==null&&String(value.property).trim()!==''){
  if(!create)throw Error('العقار المبدئي مسموح فقط عند إنشاء عقد جديد.');
  intent.property=cleanText(value.property,'اسم العقار');
 }
 return intent;
}

export function installContractRoutes(target,open){
 const previous=target.go;
 async function route(initial={}){
  const intent=normalizeContractIntent(initial);
  if(intent.create){
   const module=await import('../pages/contract-foundation.js');
   return module.openContractFoundation({...intent,openContracts:open});
  }
  return open(intent);
 }
 target.AQARI_V267_OPEN_CONTRACTS=route;
 target.go=function(page,...args){
  if(page==='smartContractsPage')return route({create:true});
  if(page==='leases')return route();
  return previous?.call(this,page,...args);
 };
}
