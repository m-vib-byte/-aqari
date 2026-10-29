// Export only: never asks the server to restore or write to another project.
export async function fetchStorageBackup({session, auth, config, request=fetch}) {
 session.check();
 if(session.bound.role!=='general_manager')throw Error('لا تملك صلاحية هذه العملية.');
 if(!auth?.access_token||auth.user?.id!==session.bound.user)throw Error('تغيرت جلسة الدخول. افتح الصفحة من جديد.');
 const base=new URL(String(config.supabaseUrl||''));
 if(base.protocol!=='https:'||base.username||base.password||!config.supabasePublishableKey)throw Error('تعذر التحقق من إعداد خدمة النسخة الاحتياطية.');
 const endpoint=new URL('/functions/v1/aqari-stage-c-storage-export',base);
 const response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabasePublishableKey,Authorization:'Bearer '+auth.access_token},body:JSON.stringify({workspaceId:session.bound.workspace,restoreToIsolated:false}),cache:'no-store',credentials:'omit',redirect:'error'});
 session.check();
 if(!response.ok){
  const error=await response.json().catch(()=>({}));
  if(error?.error==='MFA_REQUIRED')throw Error('يلزم التوثيق الثنائي AAL2 قبل تنزيل النسخة الاحتياطية.');
  throw Error('تعذر تنزيل النسخة الاحتياطية للملفات.');
 }
 const hash=response.headers.get('x-aqari-backup-sha256')||'';
 if(!/^[a-f0-9]{64}$/i.test(hash)||response.headers.get('content-type')?.split(';')[0]!=='application/zip')throw Error('تعذر التحقق من ملف النسخة الاحتياطية.');
 const blob=await response.blob();session.check();
 if(blob.size<1||blob.size>70*1024*1024)throw Error('تعذر التحقق من ملف النسخة الاحتياطية.');
 const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 session.check();
 if(actual!==hash.toLowerCase())throw Error('تعذر التحقق من ملف النسخة الاحتياطية.');
 const name=(response.headers.get('content-disposition')||'').match(/filename="([A-Za-z0-9._-]+\.zip)"/)?.[1]||'aqari-storage-backup.zip';
 return {blob,name,hash:actual};
}
