/* Presentation only. Authentication and workspace activation remain authoritative. */
(function(){
  'use strict';
  const root=document.documentElement;
  const screen=document.getElementById('aqHomePresentation');
  if(!screen)return;
  const message=screen.querySelector('[role="status"]');
  const retry=screen.querySelector('button');
  const modules=['V201','V202','V205','V206','V208','V209','V210','V211',
    'OWNER_EXACT','OWNER_FINAL','UNIFIED_EXPERIENCE','PREMIUM_NAVIGATION','LIVE_STABILITY'];
  const scripts=['owner-reference','owner-feedback','owner-final','unified-layout','premium-navigation','live-stability']
    .map(name=>'aqari-v267-'+name+'-js');
  const loaded=new Set();
  const styles=['aqari-owner-feedback-css','aqari-owner-final-beige-css',
    'aqari-v267-unified-layout-css','aqari-v267-unified-virtual-css',
    'aqari-v267-premium-refinement-css','aqari-v267-luxury-warm-css','aqari-live-stability-css'];
  const inertNodes=new Set();
  let timer,frame,epoch=0,started=0,presentedScope=null,watching=false;
  function scope(){
    const c=window.AQARI_SUPABASE?.context,m=c?.membership;
    const user=c?.user?.id,workspace=c?.workspace?.id;
    const data=window.AQARI_DATA_GATE?.scope,storage=window.AQARI_EARLY_STORAGE_GATE?.scope;
    if(!root.classList.contains('aqari-auth-unlocked')||!user||!workspace||
      m?.is_active!==true||m.user_id!==user||m.workspace_id!==workspace||
      !['general_manager','property_manager','accountant','viewer'].includes(m.role)||
      data?.userId!==user||data.workspaceId!==workspace||
      storage?.userId!==user||storage.workspaceId!==workspace)return null;
    return JSON.stringify([user,workspace,m.role]);
  }
  function ready(){
    return modules.every(name=>Boolean(window['AQARI_'+name]))&&
      scripts.every(id=>loaded.has(id))&&
      styles.every(id=>Boolean(document.getElementById(id)?.sheet))&&
      [...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.disabled||Boolean(link.sheet))&&
      document.body.classList.contains('aq-live-stable')&&
      Boolean(document.getElementById('aqOwnerExactHome')?.querySelector('#aqLiveStability'))&&
      Boolean(document.getElementById('aqOwnerExactBottom'));
  }
  function protect(){
    for(const node of document.body.children){
      if(node===screen||/^(SCRIPT|STYLE|LINK)$/.test(node.tagName)||node.hasAttribute('inert'))continue;
      node.setAttribute('inert','');inertNodes.add(node);
    }
  }
  function release(){for(const node of inertNodes)node.removeAttribute('inert');inertNodes.clear();}
  function stop(){clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect();watching=false;}
  function check(){
    clearTimeout(timer);
    const key=scope();
    if(!key)return;
    protect();
    if(ready()){
      const ticket=++epoch;
      cancelAnimationFrame(frame);
      // Commit visibility only after the complete styled surface survives a paint turn.
      frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
        if(ticket!==epoch||scope()!==key||!ready())return check();
        presentedScope=key;root.classList.add('aqari-home-presented');
        screen.setAttribute('aria-hidden','true');release();stop();
      });});
      return;
    }
    if(Date.now()-started>=15000){
      const failure='تعذر إكمال تحميل الواجهة. اضغط إعادة المحاولة.';
      if(message.textContent!==failure)message.textContent=failure;
      retry.hidden=false;
      // No endless polling. A late asset or DOM update can still finish rendering.
      return;
    }
    timer=setTimeout(check,100);
  }
  function sync(){
    const key=scope();
    if(key&&key===presentedScope)return;
    ++epoch;stop();presentedScope=null;root.classList.remove('aqari-home-presented');
    release();screen.setAttribute('aria-hidden',key?'false':'true');
    if(!key)return;
    started=Date.now();retry.hidden=true;message.textContent='جارٍ تجهيز الصفحة الرئيسية…';
    observer.observe(document.body,{childList:true,subtree:true});watching=true;check();
  }
  const observer=new MutationObserver(()=>{if(watching)check();});
  retry.addEventListener('click',()=>window.location.reload());
  window.addEventListener('aqari:auth-boundary',sync);
  document.addEventListener('load',event=>{
    if(event.target?.tagName==='SCRIPT')loaded.add(event.target.id);
    if(watching&&/^(LINK|SCRIPT)$/.test(event.target?.tagName))check();
  },true);
  sync();
})();
