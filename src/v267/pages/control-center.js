import {t,getLocale,dateLocale} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {SECTIONS,LANGUAGES,CORE_LABEL_KEYS,GROUP_LABEL_KEYS,SERVICE_LABEL_KEYS,label,validateSettings} from '../components/catalog.js';

export async function openControlCenter(){
 const dialog=createDialog(t('مركز تحكم المدير العام'),{localized:true});if(!dialog)return;
 dialog.el.classList.add('aq267-manager-control');
 const {session,body,status,run}=dialog;let settings,revision,memberRows=[];
 const reload=node('button',t('تحديث الإعدادات')),
  save=node('button',t('حفظ الإعدادات والتحقق')),
  staffAccess=node('button',t('إدارة صلاحيات الموظفين والعقارات')),
  reason=node('textarea'),content=node('div'),audit=node('div');
 reload.type=save.type=staffAccess.type='button';reload.className='aq267-manager-secondary';save.className='aq267-manager-save';staffAccess.className='aq267-manager-primary';
 reason.maxLength=500;reason.rows=2;reason.placeholder=t('مثال: إعادة ترتيب الواجهة أو تعديل صلاحيات موظف');
 content.className='aq267-manager-content';audit.className='aq267-manager-audit';
 let auditPage=0;const next=node('button',t('تعديلات أقدم')),previous=node('button',t('تعديلات أحدث'));next.type=previous.type='button';
 const hero=node('section');hero.className='aq267-manager-hero';
 const heroCopy=node('div');heroCopy.append(node('span',t('إدارة آمنة بدون كسر وظائف النظام')),node('h3',t('واجهة واحدة للمسميات والأقسام والصلاحيات')),node('p',t('يمكن للمدير العام تغيير النصوص الظاهرة وتشغيل الأقسام أو إيقافها وضبط صلاحيات العرض والتعديل. مفاتيح النظام والروابط الداخلية والحسابات لا تتغير.')));
 const heroActions=node('div');heroActions.className='aq267-manager-actions';heroActions.append(staffAccess,reload);hero.append(heroCopy,heroActions);
 const saveBar=node('section');saveBar.className='aq267-manager-savebar';saveBar.append(field(t('سبب التعديل'),reason),save);
 body.append(hero,content,saveBar,node('h3',t('سجل التعديلات')),audit,previous,next);
 staffAccess.onclick=()=>run(async()=>{const module=await import('./staff-access.js');dialog.close();module.openStaffAccess();});

 async function readAudit(){
  const rows=await session.request(session.client.from('aqari_control_audit').select('id,actor_id,action,reason,before_value,after_value,created_at').eq('workspace_id',session.bound.workspace).order('created_at',{ascending:false}).order('id',{ascending:false}).range(auditPage*20,auditPage*20+19));
  audit.replaceChildren();
  for(const row of rows){const details=node('details'),name=memberRows.find(m=>m.user_id===row.actor_id)?.display_name||t('مستخدم محفوظ');details.append(node('summary',new Date(row.created_at).toLocaleString(dateLocale())+' • '+name),node('p',row.reason),node('pre',JSON.stringify({قبل:row.before_value,بعد:row.after_value},null,2)));audit.append(details);}
  if(!rows.length)audit.append(node('p',t('لا توجد تعديلات في هذه الصفحة.')));previous.hidden=auditPage===0;next.hidden=rows.length<20;
 }

 function panel(titleText,descriptionText,open=false){const details=node('details');details.className='aq267-control-panel';details.open=open;const summary=node('summary');summary.append(node('strong',titleText),node('small',descriptionText));details.append(summary);return details;}

 function render(){
  content.replaceChildren();

  const sections=panel(t('إدارة الأقسام الرئيسية'),t('تشغيل أو إيقاف الأقسام الظاهرة للمستخدمين مع بقاء بياناتها محفوظة.'),true),sectionGrid=node('div');sectionGrid.className='aq267-control-section-grid';
  for(const key of SECTIONS){const c=node('input');c.type='checkbox';c.checked=settings.sections[key]!==false;const l=field(label(key,getLocale(),settings.labels||{}),c);l.className='aq267-check aq267-section-toggle';c.onchange=()=>settings.sections[key]=c.checked;sectionGrid.append(l);}sections.append(sectionGrid);content.append(sections);

  const permissions=panel(t('صلاحيات الأقسام والحسابات'),t('تحديد العرض والتعديل للدور أو للحساب نفسه، مع بقاء سقف الدور الأمني مطبقاً.'));
  const permissionHead=node('div');permissionHead.className='aq267-permission-head';
  const subjects=node('select');
  for(const [id,title]of [
   ['role:property_manager',t('افتراضي — مدير العقار')],['role:accountant',t('افتراضي — المحاسب')],['role:viewer',t('افتراضي — عرض فقط')],
   ...memberRows.filter(m=>m.is_active&&m.role!=='general_manager').map(m=>['user:'+m.user_id,(m.display_name||t('حساب محفوظ'))+' — '+roleName(m.role)])
  ]){const o=node('option',title);o.value=id;subjects.append(o);}
  permissionHead.append(field(t('الدور أو حساب الموظف'),subjects),node('p',t('«حسب الافتراضي» يرث الصلاحية الأصلية. لا يمكن لأي إعداد هنا تجاوز سقف الدور أو منح صلاحية المدير العام.')));permissions.append(permissionHead);
  const cells=node('div');cells.className='aq267-permission-grid';permissions.append(cells);
  function renderPermissions(){cells.replaceChildren();for(const key of SECTIONS){const card=node('article');card.className='aq267-permission-card';card.append(node('h3',label(key,getLocale(),settings.labels||{})));for(const [action,title]of [['read',t('العرض')],['write',t('الإضافة والتعديل')]]){const select=node('select');for(const [value,text]of [['inherit',t('حسب الافتراضي')],['true',t('مسموح')],['false',t('ممنوع')]]){const o=node('option',text);o.value=value;select.append(o);}const value=settings.permissions[subjects.value]?.[key]?.[action];select.value=typeof value==='boolean'?String(value):'inherit';select.onchange=()=>{const subject=settings.permissions[subjects.value]??={};const section=subject[key]??={};if(select.value==='inherit')delete section[action];else section[action]=select.value==='true';if(Object.keys(section).length===0)delete subject[key];if(Object.keys(subject).length===0)delete settings.permissions[subjects.value];};card.append(field(title,select));}cells.append(card);}}
  subjects.onchange=renderPermissions;renderPermissions();content.append(permissions);

  const labels=panel(t('مسميات الواجهة والتنقل'),t('تعديل النص الظاهر فقط؛ الروابط والمفاتيح الداخلية تبقى ثابتة وآمنة.')),
   locale=node('select');
  for(const [value,text]of Object.entries(LANGUAGES)){const o=node('option',text);o.value=value;locale.append(o);}locale.value=getLocale();
  const labelsIntro=node('div');labelsIntro.className='aq267-label-head';labelsIntro.append(field(t('اللغة'),locale),node('p',t('يمكنك إعادة أي اسم إلى الافتراضي بزر واحد. التعديل هنا لا يغير قواعد البيانات أو الصلاحيات أو المسارات.')));labels.append(labelsIntro);
  const navigation=panel(t('التنقل والأقسام الأساسية'),t('الأسماء الرئيسية التي تظهر في شريط التنقل والصفحات.'),true),
   groups=panel(t('مجموعات الخدمات الرئيسية'),t('العناوين الكبيرة داخل دليل الخدمات.')),
   services=panel(t('الصفحات والخدمات'),t('أسماء الخدمات التفصيلية بدون تغيير الوظيفة الداخلية.')),
   navigationNames=node('div'),groupNames=node('div'),serviceNames=node('div');
  navigationNames.className=groupNames.className=serviceNames.className='aq267-label-grid';navigation.append(navigationNames);groups.append(groupNames);services.append(serviceNames);labels.append(navigation,groups,services);
  function fillNames(container,keys){container.replaceChildren();for(const key of keys){const row=node('div'),input=node('input'),reset=node('button',t('الافتراضي'));row.className='aq267-label-row';input.maxLength=80;input.value=settings.labels[locale.value]?.[key]||'';input.placeholder=label(key,locale.value);reset.type='button';reset.className='aq267-label-reset';input.oninput=()=>{const entries=settings.labels[locale.value]??={};if(input.value.trim())entries[key]=input.value.trim();else delete entries[key];};reset.onclick=()=>{const entries=settings.labels[locale.value]??={};delete entries[key];input.value='';input.placeholder=label(key,locale.value);};row.append(field(label(key,locale.value),input),reset);container.append(row);}}
  function renderLabels(){fillNames(navigationNames,CORE_LABEL_KEYS);fillNames(groupNames,GROUP_LABEL_KEYS);fillNames(serviceNames,SERVICE_LABEL_KEYS);}locale.onchange=renderLabels;renderLabels();content.append(labels);
 }

 async function load(){const data=await session.request(session.client.rpc('aqari_control_center',{p_workspace_id:session.bound.workspace}));settings=structuredClone(data.control.settings);settings.sections??={};settings.permissions??={};settings.labels??={};revision=Number(data.control.revision);memberRows=data.members;render();await readAudit();status.textContent=t('تمت قراءة الإعدادات وسجل التدقيق من قاعدة البيانات.');}
 reload.onclick=()=>run(load);
 save.onclick=()=>run(async()=>{if(reason.value.trim().length<3)throw Error('اكتب سبب التعديل أولاً.');validateSettings(settings);const expected=structuredClone(settings),nextRevision=await session.request(session.client.rpc('aqari_save_controls',{p_workspace_id:session.bound.workspace,p_settings:expected,p_expected_revision:revision,p_reason:reason.value.trim()}));const verified=await session.request(session.client.rpc('aqari_control_center',{p_workspace_id:session.bound.workspace}));if(Number(verified.control.revision)!==Number(nextRevision)||JSON.stringify(canonical(verified.control.settings))!==JSON.stringify(canonical(expected)))throw Error('لم تتأكد إعادة القراءة. حدّث الإعدادات.');revision=Number(nextRevision);reason.value='';await readAudit();window.dispatchEvent(new CustomEvent('aqari:v267-controls-changed'));status.textContent=t('تم الحفظ وإعادة القراءة وتسجيل التعديل.');});
 next.onclick=()=>run(async()=>{auditPage++;await readAudit();status.textContent=t('سجل التعديلات المحفوظ.');});previous.onclick=()=>run(async()=>{if(auditPage>0)auditPage--;await readAudit();status.textContent=t('سجل التعديلات المحفوظ.');});await run(load);
}
function roleName(role){return ({general_manager:t('المدير العام'),property_manager:t('مدير العقار'),accountant:t('محاسب'),viewer:t('عرض فقط')}[role]||role||t('حساب موظف'));}
function canonical(x){return x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}

