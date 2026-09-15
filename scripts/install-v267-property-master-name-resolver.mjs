import {readFileSync,writeFileSync} from 'node:fs';

const url=new URL('../src/v267/pages/property-master-file.js',import.meta.url);
let source=readFileSync(url,'utf8');
const rpcName='aqari_property_master_resolve_by_name';
if(!source.includes(rpcName)){
 const anchor=`export async function openPropertyMasterFileByName(name){
 const bridge=window.AQARI_SUPABASE,initialUser=bridge?.context?.user?.id,initialWorkspace=bridge?.context?.workspace?.id;
 if(!initialUser||!initialWorkspace||typeof bridge?.getClient!=='function')throw Error('الجلسة غير جاهزة.');
 const assertSameScope=()=>{if(bridge?.context?.user?.id!==initialUser||bridge?.context?.workspace?.id!==initialWorkspace)throw Error('تغيرت الجلسة أو مساحة العمل أثناء فتح ملف العقار. أعد المحاولة.');};
 const client=await bridge.getClient();assertSameScope();
 const {data,error}=await client.from('aqari_properties').select('id,name').eq('workspace_id',initialWorkspace).eq('name',String(name||'').trim()).limit(2);assertSameScope();
 if(error)throw error;if(!Array.isArray(data)||data.length!==1)throw Error(data?.length?'اسم العقار غير فريد. افتح السجل باستخدام معرفه.':'لم يتم ربط هذا العقار بالسجل الخادمي بعد.');
 return openPropertyMasterFile(data[0].id);
}`;
 if(!source.includes(anchor))throw Error('V267_PROPERTY_MASTER_NAME_LOOKUP_ANCHOR_MISSING');
 const replacement=`export async function openPropertyMasterFileByName(name){
 const bridge=window.AQARI_SUPABASE,initialUser=bridge?.context?.user?.id,initialWorkspace=bridge?.context?.workspace?.id;
 if(!initialUser||!initialWorkspace||typeof bridge?.getClient!=='function')throw Error('الجلسة غير جاهزة.');
 const assertSameScope=()=>{if(bridge?.context?.user?.id!==initialUser||bridge?.context?.workspace?.id!==initialWorkspace)throw Error('تغيرت الجلسة أو مساحة العمل أثناء فتح ملف العقار. أعد المحاولة.');};
 const propertyName=text(name);if(!propertyName)throw Error('اسم العقار مطلوب.');
 const client=await bridge.getClient();assertSameScope();
 const {data,error}=await client.rpc('${rpcName}',{p_workspace_id:initialWorkspace,p_name:propertyName});assertSameScope();
 if(error)throw error;
 if(data?.workspace_id!==initialWorkspace||data?.user_id!==initialUser||!data?.property_id)throw Error('تعذر تأكيد نطاق العقار المطلوب.');
 return openPropertyMasterFile(data.property_id);
}`;
 source=source.replace(anchor,replacement);
 writeFileSync(url,source);
 console.log('Installed permission-scoped property name resolver for this V267 build.');
}else console.log('V267 property name resolver already installed.');
