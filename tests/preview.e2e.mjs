import { chromium } from 'playwright';

const base = process.env.AQARI_BASE_URL;
const expectedSha = String(process.env.AQARI_EXPECTED_SHA || '').trim();
if(!base || !expectedSha){
  console.error('AQARI_BASE_URL and AQARI_EXPECTED_SHA are required');
  process.exit(2);
}

const previewUrl = new URL(base);
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || previewUrl.searchParams.get('x-vercel-protection-bypass') || '').trim();
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({
  viewport:{ width:390, height:844 },
  extraHTTPHeaders:bypass ? {
    'x-vercel-protection-bypass':bypass,
    'x-vercel-set-bypass-cookie':'true'
  } : {}
});
const page = await context.newPage();
const pageErrors = [];
const responseErrors = [];
const dbStatusRequests = [];
const startupDialogs = [];
page.on('request', request => {
  try{
    const url = new URL(request.url());
    if(url.origin === previewUrl.origin && ['/api/db/status','/api/supabase-status'].includes(url.pathname)){
      dbStatusRequests.push(url.pathname);
    }
  }catch{}
});
page.on('dialog', async dialog => {
  startupDialogs.push({ type:dialog.type(), message:dialog.message() });
  await dialog.dismiss();
});
await page.route('**/final-release-ui.js*', async route => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  await route.continue();
});
page.on('pageerror', error => pageErrors.push(error.stack || error.message));
page.on('response', response => {
  try{
    if(new URL(response.url()).origin === previewUrl.origin && response.status() >= 400){
      responseErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  }catch{}
});

let failed = false;
async function check(name, fn){
  try{ await fn(); console.log('PASS', name); }
  catch(error){ failed = true; console.error('FAIL', name, '-', error.message); }
}

await check('V205 simplified platform loads on the secure V198 runtime', async () => {
  const navigation = page.goto(base, { waitUntil:'domcontentloaded', timeout:30000 });
  await page.waitForSelector('#aqariCloudGateV168', { state:'visible', timeout:3500 });
  const firstPaint = await page.evaluate(() => ({
    shellReady:document.documentElement.classList.contains('aqari-shell-ready'),
    authUnlocked:document.documentElement.classList.contains('aqari-auth-unlocked'),
    bodyVisibility:getComputedStyle(document.body).visibility,
    gateVisible:Boolean(document.getElementById('aqariCloudGateV168')?.getClientRects().length),
    message:document.getElementById('cloudGateMsgV168')?.textContent?.trim() || '',
    authButtonsDisabled:Array.from(document.querySelectorAll('[data-cloud-auth-action]')).every(button => button.disabled)
  }));
  if(!firstPaint.shellReady || firstPaint.authUnlocked || firstPaint.bodyVisibility !== 'visible' || !firstPaint.gateVisible || !firstPaint.authButtonsDisabled || !firstPaint.message.includes('جاري تحميل')){
    throw new Error('secure login shell was not usable during delayed asset loading: ' + JSON.stringify(firstPaint));
  }
  const response = await navigation;
  if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForTimeout(2000);
  if(startupDialogs.length) throw new Error('blocking startup dialog: ' + JSON.stringify(startupDialogs));
  if(dbStatusRequests.length) throw new Error('startup triggered database status requests: ' + dbStatusRequests.join(','));
  const state = await page.evaluate(() => ({
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.classList.contains('on')),
    gateInert:document.getElementById('aqariCloudGateV168')?.hasAttribute('inert'),
    gateAriaHidden:document.getElementById('aqariCloudGateV168')?.getAttribute('aria-hidden'),
    authButtonsDisabled:Array.from(document.querySelectorAll('[data-cloud-auth-action]')).some(button => button.disabled),
    loginSecure:window.login === window.cloudLoginV198,
    localLoginSecure:window.loginLocalV120 === window.cloudLoginV198,
    supabase:Boolean(window.AQARI_SUPABASE),
    cloud:Boolean(window.AQARI_CLOUD_SYNC),
    autosyncMode:window.AQARI_AUTOSYNC?.status?.mode,
    design:document.querySelector('meta[name="aqari-design"]')?.content,
    productRelease:document.querySelector('meta[name="aqari-release"]')?.content,
    apiContract:document.querySelector('meta[name="aqari-api-contract"]')?.content,
    releaseStage:document.querySelector('meta[name="aqari-stage"]')?.content,
    title:document.title,
    luxury:document.body.classList.contains('aq-v200'),
    easy:document.body.classList.contains('aq-v201'),
    propertyOS:document.body.classList.contains('aq-v202'),
    unitDirectory:document.body.classList.contains('aq-v203'),
    propertyOSReady:document.body.getAttribute('data-v202-ready'),
    propertyOSVersion:window.AQARI_V202?.version,
    simplified:document.body.classList.contains('aq-v205'),
    simplifiedReady:document.body.getAttribute('data-v205-ready'),
    simplifiedVersion:window.AQARI_V205?.version,
    portfolioCollections:document.body.classList.contains('aq-v208'),
    globalSearch:document.body.classList.contains('aq-v209'),
    globalSearchVersion:window.AQARI_V209?.version,
    globalSearchRevision:window.AQARI_V209?.revision,
    globalSearchMeta:document.querySelector('meta[name="aqari-global-search"]')?.content,
    simpleHome:Boolean(document.getElementById('v205SimpleHome')),
    shell:Boolean(document.getElementById('aqariV199Topbar')),
    dashboard:Boolean(document.getElementById('aqariV199Dashboard')),
    mobileItems:document.querySelectorAll('.mobilebar .v199-bottom-button').length,
    createOptions:document.querySelectorAll('#v201CreateMenu [data-v201-create]').length,
    propertyActions:document.querySelectorAll('#v201PropertyCenter [data-v201-property-action]').length,
    mobileCreateHidden:!document.getElementById('v201MobileCreate')?.getClientRects().length,
    businessLinks:Array.from(document.querySelectorAll('#v199MoreMenu [data-v199-go]')).map(node => node.getAttribute('data-v199-go')),
    fakeBars:document.querySelectorAll('#aqariV199Dashboard .v199-mini-bars').length,
    labels:Array.from(document.querySelectorAll('#aqariV199Dashboard .v199-kpi-label')).map(node => node.textContent.trim()),
    priorityFirst:(() => {
      const dashboard=document.getElementById('aqariV199Dashboard');
      const priority=dashboard?.querySelector('.v201-priority-panel');
      const kpis=dashboard?.querySelector('.v199-kpi-grid');
      return Boolean(priority&&kpis&&(priority.compareDocumentPosition(kpis)&Node.DOCUMENT_POSITION_FOLLOWING));
    })(),
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if(!state.gate || !state.loginSecure || !state.localLoginSecure || !state.supabase || !state.cloud){
    throw new Error('secure cloud bridge unavailable');
  }
  if(state.gateInert || state.gateAriaHidden === 'true' || state.authButtonsDisabled){
    throw new Error('secure cloud gate did not become interactive after startup');
  }
  if(state.autosyncMode !== 'manual_only') throw new Error('automatic upload must remain disabled');
  if(state.productRelease !== 'V211.1.2' || state.apiContract !== 'V198' || state.releaseStage !== 'production'){
    throw new Error('visible release identity mismatch');
  }
  if(!state.title.includes('V211.1.2')) throw new Error('document title has stale release identity');
  if(state.design !== 'V206-preview' || !state.luxury || !state.easy || !state.propertyOS || !state.unitDirectory || state.propertyOSReady !== 'true' || state.propertyOSVersion !== 'V206-preview' || !state.simplified || state.simplifiedReady !== 'true' || state.simplifiedVersion !== 'V205-preview' || !state.portfolioCollections || !state.globalSearch || state.globalSearchVersion !== 'V209-global-search' || state.globalSearchRevision !== 'V209.1-self-heal' || state.globalSearchMeta !== 'V209-global-search' || !state.simpleHome || !state.shell || !state.dashboard) throw new Error('V209 presentation layer unavailable');
  if(state.mobileItems !== 5) throw new Error(`mobile navigation count ${state.mobileItems}`);
  if(state.createOptions !== 4) throw new Error(`quick-create option count ${state.createOptions}`);
  if(state.propertyActions !== 4) throw new Error(`property action count ${state.propertyActions}`);
  if(!state.mobileCreateHidden) throw new Error('duplicate mobile create trigger must stay hidden on home');
  for(const route of ['tenants','reports','documentsHub']) if(!state.businessLinks.includes(route)) throw new Error(`${route} missing from More menu`);
  if(state.fakeBars !== 0) throw new Error('hard-coded chart bars must not be shown');
  if(!state.priorityFirst) throw new Error('today priorities must precede KPIs');
  for(const label of ['الدخل المسجل','المقبوضات المسجلة','إيجار مستحق','طلبات صيانة مفتوحة']) if(!state.labels.includes(label)) throw new Error(`${label} missing`);
  if(state.horizontalOverflow) throw new Error('page has horizontal overflow at 390px');
});

await check('V209 signed-out search stays sealed and fits the iPhone viewport', async () => {
  await page.evaluate(() => document.querySelector('#v205SimpleHome [data-v205-command="search"]')?.click());
  await page.waitForTimeout(180);
  const state=await page.evaluate(() => {
    const panel=document.getElementById('v199SearchPanel');
    const input=document.getElementById('v199SearchInput');
    const results=document.getElementById('v209SearchResults');
    const rect=panel?.getBoundingClientRect();
    let properties=[];
    try{properties=window.AQARI_V202?.rentOfficeProperties?.()||[]}catch{}
    return {
      open:Boolean(panel?.classList.contains('on')),
      role:panel?.getAttribute('role'),
      dir:panel?.getAttribute('dir'),
      inputValue:input?.value||'',
      inputFont:input?parseFloat(getComputedStyle(input).fontSize):0,
      signedOutMessage:String(results?.textContent||'').includes('سجّل الدخول'),
      protectedProperties:Array.isArray(properties)?properties.length:-1,
      left:rect?.left??-1,
      right:rect?.right??-1,
      viewport:document.documentElement.clientWidth,
      horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  });
  if(!state.open||state.role!=='search'||state.dir!=='rtl')throw new Error('V209 search surface did not open accessibly: '+JSON.stringify(state));
  if(state.inputValue||!state.signedOutMessage||state.protectedProperties!==0)throw new Error('signed-out V209 search exposed or retained protected data');
  if(state.inputFont<16)throw new Error(`V209 input font ${state.inputFont}px can trigger iPhone zoom`);
  if(state.left<0||state.right>state.viewport+1||state.horizontalOverflow)throw new Error(`V209 panel escaped viewport: ${state.left}..${state.right}/${state.viewport}`);
  await page.keyboard.press('Escape');
});

await check('V210 signed-out command center stays sealed and mobile-safe', async () => {
  await page.waitForFunction(() => window.AQARI_V210?.version === 'V210-daily-command-center');
  const state=await page.evaluate(() => ({
    authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
    apiVersion:window.AQARI_V210?.version,
    commandCenter:Boolean(document.getElementById('v210DailyCommandCenter')),
    cssLoaded:Boolean(document.getElementById('aqari-v210-daily-command-center-css')),
    scriptLoaded:Boolean(document.getElementById('aqari-v210-daily-command-center-js')),
    meta:document.querySelector('meta[name="aqari-daily-command-center"]')?.content||'',
    protectedSnapshot:window.AQARI_V210?.resume?.(null),
    horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
  }));
  if(state.authenticated)throw new Error('test requires a signed-out Preview');
  if(state.apiVersion!=='V210-daily-command-center'||!state.cssLoaded||!state.scriptLoaded||state.meta!=='V210-daily-command-center')throw new Error('V210 assets or identity missing: '+JSON.stringify(state));
  if(state.commandCenter||state.protectedSnapshot!==false)throw new Error('signed-out V210 command center exposed protected workspace data');
  if(state.horizontalOverflow)throw new Error('V210 creates horizontal overflow at 390px');
});

await check('V205 keeps one visible mobile navigation with five clear sections', async () => {
  await page.waitForSelector('body[data-v205-ready="true"]');
  const state=await page.evaluate(() => {
    const root=document.getElementById('v205SimpleHome');
    const sections=Array.from(document.querySelectorAll('#v205PrimarySections [data-v205-section]')).map(node => {
      const rect=node.getBoundingClientRect();
      return {
        key:node.getAttribute('data-v205-section'),
        route:node.getAttribute('data-v199-go'),
        label:node.textContent.trim(),
        current:node.getAttribute('aria-current'),
        width:rect.width,
        height:rect.height
      };
    });
    return {
      lang:document.documentElement.lang,
      dir:document.documentElement.dir,
      rootDirection:root?getComputedStyle(root).direction:'',
      navLabel:document.getElementById('v205PrimarySections')?.getAttribute('aria-label')||'',
      inPageNavHidden:Boolean(document.getElementById('v205PrimarySections')?.hidden),
      visibleTopNav:Boolean(document.querySelector('.v199-primary-nav')?.getClientRects().length),
      mobileSections:Array.from(document.querySelectorAll('.mobilebar .v199-bottom-button')).map(node => {
        const rect=node.getBoundingClientRect();
        return {width:rect.width,height:rect.height,visible:Boolean(node.getClientRects().length)};
      }),
      sections,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  });
  const expected=[
    ['home','home','الرئيسية'],
    ['properties','properties','العقارات'],
    ['tenants','tenants','المستأجرون'],
    ['collectionProPage','collectionProPage','التحصيل'],
    ['maintenanceProPage','maintenanceProPage','الصيانة']
  ];
  if(state.lang!=='ar'||state.dir!=='rtl'||state.rootDirection!=='rtl')throw new Error('V205 must stay Arabic RTL');
  if(!state.navLabel)throw new Error('primary navigation needs an accessible label');
  if(state.sections.length!==5)throw new Error(`primary section count ${state.sections.length}`);
  if(new Set(state.sections.map(item => item.key)).size!==5)throw new Error('primary section keys must be unique');
  expected.forEach(([key,route,label],index) => {
    const actual=state.sections[index];
    if(actual?.key!==key||actual?.route!==route||!actual?.label.includes(label))throw new Error(`primary section ${index+1} mismatch`);
  });
  if(state.sections.filter(item => item.current==='page').length!==1)throw new Error('exactly one primary section must be current');
  if(!state.inPageNavHidden)throw new Error('duplicate in-page navigation must stay hidden');
  if(state.visibleTopNav)throw new Error('desktop navigation must stay hidden at mobile width');
  if(state.mobileSections.length!==5||state.mobileSections.some(item => !item.visible||item.width<44||item.height<44))throw new Error('mobile navigation must expose five accessible touch targets');
  if(state.overflow)throw new Error('V205 home overflows horizontally at 390px');
});

await check('V205 daily actions are complete and safe before property selection', async () => {
  const actions=await page.evaluate(() => Array.from(document.querySelectorAll('#v205DailyActions [data-v205-daily-action]')).map(node => {
    const rect=node.getBoundingClientRect();
    return {
      key:node.getAttribute('data-v205-daily-action'),
      route:node.getAttribute('data-v199-go'),
      label:node.textContent.trim(),
      disabled:node.disabled,
      width:rect.width,
      height:rect.height
    };
  }));
  const expected=['contract','payment','statement','maintenance'];
  if(JSON.stringify(actions.map(item => item.key))!==JSON.stringify(expected))throw new Error(`daily actions: ${actions.map(item => item.key).join(',')}`);
  for(const action of actions){
    if(!action.label||!action.route||action.disabled)throw new Error(`${action.key} is not actionable`);
    if(action.width<44||action.height<44)throw new Error(`${action.key} touch target is too small`);
  }
});

await check('V205 signed-out home exposes no protected tenant data', async () => {
  const state=await page.evaluate(() => {
    const root=document.getElementById('v205SimpleHome');
    const normalized=String(root?.innerText||'').replace(/[٠-٩]/g,digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    return {
      authenticated:Boolean(window.AQARI_SUPABASE?.context?.user),
      civilIdVisible:/\b\d{12}\b/.test(normalized),
      protectedCards:root?.querySelectorAll('[data-v202-unit-index],[data-v202-tenant-statement],[data-v202-civil-reveal]').length||0,
      contactLinks:root?.querySelectorAll('a[href^="mailto:"],a[href^="tel:"]').length||0,
      rawSensitiveValues:root?.querySelectorAll('.aq-unit-sensitive-value,.v204-sensitive-value:not(.is-masked)').length||0
    };
  });
  if(state.authenticated)throw new Error('test requires a signed-out Preview');
  if(state.civilIdVisible||state.protectedCards||state.contactLinks||state.rawSensitiveValues)throw new Error('protected tenant data leaked into the public V205 home');
});

await check('signed-out property workspace fails closed', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(trigger) await trigger.click();
  await page.waitForTimeout(160);
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v202PropertyWorkspace')?.getAttribute('aria-hidden') === 'false',
    documentShown:document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden') === 'false',
    tenantData:document.querySelectorAll('#v202PropertyWorkspace [data-v202-unit-index],#v202DocumentDialog [data-v202-tenant-statement]').length,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  }));
  if(state.shown||state.documentShown||state.tenantData) throw new Error('signed-out property data or document became visible');
  if(state.horizontalOverflow) throw new Error('signed-out property flow creates horizontal overflow at 390px');
});

await check('V206 ledger remains sealed before authentication', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(trigger) await trigger.click();
  await page.waitForTimeout(160);
  await page.evaluate(() => document.querySelector('#v202PropertyWorkspace [data-v202-action="statement"]')?.click());
  await page.waitForTimeout(160);
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden')==='false',
    ledger:Boolean(document.querySelector('#v202DocumentDialog [data-v206-ledger]')),
    cssLoaded:Boolean(document.getElementById('aqari-v206-integrated-ledger-css')),
    legacyV206:Boolean(document.querySelector('#v201RentStatement [data-v206-ledger]'))
  }));
  if(state.shown||state.ledger||state.legacyV206) throw new Error('signed-out V206 ledger must not render');
  if(!state.cssLoaded) throw new Error('V206 ledger stylesheet missing');
});

await check('V201 quick-create respects the auth gate and keeps an accessible modal', async () => {
  const authState = await page.evaluate(() => ({
    gateOpen:document.getElementById('aqariCloudGateV168')?.classList.contains('on'),
    gateRole:document.getElementById('aqariCloudGateV168')?.getAttribute('role'),
    gateModal:document.getElementById('aqariCloudGateV168')?.getAttribute('aria-modal'),
    authenticated:Boolean(
      window.AQARI_SUPABASE?.context?.user?.id &&
      window.AQARI_SUPABASE?.context?.workspace?.id &&
      window.AQARI_SUPABASE?.context?.membership?.is_active
    )
  }));
  if(authState.gateOpen && !authState.authenticated){
    if(authState.gateRole !== 'dialog' || authState.gateModal !== 'true'){
      throw new Error('signed-out cloud gate must remain an accessible modal');
    }
    return;
  }
  await page.locator('#v205SimpleHome [data-v205-command="quick"]').click();
  await page.waitForTimeout(160);
  const open = await page.evaluate(() => ({
    shown:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden') === 'false',
    focused:Boolean(document.activeElement?.matches('[data-v201-create]'))
  }));
  if(!open.shown || !open.focused) throw new Error('quick-create sheet did not open accessibly');
  await page.evaluate(() => document.querySelector('[data-v201-create="properties"]')?.click());
  await page.waitForTimeout(180);
  const modal = await page.evaluate(() => ({
    open:document.getElementById('modal')?.classList.contains('on'),
    role:document.getElementById('modal')?.getAttribute('role'),
    ariaModal:document.getElementById('modal')?.getAttribute('aria-modal'),
    labels:document.querySelectorAll('#fields .v201-field').length,
    controls:document.querySelectorAll('#fields input,#fields select,#fields textarea').length
  }));
  if(!modal.open || modal.role !== 'dialog' || modal.ariaModal !== 'true') throw new Error('create modal accessibility contract failed');
  if(!modal.controls || modal.labels !== modal.controls) throw new Error(`visible labels ${modal.labels}/${modal.controls}`);
  await page.evaluate(() => {
    document.getElementById('modal')?.classList.remove('on');
    window.go?.('home');
  });
});

await check('V79 database status is manual, coalesced, and render-safe', async () => {
  const before = dbStatusRequests.length;
  if(before !== 0) throw new Error(`database status requested during startup: ${dbStatusRequests.join(', ')}`);
  await page.evaluate(() => Promise.all(Array.from({length:20}, () => window.checkBootstrapV79())));
  if(dbStatusRequests.length - before !== 1) throw new Error(`status requests were not coalesced: ${dbStatusRequests.length - before}`);
  const after = dbStatusRequests.length;
  await page.evaluate(() => { for(let i=0;i<10;i+=1) window.render(); });
  await page.waitForTimeout(100);
  if(dbStatusRequests.length !== after) throw new Error('render triggered a database status request');
});

async function readApi(path){
  const response = await page.request.get(new URL(path, base).toString());
  if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  const cacheControl = String(response.headers()['cache-control'] || '');
  if(!cacheControl.includes('no-store')) throw new Error(`${path} browser cache contract`);
  if(response.headers()['x-content-type-options'] !== 'nosniff') throw new Error(`${path} nosniff contract`);
  const body = await response.json();
  if(body.ok !== true || body.version !== 'V198') throw new Error(`${path} payload mismatch`);
  const post = await page.request.post(new URL(path, base).toString());
  if(post.status() !== 405) throw new Error(`${path} POST must be 405`);
  return body;
}

await check('all read-only APIs', async () => {
  for(const path of [
    '/api/health','/api/health/deep','/api/db/status','/api/ops/status','/api/release',
    '/api/config-status','/api/supabase-status','/api/cloud-sync-status',
    '/api/migration-status','/api/autosync-status','/api/production-readiness',
    '/api/final-release-status','/api/production-meta'
  ]) await readApi(path);
});

await check('legacy database status compatibility', async () => {
  const body = await readApi('/api/db/status');
  if(body.provider !== 'supabase' || body.mode !== 'supabase_cloud') throw new Error('Supabase mode missing');
  if(body.configured !== true) throw new Error('public Supabase configuration missing');
  if(body.connected !== true || body.connectionVerified !== true) throw new Error('live Supabase connection was not verified');
  if(body.connection?.state !== 'up') throw new Error(`Supabase connection state ${body.connection?.state || 'missing'}`);
  if(typeof body.authMode !== 'string' || !body.authMode) throw new Error('authMode missing');
  if(!Array.isArray(body.tables)) throw new Error('tables must be an array');
  if('releasePreparationSnapshot' in body) throw new Error('stale release snapshot leaked');
});

await check('Preview SHA and environment', async () => {
  const body = await readApi('/api/production-meta');
  if(body.deployment?.environment !== 'preview') throw new Error('not a Preview deployment');
  if(body.deployment?.gitSha !== expectedSha) throw new Error(`SHA ${body.deployment?.gitSha || 'missing'} != ${expectedSha}`);
  if(body.productVersion !== 'V211.1.2' || body.apiContractVersion !== 'V198') throw new Error('release identity mismatch');
});

await check('Preview production-readiness contract', async () => {
  const body = await readApi('/api/production-readiness');
  const summary = body.summary;
  if(body.deployment?.environment !== 'preview') throw new Error('production-readiness did not report Preview');
  if(!summary || !Number.isInteger(summary.passed) || !Number.isInteger(summary.required) || typeof summary.ready !== 'boolean'){
    throw new Error('summary contract invalid');
  }
  if(summary.required <= 0) throw new Error('summary.required must be positive');
  if(summary.ready !== (summary.passed === summary.required) || body.ready !== summary.ready) throw new Error('readiness is inconsistent');
  if(body.ready !== true) throw new Error('Preview is not operationally ready: ' + JSON.stringify(body.checks));
  if(body.checks?.supabaseConnection?.state !== 'up') throw new Error('Supabase live check did not pass');
  const serialized = JSON.stringify(body);
  if(/DATABASE_URL|AUTH_SECRET|MFA_ENCRYPTION_KEY|S3_SECRET_ACCESS_KEY|RESEND_API_KEY|WHATSAPP_ACCESS_TOKEN|PAYMENT_WEBHOOK_SECRET/.test(serialized)){
    throw new Error('legacy secret footprint leaked from readiness payload');
  }

  console.log('INFO', `operational readiness checks: ${summary.passed}/${summary.required}`);
});

await check('V211 identity survives a blocked V201 presentation layer', async () => {
  const fallbackPage = await context.newPage();
  try{
    await fallbackPage.route('**/v201-experience.js*', route => route.abort('failed'));
    const fallbackUrl = new URL(base);
    fallbackUrl.pathname = '/app';
    fallbackUrl.searchParams.set('release','V211.1.2');
    const response = await fallbackPage.goto(fallbackUrl.toString(), { waitUntil:'domcontentloaded', timeout:30000 });
    if(!response?.ok()) throw new Error(`fallback HTTP ${response?.status()}`);
    await fallbackPage.waitForSelector('#aqariV199Topbar', { timeout:12000 });
    const identity = await fallbackPage.evaluate(() => ({
      header:document.querySelector('#aqariV199Topbar .v199-brand-copy small')?.textContent?.trim() || '',
      gate:document.querySelector('.v199-gate-version')?.textContent?.trim() || '',
      stale:Array.from(document.querySelectorAll('#aqariV199Topbar,.v199-gate-version'))
        .some(node => /V200(?:\s+LUXURY)?/i.test(node.textContent || ''))
    }));
    if(identity.header !== 'V211.1.2' || identity.gate !== 'AQARI V211.1.2' || identity.stale){
      throw new Error('fallback release identity mismatch: ' + JSON.stringify(identity));
    }
  }finally{
    await fallbackPage.close();
  }
});

await check('PWA and V209 presentation assets', async () => {
  for(const path of ['/manifest.webmanifest','/sw.js','/aqari-icon.svg','/v199-ui.css','/v199-ui.js','/v200-luxury.css','/v201-easy.css','/v201-experience.js','/v202-prestige.css','/v202-property-os.js','/v205-simple.css','/v205-simplified-shell.js','/v206-integrated-ledger.css','/v208-portfolio-collections.css','/v208-portfolio-collections.js','/v209-global-search.css','/v209-global-search.js','/v210-daily-command-center.css','/v210-daily-command-center.js']){
    const response = await page.request.get(new URL(path, base).toString());
    if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  }
  if(pageErrors.length) throw new Error(pageErrors.slice(0,3).join(' | '));
  if(responseErrors.length) throw new Error(responseErrors.slice(0,5).join(' | '));
});

await browser.close();
if(failed) process.exit(1);
console.log('AQARI V210 Daily Command Center Preview E2E on V198 runtime: PASS');
