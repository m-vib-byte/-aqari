'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

test('V208 aggregates portfolio collections only from the secure V206.3 rent office API',()=>{
  const loader=fs.readFileSync(path.join(root,'final-release-ui.js'),'utf8');
  const portfolio=fs.readFileSync(path.join(root,'v208-portfolio-collections.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'v208-portfolio-collections.css'),'utf8');
  const office=fs.readFileSync(path.join(root,'v206-rent-ledger.js'),'utf8');
  const propertyOS=fs.readFileSync(path.join(root,'v202-property-os.js'),'utf8');
  const shell=fs.readFileSync(path.join(root,'v205-simplified-shell.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

  assert.match(propertyOS,/rentOfficeProperties:function\(\)/);
  assert.match(propertyOS,/openProperty:function\(name,period\)/);
  assert.match(propertyOS,/rentOfficeData:function\(name,period\)/);
  assert.match(propertyOS,/totalRent:numberFrom\(model\.totals\.due\)/);
  assert.match(propertyOS,/totalCollected:numberFrom\(model\.totals\.paid\)/);
  assert.match(propertyOS,/totalBalance:numberFrom\(model\.totals\.balance\)/);
  assert.match(propertyOS,/canRecordPayment:rentWriteAllowed\(\)&&!protectedPropertyActive\(property\)/);
  assert.match(office,/AQARI_V202\?\.rentOfficeData/);
  assert.match(office,/canRecordPayment:Boolean\(data\?\.canRecordPayment\)/);

  assert.match(shell,/\['collectionProPage','collectionProPage','التحصيل'\]/);
  assert.match(html,/id=["']collectionProPage["']/);

  assert.match(loader,/function installV208PortfolioCollections\s*\(/);
  assert.match(loader,/portfolioCss\.href='\/v208-portfolio-collections\.css'/);
  assert.match(loader,/portfolioJs\.src='\/v208-portfolio-collections\.js'/);
  assert.match(loader,/script\.addEventListener\('load', installV208PortfolioCollections, \{ once:true \}\)/);
  assert.ok(loader.indexOf("script.src='/v206-rent-ledger.js'")<loader.indexOf("script.addEventListener('load', installV208PortfolioCollections"));

  assert.match(portfolio,/AQARI_V202\?\.rentOfficeProperties/);
  assert.match(portfolio,/AQARI_V202\.rentOfficeProperties\(\)/);
  assert.match(portfolio,/AQARI_V202\?\.rentOfficeData/);
  assert.match(portfolio,/rentOfficeData\(name,period\)/);
  assert.match(portfolio,/norm\(data\.property\)===norm\(name\)/);
  assert.match(portfolio,/String\(data\.period\|\|''\)===period/);
  assert.match(portfolio,/data\.totalRent/);
  assert.match(portfolio,/data\.totalCollected/);
  assert.match(portfolio,/data\.totalBalance/);
  assert.match(portfolio,/data\.canRecordPayment/);
  assert.match(portfolio,/function collectionRate\s*\(/);
  assert.match(portfolio,/function prioritySort\s*\(/);
  assert.match(portfolio,/data-v208-filter="action"/);
  assert.match(portfolio,/data-v208-filter="due"/);
  assert.match(portfolio,/data-v208-filter="settled"/);
  assert.match(portfolio,/data-v208-filter="setup"/);
  assert.match(portfolio,/data-v208-filter="all"/);
  assert.match(portfolio,/id="v208PortfolioPeriod"/);
  assert.match(portfolio,/type="month"/);
  assert.match(portfolio,/data-v208-search/);
  assert.match(portfolio,/function restoreSearchFocus\s*\(/);
  assert.match(portfolio,/input\.focus\(\{preventScroll:true\}\)/);
  assert.match(portfolio,/input\.setSelectionRange\(left,right\)/);
  assert.match(portfolio,/restoreSearchFocus\(start,end\)/);
  assert.match(portfolio,/data-v208-open/);
  assert.match(portfolio,/data-v208-statement/);
  assert.match(portfolio,/v202TabCollections/);
  assert.match(portfolio,/data-v202-action="statement"/);
  assert.match(portfolio,/v202StatementPeriod/);
  assert.match(portfolio,/AQARI_V202\.openProperty\(name,period\)/);
  assert.doesNotMatch(portfolio,/querySelectorAll\('\[data-v201-property\]'\)/);
  assert.match(portfolio,/id="v208PortfolioCollections"/);
  assert.match(portfolio,/id="v208HomeCollections"/);
  assert.match(portfolio,/window\.go\?\.\('collectionProPage'\)/);
  assert.match(portfolio,/AQARI_SUPABASE\?\.context/);
  assert.match(portfolio,/membership\?\.is_active===true/);
  assert.match(portfolio,/membershipUserId===userId/);
  assert.match(portfolio,/membershipWorkspaceId===workspaceId/);
  assert.match(portfolio,/propertyNames\(\)\.map\(officeSummary\)\.filter\(item=>item\.valid\)/);
  assert.match(portfolio,/authSuspended=true;\s*clearViews\(\)/);
  assert.match(portfolio,/event==='SIGNED_OUT'/);
  assert.match(portfolio,/onAuthStateChange\(function\(event\)\{\s*setTimeout\(function\(\)\{handleAuthStateChange\(event\)\},0\);\s*\}\)/);
  assert.match(portfolio,/AQARI_SUPABASE\.refreshContext\(expected\)/);
  assert.match(portfolio,/sameAuthAccess\(expected,authAccess\(context\)\)/);
  assert.match(portfolio,/AQARI_DATA_GATE\?\.scope/);
  assert.match(portfolio,/AQARI_EARLY_STORAGE_GATE\?\.scope/);
  assert.match(portfolio,/window\.AQARI_V208=Object\.freeze/);
  assert.match(portfolio,/seal:seal/);
  assert.match(portfolio,/resume:resume/);
  assert.match(portfolio,/actionToken!==interactionEpoch\|\|scopeKey\(\)!==scope/);
  assert.match(portfolio,/norm\(title\.textContent\)!==norm\(name\)/);
  assert.match(portfolio,/عرض فقط/);
  assert.match(portfolio,/لوحة التحصيل الشاملة/);
  assert.match(portfolio,/V206\.3/);

  assert.doesNotMatch(portfolio,/rentLedgerV202/);
  assert.doesNotMatch(portfolio,/contractsV202/);
  assert.doesNotMatch(portfolio,/propertyContext/);
  assert.doesNotMatch(portfolio,/localStorage/);
  assert.doesNotMatch(portfolio,/sessionStorage/);
  assert.doesNotMatch(portfolio,/AQARI_SUPABASE\s*=/);

  assert.match(css,/v208-board/);
  assert.match(css,/v208-period/);
  assert.match(css,/v208-home-card/);
  assert.match(css,/v208-state\.is-due/);
  assert.match(css,/v208-kpis \.is-collected/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media print\{body\.aq-v208 \.v208-board,body\.aq-v208 \.v208-home-card\{display:none!important\}\}/);
});

test('V208 access is fail-closed and requires an exact active membership',()=>{
  const portfolio=fs.readFileSync(path.join(root,'v208-portfolio-collections.js'),'utf8');
  const match=portfolio.match(/function accessContextReady\(context\)\{[\s\S]*?\n  \}/);
  assert.ok(match,'accessContextReady must remain independently testable');
  const accessContextReady=vm.runInNewContext('('+match[0]+')');
  const valid={
    user:{id:'user-1'},
    workspace:{id:'workspace-1'},
    membership:{is_active:true,user_id:'user-1',workspace_id:'workspace-1'}
  };

  assert.equal(accessContextReady(valid),true);
  assert.equal(accessContextReady(),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,user_id:''}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,workspace_id:''}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,user_id:'user-2'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,workspace_id:'workspace-2'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,is_active:'true'}}),false);
  assert.equal(accessContextReady({...valid,membership:{...valid.membership,is_active:false}}),false);
});

test('V208 removes stale portfolio totals before an unauthorized workspace can render',()=>{
  const portfolio=fs.readFileSync(path.join(root,'v208-portfolio-collections.js'),'utf8');
  const listeners={};
  const removed=[];
  const stale={
    v208PortfolioCollections:{remove(){removed.push('board')}},
    v208HomeCollections:{remove(){removed.push('home')}}
  };
  const document={
    readyState:'loading',
    body:{classList:{add(){} }},
    head:{appendChild(){}},
    addEventListener(type,callback){listeners[type]=callback},
    getElementById(id){return stale[id]||null},
    querySelector(){return null},
    querySelectorAll(){return []},
    createElement(){return {name:'',content:''}}
  };
  const window={
    AQARI_SUPABASE:{
      context:{
        user:{id:'user-1'},
        workspace:{id:'workspace-1'},
        membership:{is_active:true,user_id:'user-2',workspace_id:'workspace-1'}
      },
      onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
    },
    AQARI_DATA_GATE:{scope:null},
    AQARI_EARLY_STORAGE_GATE:{scope:null}
  };
  class MutationObserver{observe(){}}

  vm.runInNewContext(portfolio,{window,document,MutationObserver,setTimeout(callback){callback();return 1},clearTimeout(){},Intl,Date,Promise,Event,HTMLInputElement:class{},HTMLElement:class{}});
  assert.equal(typeof listeners.DOMContentLoaded,'function');
  listeners.DOMContentLoaded();
  assert.deepEqual([...new Set(removed)].sort(),['board','home']);
  const active={
    user:{id:'user-1'},workspace:{id:'workspace-1'},
    membership:{is_active:true,user_id:'user-1',workspace_id:'workspace-1',role:'property_manager'}
  };
  window.AQARI_SUPABASE.context=active;
  window.AQARI_DATA_GATE.scope={userId:'user-1',workspaceId:'workspace-1'};
  window.AQARI_EARLY_STORAGE_GATE.scope={userId:'user-1',workspaceId:'workspace-1'};
  assert.equal(window.AQARI_V208.resume(active),true,'validated bridge unlock must recover a cold-suspended V208');
});

// Include the shared startup ownership regression in the existing CI suite.
require('./startup-module-boundary.test.cjs');
