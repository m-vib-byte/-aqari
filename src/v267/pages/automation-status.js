import {node} from '../components/dialog.js';
import {currentScope,safeError} from '../api/session.js';

// Staging has an outbox, but no configured recurring scheduler or sender.
// Do not load production's scheduler client or claim that reminders are being sent.
try{
 const scope=currentScope(),home=document.getElementById('home');
 if(home&&!document.getElementById('aqari-v267-automation-status')){
  const panel=node('section'),title=node('h2','التنبيهات والأتمتة'),status=node('p','التشغيل المجدول والإرسال الخارجي غير مهيّأين في المعاينة. تجهيز السجل لا يعني إرسال الرسائل.'),button=node('button','عرض سجل التنبيهات المحفوظ');
  panel.id='aqari-v267-automation-status';panel.className='aq267-tools';panel.setAttribute('aria-label','حالة الأتمتة التجريبية');status.setAttribute('role','status');button.type='button';
  button.onclick=async()=>{try{const live=currentScope();if(live.workspace!==scope.workspace||live.user!==scope.user)throw Error('تغيّرت جلسة الدخول.');const desk=await import('../../../v267-service-desk.js');await desk.openDesk('notifications');}catch(e){status.textContent=safeError(e);}};
  panel.append(title,status,button);home.append(panel);
  window.addEventListener('aqari:auth-boundary',()=>{try{const live=currentScope();if(live.workspace!==scope.workspace||live.user!==scope.user)panel.remove();}catch{panel.remove();}});
 }
}catch{ /* Auth boundary: no panel and no background requests. */ }
