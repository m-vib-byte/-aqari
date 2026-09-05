(function(){
  'use strict';

  function el(tag, cls, text){
    const node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text !== undefined) node.textContent = text;
    return node;
  }

  function countLocalKeys(){
    if(!window.AQARI_CLOUD_SYNC) return 0;
    try{
      const snap = window.AQARI_CLOUD_SYNC.collectLocalSnapshot();
      return Object.keys(snap.values || {}).length;
    }catch{
      return 0;
    }
  }

  async function getCloudInfo(){
    if(!window.AQARI_CLOUD_SYNC) return null;
    try{
      const cloud = await window.AQARI_CLOUD_SYNC.downloadCloudPreview();
      return cloud;
    }catch{
      return null;
    }
  }

  async function getAuthInfo(forceRefresh = false){
    if(!window.AQARI_SUPABASE) return { signedIn:false };
    try{
      const ctx = forceRefresh
        ? await window.AQARI_SUPABASE.refreshContext()
        : window.AQARI_SUPABASE.context;
      const userId = String(ctx.user?.id || '').trim();
      const workspaceId = String(ctx.workspace?.id || '').trim();
      const scope = window.AQARI_DATA_GATE?.scope;
      return {
        signedIn:Boolean(ctx.user),
        dataReady:Boolean(
          userId && workspaceId &&
          ctx.membership?.is_active === true &&
          String(ctx.membership.user_id || '') === userId &&
          String(ctx.membership.workspace_id || '') === workspaceId &&
          scope?.userId === userId && scope?.workspaceId === workspaceId
        ),
        role:ctx.membership?.role || null,
        workspace:ctx.workspace?.name || null
      };
    }catch{
      return { signedIn:false };
    }
  }

  function mount(){
    if(document.querySelector('.aq-v192-wizard')) return;

    const wrap = el('section','aq-v192-wizard');
    const title = el('strong','', 'نقل بيانات عقاري إلى السحابة');
    const desc = el('small','', 'المعالج يحافظ على بيانات الجهاز، ولا يستبدلها تلقائيًا. النقل إلى Supabase يتم فقط بعد تسجيل الدخول والضغط على زر النقل.');
    const status = el('div','aq-v192-status','جاري فحص الحالة...');
    const actions = el('div','aq-v192-actions');

    const refreshBtn = el('button','', 'تحديث الفحص');
    refreshBtn.type = 'button';

    const uploadBtn = el('button','', 'نقل بيانات هذا الجهاز');
    uploadBtn.type = 'button';
    uploadBtn.disabled = true;

    const previewBtn = el('button','', 'معاينة النسخة السحابية');
    previewBtn.type = 'button';
    previewBtn.disabled = true;

    const result = el('pre','aq-v192-result','');

    actions.append(refreshBtn, uploadBtn, previewBtn);
    wrap.append(title, desc, status, actions, result);

    const main = document.querySelector('main,.main,.content,#app,.app,[role="main"]') || document.body;
    const anchor = main.querySelector('.aq-v185-ready,.aq-v184-prod,.aq-v183-sec');
    if(anchor && anchor.nextSibling) main.insertBefore(wrap, anchor.nextSibling);
    else main.insertBefore(wrap, main.firstChild);

    async function refresh(forceAuthRefresh = false){
      status.textContent = 'جاري فحص الحالة...';
      result.textContent = '';

      const auth = await getAuthInfo(forceAuthRefresh);
      const localKeys = auth.dataReady ? countLocalKeys() : 0;
      const cloud = auth.dataReady ? await getCloudInfo() : null;

      const cloudEmpty =
        !cloud ||
        !cloud.payload ||
        (typeof cloud.payload === 'object' && Object.keys(cloud.payload).length === 0);

      status.textContent =
        `بيانات الجهاز: ${localKeys} مفتاح | ` +
        `تسجيل الدخول: ${auth.signedIn ? 'نعم' : 'لا'} | ` +
        `Workspace: ${auth.workspace || '—'} | ` +
        `Cloud revision: ${cloud?.revision ?? '—'} | ` +
        `السحابة: ${cloudEmpty ? 'فارغة/جاهزة للنقل' : 'تحتوي بيانات'}`;

      uploadBtn.disabled = !(auth.dataReady && localKeys > 0);
      previewBtn.disabled = !auth.dataReady;
    }

    refreshBtn.addEventListener('click', () => refresh(true));
    window.addEventListener('aqari:auth-boundary', event => {
      if(['ready','locked'].includes(event?.detail?.state)) refresh(false);
    });

    previewBtn.addEventListener('click', async function(){
      result.textContent = 'جاري جلب النسخة السحابية...';
      try{
        const cloud = await window.AQARI_CLOUD_SYNC.downloadCloudPreview();
        result.textContent = JSON.stringify({
          revision: cloud?.revision ?? null,
          updatedAt: cloud?.updatedAt ?? null,
          hasPayload: Boolean(cloud?.payload),
          payloadTopLevelKeys:
            cloud?.payload && typeof cloud.payload === 'object'
              ? Object.keys(cloud.payload).length
              : 0
        }, null, 2);
      }catch(err){
        result.textContent = 'تعذر جلب النسخة السحابية: ' + (err?.message || String(err));
      }
    });

    uploadBtn.addEventListener('click', async function(){
      uploadBtn.disabled = true;
      result.textContent = 'جاري النقل الآمن إلى Supabase...';
      try{
        const before = await window.AQARI_CLOUD_SYNC.downloadCloudPreview();

        if(before?.payload && typeof before.payload === 'object' && Object.keys(before.payload).length > 0){
          result.textContent = 'تم إيقاف النقل لأن السحابة تحتوي بيانات. لن يتم الاستبدال تلقائيًا.';
          return;
        }

        const saved = await window.AQARI_CLOUD_SYNC.uploadLocal();
        result.textContent = JSON.stringify({
          ok:true,
          message:'تم نقل البيانات إلى السحابة',
          revision:saved.revision,
          updatedAt:saved.updated_at
        }, null, 2);

        await refresh();
      }catch(err){
        result.textContent = 'تعذر النقل: ' + (err?.message || String(err));
      }finally{
        uploadBtn.disabled = false;
      }
    });

    refresh(false);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mount, {once:true});
  }else{
    mount();
  }
})();
