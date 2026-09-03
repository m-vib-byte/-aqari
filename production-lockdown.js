(function(){
  'use strict';

  const DEBUG_KEY = 'aqari_debug_mode';

  function isDebug(){
    try{
      const url = new URL(location.href);
      if(url.searchParams.get('debug') === '1') return true;
      return localStorage.getItem(DEBUG_KEY) === '1';
    }catch{
      return false;
    }
  }

  function apply(){
    const debug = isDebug();
    document.documentElement.classList.toggle('aqari-debug-mode', debug);
    document.documentElement.classList.toggle('aqari-production-mode', !debug);

    const selectors = [
      '.aq-v180-cleanup',
      '.aq-v184-prod',
      '.aq-v185-ready',
      '.aq-v192-wizard',
      '.aq-v193-autosync',
      '.aq-v195-prod-status',
      '.aq-v196-final'
    ];

    document.querySelectorAll(selectors.join(',')).forEach(el=>{
      el.hidden = !debug;
      el.setAttribute('aria-hidden', String(!debug));
    });
  }

  window.AQARI_DEBUG = Object.freeze({
    enable(){
      localStorage.setItem(DEBUG_KEY,'1');
      apply();
    },
    disable(){
      localStorage.removeItem(DEBUG_KEY);
      apply();
    },
    get enabled(){ return isDebug(); },
    apply
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  }else{
    apply();
  }
})();
