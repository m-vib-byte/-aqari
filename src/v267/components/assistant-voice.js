// Browser speech only: no audio recording, storage or new provider credentials.
export function createAssistantVoice({host,allowed,language,onText,onState,busy=()=>false}){
 const Recognition=host.SpeechRecognition||host.webkitSpeechRecognition;
 let recognition=null,epoch=0,autoRead=false,lastAnswer='',timer=null;
 const state=(value)=>onState(value);
 const clearTimer=()=>{if(timer!==null)host.clearTimeout(timer);timer=null;};
 function stop(){epoch++;autoRead=false;clearTimer();const old=recognition;recognition=null;try{old?.abort();}catch{}try{host.speechSynthesis?.cancel();}catch{}state('idle');}
 function speak(text){
  if(!allowed()||!text)return false;
  if(!host.speechSynthesis||!host.SpeechSynthesisUtterance){state('no-speaker');return false;}
  const token=++epoch;clearTimer();const old=recognition;recognition=null;try{old?.abort();}catch{}
  try{
   host.speechSynthesis.cancel();
   const utterance=new host.SpeechSynthesisUtterance(text);utterance.lang=language();
   const voices=host.speechSynthesis.getVoices?.()||[];
   const voice=voices.find(v=>v.lang===utterance.lang)||voices.find(v=>v.lang?.split('-')[0]===utterance.lang.split('-')[0]);
   if(voice)utterance.voice=voice;
   utterance.onend=()=>{if(token===epoch)state('idle');};
   utterance.onerror=()=>{if(token===epoch)state('playback-error');};
   state('speaking');host.speechSynthesis.speak(utterance);return true;
  }catch{state('playback-error');return false;}
 }
 function start(){
  if(!allowed()||busy())return false;
  stop();if(!Recognition){state('unsupported');return false;}
  const token=epoch;let delivered=false;
  try{
   const current=new Recognition();recognition=current;autoRead=true;
   current.lang=language();current.continuous=false;current.interimResults=false;current.maxAlternatives=1;
   current.onresult=event=>{
    if(token!==epoch||!allowed()||busy()||delivered)return;
    const text=Array.from(event.results||[]).filter(r=>r.isFinal!==false).map(r=>r[0]?.transcript||'').join(' ').trim().slice(0,1200);
    if(!text)return;delivered=true;clearTimer();recognition=null;try{current.abort();}catch{}
    state('thinking');onText(text);
   };
   current.onerror=event=>{if(token!==epoch||delivered)return;epoch++;clearTimer();recognition=null;autoRead=false;try{current.abort();}catch{}state(event.error==='not-allowed'||event.error==='service-not-allowed'?'permission-denied':event.error==='no-speech'?'no-speech':'recognition-error');};
   current.onend=()=>{if(token===epoch&&!delivered&&recognition===current){epoch++;clearTimer();recognition=null;autoRead=false;state('no-speech');}};
   state('listening');current.start();
   timer=host.setTimeout(()=>{if(token===epoch&&!delivered){stop();state('no-speech');}},30000);
   return true;
  }catch{stop();state('recognition-error');return false;}
 }
 return {start,stop,clear(){stop();lastAnswer='';},requestStarted(){clearTimer();const old=recognition;recognition=null;epoch++;try{old?.abort();}catch{}try{host.speechSynthesis?.cancel();}catch{}state('thinking');},answer(text){if(!allowed())return;lastAnswer=text;if(autoRead)speak(text);else state('idle');},failed(){autoRead=false;state('idle');},read(){return speak(lastAnswer);},supported:Boolean(Recognition)};
}

export function mountAssistantVoice({dialog,form,input,host,identity,language,busy}){
 const doc=dialog.ownerDocument,scope=identity();
 const controls=doc.createElement('div');controls.id='aqExactVoiceControls';controls.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:10px 0;';
 const make=(text)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.style.cssText='min-height:44px;padding:10px 14px;flex:1 1 130px;';controls.append(b);return b;};
 const mic=make('🎤 تكلم مع المساعد'),read=make('🔊 سماع آخر رد'),stop=make('إيقاف الصوت');read.disabled=true;
 const status=doc.createElement('p');status.id='aqExactVoiceStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='font-size:14px;margin:4px 0;';
 const hint=doc.createElement('small');hint.textContent='اضغط المايك وتكلم؛ يُرسل سؤالك عند انتهاء الكلام ويرد المساعد بصوت آلي. يستخدم التعرف الصوتي خدمة المتصفح، وقد تُرسل إليها مقاطع الصوت. اضغط المايك مجددًا لسؤال آخر.';
 form.before(controls,status,hint);
 const messages={idle:'الصوت متوقف. اضغط المايك للتحدث.',listening:'أسمعك الآن… تكلم ثم توقف لإرسال سؤالك.',thinking:'جارٍ إعداد الرد…',speaking:'المساعد يتحدث…',unsupported:'المايك غير مدعوم هنا. افتح الموقع في Safari أو استخدم مايك لوحة المفاتيح.','no-speaker':'قراءة الصوت غير مدعومة في هذا المتصفح.','permission-denied':'لم يُسمح بالمايك. اسمح له من إعدادات الموقع ثم حاول مجددًا.','no-speech':'لم أسمع كلامًا. اضغط المايك وحاول مرة ثانية.','recognition-error':'تعذر تشغيل المايك. جرّب Safari أو مايك لوحة المفاتيح.','playback-error':'تعذر تشغيل الصوت تلقائيًا. اضغط «سماع آخر رد».'};
 const voice=createAssistantVoice({host,allowed:()=>dialog.open&&identity()===scope,language,busy,onText:text=>{input.value=text;form.requestSubmit();},onState:value=>{status.textContent=messages[value]||messages.idle;mic.disabled=value==='thinking';mic.setAttribute('aria-pressed',String(value==='listening'));}});
 mic.onclick=()=>voice.start();read.onclick=()=>voice.read();stop.onclick=()=>voice.stop();
 const hide=()=>{if(doc.hidden)voice.stop();};doc.addEventListener('visibilitychange',hide);
 dialog.addEventListener('close',()=>{voice.clear();read.disabled=true;});
 dialog.addEventListener('cancel',()=>voice.clear());
 status.textContent=messages[voice.supported?'idle':'unsupported'];
 return {...voice,answer(text){read.disabled=false;voice.answer(text);},destroy(){voice.clear();doc.removeEventListener('visibilitychange',hide);}};
}
