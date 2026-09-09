const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('v267-partners.js','utf8'),{window,console,BigInt,Number,Map,Set,Date,JSON});const E=window.AQARI_SHARES;
const input=[{id:'a',name:'مالك أول',role:'مالك',percent:'80.88'},{id:'b',name:'مالك ثان',role:'وارث',percent:'16'},{id:'c',name:'مالك ثالث',role:'وارث',percent:'3.12'}];
const change=(s,a)=>E.transition(s,a,'manager','2026-09-07T00:00:00Z','event-'+(s?.version||0));
test('ownership accepts Arabic digits and rejects incomplete or duplicate shares',()=>{
 assert.equal(E.scaled('٨٠٫٨٨',2),8088);
 assert.equal(E.owners(input).reduce((n,r)=>n+r.bps,0),10000);
 assert.throws(()=>E.owners(input.slice(1)),/١٠٠/);
 assert.throws(()=>E.owners([...input,{...input[0]}]));
 assert.throws(()=>E.owners([{id:'x',name:'a',role:'b',percent:'100.001'}]));
});
test('fils allocation conserves exact totals, including negative corrections and tiny amounts',()=>{
 const owners=E.owners(input);
 for(const amount of [1,2,3,1001,123456789,-1,-3,-999999,Number.MAX_SAFE_INTEGER]){
  const result=E.allocate(amount,owners);assert.equal(result.reduce((a,b)=>a+b,0),amount);
 }
});
test('distribution records delta only, preserves ownership snapshots and prevents duplicate distribution',()=>{
 let s=change(null,{type:'owners',rows:input});
 s=change(s,{type:'distribution',basis:{income:1000000,expenses:100000,due:200000}});
 assert.equal(s.events[1].rows.reduce((n,r)=>n+r.net,0),900000);
 assert.throws(()=>change(s,{type:'distribution',basis:{income:1000000,expenses:100000,due:200000}}),/مبالغ جديدة/);
 s=change(s,{type:'owners',rows:[{id:'a',name:'مالك أول',role:'مالك',percent:'100'}]});
 s=change(s,{type:'distribution',basis:{income:1100000,expenses:110000,due:0}});
 assert.equal(s.events.at(-1).rows[0].net,90000);
 assert.equal(s.events[1].rows.length,3);
 assert.equal(s.events[2].before.length,3);
});
test('partner payments cannot exceed balance and remain visible after removal',()=>{
 let s=change(null,{type:'owners',rows:input});s=change(s,{type:'distribution',basis:{income:100000,expenses:0,due:0}});
 const due=E.balance(s,'b');
 s=change(s,{type:'payment',partnerId:'b',amount:String(due/1000),reference:'TEST-1'});
 assert.equal(E.balance(s,'b'),0);
 assert.throws(()=>change(s,{type:'payment',partnerId:'b',amount:'1',reference:'TEST-2'}));
 assert.throws(()=>change(s,{type:'payment',partnerId:'a',amount:'1',reference:''}));
 const original=JSON.stringify(s);change(s,{type:'disable'});assert.equal(JSON.stringify(s),original);
 assert.throws(()=>change(change(s,{type:'disable'}),{type:'distribution',basis:{income:200000,expenses:0,due:0}}));
});
test('expense corrections are allocated without altering historic distributions',()=>{
 let s=change(null,{type:'owners',rows:input});s=change(s,{type:'distribution',basis:{income:100000,expenses:20000,due:0}});
 s=change(s,{type:'distribution',basis:{income:100000,expenses:10000,due:0}});
 assert.equal(s.events.at(-1).rows.reduce((n,r)=>n+r.net,0),10000);
 assert.equal(s.events[1].basis.expenses,20000);
});
