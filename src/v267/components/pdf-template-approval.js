import {node,field} from './dialog.js';
import {t} from './locale.js';

export function pdfTemplateAccess(d,property){
 return async(action,data={})=>{
  const result=await d.session.request(d.session.client.rpc('aqari_pdf_templates',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{property_id:property.id,...data}}));
  d.session.check();return result;
 };
}

export async function mountPdfTemplateApprovals(d,target,property,{manager,onOpen}){
 const rpc=pdfTemplateAccess(d,property),list=node('section'),cards=node('div'),requests=node('section'),requestCards=node('div');
 const button=(label,fn)=>{const b=node('button',t(label));b.type='button';b.onclick=()=>d.run(fn);return b;};
 const status=node('p');status.setAttribute('role','status');
 list.append(node('h3',t('نماذج معتمدة للتعبئة')),node('p',t('التعبئة تحفظ بياناتك الخاصة. تعديل النص والحقول واعتماد النموذج من صلاحية المدير.')),cards,status);
 let offset=0,requestOffset=0;
 const more=button('عرض نماذج معتمدة أخرى',load),requestMore=button('عرض طلبات أخرى',loadRequests);
 list.append(more);requests.append(node('h3',t('طلبات تعديل النماذج')),requestCards,requestMore);target.append(list,requests);
 async function load(){
  const result=await rpc('list',{offset});
  for(const item of result.items.slice(0,20)){
   const card=node('article');card.append(node('strong',item.title),node('p',t(item.is_active?'معتمد للتعبئة':'موقوف للتعبئة')));
   if(item.is_active)card.append(button('تعبئة النموذج المعتمد',()=>onOpen(item.document_id)));
   if(manager&&item.is_active)card.append(button('إيقاف تعبئة هذا النموذج',async()=>{await rpc('revoke',{document_id:item.document_id});offset=0;cards.replaceChildren();await load();d.status.textContent=t('أوقفت التعبئة الجديدة لهذا النموذج؛ الأصل والبيانات المحفوظة باقية.');}));
   cards.append(card);
  }
  offset=result.next_offset;more.hidden=!result.has_more;status.textContent=cards.children.length?'':t('لا توجد نماذج معتمدة للتعبئة في هذا العقار.');
 }
 async function loadRequests(){
  const result=await rpc('requests',{offset:requestOffset});
  for(const item of result.items.slice(0,20)){
   const card=node('article');card.append(node('p',item.reason),node('p',new Date(item.requested_at).toLocaleString()),node('p',item.response||t('بانتظار مراجعة المدير')));
   if(manager&&!item.response){
    const response=node('textarea');response.maxLength=1000;response.rows=3;
    card.append(field(t('رد المدير على طلب التعديل'),response),button('حفظ رد المدير',async()=>{const value=response.value.trim();if(value.length<3)throw Error(t('اكتب ردًا من ٣ أحرف على الأقل.'));await rpc('respond',{id:item.id,response:value});requestOffset=0;requestCards.replaceChildren();await loadRequests();}));
   }
   requestCards.append(card);
  }
  requestOffset=result.next_offset;requestMore.hidden=!result.has_more;
 }
 await load();await loadRequests();
}

export function mountPdfTemplateChangeRequest(d,target,property,documentId){
 const rpc=pdfTemplateAccess(d,property),panel=node('details'),reason=node('textarea'),status=node('p'),send=node('button',t('حفظ طلب التعديل'));
 let requestId=null,requestReason='';panel.style.width='100%';reason.rows=3;reason.maxLength=1000;send.type='button';status.setAttribute('role','status');
 panel.append(node('summary',t('طلب تعديل النموذج من المدير')),field(t('التعديل المطلوب في النموذج'),reason),send,status);
 send.onclick=()=>d.run(async()=>{
  const value=reason.value.trim();if(value.length<3)throw Error(t('وضح التعديل المطلوب في ٣ أحرف على الأقل.'));
  if(value!==requestReason){requestReason=value;requestId=crypto.randomUUID();}
  await rpc('request',{id:requestId,document_id:documentId,reason:value});
  status.textContent=t('حُفظ الطلب للمدير. يمكنك متابعة الرد من النماذج المحفوظة.');
 });target.append(panel);
}
