import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('src/v267/pages/hr-lifecycle.js','utf8');
const gate=source.slice(source.indexOf(' const guardedAction='),source.indexOf(' const clear='));
for(const protocol of [undefined,'old','closure-v1'])test('custody and settlement actions require advertised backend protocol '+protocol,()=>{
 const ctx={context:{custody_closure_protocol:protocol},button:(label,fn)=>({label,onclick:fn})};vm.createContext(ctx);vm.runInContext(gate+'\nglobalThis.action=guardedAction("close",()=>{});',ctx);assert.equal(ctx.action.disabled,protocol!=='closure-v1');
});
