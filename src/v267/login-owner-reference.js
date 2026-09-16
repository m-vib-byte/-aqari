(function(){
'use strict';
const GUEST_ID='aqariOwnerGuestPreview';
const DIALOG_ID='aqariOwnerGuestDialog';
function mount(){
 const main=document.querySelector('body.v267-login-page main');
 if(!main||document.getElementById(GUEST_ID))return;
 const button=document.createElement('button');button.type='button';button.id=GUEST_ID;button.className='aq-owner-login-guest';button.textContent='معاينة كضيف — بدون بيانات';
 const note=document.createElement('p');note.className='aq-owner-login-trust';note.textContent='المعاينة لا تسجل دخولًا ولا تقرأ عقارات أو مستأجرين أو مستندات أو بيانات مالية.';
 button.addEventListener('click',()=>{
  let dialog=document.getElementById(DIALOG_ID);
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id=DIALOG_ID;dialog.className='aq-owner-login-dialog';
   dialog.innerHTML='<form method="dialog" class="aq-owner-login-dialog-head"><div><strong>معاينة عقاري</strong><small>عرض عام وآمن بدون بيانات خاصة</small></div><button value="close" aria-label="إغلاق">×</button></form><div class="aq-owner-login-dialog-body"><article><strong>إدارة العقارات والتحصيل</strong><small>مسارات العقار والوحدة والمستأجر والعقد والتحصيل.</small></article><article><strong>الصيانة والتنبيهات</strong><small>متابعة الطلبات والمهام والاستحقاقات.</small></article><article><strong>التقارير والموافقات</strong><small>لوحات الإدارة والتقارير ومراكز الموافقة حسب صلاحية الحساب بعد الدخول.</small></article><p>هذه المعاينة لا تتصل بقاعدة البيانات ولا تعرض أي سجل حقيقي.</p></div>';
   document.body.appendChild(dialog);
  }
  dialog.showModal?.();
 });
 const status=document.getElementById('status');
 if(status)main.insertBefore(button,status);else main.appendChild(button);
 if(status)main.insertBefore(note,status);else main.appendChild(note);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
