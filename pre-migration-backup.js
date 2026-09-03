(function(){
  'use strict';

  function collect(){
    if(window.AQARI_CLOUD_SYNC?.collectLocalSnapshot){
      return window.AQARI_CLOUD_SYNC.collectLocalSnapshot();
    }

    const values = {};
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(!k) continue;
      if(/aqari|tenant|property|unit|lease|payment|maintenance|employee|owner|vendor|document/i.test(k)){
        const raw = localStorage.getItem(k);
        try { values[k] = JSON.parse(raw); }
        catch { values[k] = raw; }
      }
    }

    return {
      schema:'aqari-local-snapshot-v1',
      capturedAt:new Date().toISOString(),
      origin:location.origin,
      pathname:location.pathname,
      values
    };
  }

  function download(){
    const snapshot = collect();
    const blob = new Blob(
      [JSON.stringify(snapshot,null,2)],
      {type:'application/json;charset=utf-8'}
    );
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    a.href = URL.createObjectURL(blob);
    a.download = `AQARI_BACKUP_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    return snapshot;
  }

  window.AQARI_BACKUP = Object.freeze({
    version:'V203',
    runtimeBase:'V198',
    dataContract:'V202',
    collect,
    download
  });
})();

