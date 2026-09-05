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

      const pass = health?.ok === true &&
        release?.apiContractVersion === 'V198' &&
        Boolean(release?.productVersion) &&
        release.productVersion === ready?.productVersion &&
        ready?.ready === true;
      line.textContent = pass
        ? `المنصة جاهزة — إعدادات التشغيل ${ready.summary?.present || 0}/${ready.summary?.required || 0}`
        : `تحتاج مراجعة قبل الإنتاج — ${ready?.checks?.supabaseConnection?.connection?.state || 'unknown'}`;

      details.textContent = JSON.stringify({
        apiContractVersion: release?.apiContractVersion || release?.version || null,
        productVersion: release?.productVersion || null,
        ready: ready?.ready === true,
        connection: ready?.checks?.supabaseConnection?.connection?.state || null,
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
