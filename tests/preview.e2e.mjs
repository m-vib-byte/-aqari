import { chromium } from 'playwright';

const base = process.env.AQARI_BASE_URL;
const expectedSha = String(process.env.AQARI_EXPECTED_SHA || '').trim();
if(!base || !expectedSha){
  console.error('AQARI_BASE_URL and AQARI_EXPECTED_SHA are required');
  process.exit(2);
}

const previewUrl = new URL(base);
if(base !== previewUrl.origin){
  console.error('AQARI_BASE_URL must be the clean, verified Preview origin');
  process.exit(2);
}
const bypass = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();
const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({
  viewport:{ width:390, height:844 }
});
const publicProbe = await context.request.get(base,{failOnStatusCode:false,maxRedirects:0});
if(!publicProbe.ok()){
  if(![401,403].includes(publicProbe.status())){
    console.error(`Preview probe failed with unexpected HTTP ${publicProbe.status()}`);
    await browser.close();
    process.exit(2);
  }
  if(!bypass){
    console.error(`Preview is protected (HTTP ${publicProbe.status()}) and no bypass secret is configured`);
    await browser.close();
    process.exit(2);
  }
  const protectedProbe = await context.request.get(base,{
    failOnStatusCode:false,
    maxRedirects:0,
    headers:{
      'x-vercel-protection-bypass':bypass,
      'x-vercel-set-bypass-cookie':'true'
    }
  });
  if(!protectedProbe.ok()){
    console.error(`Vercel bypass failed with HTTP ${protectedProbe.status()}`);
    await browser.close();
    process.exit(2);
  }
}
const page = await context.newPage();
const pageErrors = [];
const responseErrors = [];
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

await check('V202 property operations loads on the secure V198 runtime', async () => {
  const response = await page.goto(base, { waitUntil:'domcontentloaded', timeout:30000 });
  if(!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
  await page.waitForFunction(() => (
    window.AQARI_V202?.version === 'V202-preview' &&
    window.AQARI_V203?.version === 'V203-simple' &&
    window.AQARI_DHAHAWI?.version === 'V203-dhahawi-ledger' &&
    window.login === window.cloudLoginV198 &&
    window.loginLocalV120 === window.cloudLoginV198 &&
    Boolean(window.AQARI_SUPABASE) && Boolean(window.AQARI_CLOUD_SYNC) &&
    document.body.getAttribute('data-v202-ready') === 'true'
  ), null, { timeout:20000 });
  const state = await page.evaluate(() => ({
    release:document.querySelector('meta[name="aqari-release"]')?.content,
    runtimeBase:document.querySelector('meta[name="aqari-runtime-base"]')?.content,
    dataContract:document.querySelector('meta[name="aqari-data-contract"]')?.content,
    gate:Boolean(document.getElementById('aqariCloudGateV168')?.classList.contains('on')),
    loginSecure:window.login === window.cloudLoginV198,
    localLoginSecure:window.loginLocalV120 === window.cloudLoginV198,
    supabase:Boolean(window.AQARI_SUPABASE),
    cloud:Boolean(window.AQARI_CLOUD_SYNC),
    autosyncMode:window.AQARI_AUTOSYNC?.status?.mode,
    design:document.querySelector('meta[name="aqari-design"]')?.content,
    experience:document.querySelector('meta[name="aqari-experience"]')?.content,
    operations:document.querySelector('meta[name="aqari-operations"]')?.content,
    luxury:document.body.classList.contains('aq-v200'),
    easy:document.body.classList.contains('aq-v201'),
    propertyOS:document.body.classList.contains('aq-v202'),
    propertyOSReady:document.body.getAttribute('data-v202-ready'),
    propertyOSVersion:window.AQARI_V202?.version,
    shell:Boolean(document.getElementById('aqariV199Topbar')),
    dashboard:Boolean(document.getElementById('aqariV199Dashboard')),
    mobileItems:document.querySelectorAll('.mobilebar .v199-bottom-button').length,
    createOptions:document.querySelectorAll('#v201CreateMenu [data-v201-create]').length,
    propertyActions:document.querySelectorAll('#v201PropertyCenter [data-v201-property-action]').length,
    mobileCreateSize:document.getElementById('v201MobileCreate')?.getBoundingClientRect().width,
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
  if(state.release !== 'V203' || state.runtimeBase !== 'V198' || state.dataContract !== 'V202') throw new Error('V203 release identity metadata unavailable');
  if(!state.gate || !state.loginSecure || !state.localLoginSecure || !state.supabase || !state.cloud){
    throw new Error('secure cloud bridge unavailable');
  }
  if(state.autosyncMode !== 'manual_only') throw new Error('automatic upload must remain disabled');
  if(state.design !== 'V202-preview' || state.experience !== 'V203-simple' || state.operations !== 'V203-dhahawi-ledger' || !state.luxury || !state.easy || !state.propertyOS || state.propertyOSReady !== 'true' || state.propertyOSVersion !== 'V202-preview' || !state.shell || !state.dashboard) throw new Error('V202 data presentation or V203 experience layer unavailable');
  if(state.mobileItems !== 5) throw new Error(`mobile navigation count ${state.mobileItems}`);
  if(state.createOptions !== 4) throw new Error(`quick-create option count ${state.createOptions}`);
  if(state.propertyActions !== 4) throw new Error(`property action count ${state.propertyActions}`);
  if(state.mobileCreateSize < 44) throw new Error(`mobile create target ${state.mobileCreateSize}px`);
  for(const route of ['tenants','reports','documentsHub']) if(!state.businessLinks.includes(route)) throw new Error(`${route} missing from More menu`);
  if(state.fakeBars !== 0) throw new Error('hard-coded chart bars must not be shown');
  if(!state.priorityFirst) throw new Error('today priorities must precede KPIs');
  for(const label of ['الدخل المسجل','المقبوضات المسجلة','إيجار مستحق','طلبات صيانة مفتوحة']) if(!state.labels.includes(label)) throw new Error(`${label} missing`);
  if(state.horizontalOverflow) throw new Error('page has horizontal overflow at 390px');
});

// Authentication itself is covered by the secure-runtime contract above. The remaining
// checks exercise the already-rendered operations UI without requiring a real user session.
await page.addStyleTag({ content:'#aqariCloudGateV168{display:none!important;pointer-events:none!important}' });
await page.evaluate(() => {
  const gate=document.getElementById('aqariCloudGateV168');
  if(!gate)return;
  gate.classList.remove('on');
  gate.hidden=true;
  gate.setAttribute('inert','');
  gate.setAttribute('aria-hidden','true');
});

await check('each property has a complete V202 operating workspace', async () => {
  const trigger=await page.$('#aqariV199Dashboard [data-v201-property]');
  if(!trigger) throw new Error('property management trigger missing');
  await page.evaluate(() => document.querySelector('#aqariV199Dashboard [data-v201-property]')?.click());
  await page.waitForFunction(() => (
    document.getElementById('v202PropertyWorkspace')?.getAttribute('aria-hidden') === 'false' &&
    Boolean(document.querySelector('#v202PropertyWorkspace .v203-simple-strip'))
  ));
  const state=await page.evaluate(() => ({
    shown:document.getElementById('v202PropertyWorkspace')?.getAttribute('aria-hidden') === 'false',
    title:document.getElementById('v202PropertyTitle')?.textContent.trim(),
    actions:Array.from(document.querySelectorAll('#v202PropertyWorkspace [data-v202-action]')).map(node => node.textContent.trim()),
    tabs:Array.from(document.querySelectorAll('#v202PropertyWorkspace [role="tab"]')).map(node => ({label:node.textContent.trim(),selected:node.getAttribute('aria-selected'),controls:node.getAttribute('aria-controls')})),
    kpis:document.querySelectorAll('#v202PropertyWorkspace .v202-property-kpis .v202-kpi').length,
    context:window.AQARI_V202?.propertyContext(document.getElementById('v202PropertyTitle')?.textContent.trim())
  }));
  if(!state.shown || !state.title) throw new Error('V202 property workspace did not open');
  for(const label of ['إبرام عقد','تسجيل إيجار','كشف الإيجار','الملف الكامل']) if(!state.actions.some(text => text.includes(label))) throw new Error(`${label} action missing`);
  for(const label of ['نظرة عامة','العقود','التحصيل','المصروفات']) if(!state.tabs.some(tab => tab.label.includes(label))) throw new Error(`${label} tab missing`);
  if(state.tabs.some(tab => !tab.controls)) throw new Error('tab relationships missing');
  if(state.kpis !== 6) throw new Error(`property KPI count ${state.kpis}`);
  if(!state.context || state.context.name !== state.title) throw new Error('property context mismatch');
  await page.evaluate(() => document.querySelector('[data-v202-close]')?.click());
});

await check('V203 actions and Dhahawi ledger stay bound to the exact V202 month snapshot', async () => {
  await page.evaluate(() => document.querySelector('#aqariV199Dashboard [data-v201-property]')?.click());
  await page.waitForFunction(() => (
    Boolean(document.querySelector('#v202PropertyWorkspace .v203-simple-strip')) &&
    typeof window.AQARI_V202?.rentSnapshot === 'function' &&
    typeof window.AQARI_DHAHAWI?.statementModel === 'function'
  ));

  const state = await page.evaluate(() => {
    const api = window.AQARI_V202;
    const workspace = document.querySelector('#v202PropertyWorkspace > .v202-workspace');
    const property = api.currentProperty();
    const period = api.currentPeriod();
    const snapshot = api.rentSnapshot(property, period);
    const amount = value => Number(value || 0).toLocaleString('ar-KW', { maximumFractionDigits: 3 }) + ' د.ك';
    const expected = Number(snapshot?.totals?.expected ?? snapshot?.totals?.due ?? 0);
    const paid = Number(snapshot?.totals?.collected ?? snapshot?.totals?.paid ?? 0);
    const balance = Number(snapshot?.totals?.balance || 0);
    return {
      property,
      title: document.getElementById('v202PropertyTitle')?.textContent.trim() || '',
      period,
      strips: workspace?.querySelectorAll('.v203-simple-strip').length || 0,
      actions: Array.from(workspace?.querySelectorAll('[data-v203-action]') || []).map(node => ({
        action: node.getAttribute('data-v203-action'),
        type: node.getAttribute('type'),
        disabled: node.disabled,
        label: node.textContent.trim(),
      })),
      originalHidden: workspace?.querySelector('.v202-actions')?.getAttribute('aria-hidden'),
      v203Version: window.AQARI_V203?.version,
      dhahawiVersion: window.AQARI_DHAHAWI?.version,
      snapshot: snapshot ? {
        property: snapshot.property,
        period: snapshot.period,
        contracts: snapshot.contracts,
        paidUnits: snapshot.paidUnits,
        dueContracts: Array.from(snapshot.dueContracts || []).length,
        totals: snapshot.totals,
        items: Array.from(snapshot.items || []).map(item => ({
          contractId: item.contractId,
          unit: item.unit,
          due: item.due,
          paid: item.paid,
          pending: item.pending,
          balance: item.balance,
        })),
      } : null,
      glance: Array.from(workspace?.querySelectorAll('.v203-month-glance strong') || []).map(node => node.textContent.trim()),
      expectedGlance: snapshot ? [
        String(Number(snapshot.contracts || 0)),
        String(Number(snapshot.paidUnits || 0)),
        expected ? `${amount(paid)} من ${amount(expected)}` : 'لا توجد عقود فعالة',
        amount(balance),
      ] : [],
      overflow: workspace ? workspace.scrollWidth > workspace.clientWidth + 1 : true,
    };
  });

  if (!state.property || state.property !== state.title || state.strips !== 1) throw new Error(`V203 property/strip mismatch (${state.property}, ${state.strips})`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(state.period)) throw new Error(`invalid V202 current period ${state.period}`);
  if (!state.snapshot || state.snapshot.property !== state.property || state.snapshot.period !== state.period) throw new Error('rentSnapshot is not bound to the active property and period');
  if (state.v203Version !== 'V203-simple' || state.dhahawiVersion !== 'V203-dhahawi-ledger') throw new Error('V203 runtime APIs unavailable');
  if (state.originalHidden !== 'true') throw new Error('duplicate V202 action bar is still exposed');
  if (state.overflow) throw new Error('V203 workspace overflows at 390px');

  const requiredActions = ['contract', 'payment', 'receipt', 'statement', 'profile'];
  if (state.actions.length !== requiredActions.length || new Set(state.actions.map(item => item.action)).size !== requiredActions.length) throw new Error('V203 action set is duplicated or incomplete');
  for (const action of requiredActions) {
    const button = state.actions.find(item => item.action === action);
    if (!button || button.type !== 'button' || button.disabled || !button.label) throw new Error(`V203 ${action} button contract failed`);
  }

  const requireAmount = (value, label) => {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${label} must be a finite non-negative number`);
    return Number(value);
  };
  for (const key of ['due', 'expected', 'paid', 'collected', 'pending', 'balance']) requireAmount(state.snapshot.totals?.[key], `snapshot.totals.${key}`);
  if (Number(state.snapshot.contracts) !== state.snapshot.items.length) throw new Error('snapshot contract count does not match its items');
  if (Number(state.snapshot.paidUnits) !== state.snapshot.items.filter(item => Number(item.paid) > 0).length) throw new Error('snapshot paid-unit count is inconsistent');
  if (Number(state.snapshot.dueContracts) !== state.snapshot.items.filter(item => Number(item.balance) > 0).length) throw new Error('snapshot due-contract count is inconsistent');
  for (const [index, item] of state.snapshot.items.entries()) {
    if (!item.contractId || !item.unit) throw new Error(`snapshot item ${index} is not linked to a contract and unit`);
    const due = requireAmount(item.due, `snapshot.items[${index}].due`);
    const paid = requireAmount(item.paid, `snapshot.items[${index}].paid`);
    requireAmount(item.pending, `snapshot.items[${index}].pending`);
    const balance = requireAmount(item.balance, `snapshot.items[${index}].balance`);
    if (Math.abs(balance - Math.max(0, due - paid)) > 0.0005) throw new Error(`snapshot item ${index} balance is inconsistent`);
  }
  const itemBalanceTotal = state.snapshot.items.reduce((total, item) => total + Number(item.balance), 0);
  if (Math.abs(Number(state.snapshot.totals.balance) - itemBalanceTotal) > 0.0005) throw new Error('snapshot total balance must equal the sum of contract balances');
  if (JSON.stringify(state.glance) !== JSON.stringify(state.expectedGlance)) throw new Error('V203 headline numbers diverge from the V202 snapshot');

  await page.locator('#v202PropertyWorkspace [data-v203-action="statement"]').click();
  await page.waitForFunction(() => document.getElementById('aqariDhahawiDialog')?.classList.contains('on'));
  const statement = await page.evaluate(() => {
    const dialog = document.getElementById('aqariDhahawiDialog');
    const property = window.AQARI_V202.currentProperty();
    const period = window.AQARI_V202.currentPeriod();
    const snapshot = window.AQARI_V202.rentSnapshot(property, period);
    const model = window.AQARI_DHAHAWI.statementModel(property, period);
    return {
      hidden: dialog?.getAttribute('aria-hidden'),
      inert: dialog?.hasAttribute('inert'),
      headers: dialog?.querySelectorAll('thead th').length || 0,
      rows: dialog?.querySelectorAll('tbody .v203-rent-row:not(.v203-rent-filler)').length || 0,
      property: dialog?.querySelector('[data-v202-dhahawi]')?.getAttribute('data-property'),
      paperPeriod: dialog?.querySelector('[data-v202-dhahawi]')?.getAttribute('data-period'),
      dialogPeriod: dialog?.dataset.period,
      inputPeriod: dialog?.querySelector('[data-dhahawi-period]')?.value,
      controls: ['close', 'csv', 'print'].map(name => {
        const node = dialog?.querySelector(`[data-dhahawi-${name}]`);
        return { name, exists: Boolean(node), type: node?.getAttribute('type'), disabled: Boolean(node?.disabled) };
      }),
      snapshotTotals: snapshot?.totals,
      modelTotals: model?.totals,
      modelAvailable: model?.available,
      modelItems: model?.items?.length,
      summary: Array.from(dialog?.querySelectorAll('.v203-ledger-summary strong') || []).map(node => node.textContent.trim()),
    };
  });
  if (statement.hidden !== 'false' || statement.inert || statement.headers !== 14 || statement.property !== state.property) throw new Error('Dhahawi statement did not open as the linked 14-column dialog');
  if (statement.paperPeriod !== state.period || statement.dialogPeriod !== state.period || statement.inputPeriod !== state.period) throw new Error('Dhahawi statement period diverges from V202');
  if (!statement.modelAvailable || statement.rows !== Number(statement.modelItems) || statement.rows !== state.snapshot.items.length) throw new Error('Dhahawi rows diverge from rentSnapshot');
  for (const control of statement.controls) if (!control.exists || control.type !== 'button' || control.disabled) throw new Error(`Dhahawi ${control.name} button contract failed`);
  for (const key of ['due', 'paid', 'pending', 'balance']) {
    requireAmount(statement.modelTotals?.[key], `statement.totals.${key}`);
    if (Math.abs(Number(statement.modelTotals?.[key]) - Number(statement.snapshotTotals?.[key])) > 0.0005) throw new Error(`Dhahawi ${key} diverges from rentSnapshot`);
  }
  if (statement.summary.length < 4 || statement.summary.some(value => !value || /(?:NaN|undefined|null)/i.test(value))) throw new Error('Dhahawi numeric summary is incomplete');

  const [year, month] = state.period.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  const changedPeriod = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthInput = page.locator('#aqariDhahawiDialog [data-dhahawi-period]');
  await monthInput.fill(changedPeriod);
  await monthInput.dispatchEvent('change');
  await page.waitForFunction(period => {
    const dialog = document.getElementById('aqariDhahawiDialog');
    return dialog?.dataset.period === period && dialog.querySelector('[data-v202-dhahawi]')?.getAttribute('data-period') === period;
  }, changedPeriod);

  const changed = await page.evaluate(period => {
    const dialog = document.getElementById('aqariDhahawiDialog');
    const property = window.AQARI_V202.currentProperty();
    const snapshot = window.AQARI_V202.rentSnapshot(property, period);
    const model = window.AQARI_DHAHAWI.statementModel(property, period);
    return {
      snapshotPeriod: snapshot?.period,
      modelPeriod: model?.period,
      paperPeriod: dialog?.querySelector('[data-v202-dhahawi]')?.getAttribute('data-period'),
      dialogPeriod: dialog?.dataset.period,
      inputPeriod: dialog?.querySelector('[data-dhahawi-period]')?.value,
      snapshotTotals: snapshot?.totals,
      modelTotals: model?.totals,
      snapshotItems: snapshot?.items?.length,
      modelItems: model?.items?.length,
      rows: dialog?.querySelectorAll('tbody .v203-rent-row:not(.v203-rent-filler)').length || 0,
      focusedPeriod: document.activeElement === dialog?.querySelector('[data-dhahawi-period]'),
      summary: Array.from(dialog?.querySelectorAll('.v203-ledger-summary strong') || []).map(node => node.textContent.trim()),
    };
  }, changedPeriod);
  for (const value of [changed.snapshotPeriod, changed.modelPeriod, changed.paperPeriod, changed.dialogPeriod, changed.inputPeriod]) {
    if (value !== changedPeriod) throw new Error(`month change did not propagate (${value} != ${changedPeriod})`);
  }
  if (Number(changed.snapshotItems) !== Number(changed.modelItems) || Number(changed.rows) !== Number(changed.snapshotItems)) throw new Error('changed-month rows diverge from rentSnapshot');
  if (!changed.focusedPeriod) throw new Error('month refresh did not restore focus to the period control');
  for (const key of ['due', 'paid', 'pending', 'balance']) {
    requireAmount(changed.snapshotTotals?.[key], `changedSnapshot.totals.${key}`);
    if (Math.abs(Number(changed.modelTotals?.[key]) - Number(changed.snapshotTotals?.[key])) > 0.0005) throw new Error(`changed-month ${key} diverges from rentSnapshot`);
  }
  if (changed.summary.length < 4 || changed.summary.some(value => !value || /(?:NaN|undefined|null)/i.test(value))) throw new Error('changed-month numeric summary is incomplete');

  await page.evaluate(() => {
    window.__aqariPrintCalls = 0;
    window.print = () => { window.__aqariPrintCalls += 1; };
  });
  await page.emulateMedia({ media:'print' });
  if (await page.evaluate(() => getComputedStyle(document.getElementById('aqariDhahawiDialog')).display) !== 'block') throw new Error('print media did not switch the statement overlay to block layout');
  await page.emulateMedia({ media:'screen' });
  await page.locator('#aqariDhahawiDialog [data-dhahawi-print]').click();
  await page.waitForFunction(() => window.__aqariPrintCalls === 1);
  await page.waitForFunction(() => !document.body.classList.contains('v203-print-dhahawi'));

  await page.locator('#aqariDhahawiDialog [data-dhahawi-close]').click();
  await page.waitForFunction(() => document.getElementById('aqariDhahawiDialog')?.getAttribute('aria-hidden') === 'true');
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-v203-action') === 'statement');
  const closed = await page.evaluate(() => ({
    inert: document.getElementById('aqariDhahawiDialog')?.hasAttribute('inert'),
    openClass: document.getElementById('aqariDhahawiDialog')?.classList.contains('on'),
    bodyOpen: document.body.classList.contains('aqari-dhahawi-open'),
    bodyPrint: document.body.classList.contains('v203-print-dhahawi'),
    workspaceOpen: document.getElementById('v202PropertyWorkspace')?.getAttribute('aria-hidden') === 'false',
    focus: document.activeElement?.getAttribute('data-v203-action'),
  }));
  if (!closed.inert || closed.openClass || closed.bodyOpen || closed.bodyPrint || !closed.workspaceOpen || closed.focus !== 'statement') throw new Error('Dhahawi print/close lifecycle failed');
  await page.evaluate(() => document.querySelector('[data-v202-close]')?.click());
});

await check('V201 quick-create and accessible modal', async () => {
  await page.evaluate(() => document.querySelector('[data-v201-quick]')?.click());
  await page.waitForFunction(() => (
    document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden') === 'false' &&
    Boolean(document.activeElement?.matches('[data-v201-create]'))
  ));
  const open = await page.evaluate(() => ({
    shown:document.getElementById('v201CreateMenu')?.getAttribute('aria-hidden') === 'false',
    focused:Boolean(document.activeElement?.matches('[data-v201-create]'))
  }));
  if(!open.shown || !open.focused) throw new Error('quick-create sheet did not open accessibly');
  await page.evaluate(() => document.querySelector('[data-v201-create="properties"]')?.click());
  await page.waitForFunction(() => document.getElementById('modal')?.classList.contains('on'));
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

await check('deterministic V203 fixture proves month, contract, unit, statuses, and quick actions', async () => {
  const fixtureState = await page.evaluate(() => {
    db = {
      properties:[['E2E TOWER','E2E OWNER','4','700']],
      tenants:[],collections:[],expenses:[],maintenance:[],workOrders:[],audit:[],
      contractsV202:[
        {id:'e2e-a',contract_no:'A-1',tenant:'TENANT A',property:'E2E TOWER',unit:'A',rent:100,contractRent:120,insurance:20,advance:10,cleaningFees:5,status:'signed',start_date:'2026-01-01',end_date:'2099-12-31',source:'e2e-preview-fixture'},
        {id:'e2e-b',contract_no:'B-1',tenant:'TENANT B',property:'E2E TOWER',unit:'B',rent:200,status:'signed',start_date:'2026-01-01',end_date:'2099-12-31',source:'e2e-preview-fixture'},
        {id:'e2e-unsigned',contract_no:'C-1',tenant:'TENANT C',property:'E2E TOWER',unit:'C',rent:300,status:'approved',start_date:'2026-01-01',end_date:'2099-12-31',source:'e2e-preview-fixture'},
        {id:'e2e-future',contract_no:'D-1',tenant:'TENANT D',property:'E2E TOWER',unit:'D',rent:400,status:'signed',start_date:'2026-09-01',end_date:'2026-12-31',source:'e2e-preview-fixture'}
      ],
      tenantDirectoryV202:[
        {property:'E2E TOWER',unit:'A',tenant:'TENANT A',contractId:'e2e-a',phone:'50000000',email:'a@example.com',civilId:'111111111111',nationality:'KW',verified:true,source:'e2e-preview-fixture'}
      ],
      rentLedgerV202:[
        {id:'e2e-approved',receiptNo:'R-APPROVED',property:'E2E TOWER',unit:'A',tenant:'TENANT A',contractId:'e2e-a',period:'2026-08',paid:40,status:'approved',paidAt:'2026-08-05',method:'KNET',knetOperationNo:'K-1',voucherNo:'V-1',receiptContract:'RC-1',accountant:'QA',source:'e2e-preview-fixture'},
        {id:'e2e-rejected',receiptNo:'R-REJECTED',property:'E2E TOWER',unit:'A',tenant:'TENANT A',contractId:'e2e-a',period:'2026-08',paid:30,status:'rejected',source:'e2e-preview-fixture'},
        {id:'e2e-pending',receiptNo:'R-PENDING',property:'E2E TOWER',unit:'B',tenant:'TENANT B',contractId:'e2e-b',period:'2026-08',paid:50,status:'pending',source:'e2e-preview-fixture'},
        {id:'e2e-wrong-unit',receiptNo:'R-WRONG',property:'E2E TOWER',unit:'A',tenant:'TENANT B',contractId:'e2e-b',period:'2026-08',paid:999,status:'paid',source:'e2e-preview-fixture'},
        {id:'e2e-july',receiptNo:'R-JULY',property:'E2E TOWER',unit:'B',tenant:'TENANT B',contractId:'e2e-b',period:'2026-07',paid:200,status:'تم السداد',source:'e2e-preview-fixture'},
        {id:'e2e-june-overpayment',receiptNo:'R-JUNE-OVERPAYMENT',property:'E2E TOWER',unit:'A',tenant:'TENANT A',contractId:'e2e-a',period:'2026-06',paid:150,status:'paid',source:'e2e-preview-fixture'}
      ],
      rentStatementsV202:[{id:'e2e-official',property:'E2E TOWER',period:'2026-08',totalRent:310,totalCollected:50,totalInsurance:20,totalAdvance:10,totalCleaning:5,sourcePages:'fixture',source:'e2e-preview-fixture'}]
    };
    const august=window.AQARI_V202.rentSnapshot('E2E TOWER','2026-08');
    const july=window.AQARI_V202.rentSnapshot('E2E TOWER','2026-07');
    const june=window.AQARI_V202.rentSnapshot('E2E TOWER','2026-06');
    window.AQARI_V202.openProperty('E2E TOWER');
    return {
      august:{contracts:august.contracts,paidUnits:august.paidUnits,totals:august.totals,ids:august.items.map(item=>item.contractId),diagnostics:Object.fromEntries(Object.entries(august.diagnostics).map(([key,value])=>[key,value.length]))},
      july:{contracts:july.contracts,paidUnits:july.paidUnits,totals:july.totals,ids:july.items.map(item=>item.contractId)},
      june:{contracts:june.contracts,paidUnits:june.paidUnits,totals:june.totals,overpayments:june.diagnostics.overpayments.map(entry=>({contractId:entry.contractId,amount:entry.amount}))}
    };
  });
  if(JSON.stringify(fixtureState.august.ids)!==JSON.stringify(['e2e-a','e2e-b'])) throw new Error(`August contracts ${fixtureState.august.ids}`);
  if(fixtureState.august.contracts!==2 || fixtureState.august.paidUnits!==1) throw new Error('August contract/unit counts are wrong');
  if(fixtureState.august.totals.due!==300 || fixtureState.august.totals.paid!==40 || fixtureState.august.totals.pending!==50 || fixtureState.august.totals.ignored!==30 || fixtureState.august.totals.balance!==260) throw new Error(`August totals ${JSON.stringify(fixtureState.august.totals)}`);
  if(fixtureState.august.diagnostics.unmatchedPayments!==1 || fixtureState.august.diagnostics.ignoredPayments!==1) throw new Error(`August diagnostics ${JSON.stringify(fixtureState.august.diagnostics)}`);
  if(fixtureState.july.contracts!==2 || fixtureState.july.paidUnits!==1 || fixtureState.july.totals.due!==300 || fixtureState.july.totals.paid!==200 || fixtureState.july.totals.balance!==100) throw new Error(`July snapshot ${JSON.stringify(fixtureState.july)}`);
  if(fixtureState.june.contracts!==2 || fixtureState.june.paidUnits!==1 || fixtureState.june.totals.due!==300 || fixtureState.june.totals.paid!==150 || fixtureState.june.totals.balance!==200) throw new Error(`June snapshot ${JSON.stringify(fixtureState.june)}`);
  if(fixtureState.june.overpayments.length!==1 || fixtureState.june.overpayments[0]?.contractId!=='e2e-a' || fixtureState.june.overpayments[0]?.amount!==50) throw new Error(`June overpayment diagnostics ${JSON.stringify(fixtureState.june.overpayments)}`);

  await page.waitForFunction(() => document.querySelector('#v202PropertyWorkspace .v203-simple-strip')?.textContent.includes('E2E TOWER'));
  await page.locator('#v202PropertyWorkspace [data-v203-due-contract="e2e-a"]').click();
  await page.waitForFunction(() => document.getElementById('v202PaymentDialog')?.getAttribute('aria-hidden') === 'false');
  if(await page.locator('#v202PaymentContract').inputValue()!=='e2e-a') throw new Error('payment action did not preserve the exact contract');
  await page.locator('#v202PaymentDialog [data-v202-payment-close]').first().click();

  const directPaymentOpened=await page.evaluate(() => window.AQARI_V202.openPayment({period:'2026-07',contractId:'e2e-a'}));
  if(!directPaymentOpened) throw new Error('direct period-aware payment action did not open');
  await page.waitForFunction(() => (
    document.getElementById('v202PaymentDialog')?.getAttribute('aria-hidden') === 'false' &&
    document.getElementById('v202PaymentPeriod')?.value === '2026-07' &&
    document.getElementById('v202PaymentContract')?.value === 'e2e-a'
  ));
  await page.locator('#v202PaymentDialog [data-v202-payment-close]').first().click();

  await page.evaluate(() => window.AQARI_V202.openProperty('E2E TOWER'));
  await page.locator('#v202PropertyWorkspace [data-v203-action="receipt"]').click();
  await page.waitForFunction(() => document.getElementById('v202DocumentDialog')?.getAttribute('aria-hidden') === 'false');
  const receiptText=await page.locator('#v202DocumentBody').innerText();
  if(!receiptText.includes('R-APPROVED') || receiptText.includes('R-REJECTED') || receiptText.includes('R-WRONG')) throw new Error(`latest receipt selection ${receiptText}`);
  await page.locator('#v202DocumentDialog [data-v202-document-close]').click();

  await page.evaluate(() => {
    window.__aqariE2ERoutes=[];
    window.__aqariE2EOriginalGo=window.go;
    window.go=route => window.__aqariE2ERoutes.push(route);
    window.AQARI_V202.openProperty('E2E TOWER');
  });
  await page.locator('#v202PropertyWorkspace [data-v203-action="contract"]').click();
  await page.evaluate(() => window.AQARI_V202.openProperty('E2E TOWER'));
  await page.locator('#v202PropertyWorkspace [data-v203-action="profile"]').click();
  const routes=await page.evaluate(() => {
    const value=window.__aqariE2ERoutes.slice();
    window.go=window.__aqariE2EOriginalGo;
    delete window.__aqariE2EOriginalGo;
    return value;
  });
  if(JSON.stringify(routes)!==JSON.stringify(['smartContractsPage','property360Page'])) throw new Error(`quick action routes ${routes}`);
});

async function readApi(path){
  const response = await page.request.get(new URL(path, base).toString());
  if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  if(!String(response.headers()['cache-control'] || '').includes('no-store')) throw new Error(`${path} cache contract`);
  if(response.headers()['x-content-type-options'] !== 'nosniff') throw new Error(`${path} nosniff contract`);
  const body = await response.json();
  if(body.ok !== true || body.version !== 'V203' || body.runtimeBase !== 'V198' || body.dataContract !== 'V202') throw new Error(`${path} payload mismatch`);
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
  if(typeof body.connected !== 'boolean') throw new Error('connected must be boolean');
  if(body.connectionVerified !== false) throw new Error('compatibility route must not claim a live database check');
  if(typeof body.authMode !== 'string' || !body.authMode) throw new Error('authMode missing');
  if(!Array.isArray(body.tables)) throw new Error('tables must be an array');
});

await check('Preview SHA and environment', async () => {
  const body = await readApi('/api/production-meta');
  if(body.deployment?.environment !== 'preview') throw new Error('not a Preview deployment');
  if(body.deployment?.gitSha !== expectedSha) throw new Error(`SHA ${body.deployment?.gitSha || 'missing'} != ${expectedSha}`);
});

await check('Preview production-readiness contract', async () => {
  const body = await readApi('/api/production-readiness');
  const configured = body.configured;
  const summary = body.summary;
  if(body.deployment?.environment !== 'preview') throw new Error('production-readiness did not report Preview');
  if(!configured || typeof configured !== 'object' || Array.isArray(configured)) throw new Error('configured map missing');

  const keys = Object.keys(configured);
  if(!keys.length) throw new Error('configured map is empty');
  for(const key of keys){
    if(!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`invalid configured key: ${key}`);
    if(typeof configured[key] !== 'boolean') throw new Error(`configured.${key} must be boolean`);
  }

  if(!summary || !Number.isInteger(summary.present) || !Number.isInteger(summary.required) || typeof summary.ready !== 'boolean'){
    throw new Error('summary contract invalid');
  }
  const present = Object.values(configured).filter(Boolean).length;
  if(summary.required <= 0) throw new Error('summary.required must be positive');
  if(summary.required !== keys.length) throw new Error(`required ${summary.required} != configured keys ${keys.length}`);
  if(summary.present !== present) throw new Error(`present ${summary.present} != configured true values ${present}`);
  if(summary.ready !== (summary.present === summary.required)) throw new Error('summary.ready is inconsistent');

  console.log('INFO', `production environment configuration visible to Preview: ${summary.present}/${summary.required}`);
});

await check('PWA and V203 presentation assets', async () => {
  for(const path of ['/manifest.webmanifest','/sw.js','/aqari-icon.svg','/v199-ui.css','/v199-ui.js','/v200-luxury.css','/v201-easy.css','/v201-experience.js','/v202-prestige.css','/v202-property-os.js','/v202-rent-operations.css','/v202-rent-operations.js','/v203-simple.css','/v203-simple.js']){
    const response = await page.request.get(new URL(path, base).toString());
    if(!response.ok()) throw new Error(`${path} HTTP ${response.status()}`);
  }
  if(pageErrors.length) throw new Error(pageErrors.slice(0,3).join(' | '));
  if(responseErrors.length) throw new Error(responseErrors.slice(0,5).join(' | '));
});

await browser.close();
if(failed) process.exit(1);
console.log('AQARI V203 Preview E2E on V198 runtime / V202 data contract: PASS');
