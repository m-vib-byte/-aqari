(function(){
  'use strict';

  function mount(){
    if(typeof document==='undefined'||!document.body)return false;
    if(document.querySelector('.aq-v196-final'))return true;

    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v196-final';

    const title = document.createElement('strong');
    title.textContent = 'AQARI V203 — مسار العقار الموحد';

    const desc = document.createElement('small');
    desc.textContent = 'يعتمد ملف العقار وكشف الإيجار والمسار السريع على بيانات V202 الموثوقة. خذ نسخة احتياطية واختبر المعاينة قبل اعتماد Production.';

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
    result.setAttribute('role','status');
    result.setAttribute('aria-live','polite');

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
    return true;
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  }else{
    mount();
  }
})();

(function(){
  'use strict';

  const MAX_ATTEMPTS = 3;
  const LOAD_TIMEOUT_MS = 20000;
  const RETRY_BASE_MS = 300;
  const root=window;
  const runtime = root.__AQARI_RELEASE_LOADER_STATE__ || {
    assets:Object.create(null),
    pipeline:null,
    status:'idle',
    error:null,
    requiresReload:false,
    domReady:null
  };
  root.__AQARI_RELEASE_LOADER_STATE__ = runtime;
  if(!runtime.assets||typeof runtime.assets!=='object')runtime.assets=Object.create(null);
  if(runtime.loaderInstalled&&root.AQARI_RELEASE_LOADER){
    root.AQARI_RELEASE_LOADER.start().catch(function(){});
    return;
  }

  function whenDomReady(){
    if(document.head&&document.body)return Promise.resolve();
    if(runtime.domReady)return runtime.domReady;
    runtime.domReady=new Promise(function(resolve){
      function ready(){
        if(!document.head||!document.body)return;
        document.removeEventListener('DOMContentLoaded',ready);
        resolve();
      }
      document.addEventListener('DOMContentLoaded',ready);
      ready();
    });
    return runtime.domReady;
  }

  function absoluteUrl(value){
    try{return new URL(value,document.baseURI).href}catch(_){return String(value||'')}
  }

  function assetUrl(element,kind){
    return absoluteUrl(kind==='style' ? element.href : element.src);
  }

  function currentUrl(element,kind){
    return absoluteUrl(kind==='style' ? element.getAttribute('href') : element.getAttribute('src'));
  }

  function publish(name,detail){
    try{root.dispatchEvent(new CustomEvent(name,{detail:detail}))}catch(_){}
  }

  function ensureFailureUi(){
    if(!document.body)return null;
    let panel=document.getElementById('aqariReleaseLoaderError');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.id='aqariReleaseLoaderError';
    panel.hidden=true;
    panel.setAttribute('role','alert');
    panel.setAttribute('aria-live','assertive');
    panel.setAttribute('aria-atomic','true');
    panel.style.cssText='position:relative;z-index:1700;margin:12px;padding:14px 16px;border:1px solid #c9877d;border-radius:14px;background:#fff7f5;color:#53251f;font:600 14px/1.6 Tahoma,Arial,sans-serif;text-align:right';
    const title=document.createElement('strong');
    title.textContent='تعذر تشغيل واجهة عقاري V203';
    title.style.display='block';
    const message=document.createElement('span');
    message.setAttribute('data-aqari-release-error-message','');
    message.style.display='block';
    message.style.margin='4px 0 10px';
    const retry=document.createElement('button');
    retry.type='button';
    retry.setAttribute('data-aqari-release-retry','');
    retry.textContent='إعادة المحاولة';
    retry.style.cssText='min-height:44px;padding:8px 14px;border:1px solid #7c4d2b;border-radius:10px;background:#fff;color:#573319;font:700 13px Tahoma,Arial,sans-serif;cursor:pointer';
    retry.addEventListener('click',function(){
      if(runtime.status==='loading'||runtime.status==='retrying')return;
      if(runtime.requiresReload){
        if(root.location&&typeof root.location.reload==='function')root.location.reload();
        return;
      }
      root.AQARI_RELEASE_LOADER?.retry().catch(function(){});
    });
    panel.append(title,message,retry);
    document.body.insertBefore(panel,document.body.firstChild);
    return panel;
  }

  function syncFailureUi(){
    const panel=ensureFailureUi();
    if(!panel)return;
    const failed=runtime.status==='error';
    panel.hidden=!failed;
    if(!failed)return;
    const message=panel.querySelector('[data-aqari-release-error-message]');
    const retry=panel.querySelector('[data-aqari-release-retry]');
    const detail=runtime.error?String(runtime.error.message||runtime.error):'خطأ غير معروف';
    if(message)message.textContent=detail+(runtime.requiresReload?' — يلزم تحديث الصفحة قبل المحاولة مجدداً.':'');
    if(retry)retry.textContent=runtime.requiresReload?'تحديث الصفحة':'إعادة المحاولة';
  }

  function setPipelineState(status,error){
    runtime.status=status;
    runtime.error=error||null;
    const html=document.documentElement;
    if(html){
      html.dataset.aqariReleaseState=status;
      if(error)html.dataset.aqariReleaseError=String(error.message||error);
      else delete html.dataset.aqariReleaseError;
    }
    if(document.body)syncFailureUi();else whenDomReady().then(syncFailureUi);
    publish('aqari:release-loader-state',{status:status,error:error?String(error.message||error):null});
  }

  function alreadyLoaded(element,kind){
    if(element.dataset.aqariLoadState==='loaded')return true;
    if(kind==='style'&&element.sheet)return true;
    if(kind==='script'&&(element.readyState==='loaded'||element.readyState==='complete'))return true;
    return false;
  }

  function freshElement(kind,id,url){
    const element=document.createElement(kind==='style'?'link':'script');
    element.id=id;
    if(kind==='style'){
      element.rel='stylesheet';
      element.href=url;
    }else{
      element.async=false;
      element.src=url;
    }
    return element;
  }

  function loadAsset(template,kind){
    const id=template.id;
    const url=assetUrl(template,kind);
    if(!id||!url)return Promise.reject(new Error('Invalid release asset descriptor'));

    const cached=runtime.assets[id];
    if(cached&&cached.url===url){
      if(cached.status==='loading'||cached.status==='retrying')return cached.promise;
      if(kind==='script'&&cached.status==='runtime-error')return Promise.reject(cached.error||new Error('Script runtime failed: '+url));
      if(cached.status==='loaded'){
        const loadedElement=document.getElementById(id);
        if(kind==='script'||(loadedElement&&currentUrl(loadedElement,kind)===url))return Promise.resolve(loadedElement||cached.element||template);
      }
    }

    const record={id:id,url:url,kind:kind,status:'loading',attempts:0,error:null,element:null,promise:null};
    let resolveRecord;
    let rejectRecord;
    record.promise=new Promise(function(resolve,reject){resolveRecord=resolve;rejectRecord=reject});
    runtime.assets[id]=record;

    function succeed(element){
      record.status='loaded';
      record.error=null;
      record.element=element;
      element.dataset.aqariLoadState='loaded';
      element.removeAttribute('aria-invalid');
      publish('aqari:asset-loaded',{id:id,url:url,attempts:record.attempts});
      resolveRecord(element);
    }

    function fail(error,element,retryable,runtimeError){
      record.error=error;
      record.element=element||null;
      if(element){
        element.dataset.aqariLoadState=runtimeError?'runtime-error':'error';
        element.setAttribute('aria-invalid','true');
      }
      if(runtimeError){
        record.status='runtime-error';
        runtime.requiresReload=true;
        try{error.aqariRuntimeError=true}catch(_){}
        publish('aqari:asset-error',{id:id,url:url,error:String(error.message||error),runtime:true});
        rejectRecord(error);
        return;
      }
      if(retryable!==false&&record.attempts<MAX_ATTEMPTS){
        record.status='retrying';
        if(element?.dataset.aqariManaged==='true')element.remove();
        const delay=RETRY_BASE_MS*Math.pow(2,record.attempts-1);
        publish('aqari:asset-retry',{id:id,url:url,attempt:record.attempts+1,delay:delay});
        window.setTimeout(attempt,delay);
        return;
      }
      record.status='error';
      publish('aqari:asset-error',{id:id,url:url,error:String(error.message||error),runtime:false});
      rejectRecord(error);
    }

    function attempt(){
      record.attempts+=1;
      record.status='loading';
      let element=document.getElementById(id);

      if(element&&currentUrl(element,kind)!==url){
        fail(new Error('Asset id conflict for '+id),element,false);
        return;
      }

      if(element?.dataset.aqariLoadState==='error'){
        if(element.dataset.aqariManaged==='true')element.remove();
        else{
          fail(new Error('Unmanaged asset failed: '+id),element,false);
          return;
        }
        element=null;
      }

      if(element&&alreadyLoaded(element,kind)){
        succeed(element);
        return;
      }

      if(!element){
        element=record.attempts===1?template:freshElement(kind,id,url);
        element.dataset.aqariManaged='true';
      }
      element.dataset.aqariLoadState='loading';

      let settled=false;
      let timeoutId=0;
      function cleanup(){
        window.clearTimeout(timeoutId);
        element.removeEventListener('load',onLoad);
        element.removeEventListener('error',onError);
        if(kind==='script')window.removeEventListener('error',onScriptError,true);
      }
      function onLoad(){
        if(settled)return;
        settled=true;
        cleanup();
        succeed(element);
      }
      function onError(){
        if(settled)return;
        settled=true;
        cleanup();
        fail(new Error('Failed to load '+url),element);
      }
      function onScriptError(event){
        if(settled||absoluteUrl(event.filename)!==url)return;
        settled=true;
        cleanup();
        const error=event.error instanceof Error?event.error:new Error(event.message||('Script failed: '+url));
        fail(error,element,false,true);
      }

      element.addEventListener('load',onLoad,{once:true});
      element.addEventListener('error',onError,{once:true});
      if(kind==='script')window.addEventListener('error',onScriptError,true);
      timeoutId=window.setTimeout(function(){
        if(settled)return;
        settled=true;
        cleanup();
        fail(new Error('Timed out loading '+url),element);
      },LOAD_TIMEOUT_MS);

      if(!element.isConnected){
        const parent=kind==='style'?document.head:(document.body||document.head);
        if(!parent){fail(new Error('Document is not ready for '+id),element,false);return}
        parent.appendChild(element);
      }
    }

    attempt();
    return record.promise;
  }

  function loadStylesheet(element){return loadAsset(element,'style')}
  function loadScript(element){return loadAsset(element,'script')}

  function installV203Simple(){
    const simpleCss=document.createElement('link');
    simpleCss.id='aqari-v203-simple-css';
    simpleCss.rel='stylesheet';
    simpleCss.href='/v203-simple.css';

    const simple=document.createElement('script');
    simple.id='aqari-v203-simple-js';
    simple.async=false;
    simple.src='/v203-simple.js';

    return loadStylesheet(simpleCss).then(function(){return loadScript(simple)});
  }

  function installDhahawiRentLedger(){
    const rentCss = document.createElement('link');
    rentCss.id = 'aqari-v202-rent-css';
    rentCss.rel = 'stylesheet';
    rentCss.href = '/v202-rent-operations.css';

    const rent = document.createElement('script');
    rent.id = 'aqari-v202-rent-js';
    rent.async = false;
    rent.src = '/v202-rent-operations.js';

    return loadStylesheet(rentCss)
      .then(function(){return loadScript(rent)})
      .then(installV203Simple);
  }

  function installV202PropertyOS(){
    document.body.classList.add('aq-v202');

    const prestige = document.createElement('link');
    prestige.id = 'aqari-v202-prestige-css';
    prestige.rel = 'stylesheet';
    prestige.href = '/v202-prestige.css';

    const propertyOS = document.createElement('script');
    propertyOS.id = 'aqari-v202-property-os-js';
    propertyOS.async = false;
    propertyOS.src = '/v202-property-os.js';

    return loadStylesheet(prestige)
      .then(function(){return loadScript(propertyOS)})
      .then(installDhahawiRentLedger);
  }

  function installV201Experience(){
    const experience = document.createElement('script');
    experience.id = 'aqari-v201-experience-js';
    experience.async = false;
    experience.src = '/v201-experience.js';

    return loadScript(experience).then(installV202PropertyOS);
  }

  function beginV199Preview(){
    return whenDomReady().then(function(){
      document.body.classList.add('aq-v199','aq-v200','aq-v201','aq-v202');

      const stylesheet = document.createElement('link');
      stylesheet.id = 'aqari-v199-ui-css';
      stylesheet.rel = 'stylesheet';
      stylesheet.href = '/v199-ui.css';

      const luxury = document.createElement('link');
      luxury.id = 'aqari-v200-luxury-css';
      luxury.rel = 'stylesheet';
      luxury.href = '/v200-luxury.css';

      const easy = document.createElement('link');
      easy.id = 'aqari-v201-easy-css';
      easy.rel = 'stylesheet';
      easy.href = '/v201-easy.css';

      const script = document.createElement('script');
      script.id = 'aqari-v199-ui-js';
      script.async = false;
      script.src = '/v199-ui.js';

      return Promise.all([
        loadStylesheet(stylesheet),
        loadStylesheet(luxury),
        loadStylesheet(easy)
      ]).then(function(){return loadScript(script)}).then(installV201Experience);
    });
  }

  function installV199Preview(options){
    const force=options===true||options?.force===true;
    if(runtime.status==='loading')return runtime.pipeline;
    if(runtime.status==='loaded')return runtime.pipeline||Promise.resolve();
    if(runtime.requiresReload)return Promise.reject(runtime.error||new Error('A page reload is required after a script runtime error'));
    runtime.requiresReload=false;
    setPipelineState('loading');
    runtime.pipeline=beginV199Preview().then(function(value){
      setPipelineState('loaded');
      return value;
    }).catch(function(error){
      setPipelineState('error',error);
      console.error('[AQARI] Release assets failed to load',error);
      throw error;
    });
    return runtime.pipeline;
  }

  const api=window.AQARI_RELEASE_LOADER||{};
  api.start=function(){return installV199Preview()};
  api.retry=function(){return installV199Preview({force:true})};
  api.state=function(){
    return {
      status:runtime.status,
      error:runtime.error?String(runtime.error.message||runtime.error):null,
      requiresReload:Boolean(runtime.requiresReload),
      assets:Object.keys(runtime.assets).reduce(function(result,id){
        const asset=runtime.assets[id];
        result[id]={status:asset.status,attempts:asset.attempts,url:asset.url,error:asset.error?String(asset.error.message||asset.error):null};
        return result;
      },{})
    };
  };
  window.AQARI_RELEASE_LOADER=api;
  runtime.loaderInstalled=true;

  function start(){installV199Preview().catch(function(){})}
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
