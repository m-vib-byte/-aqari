(function(){
  'use strict';

  async function mount(){
    if(document.querySelector('.aq-v195-prod-status')) return;

    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v195-prod-status';

    const title = document.createElement('strong');
    title.textContent = 'حالة جاهزية الإنتاج';

    const line = document.createElement('small');
    line.textContent = 'جاري فحص خدمات الإنتاج...';

    const details = document.createElement('pre');
    details.className = 'aq-v195-prod-result';

    box.append(title,line,details);

    const anchor = root.querySelector('.aq-v193-autosync,.aq-v192-wizard,.aq-v185-ready');
    if(anchor && anchor.nextSibling) root.insertBefore(box, anchor.nextSibling);
    else root.insertBefore(box, root.firstChild);

    try{
      const [health, release, ready] = await Promise.all([
        fetch('/api/health', {cache:'no-store'}).then(r=>r.json()),
        fetch('/api/release', {cache:'no-store'}).then(r=>r.json()),
        fetch('/api/production-readiness', {cache:'no-store'}).then(r=>r.json())
      ]);

      const pass = health?.ok === true && release?.version === 'V203' && release?.runtimeBase === 'V198' && release?.dataContract === 'V202' && ready?.ok === true;
      line.textContent = pass
        ? `الواجهة وواجهات الفحص تعمل — إعدادات الإنتاج ${ready.summary?.present || 0}/${ready.summary?.required || 0}`
        : 'تحتاج مراجعة قبل الإنتاج';

      details.textContent = JSON.stringify({
        version: release?.version || null,
        runtimeBase: release?.runtimeBase || null,
        dataContract: release?.dataContract || null,
        releaseReadiness: release?.validation?.production || 'not_deployed',
        environment: ready?.deployment?.environment || null,
        configured: ready?.summary || null
      }, null, 2);
    }catch(err){
      line.textContent = 'تعذر فحص جاهزية الإنتاج من هذه البيئة.';
      details.textContent = String(err?.message || err);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount, {once:true});
  }else{
    mount();
  }
})();
