const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('v210-daily-command-center.js','utf8');
const css=fs.readFileSync('v210-daily-command-center.css','utf8');
const loader=fs.existsSync('final-release-ui.js')?fs.readFileSync('final-release-ui.js','utf8'):'';

test('V210 declares a stable release identity',()=>{
  assert.match(js,/V210-daily-command-center/);
  assert.match(js,/window\.AQARI_V210=Object\.freeze/);
});

test('V210 reads rent data only through the protected V202 API',()=>{
  assert.match(js,/AQARI_V202\?\.rentOfficeProperties/);
  assert.match(js,/AQARI_V202\?\.rentOfficeData/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|rentLedgerV202|contractsV202/);
});

test('V210 requires exact user, workspace, membership and data scopes',()=>{
  for(const token of ['membership?.is_active!==true','membershipUserId!==userId','membershipWorkspaceId!==workspaceId','AQARI_DATA_GATE','AQARI_EARLY_STORAGE_GATE'])assert.ok(js.includes(token),token);
});

test('V210 fails closed and clears protected UI on auth loss',()=>{
  assert.match(js,/if\(!state\|\|!home\)\{clear\(\);return\}/);
  assert.match(js,/SIGNED_OUT/);
  assert.match(js,/TOKEN_REFRESH_FAILED/);
  assert.match(js,/function seal\(\)\{authSuspended=true/);
});

test('V210 revalidates scope around every protected snapshot',()=>{
  assert.match(js,/if\(scopeKey\(\)!==scope\|\|!Array\.isArray\(names\)\)return \[\]/);
  assert.match(js,/if\(scopeKey\(\)!==scope\)return null/);
});

test('V210 exposes the daily and monthly execution indicators',()=>{
  for(const label of ['المستحق','تحصيل اليوم','تحصيل الشهر','متأخرون','بانتظار المراجعة','مستندات جاهزة','مهام حرجة'])assert.ok(js.includes(label),label);
});

test('V210 aggregate calculates daily KPIs and priorities deterministically',()=>{
  const body={classList:{add(){}},prepend(){}};
  const document={readyState:'complete',body,head:{appendChild(){}},addEventListener(){},getElementById(){return null},querySelector(){return null},createElement(){return {}}};
  const context={window:{},document,MutationObserver:class{observe(){}},setTimeout(){return 1},clearTimeout(){},Intl,Date,Number,String,Array,Object,Math,JSON,Set,console};
  context.window=context.window;
  vm.runInNewContext(js,context);
  const aggregate=context.window.AQARI_V210.testing.aggregate;
  const result=aggregate([
    {name:'برج أ',valid:true,due:1000,collected:600,balance:400,units:2,pending:50,canRecordPayment:true,records:[
      {billable:true,balance:400,pending:0,paymentStatus:'مستحق',hasContract:true,receiptNo:''},
      {billable:true,balance:0,pending:50,paymentStatus:'قيد المراجعة',hasContract:false,receiptNo:'R-1'}
    ]},
    {name:'برج ب',valid:true,due:500,collected:500,balance:0,units:1,pending:0,canRecordPayment:true,records:[
      {billable:true,balance:0,pending:0,paymentStatus:'مسدد',hasContract:true,receiptNo:''}
    ]},
    {name:'غير صالح',valid:false,due:9999,collected:9999,balance:9999,units:0,records:[]}
  ]);
  assert.equal(result.properties,2);
  assert.equal(result.due,1500);
  assert.equal(result.collected,1100);
  assert.equal(result.balance,400);
  assert.equal(result.dueProperties,1);
  assert.equal(result.lateTenants,1);
  assert.equal(result.pendingApprovals,1);
  assert.equal(result.readyDocuments,3);
  assert.equal(result.priorities.length,1);
  assert.equal(result.priorities[0].name,'برج أ');
});

test('V210 avoids indexing or rendering tenant identity',()=>{
  assert.doesNotMatch(js,/civilId|phone|email/);
  assert.doesNotMatch(js,/record\?\.tenant/);
});

test('V210 validates property identity before opening a protected workspace',()=>{
  assert.match(js,/propertyNames\(scope\)\.find/);
  assert.match(js,/AQARI_V202\?\.openProperty/);
});

test('V210 period is strict and propagated to the collection board',()=>{
  assert.match(js,/\^\\d\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/);
  assert.match(js,/v208PortfolioPeriod/);
  assert.match(js,/dispatchEvent\(new Event\('input'/);
});

test('V210 CSS is fully scoped and print-isolated',()=>{
  const rules=css.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('/*')&&!line.startsWith('@'));
  assert.ok(rules.length>15);
  assert.ok(rules.every(line=>line.startsWith('#v210DailyCommandCenter')));
  assert.match(css,/@media print\{#v210DailyCommandCenter\{display:none!important\}\}/);
});

test('V210 mobile layout preserves compact two-column KPIs',()=>{
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/grid-template-columns:1fr 1fr/);
  assert.match(css,/font-size:16px/);
});

test('release loader installs V210 only after V209',()=>{
  if(!loader)return;
  assert.match(loader,/aqari-v210-daily-command-center-css/);
  assert.match(loader,/aqari-v210-daily-command-center-js/);
  assert.ok(loader.indexOf('installV210DailyCommandCenter')<loader.lastIndexOf('installV209GlobalSearch'));
  assert.match(loader,/addEventListener\('load', installV210DailyCommandCenter/);
});
