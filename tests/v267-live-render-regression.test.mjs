import {workspaceIcon} from '../src/v267/components/workspace-icons.js';
import {t} from '../src/v267/components/locale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {registeredUnitCount} from '../src/v267/components/live-dashboard-data.js';
const source=readFileSync(new URL('../src/v267/live-stability-runtime.js',import.meta.url),'utf8');

function runtime(document){
 const box={workspaceIcon,t,registeredUnitCount,document:{readyState:'loading',addEventListener(){},documentElement:{lang:'ar'},...document},window:{},requestAnimationFrame(){}};
 vm.createContext(box);vm.runInContext(source.replace(/^import .*;$/gm,''),box);return box;
}
test('a paid amount mentioning due in its description is not reported as due',()=>{
 const card=(label,value,description)=>({textContent:label+' '+value+' '+description,closest:()=>null,querySelector:s=>s.includes('label')?{textContent:label}:{textContent:value}});
 const box=runtime({querySelectorAll:()=>[card('تحصيل الشهر','100 د.ك','100% من المستحق'),card('المستحق','125 د.ك','')]});
 assert.equal(vm.runInContext('sourceValue(/المستحق/) ',box),'125 د.ك');
});
test('missing metrics stay unavailable instead of using a different financial value',()=>{
 const box=runtime({querySelectorAll:()=>[{textContent:'الدخل المسجل 3550 د.ك 4 عقار مسجل',closest:()=>null,querySelector:s=>s.includes('label')?{textContent:'الدخل المسجل'}:{textContent:'3550 د.ك'}}]});
 assert.equal(vm.runInContext('sourceValue(/عقار مسجل/)',box),'—');
});
test('rendered shell changes cannot schedule their own refresh',()=>{
 const box=runtime({});
 box.record={target:{closest:()=>({})}};
 assert.equal(vm.runInContext('isSourceMutation(record)',box),false);
 box.record={target:{closest:()=>null}};
 assert.equal(vm.runInContext('isSourceMutation(record)',box),true);
 box.record={target:{nodeType:3,parentElement:{closest:()=>({})}}};
 assert.equal(vm.runInContext('isSourceMutation(record)',box),false);
});
test('unchanged metric text is not replaced',()=>{
 let writes=0;
 const node={get textContent(){return '100 د.ك'},set textContent(v){writes++},closest:()=>({classList:{toggle(){}}})};
 const box=runtime({querySelector:()=>node});
 vm.runInContext("setValue('month','100 د.ك')",box);
 assert.equal(writes,0);
});
test('opening a section deactivates home along with other pages',()=>{
 const src=readFileSync(new URL('../src/v267/unified-layout-runtime.js',import.meta.url),'utf8');
 const states=[new Set(['on']),new Set(['on'])];
 const box={workspaceIcon,t,document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>states.map(s=>({classList:{remove:c=>s.delete(c)}}))}};
 vm.createContext(box);vm.runInContext(src,box);vm.runInContext('hideNativePages()',box);
 assert.ok(states.every(s=>!s.has('on')));
});

test('legacy property rows use canonical registered unit counts',()=>{
 const dhahawi={textContent:'118 وحدة',dataset:{}},kabd={textContent:'5 وحدة',dataset:{}};
 const row=(name,units)=>({closest:()=>null,querySelector:s=>s==='strong'?{textContent:name}:s==='.v199-property-units'?units:null});
 const rows=[row('برج ضحاوي',dhahawi),row('برج كبد',kabd)];
 const box=runtime({querySelectorAll:s=>s==='.v199-property-row'?rows:[]});
 box.referenceReport={properties:[
  {name:'برج ضحاوي',aqari_units:[{count:110}]},
  {name:'برج كبد',aqari_units:[{count:0}]}
 ]};
 vm.runInContext('reconcileLegacyPropertyUnitCounts()',box);
 assert.equal(dhahawi.textContent,'110 وحدة');
 assert.equal(kabd.textContent,'0 وحدة');
 assert.equal(dhahawi.dataset.aqCanonicalUnits,'true');
 assert.equal(kabd.dataset.aqCanonicalUnits,'true');
});
