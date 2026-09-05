(function(){
  'use strict';

  function mount(){
    if(document.querySelector('.aq-v196-final')) return;

    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v196-final';

    const title = document.createElement('strong');
    title.textContent = 'عقاري V266 — التشغيل الآلي السحابي';

    const desc = document.createElement('small');
    desc.textContent = 'الإصدار التشغيلي يضيف لوحة آمنة لمتابعة الجدولة اليومية والاستحقاقات من السحابة، مع بقاء مركز المتابعة وأدوات النسخ الاحتياطي وفحص الجاهزية متاحة.';

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

  const PRODUCT_RELEASE='V266';
  function releaseAsset(path){
    return path+(path.includes('?')?'&':'?')+'release='+encodeURIComponent(PRODUCT_RELEASE);
  }

  function syncReleaseIdentity(){
    if(typeof globalThis!=='undefined')globalThis.AQARI_RELEASE=PRODUCT_RELEASE;
    let meta=document.querySelector('meta[name="aqari-release"]');
    if(!meta&&document.head){
      meta=document.createElement('meta');
      meta.name='aqari-release';
      document.head.appendChild(meta);
    }
    if(meta)meta.content=PRODUCT_RELEASE;
    document.title='عقاري '+PRODUCT_RELEASE+' • Supabase Connected';
  }

  function installV266SchedulerControl(){
    document.body?.classList.add('aq-v266');

    if(!document.getElementById('aqari-v266-scheduler-control-css')){
      const schedulerCss=document.createElement('link');
      schedulerCss.id='aqari-v266-scheduler-control-css';
      schedulerCss.rel='stylesheet';
      schedulerCss.href=releaseAsset('/v266-scheduler-control.css');
      document.head.appendChild(schedulerCss);
    }

    if(!document.getElementById('aqari-v266-scheduler-control-js')){
      const schedulerJs=document.createElement('script');
      schedulerJs.id='aqari-v266-scheduler-control-js';
      schedulerJs.src=releaseAsset('/v266-scheduler-control.js');
      document.body.appendChild(schedulerJs);
    }
  }

  function installV211FollowUpCenter(){
    document.body?.classList.add('aq-v211');

    if(!document.getElementById('aqari-v211-follow-up-center-css')){
      const followUpCss=document.createElement('link');
      followUpCss.id='aqari-v211-follow-up-center-css';
      followUpCss.rel='stylesheet';
      followUpCss.href='/v211-follow-up-center.css?v=211.1';
      document.head.appendChild(followUpCss);
    }

    if(!document.getElementById('aqari-v211-follow-up-center-js')){
      const followUpJs=document.createElement('script');
      followUpJs.id='aqari-v211-follow-up-center-js';
      followUpJs.src='/v211-follow-up-center.js?v=211.1';
      document.body.appendChild(followUpJs);
    }
    installV266SchedulerControl();
  }

  function installV210DailyCommandCenter(){
    document.body?.classList.add('aq-v210');

    if(!document.getElementById('aqari-v210-daily-command-center-css')){
      const commandCss=document.createElement('link');
      commandCss.id='aqari-v210-daily-command-center-css';
      commandCss.rel='stylesheet';
      commandCss.href='/v210-daily-command-center.css?v=210.0';
      document.head.appendChild(commandCss);
    }

    let commandJs=document.getElementById('aqari-v210-daily-command-center-js');
    if(!commandJs){
      commandJs=document.createElement('script');
      commandJs.id='aqari-v210-daily-command-center-js';
      commandJs.src='/v210-daily-command-center.js?v=210.0';
      commandJs.dataset.v211LoaderBound='true';
      commandJs.addEventListener('load', installV211FollowUpCenter, { once:true });
      document.body.appendChild(commandJs);
    }else if(window.AQARI_V210?.version==='V210-daily-command-center'||document.querySelector('meta[name="aqari-daily-command-center"]')){
      installV211FollowUpCenter();
    }else if(commandJs.dataset.v211LoaderBound!=='true'){
      commandJs.dataset.v211LoaderBound='true';
      commandJs.addEventListener('load', installV211FollowUpCenter, { once:true });
    }
  }

  function installV209GlobalSearch(){
    document.body?.classList.add('aq-v209');

    if(!document.getElementById('aqari-v209-global-search-css')){
      const globalSearchCss=document.createElement('link');
      globalSearchCss.id='aqari-v209-global-search-css';
      globalSearchCss.rel='stylesheet';
      globalSearchCss.href='/v209-global-search.css?v=209.1';
      document.head.appendChild(globalSearchCss);
    }

    let globalSearchJs=document.getElementById('aqari-v209-global-search-js');
    if(!globalSearchJs){
      globalSearchJs=document.createElement('script');
      globalSearchJs.id='aqari-v209-global-search-js';
      globalSearchJs.src='/v209-global-search.js?v=209.1';
      globalSearchJs.dataset.v210LoaderBound='true';
      globalSearchJs.addEventListener('load', installV210DailyCommandCenter, { once:true });
      document.body.appendChild(globalSearchJs);
    }else if(window.AQARI_V209?.version==='V209-global-search'||document.querySelector('meta[name="aqari-global-search"]')){
      installV210DailyCommandCenter();
    }else if(globalSearchJs.dataset.v210LoaderBound!=='true'){
      globalSearchJs.dataset.v210LoaderBound='true';
      globalSearchJs.addEventListener('load', installV210DailyCommandCenter, { once:true });
    }
  }

  function installV208PortfolioCollections(){
    document.body?.classList.add('aq-v208');

    if(!document.getElementById('aqari-v208-portfolio-collections-css')){
      const portfolioCss=document.createElement('link');
      portfolioCss.id='aqari-v208-portfolio-collections-css';
      portfolioCss.rel='stylesheet';
      portfolioCss.href='/v208-portfolio-collections.css';
      document.head.appendChild(portfolioCss);
    }

    let portfolioJs=document.getElementById('aqari-v208-portfolio-collections-js');
    if(!portfolioJs){
      portfolioJs=document.createElement('script');
      portfolioJs.id='aqari-v208-portfolio-collections-js';
      portfolioJs.src='/v208-portfolio-collections.js';
      portfolioJs.dataset.v209LoaderBound='true';
      portfolioJs.addEventListener('load', installV209GlobalSearch, { once:true });
      document.body.appendChild(portfolioJs);
    }else if(document.querySelector('meta[name="aqari-portfolio-collections"]')){
      installV209GlobalSearch();
    }else if(portfolioJs.dataset.v209LoaderBound!=='true'){
      portfolioJs.dataset.v209LoaderBound='true';
      portfolioJs.addEventListener('load', installV209GlobalSearch, { once:true });
    }
  }

  function installV206RentLedger(){
    document.body?.classList.add('aq-v206');

    if(!document.getElementById('aqari-v206-rent-ledger-css')){
      const css=document.createElement('link');
      css.id='aqari-v206-rent-ledger-css';
      css.rel='stylesheet';
      css.href='/v206-rent-ledger.css';
      document.head.appendChild(css);
    }

    if(!document.getElementById('aqari-v206-rent-ledger-js')){
      const script=document.createElement('script');
      script.id='aqari-v206-rent-ledger-js';
      script.src='/v206-rent-ledger.js';
      script.addEventListener('load', installV208PortfolioCollections, { once:true });
      document.body.appendChild(script);
    }else{
      installV208PortfolioCollections();
    }
  }

  function installV205SimplifiedShell(){
    document.body?.classList.add('aq-v205');

    if(!document.getElementById('aqari-v206-integrated-ledger-css')){
      const ledger = document.createElement('link');
      ledger.id = 'aqari-v206-integrated-ledger-css';
      ledger.rel = 'stylesheet';
      ledger.href = '/v206-integrated-ledger.css';
      document.head.appendChild(ledger);
    }

    if(!document.getElementById('aqari-v205-simple-css')){
      const simple = document.createElement('link');
      simple.id = 'aqari-v205-simple-css';
      simple.rel = 'stylesheet';
      simple.href = '/v205-simple.css';
      document.head.appendChild(simple);
    }

    if(!document.getElementById('aqari-v205-simplified-shell-js')){
      const shell = document.createElement('script');
      shell.id = 'aqari-v205-simplified-shell-js';
      shell.src = '/v205-simplified-shell.js?v=209.1';
      shell.addEventListener('load', installV206RentLedger, { once:true });
      document.body.appendChild(shell);
    }else{
      installV206RentLedger();
    }
  }

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
      propertyOS.addEventListener('load', installV205SimplifiedShell, { once:true });
      document.body.appendChild(propertyOS);
    }else if(document.body?.getAttribute('data-v202-ready') === 'true'){
      installV205SimplifiedShell();
    }else{
      document.getElementById('aqari-v202-property-os-js')?.addEventListener('load', installV205SimplifiedShell, { once:true });
    }
  }

  function installV201Experience(){
    if(document.getElementById('aqari-v201-experience-js')){
      installV202PropertyOS();
      return;
    }
    const experience = document.createElement('script');
    experience.id = 'aqari-v201-experience-js';
    experience.src = releaseAsset('/v201-experience.js');
    experience.addEventListener('load', installV202PropertyOS, { once:true });
    document.body.appendChild(experience);
  }

  function installV199Preview(){
    document.body?.classList.add('aq-v199','aq-v200','aq-v201','aq-v202');

    if(!document.getElementById('aqari-v199-ui-css')){
      const stylesheet = document.createElement('link');
      stylesheet.id = 'aqari-v199-ui-css';
      stylesheet.rel = 'stylesheet';
      stylesheet.href = releaseAsset('/v199-ui.css');
      document.head.appendChild(stylesheet);
    }

    if(!document.getElementById('aqari-v200-luxury-css')){
      const luxury = document.createElement('link');
      luxury.id = 'aqari-v200-luxury-css';
      luxury.rel = 'stylesheet';
      luxury.href = releaseAsset('/v200-luxury.css');
      document.head.appendChild(luxury);
    }

    if(!document.getElementById('aqari-v201-easy-css')){
      const easy = document.createElement('link');
      easy.id = 'aqari-v201-easy-css';
      easy.rel = 'stylesheet';
      easy.href = releaseAsset('/v201-easy.css');
      document.head.appendChild(easy);
    }

    if(!document.getElementById('aqari-v199-ui-js')){
      const script = document.createElement('script');
      script.id = 'aqari-v199-ui-js';
      script.src = releaseAsset('/v199-ui.js');
      script.addEventListener('load', installV201Experience, { once:true });
      document.body.appendChild(script);
    }else{
      installV201Experience();
    }
  }

  syncReleaseIdentity();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', installV199Preview, { once:true });
  }else{
    installV199Preview();
  }
})();
