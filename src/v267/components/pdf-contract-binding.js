import {node,field} from './dialog.js';
import {t} from './locale.js';
import {createOriginalDocumentUpload} from './original-document-upload.js';
import {readPropertyContractArchive} from './property-contract-archive.js';
import {appendPdfViewer} from './pdf-viewer.js';
import {checksum} from './scan-image.js';

const rpc=(d,property,action,data={})=>d.session.request(d.session.client.rpc('aqari_pdf_contract_bindings',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{property_id:property.id,...data}}));
const button=(d,label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(fn);return b;};

// The manager explicitly confirms the lease selection. This is an archived,
// unsigned copy; it never changes the lease lifecycle or records a payment.
export function mountPdfContractBinding(d,target,{property,version,blob,title,isCurrent}){
 if(d.session.bound.role!=='general_manager')return;
 const section=node('section');target.append(section);
 if(!version?.document_id){section.append(node('p',t('اربط النسخة بالعقد بعد حفظ النموذج واعتماد إصداره.')));return;}
 const upload=createOriginalDocumentUpload(d.session);let uploaded=null,selected=null,offset=0;
 const choices=node('select'),query=node('input'),status=node('p'),confirm=node('input'),results=node('div');
 query.type='search';query.maxLength=100;confirm.type='checkbox';status.setAttribute('role','status');
 const save=button(d,'حفظ نسخة مرتبطة بالعقد',async()=>{
  const lease=selected;
  if(!lease||!confirm.checked)throw Error(t('اختر العقد وأكد مطابقة بياناته للنسخة.'));
  if(!isCurrent())throw Error(t('تغيرت البيانات؛ أعد معاينة النسخة قبل ربطها.'));
  if(!uploaded)uploaded=await upload(new File([blob],'filled-contract.pdf',{type:'application/pdf'}),{type:'property',ref:property.externalRef,propertyId:property.id,category:'property_contract',title:(title+' — نسخة مرتبطة بعقد').slice(0,180),pdfSource:version});
  const result=await rpc(d,property,'bind',{contract_ref:lease.external_ref,artifact_document_id:uploaded.id,template_document_id:version.document_id,template_revision:version.revision,confirmed:true});
  const readback=await rpc(d,property,'list',{contract_ref:lease.external_ref});
  if(result.artifact_document_id!==uploaded.id||result.lease_id!==lease.id||result.template_document_id!==version.document_id||result.template_revision!==version.revision||!readback.items?.some(row=>row.artifact_document_id===uploaded.id))throw Error(t('لم تتأكد إعادة قراءة النسخة المرتبطة. أعد المحاولة.'));
  save.disabled=true;choices.disabled=true;confirm.disabled=true;query.disabled=true;
  status.textContent=t('حُفظت النسخة وربطت بالعقد ')+lease.contract_no+t(' — إصدار النموذج ')+version.revision+t('. تجدها داخل العقد في «نسخ PDF المرتبطة». حالة العقد والسداد لم تتغير.');
 });
 save.disabled=true;
 const rows=new Map();choices.onchange=()=>{selected=rows.get(choices.value)||null;confirm.checked=false;save.disabled=true;};confirm.onchange=()=>{save.disabled=!selected||!confirm.checked;};
 const more=button(d,'عرض عقود أخرى',()=>load(false));more.hidden=true;
 async function load(reset){
  if(reset){rows.clear();choices.replaceChildren();const empty=node('option',t('اختر العقد'));empty.value='';choices.append(empty);selected=null;offset=0;confirm.checked=false;save.disabled=true;}
  const result=await rpc(d,property,'leases',{query:query.value.trim(),offset});d.session.check();
  for(const row of result.items.slice(0,50)){rows.set(row.external_ref,row);const option=node('option',[row.contract_no,t('الوحدة ')+row.unit_no,row.tenant].filter(Boolean).join(' · '));option.value=row.external_ref;choices.append(option);}
  offset=result.next_offset;more.hidden=!result.has_more;status.textContent=rows.size?'':t('لا توجد عقود مطابقة في هذا العقار.');
 }
 section.append(node('h3',t('ربط النسخة بالعقد')),node('p',t('نسخة غير موقعة محفوظة مع مرجع النموذج. راجع المستأجر والوحدة قبل الربط.')),field(t('بحث عن العقد أو الوحدة أو المستأجر'),query),button(d,'البحث عن عقد للربط',()=>load(true)),field(t('العقد المرتبط بالنسخة'),choices),more,field(t('راجعت البيانات وهي تخص هذا العقد والمستأجر والوحدة'),confirm),save,status,results);
 // Read only when requested, so PDF preview remains usable independently.
 section.append(button(d,'تحميل عقود العقار للربط',()=>load(true)));
}

export async function mountBoundContractPdfs(d,target,{property,contractRef}){
 const section=node('section'),list=node('div'),status=node('p');status.setAttribute('role','status');let offset=0;
 const urls=[];d.onDispose(()=>urls.forEach(url=>URL.revokeObjectURL(url)));
 const more=button(d,'عرض نسخ أقدم',load);more.hidden=true;
 section.append(node('h3',t('نسخ PDF المرتبطة')),node('p',t('هذه النسخ محفوظة كما رُبطت بالعقد؛ تحديث النموذج لا يغيّرها.')),list,status,more);target.append(section);
 async function load(){
  const result=await rpc(d,property,'list',{contract_ref:String(contractRef),offset});d.session.check();
  for(const row of result.items.slice(0,20)){
   const card=node('article'),viewer=node('div');
   card.append(node('p',t('إصدار النموذج ')+row.template_revision+' · '+new Date(row.created_at).toLocaleString()),button(d,'فتح النسخة المرتبطة',async()=>{
    const blob=await readPropertyContractArchive(d.session,property,row.artifact_document_id);
    if(await checksum(blob)!==row.artifact_checksum)throw Error(t('النسخة لا تطابق بصمتها وقت الربط.'));
    d.session.check();const url=URL.createObjectURL(blob);urls.push(url);viewer.replaceChildren();appendPdfViewer(viewer,url,{title:t('نسخة العقد المحفوظة'),filename:'contract-copy.pdf',embed:false,downloadLabel:'تحميل النسخة المرتبطة PDF'});
   }),viewer);list.append(card);
  }
  offset=result.next_offset;more.hidden=!result.has_more;status.textContent=list.children.length?'':t('لا توجد نسخة PDF مرتبطة بإصدار نموذج لهذا العقد.');
 }
 try{await load();}catch{status.textContent=t('تعذر تحميل نسخ PDF المرتبطة.');section.append(button(d,'إعادة تحميل نسخ PDF المرتبطة',load));}
}
