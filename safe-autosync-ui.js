(function(){
  'use strict';

  function mount(){
    if(document.querySelector('.aq-v193-autosync')) return;

    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v193-autosync';

    const title = document.createElement('strong');
    title.textContent = 'المزامنة السحابية الآمنة';

    const status = document.createElement('small');
    const actions = document.createElement('div');
    actions.className = 'aq-v193-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';

    const sync = document.createElement('button');
    sync.type = 'button';
    sync.textContent = 'مزامنة الآن';

    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.textContent = 'حالة المزامنة';

    const result = document.createElement('pre');
    result.className = 'aq-v193-result';

    function refresh(){
      const s = window.AQARI_AUTOSYNC?.status || {};
      toggle.textContent = s.enabled ? 'إيقاف المزامنة التلقائية' : 'تفعيل المزامنة التلقائية';
      status.textContent =
        `الحالة: ${s.enabled ? 'مفعلة' : 'متوقفة'} | ` +
        `آخر Revision: ${s.lastRevision ?? '—'} | ` +
        `آخر مزامنة: ${s.lastSyncAt || '—'}`;
    }

    toggle.addEventListener('click', async ()=>{
      try{
        if(window.AQARI_AUTOSYNC.status.enabled){
          window.AQARI_AUTOSYNC.disable();
          result.textContent = 'تم إيقاف المزامنة التلقائية.';
        }else{
          const cloud = await window.AQARI_CLOUD_SYNC.downloadCloudPreview();
          if(!cloud?.payload || typeof cloud.payload !== 'object' || Object.keys(cloud.payload).length === 0){
            result.textContent = 'لا يمكن تفعيل المزامنة التلقائية قبل تنفيذ أول نقل آمن إلى السحابة.';
            return;
          }
          window.AQARI_AUTOSYNC.enable();
          result.textContent = 'تم تفعيل المزامنة التلقائية الآمنة.';
        }
      }catch(err){
        result.textContent = 'تعذر تغيير الحالة: ' + (err?.message || String(err));
      }
      refresh();
    });

    sync.addEventListener('click', async ()=>{
      sync.disabled = true;
      result.textContent = 'جاري المزامنة...';
      try{
        const r = await window.AQARI_AUTOSYNC.syncNow();
        result.textContent = JSON.stringify(r,null,2);
      }catch(err){
        result.textContent = JSON.stringify({
          ok:false,
          message:err?.message || String(err),
          code:err?.code || null
        },null,2);
      }finally{
        sync.disabled = false;
        refresh();
      }
    });

    inspect.addEventListener('click', ()=>{
      result.textContent = JSON.stringify(window.AQARI_AUTOSYNC?.status || {},null,2);
    });

    actions.append(toggle,sync,inspect);
    box.append(title,status,actions,result);

    const anchor = root.querySelector('.aq-v192-wizard,.aq-v185-ready,.aq-v184-prod');
    if(anchor && anchor.nextSibling) root.insertBefore(box,anchor.nextSibling);
    else root.insertBefore(box,root.firstChild);

    refresh();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  }else{
    mount();
  }
})();
