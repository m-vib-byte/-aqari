'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

test('V209 upgrades the existing search surface without bypassing V206.3 security APIs',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const search=fs.readFileSync(path.join(root,'v209-global-search.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v209-global-search.css'),'utf8');
  const propertyOS=fs.readFileSync(path.join(root,'v202-property-os.js'),'utf8');
  const v199=fs.readFileSync(path.join(root,'v199-ui.js'),'utf8');
  const authBridge=fs.readFileSync(path.join(root,'secure-auth-bridge.js'),'utf8');

  assert.match(propertyOS,/rentOfficeData:function\(name,period\)/);
  assert.match(propertyOS,/rentOfficeAction:function\(name,key,period,action,trigger\)/);
  assert.match(propertyOS,/rentOfficeProperties:function\(\)/);
  assert.match(propertyOS,/openProperty:function\(name,period\)/);
  assert.match(v199,/id='v199SearchPanel'/);
  assert.match(v199,/id="v199SearchInput"/);
  assert.match(v199,/data-v199-action="search"/);

  assert.match(loader,/function installV209GlobalSearch\s*\(/);
  assert.match(loader,/globalSearchCss\.href='\/v209-global-search\.css\?v=209\.1'/);
  assert.match(loader,/globalSearchJs\.src='\/v209-global-search\.js\?v=209\.1'/);
  assert.match(loader,/portfolioJs\.addEventListener\('load', installV209GlobalSearch, \{ once:true \}\)/);
  assert.match(loader,/portfolioJs\.addEventListener\('load', installV209GlobalSearch, \{ once:true \}\)/);
  assert.match(loader,/meta\[name="aqari-portfolio-collections"\]/);
  assert.ok(loader.indexOf("portfolioJs.src='/v208-portfolio-collections.js'")<loader.indexOf("portfolioJs.addEventListener('load', installV209GlobalSearch"));

  assert.match(search,/AQARI_V202\?\.rentOfficeData/);
  assert.match(search,/AQARI_V202\?\.rentOfficeAction/);
  assert.match(search,/AQARI_V202\?\.rentOfficeProperties/);
  assert.match(search,/AQARI_V202\.rentOfficeProperties\(\)/);
  assert.match(search,/rentOfficeData\(name,requestedPeriod\)/);
  assert.match(search,/openProperty\(item\.property,item\.period\)/);
  assert.match(search,/rentOfficeAction\(item\.property,item\.key,item\.period,action,null\)/);
  assert.match(search,/membership\?\.is_active===true/);
  assert.match(search,/role=accessIdentity\(membership\?\.role\)/);
  assert.match(search,/membershipUserId===userId&&membershipWorkspaceId===workspaceId/);
  assert.match(search,/AQARI_DATA_GATE\?\.scope/);
  assert.match(search,/AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(search,/dataScopesReady\(access\)/);
  assert.match(search,/authSuspended=true/);
  assert.match(search,/event==='SIGNED_OUT'/);
  assert.match(search,/AQARI_SUPABASE\.refreshContext\(expected\)/);
  assert.match(search,/sameAccess\(expected,returned\).*sameAccess\(expected,live\)/);
  assert.match(search,/actionToken!==interactionEpoch\|\|scopeKey\(\)!==scope/);
  assert.match(search,/item\.scope!==scope\|\|item\.period!==period/);
  assert.match(search,/scopeKey\(\)===scope\?rows:\[\]/);
  assert.match(search,/records\.length===1/);
  assert.match(search,/data\.canRecordPayment===true&&record\?\.billable===true&&record\?\.collectible===true/);
  assert.match(search,/normalizeSearch\(title\.textContent\)===normalizeSearch\(item\.property\)/);
  assert.doesNotMatch(search,/event\.stopImmediatePropagation\(\)/);
  assert.match(v199,/if\(window\.AQARI_V209\?\.version\)return/);
  assert.match(search,/RESULT_LIMIT=30/);
  assert.match(search,/data-v209-action="statement"/);
  assert.match(search,/data-v209-action="contract"/);
  assert.match(search,/data-v209-action="receipt"/);
  assert.match(search,/data-v209-action="payment"/);
  assert.match(search,/event\.key\.toLowerCase\(\)==='k'/);
  assert.match(search,/event\.key==='\/'/);
  assert.match(search,/meta\[name="aqari-global-search"\]/);
  assert.match(search,/window\.AQARI_V209=Object\.freeze/);
  assert.match(search,/revision:REVISION/);
  assert.match(search,/observer\.observe\(document\.documentElement,\{subtree:true,childList:true\}\)/);
  assert.match(search,/seal:seal/);
  assert.match(search,/resume:resume/);
  assert.match(search,/if\(!PERIOD\.test\(next\)\)\{event\.target\.value=period;return\}/);
  assert.match(search,/if\(label&&label\.textContent!=='البحث الشامل'\)label\.textContent='البحث الشامل'/);
  assert.match(loader,/v209LoaderBound/);
  assert.match(authBridge,/AQARI_V209\?\.seal\?\.\(\)/);
  assert.match(authBridge,/AQARI_V209\?\.resume\?\.\(nextContext\)/);

  assert.doesNotMatch(search,/rentLedgerV202/);
  assert.doesNotMatch(search,/contractsV202/);
  assert.doesNotMatch(search,/localStorage/);
  assert.doesNotMatch(search,/sessionStorage/);
  assert.doesNotMatch(search,/aqariV168Search/);
  assert.doesNotMatch(search,/querySelectorAll\('\[data-v201-property\]'\)/);
  assert.doesNotMatch(search,/record\?\.email/);
  assert.doesNotMatch(search,/record\?\.phone/);
  assert.doesNotMatch(search,/civilId/);

  assert.match(css,/v209-search-panel/);
  assert.match(css,/v209-search-results/);
  assert.match(css,/v209-result-actions/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print/);
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/transform:none!important/);
  assert.match(css,/min-height:44px/);
  assert.doesNotMatch(search,/role="option"/);
  assert.doesNotMatch(search,/aria-autocomplete','list/);
});

test('V209 access gate is fail-closed and requires the exact active membership',()=>{
  const source=fs.readFileSync(path.join(root,'v209-global-search.js'),'utf8');
  const identity=source.match(/function accessIdentity\(value\)\{[\s\S]*?\n  \}/);
  const match=source.match(/function accessContextReady\(context\)\{[\s\S]*?\n  \}/);
  assert.ok(identity,'accessIdentity must remain independently testable');
  assert.ok(match,'accessContextReady must remain independently testable');
  const accessContextReady=vm.runInNewContext('(function(){'+identity[0]+';'+match[0]+';return accessContextReady})()');
  const valid={
    user:{id:'user-1'},
    workspace:{id:'workspace-1'},
    membership:{is_active:true,user_id:'user-1',workspace_id:'workspace-1',role:'property_manager'}
  };
  assert.equal(accessContextReady(valid),true);
  assert.equal(accessContextReady(),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,is_active:false}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,is_active:'true'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,user_id:'user-2'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,workspace_id:'workspace-2'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,user_id:''}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,workspace_id:''}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,role:''}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,role:' property_manager'}}),false);
  assert.equal(accessContextReady({...valid,user:{id:['user-1']}}),false);
  assert.equal(accessContextReady({...valid,user:{id:1},membership:{...valid.membership,user_id:1}}),false);
  assert.equal(accessContextReady({...valid,user:{id:' user-1'}}),false);
  assert.equal(accessContextReady({...valid,user:{id:'user-1\0'}}),false);
  assert.equal(accessContextReady({...valid,workspace:{id:'workspace-1\u200b'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,user_id:['user-1']}}),false);
});

test('V209 search normalization matches Arabic and Persian digits safely',()=>{
  const source=fs.readFileSync(path.join(root,'v209-global-search.js'),'utf8');
  const match=source.match(/function normalizeSearch\(value\)\{[\s\S]*?\n  \}/);
  assert.ok(match,'normalizeSearch must remain independently testable');
  const normalizeSearch=vm.runInNewContext('('+match[0]+')');
  assert.equal(normalizeSearch('١٢٣'),'123');
  assert.equal(normalizeSearch('۱۲۳'),'123');
  assert.equal(normalizeSearch('  برج   ضحاوي  '),'برج ضحاوي');
});
