(function(){
  'use strict';

  function mount(){
    if(document.querySelector('.aq-v196-final')) return;

    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v196-final';

    const title = document.createElement('strong');
    title.textContent = 'AQARI V198 — المرشح النهائي للإطلاق';

    const desc = document.createElement('small');
    desc.textContent = 'قبل أول نقل بيانات: خذ نسخة احتياطية من بيانات الجهاز، ثم نفّذ Migration على Preview، وبعد نجاح E2E فقط يتم اعتماد Production.';

    const actions = document.createElement('div');
    actions.className = 'aq-v196-actions';

    const backup = document.createElement('button');
    backup.type = 'button';
    backup.textContent = 'تنزيل نسخة احتياطية';

    const cloud = document.createElement('button');
    cloud.type = 'button';
    cloud.textContent = 'معاينة السحابة';

    const status = document.createElement('button');
    status.type = 'button';
    status.textContent = 'فحص الجاهزية';

    const result = document.createElement('pre');
    result.className = 'aq-v196-result';

    backup.addEventListener('click', ()=>{
      try{
        const snap = window.AQARI_BACKUP.download();
        result.textContent = JSON.stringify({
          ok:true,
          action:'backup',
          keys:Object.keys(snap.values || {}).length,
          capturedAt:snap.capturedAt
        },null,2);
      }catch(err){
        result.textContent = 'تعذر إنشاء النسخة الاحتياطية: ' + (err?.message || String(err));
      }
    });

    cloud.addEventListener('click', async ()=>{
      try{
        const c = await window.AQARI_CLOUD_SYNC.downloadCloudPreview();
        result.textContent = JSON.stringify({
          revision:c?.revision ?? null,
          updatedAt:c?.updatedAt ?? null,
          payloadTopLevelKeys:
            c?.payload && typeof c.payload === 'object' ? Object.keys(c.payload).length : 0
        },null,2);
      }catch(err){
        result.textContent = 'تعذر جلب حالة السحابة: ' + (err?.message || String(err));
      }
    });

    status.addEventListener('click', async ()=>{
      try{
        const r = await fetch('/api/final-release-status',{cache:'no-store'});
        result.textContent = JSON.stringify(await r.json(),null,2);
      }catch(err){
        result.textContent = 'تعذر فحص الجاهزية: ' + (err?.message || String(err));
      }
    });

    actions.append(backup,cloud,status);
    box.append(title,desc,actions,result);

    const anchor = root.querySelector('.aq-v195-prod-status,.aq-v193-autosync,.aq-v192-wizard');
    if(anchor && anchor.nextSibling) root.insertBefore(box,anchor.nextSibling);
    else root.insertBefore(box,root.firstChild);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  }else{
    mount();
  }
})();

(function(){
  'use strict';

  function installV202PropertyOS(){
    document.body?.classList.add('aq-v202');

    if(!document.getElementById('aqari-v202-prestige-css')){
      const prestige = document.createElement('link');
      prestige.id = 'aqari-v202-prestige-css';
      prestige.rel = 'stylesheet';
      prestige.href = '/v202-prestige.css';
      document.head.appendChild(prestige);
    }

    if(!document.getElementById('aqari-v202-property-os-js')){
      const propertyOS = document.createElement('script');
      propertyOS.id = 'aqari-v202-property-os-js';
      propertyOS.src = '/v202-property-os.js';
      document.body.appendChild(propertyOS);
    }
  }

  function installV201Experience(){
    if(document.getElementById('aqari-v201-experience-js')){
      installV202PropertyOS();
      return;
    }
    const experience = document.createElement('script');
    experience.id = 'aqari-v201-experience-js';
    experience.src = '/v201-experience.js';
    experience.addEventListener('load', installV202PropertyOS, { once:true });
    document.body.appendChild(experience);
  }

  function installV199Preview(){
    document.body?.classList.add('aq-v199','aq-v200','aq-v201','aq-v202');

    if(!document.getElementById('aqari-v199-ui-css')){
      const stylesheet = document.createElement('link');
      stylesheet.id = 'aqari-v199-ui-css';
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/v199-ui.css';
      document.head.appendChild(stylesheet);
    }

    if(!document.getElementById('aqari-v200-luxury-css')){
      const luxury = document.createElement('link');
      luxury.id = 'aqari-v200-luxury-css';
      luxury.rel = 'stylesheet';
      luxury.href = '/v200-luxury.css';
      document.head.appendChild(luxury);
    }

    if(!document.getElementById('aqari-v201-easy-css')){
      const easy = document.createElement('link');
      easy.id = 'aqari-v201-easy-css';
      easy.rel = 'stylesheet';
      easy.href = '/v201-easy.css';
      document.head.appendChild(easy);
    }

    if(!document.getElementById('aqari-v199-ui-js')){
      const script = document.createElement('script');
      script.id = 'aqari-v199-ui-js';
      script.src = '/v199-ui.js';
      script.addEventListener('load', installV201Experience, { once:true });
      document.body.appendChild(script);
    }else{
      installV201Experience();
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', installV199Preview, { once:true });
  }else{
    installV199Preview();
  }
})();
