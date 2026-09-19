import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {guardPageImport} from '../src/v267/components/navigation-import.js';

const source=readFileSync(new URL('../src/v267/pages/rental-contracts.js',import.meta.url),'utf8');
const action=source.slice(source.indexOf('  const transitions='),source.indexOf('  const docs='))
 .replace("import('./contract-execution.js')",'loadExecution()');
function fixture({role='general_manager',status='signing',source='v267-cloud',loadError=false}={}){
 let active=true,valid=true,click,done;const events=[];
 const openContractExecution=(id,options)=>{events.push(['execution',id]);if(active)return false;active=true;done=options.onDone;return true;};
 const box={guardPageImport,c:{id:42,status,source},id:42,states:{ready:'ready',approved:'approved',signing:'signing',signed:'signed'},translateStatic:s=>s,
  d:{body:{append(){}},session:{bound:{role},check(){if(!valid)throw Error('SESSION_CHANGED');}},close(){events.push(['close']);active=false;}},
  button(label,fn){click=fn;return {};},
  api:{async saveLease(c){events.push(['save',c.status]);if(c.status==='signed'&&c.source==='v267-cloud'&&!openContractExecution(c.id,{}))throw Error('تعذر فتح اعتماد تسوية الإبرام.');}},
  async show(id){events.push(['show',id]);},openRentalContracts(initial){events.push(['return',initial.id]);},
  async loadExecution(){if(loadError)throw Error('DOWNLOAD_FAILED');return {openContractExecution};}};
 vm.createContext(box);vm.runInContext(action,box);
 return {events,click,box,finish:()=>done?.(),invalidate:()=>{valid=false;}};
}
test('signing hands off the open contract dialog before opening settlement; it does not save signed state',async()=>{
 const f=fixture();await f.click();assert.deepEqual(f.events,[['close'],['execution',42]]);
 f.finish();assert.deepEqual(f.events.at(-1),['return',42]);
});
test('staff cannot open final signing or close the current contract',async()=>{
 const f=fixture({role:'staff'});await assert.rejects(f.click(),/اعتماد المدير العام/);assert.deepEqual(f.events,[]);
});
test('failed module loading keeps the current contract open for retry',async()=>{
 const f=fixture({loadError:true});await assert.rejects(f.click(),/DOWNLOAD_FAILED/);assert.deepEqual(f.events,[]);
});
test('a changed session during module loading cannot open the settlement',async()=>{
 const f=fixture();f.box.loadExecution=async()=>{f.invalidate();return {openContractExecution(){f.events.push(['unsafe']);}};};
 await assert.rejects(f.click(),/SESSION_CHANGED/);assert.deepEqual(f.events,[]);
});
test('earlier contract transitions still save and reload through the existing API',async()=>{
 const f=fixture({status:'draft'});await f.click();assert.deepEqual(f.events,[['save','ready'],['show',42]]);
});
test('legacy signing retains its existing guarded save path',async()=>{
 const f=fixture({source:'legacy'});await f.click();assert.deepEqual(f.events,[['save','signed'],['show',42]]);
});
