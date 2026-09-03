(function(){
  'use strict';

  function mount(){
    if(document.querySelector('.aq-v193-autosync')) return;
    const root = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const box = document.createElement('section');
    box.className = 'aq-v193-autosync';

    const title = document.createElement('strong');
    title.textContent = 'المزامنة السحابية اليدوية';
    const status = document.createElement('small');
    status.textContent = 'الرفع التلقائي متوقف في V203. لا تُرسل البيانات إلا بعد ضغط المستخدم على أمر رفع صريح.';

    const actions = document.createElement('div');
    actions.className = 'aq-v193-actions';
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.textContent = 'إدارة الرفع والاسترجاع';
    manage.addEventListener('click', () => window.openCloudV198?.());
    const inspect = document.createElement('button');
    inspect.type = 'button';
    inspect.textContent = 'حالة المزامنة';
    const result = document.createElement('pre');
    result.className = 'aq-v193-result';
    inspect.addEventListener('click', () => {
      result.textContent = JSON.stringify(window.AQARI_AUTOSYNC?.status || { mode:'manual_only' }, null, 2);
    });

    actions.append(manage, inspect);
    box.append(title, status, actions, result);
    const anchor = root.querySelector('.aq-v192-wizard,.aq-v185-ready,.aq-v184-prod');
    if(anchor?.nextSibling) root.insertBefore(box, anchor.nextSibling);
    else root.insertBefore(box, root.firstChild);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();

