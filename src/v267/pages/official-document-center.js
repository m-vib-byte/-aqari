import {createDialog,node,field} from '../components/dialog.js';
import {OFFICIAL_FORM_TEMPLATES,renderOfficialForm} from '../components/document-catalog.js';

const input=(type='text')=>Object.assign(node('input'),{type});
const option=(value,text)=>Object.assign(node('option',text),{value});
const uuid=()=>crypto.randomUUID();
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'):JSON.stringify(value);
async function sha256(value){const bytes=new TextEncoder().encode(canonical(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function openOfficialDocumentCenter(){
 const d=createDialog('مركز النماذج الرسمية والأرشيف');if(!d)return;
 let items=[],pending=false;
 const intro=node('p','كل إصدار محفوظ كلقطة غير قابلة للتعديل. التصحيح ينشئ إصداراً جديداً ويحفظ الإصدار السابق.'),form=node('form'),kind=node('select'),entityType=node('select'),entityId=input(),payload=node('textarea'),reason=input(),list=node('section');
 for(const [key,spec] of Object.entries(OFFICIAL_FORM_TEMPLATES))kind.append(option(key,spec.title));
 for(const [value,label] of [['property','عقار'],['unit','وحدة'],['tenant','مستأجر'],['lease','عقد'],['employee','موظف'],['vendor','مورد'],['work_order','أمر شغل'],['legal_case','قضية']])entityType.append(option(value,label));
 entityId.required=reason.required=true;payload.required=true;payload.rows=12;payload.placeholder='بيانات النموذج بصيغة JSON، وتشمل documentNo وissuedAt والحقول المطلوبة للنموذج.';
 form.append(field('نوع النموذج',kind),field('نوع السجل المرتبط',entityType),field('معرف السجل',entityId),field('بيانات النموذج',payload),field('سبب الإصدار',reason),Object.assign(node('button','إصدار وحفظ'),{type:'submit'}));
 d.body.append(intro,form,list);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_official_document_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 async function load(proof){const result=await rpc('list');if(!Array.isArray(result?.items))throw Error('تعذر استرجاع أرشيف النماذج.');items=result.items;render();if(proof&&!proof(items))throw Error('تم الحفظ لكن تعذر إثباته بإعادة القراءة؛ لا تكرر العملية.');}
 async function write(action,data,proof){if(pending)return;pending=true;try{await rpc(action,data);await load(proof);d.status.textContent='تم الحفظ والتحقق بإعادة القراءة من قاعدة البيانات.';}finally{pending=false;}}
 function run(action,data,proof){d.run(()=>write(action,data,proof));}
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
  let values;try{values=JSON.parse(payload.value);}catch{throw Error('بيانات النموذج ليست JSON صحيحاً.');}
  const rendered=renderOfficialForm(kind.value,values),id=uuid(),versionId=uuid();
  const snapshot={kind:rendered.kind,title:rendered.title,documentNo:rendered.documentNo,version:rendered.version,issuedAt:rendered.issuedAt,body:rendered.body,payload:rendered.snapshot};
  const hash=await sha256(snapshot);
  await write('issue',{id,version_id:versionId,event_id:uuid(),kind:rendered.kind,document_no:rendered.documentNo,entity_type:entityType.value,entity_id:entityId.value,title:rendered.title,body:rendered.body,payload:rendered.snapshot,template_version:rendered.version,content_sha256:hash,reason:reason.value.trim()},rows=>rows.some(x=>x.id===id&&x.version?.content_sha256===hash));
 });};
 async function pdf(item){
  const auth=await d.session.client.auth.getSession();d.session.check();const token=auth?.data?.session?.access_token;if(!token||auth?.data?.session?.user?.id!==d.session.bound.user)throw Error('انتهت جلسة الدخول.');
  const response=await fetch('/api/official-document',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({workspaceId:d.session.bound.workspace,documentId:item.id,version:item.current_version})});
  d.session.check();if(!response.ok)throw Error('تعذر إنشاء ملف PDF.');const blob=await response.blob();if(blob.type!=='application/pdf'||await blob.slice(0,5).text()!=='%PDF-')throw Error('الملف الناتج ليس PDF موثوقاً.');d.session.check();saveBlob(blob,item.document_no+'-v'+item.current_version+'.pdf');
 }
 function render(){list.replaceChildren(node('h3','الإصدارات المحفوظة'));
  for(const item of items){const card=node('article'),title=node('h4',`${item.document_no} — ${item.version.title}`),meta=node('p',`الإصدار ${item.current_version} • ${item.status==='void'?'ملغى':'صادر'} • ${item.version.issued_by_name}`),download=node('button','تنزيل PDF'),history=node('button','عرض جميع الإصدارات');download.type=history.type='button';download.disabled=pending;history.disabled=pending;
   const archive=node('section');
   download.onclick=()=>d.run(()=>pdf(item));history.onclick=()=>d.run(async()=>{
    const result=await rpc('get',{id:item.id});const versions=result?.versions;
    if(result?.series?.id!==item.id||result.series.workspace_id!==d.session.bound.workspace||!Array.isArray(versions))throw Error('تعذر تأكيد أرشيف المستند.');
    archive.replaceChildren(node('h5','النسخ المؤرشفة'));
    for(const v of versions){const previous=node('button',`تنزيل الإصدار ${v.version}`);previous.type='button';previous.onclick=()=>d.run(()=>pdf({...item,current_version:v.version}));archive.append(previous);}
    d.status.textContent=versions.length?'تم استرجاع النسخ المحفوظة.':'لا توجد إصدارات.';
   });card.append(title,meta,download,history,archive);
   if(item.status==='issued'){const replace=node('button','إنشاء إصدار مصحح'),voidButton=node('button','إلغاء موثق');replace.type=voidButton.type='button';replace.onclick=()=>d.run(async()=>{let values;try{values=JSON.parse(payload.value);}catch{throw Error('أدخل بيانات الإصدار المصحح في حقل JSON.');}const rendered=renderOfficialForm(item.kind,values),snapshot={kind:rendered.kind,title:rendered.title,documentNo:item.document_no,version:rendered.version,issuedAt:rendered.issuedAt,body:rendered.body,payload:rendered.snapshot},hash=await sha256(snapshot),versionId=uuid();await write('supersede',{id:item.id,version_id:versionId,event_id:uuid(),expected_version:item.current_version,title:rendered.title,body:rendered.body,payload:rendered.snapshot,template_version:rendered.version,content_sha256:hash,reason:reason.value.trim()},rows=>rows.some(x=>x.id===item.id&&x.current_version===item.current_version+1&&x.version.content_sha256===hash));});voidButton.onclick=()=>run('void',{id:item.id,event_id:uuid(),reason:reason.value.trim()},rows=>rows.some(x=>x.id===item.id&&x.status==='void'));card.append(replace,voidButton);}
   list.append(card);
  }
 }
 d.onDispose(()=>{items=[];payload.value='';});d.run(load);
}
