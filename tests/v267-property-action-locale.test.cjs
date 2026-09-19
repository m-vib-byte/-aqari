const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('v201-experience.js','utf8');
const start=source.indexOf('  function enhanceActivePage(){');
const end=source.indexOf('  function groupedTarget(',start);

function page(module,title){
 const buttons=[];
 const actions={querySelector:()=>buttons[0]||null,prepend:b=>buttons.unshift(b)};
 const row={cells:[{textContent:'Property record'},actions]};
 const active={id:'list',querySelector:()=>null,querySelectorAll:s=>s==='tbody tr'?[row]:[]};
 const context={cur:module,document:{querySelector:()=>active,getElementById:()=>({textContent:title}),createElement:()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;}})},enhanceTable(){}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';enhanceActivePage();enhanceActivePage();',context);
 return buttons;
}

test('property record action survives every translated page title without duplication',()=>{
 for(const title of ['العقارات والوحدات','Properties & units','संपत्तियाँ और इकाइयाँ','املاک اور یونٹس','വസ്തുക്കളും യൂണിറ്റുകളും']){
  const buttons=page('properties',title);
  assert.equal(buttons.length,1,title);
  assert.equal(buttons[0].attrs['data-v201-property'],'Property record');
 }
});
test('a property-looking title cannot add property actions to other record lists',()=>{
 for(const module of ['tenants','employees','expenses'])assert.equal(page(module,'العقارات والوحدات').length,0,module);
});
