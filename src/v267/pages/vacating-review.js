import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {createReviewWriter,reviewValues,reviewSummary,reviewHTML,REVIEW_AMOUNTS,REVIEW_LABELS} from '../domain/vacating-review.js';
const errors={VACATING_REVISION_CONFLICT:'حفظ مستخدم آخر مراجعة أحدث. حدّث السجل وراجعها قبل الحفظ.',VACATING_EVIDENCE_CHANGED:'تغير العقد أو التحصيل أو التأمين. حدّث السجل وراجع الأرقام قبل الحفظ.',VACATING_SIGNED_CONTRACT_REQUIRED:'تحتاج المراجعة عقداً موقعاً أو منتهياً محفوظاً.',VACATING_BEFORE_CONTRACT:'تاريخ الإخلاء يسبق بداية العقد.',VACATING_REQUEST_CONFLICT:'مرجع الطلب مرتبط بمراجعة مختلفة. راجع السجل.',VACATING_ACTION_UNAVAILABLE:'الإجراء النهائي غير متاح قبل اكتمال التسوية.'};
export function openVacatingReview(){
 const d=createDialog(translateStatic('مراجعة الإخلاء والتسوية'));if(!d)return;
 const urls=createPrivateUrls(d);let writer,leases=[],selected='',state=null,draft=null,output=null;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_vacating_review',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
 async function work(fn){return d.run(async()=>{try{await fn();d.session.check();}catch(e){
  if(e?.code==='42501'||[401,403].includes(e?.status)||e?.message==='ACCESS_DENIED')throw e;
  if(!d.closed){d.status.textContent=errors[e?.message]||(/^[\u0600-\u06ff]/.test(e?.message||'')?e.message:'تعذر إكمال المراجعة. تحقق من السجل قبل إعادة المحاولة.');render();}
 }});}
 async function read(){
  if(writer.pending){await writer.retry();d.session.check();}
  output=null;urls.clear();
  if(!selected){state=null;draft=null;render();return;}
  const data=await rpc('read',{lease_id:selected});d.session.check();
  if(data?.evidence?.lease?.id!==selected||!Number.isInteger(data.revision)||typeof data.evidence_token!=='string')throw Error('تعذر التحقق من بيانات العقد.');
  state=data;draft=data.review?{...data.review.request_data}:{vacate_date:'',keys_returned:false,inspection_complete:false,utilities_verified:false,rent_due:null,utilities_due:null,damage_due:null,other_due:null,reason:''};
  render();d.status.textContent=data.stale?'تغيرت بيانات العقد أو الحركات منذ آخر مراجعة. يلزم إعادة مطابقتها.':'تم استرجاع المراجعة والحركات المحفوظة.';
 }
 async function save(){
  const values=reviewValues(draft);await writer.save(values,{lease_id:selected,revision:state.revision,evidence_token:state.evidence_token});d.session.check();await read();
  d.status.textContent=translateStatic('حُفظت نسخة المراجعة وتم التحقق منها. لم يُنهَ العقد ولم تصدر براءة ذمة.');
 }
 async function print(){
  output=null;urls.clear();const id=state.review.id,result=await rpc('get',{id});d.session.check();
  if(result?.review?.id!==id||result.review.lease_id!==selected||result.review.workspace_id!==d.session.bound.workspace)throw Error('تعذر التحقق من نسخة المراجعة.');
  output=urls.create(new Blob([reviewHTML(result.review)],{type:'text/html;charset=utf-8'}));render();
 }
 function render(){
  if(d.closed)return;
  d.body.replaceChildren(node('p',translateStatic('مسودة للمراجعة — لا تنهي العقد ولا تصدر براءة ذمة. المبالغ المدخلة تحتاج مطابقة مستندات الالتزامات، والحقول الفارغة تعني أنها لم تُراجع.')));
  const select=node('select'),empty=node('option',translateStatic('اختر عقداً محفوظاً'));empty.value='';select.append(empty);
  for(const lease of leases){const option=node('option',[lease.contract_no,lease.tenant_name,lease.unit_no].join(' · '));option.value=lease.id;select.append(option);}
  select.value=selected;select.disabled=!!writer?.pending;select.onchange=()=>work(async()=>{selected=select.value;state=null;draft=null;await read();});
  d.body.append(field(translateStatic('العقد'),select),button(writer?.pending?'التحقق وإعادة نفس الطلب':'تحديث المراجعة من السجل',()=>work(read)));
  if(!state||!draft)return;
  if(writer?.pending)d.body.append(node('p',translateStatic('الحفظ بانتظار التحقق. تبقى بيانات الطلب ثابتة حتى تأكيد نتيجته.')));
  if(state.stale)d.body.append(node('p',translateStatic('المراجعة المحفوظة قديمة؛ تغيرت بيانات مرتبطة بها. طباعة النسخة السابقة لا تجعلها تسوية حالية.')));
  const l=state.evidence.lease;
  d.body.append(node('p',translateStatic('رصيد التأمين المحفوظ: ')+l.balance+' د.ك. لا يُخصم أو يُرد تلقائياً من هذه الشاشة.'));
  const form=node('form'),controls=[];
  function input(key,label,type='text'){
   const control=node(type==='textarea'?'textarea':'input');if(type!=='textarea')control.type=type;
   if(type==='checkbox')control.checked=draft[key]===true;else control.value=draft[key]??'';
   control.disabled=!!writer.pending||state.can_edit!==true;control.oninput=()=>{draft[key]=type==='checkbox'?control.checked:control.value;};controls.push(control);form.append(field(label,control));return control;
  }
  input('vacate_date','تاريخ الإخلاء المقترح','date').required=true;
  for(const key of REVIEW_AMOUNTS){const c=input(key,REVIEW_LABELS[key]+' — د.ك');c.inputMode='decimal';c.dir='ltr';c.maxLength=16;}
  for(const [key,label]of [['keys_returned','تم استلام المفاتيح'],['inspection_complete','اكتمل فحص الوحدة'],['utilities_verified','تمت مراجعة الخدمات']])input(key,label,'checkbox');
  const reason=input('reason','مرجع المراجعة وملاحظاتها','textarea');reason.required=true;reason.maxLength=2000;reason.rows=4;
  if(!writer.pending&&state.can_edit===true){const saveButton=node('button',translateStatic('حفظ نسخة المراجعة والتحقق'));saveButton.type='submit';form.append(saveButton);}
  form.onsubmit=e=>{e.preventDefault();return work(save);};d.body.append(form);
  if(state.review){
   const summary=reviewSummary(state.review.request_data,state.review.evidence.lease.balance);
   d.body.append(node('p',translateStatic('النسخة المحفوظة: ')+state.review.revision+' · '+state.review.actor_name),node('p',summary.complete?'صافي مقترح في النسخة المحفوظة: '+summary.net+' د.ك (موجب على المستأجر، سالب للمستأجر).':'لم يُحسب صافي النسخة المحفوظة لوجود مبالغ غير مراجعة.'),button('تجهيز مسودة المراجعة المحفوظة للطباعة',()=>work(print)));
  }
  if(output){const link=node('a',translateStatic('فتح مسودة المراجعة للطباعة'));link.href=output;link.target='_blank';link.rel='noopener';d.body.append(link);}
  d.body.append(node('p',translateStatic('اعتماد التسوية وإصدار براءة الذمة يتمان من مسار التسوية المخصص بعد اكتمال مراجعة الالتزامات.')));
 }
 d.onDispose(()=>{writer?.dispose();leases=[];selected='';state=null;draft=null;output=null;d.body.replaceChildren();});
 return work(async()=>{writer=createReviewWriter({rpc,scope:d.session.bound,check:d.session.check});const data=await rpc('list');d.session.check();if(!Array.isArray(data?.leases))throw Error('تعذر قراءة العقود.');leases=data.leases;render();d.status.textContent=translateStatic('اختر العقد لمراجعة الإخلاء والتسوية.');});
}

