(function(){
  'use strict';

  function activeProperty(){
    try{return String(sessionStorage.getItem('aqari_v201_property')||'').trim()}
    catch(_){return ''}
  }

  function data(){
    try{return typeof db!=='undefined'&&db?db:{}}
    catch(_){return {}}
  }

  function rows(key){return Array.isArray(data()[key])?data()[key]:[]}
  function norm(value){return String(value==null?'':value).trim().toLowerCase()}

  function propertyContracts(property){
    return rows('contractsV202').filter(function(contract){
      return contract&&typeof contract==='object'&&norm(contract.property)===norm(property);
    });
  }

  function activeContracts(property){
    return propertyContracts(property).filter(function(contract){
      return /signed|approved|موق|معتمد/i.test(String(contract.status||''));
    });
  }

  function latestReceiptIndex(property){
    const collections=rows('collections');
    let found=-1;
    collections.forEach(function(row,index){
      if(!Array.isArray(row))return;
      const text=row.map(function(v){return String(v==null?'':v)}).join(' | ');
      if(text.includes(property))found=index;
    });
    return found;
  }

  function icon(path){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  }

  const icons={
    contract:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7"/>',
    wallet:'<path d="M3 6h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6M16 11h5v4h-5a2 2 0 0 1 0-4z"/>',
    receipt:'<path d="M5 2v20l3-2 3 2 2-2 3 2 3-2V2l-3 2-3-2-2 2-3-2-3 2zM8 9h8M8 13h6"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  };

  function actionButton(action,title,copy,iconName,primary){
    return '<button type="button" class="v203-simple-action'+(primary?' is-primary':'')+'" data-v203-action="'+action+'">'+icon(icons[iconName])+'<span><strong>'+title+'</strong><small>'+copy+'</small></span></button>';
  }

  function install(){
    const hub=document.querySelector('.v202-property-hub');
    if(!hub)return;
    const property=activeProperty();
    if(!property)return;

    let strip=hub.querySelector('.v203-simple-strip');
    if(!strip){
      strip=document.createElement('section');
      strip.className='v203-simple-strip';
      strip.setAttribute('aria-label','الإجراءات السريعة');
      const hero=hub.querySelector('.v202-property-hero');
      if(hero?.nextSibling)hub.insertBefore(strip,hero.nextSibling);
      else hub.prepend(strip);
    }

    const hasActive=activeContracts(property).length>0;
    const latest=latestReceiptIndex(property);
    strip.innerHTML=
      '<div class="v203-simple-title"><div><span>اختصار العمل</span><strong>كل شيء من هنا</strong></div><small>'+(hasActive?'العقد جاهز — سجّل الإيجار مباشرة':'ابدأ بالعقد، وبعده التحصيل يصير بخطوة واحدة')+'</small></div>'+ 
      '<div class="v203-simple-actions">'+
        actionButton('contract','عقد جديد','إنشاء وربط العقد','contract',!hasActive)+
        actionButton('payment','تسجيل إيجار','تحصيل + وصل مباشرة','wallet',hasActive)+
        actionButton('receipt','آخر وصل',latest>=0?'فتح آخر إيصال مسجل':'لا يوجد وصل حتى الآن','receipt',false)+
        actionButton('statement','كشف الشهر','كشف ضحاوي للطباعة','chart',false)+
      '</div>';
    strip.dataset.latestReceipt=String(latest);

    const original=hub.querySelector('.v202-actions');
    if(original)original.classList.add('v203-original-actions');
  }

  function forward(action,source){
    const hub=document.querySelector('.v202-property-hub');
    if(!hub)return;
    if(action==='receipt'){
      const index=Number(source.closest('.v203-simple-strip')?.dataset.latestReceipt||-1);
      if(index>=0){
        const receipt=hub.querySelector('[data-v202-receipt-index="'+index+'"]');
        if(receipt){receipt.click();return;}
      }
      const collectionsTab=hub.querySelector('[data-v202-tab="collections"],[data-v202-tab="collection"]');
      collectionsTab?.click();
      return;
    }
    const target=hub.querySelector('[data-v202-action="'+action+'"]');
    target?.click();
  }

  document.addEventListener('click',function(event){
    const button=event.target.closest('[data-v203-action]');
    if(!button)return;
    forward(button.getAttribute('data-v203-action'),button);
  });

  const observer=new MutationObserver(function(){
    clearTimeout(window.__aqariV203SimpleTimer);
    window.__aqariV203SimpleTimer=setTimeout(install,40);
  });

  function boot(){
    document.body.classList.add('aq-v203-simple');
    observer.observe(document.body,{subtree:true,childList:true});
    install();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();