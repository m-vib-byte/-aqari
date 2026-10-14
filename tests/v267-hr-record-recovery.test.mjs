import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/v267/pages/hr-lifecycle.js',import.meta.url),'utf8');
const formSource=source.slice(source.indexOf(' function recordForm('),source.indexOf(' function terminationForm('));
const all=x=>[x,...x.children.flatMap(all)];
function setup(mode){
 const node=(tag,text='')=>({tag,textContent:text,value:'',children:[],append(...xs){this.children.push(...xs);}});
 const d={body:node('div'),status:node('p'),run(fn){this.pending=fn();return this.pending;}},writes=[],rows=[];let first=true,reopened=0;
 const rpc=async(action,data)=>{if(action==='employee')return {records:rows};assert.equal(action,'add_record');writes.push({...data});if(first){first=false;if(mode==='reject')throw Object.assign(Error('invalid'),{status:400,code:'23514'});if(mode==='saved')rows.push({...data});throw Error('reply lost');}if(rows.some(x=>x.id===data.id))throw Object.assign(Error('duplicate'),{code:'23505'});rows.push({...data});};
 let counter=0;const ctx={d,node,t:x=>x,input:(type='text')=>Object.assign(node('input'),{type}),select:rows=>Object.assign(node('select'),{value:rows[0][0]}),field:(_,x)=>x,context:{properties:[]},SELF_SERVICE_KINDS:[],RECORD_LABELS:{attendance:'Attendance'},crypto:{randomUUID:()=>`operation-${++counter}`},money:x=>x,rpc,employee:async()=>{reopened++;}};
 vm.createContext(ctx);vm.runInContext(formSource+'\nrecordForm("employee",false);',ctx);
 const form=all(d.body).find(x=>x.tag==='form'),inputs=all(form).filter(x=>x.tag==='input');inputs.find(x=>x.type==='datetime-local').value='2026-10-14T09:00';inputs.find(x=>x.type==='text').value='Synthetic record';
 return {form,inputs,writes,rows,submit:()=>{form.onsubmit({preventDefault(){}});return d.pending;},reopened:()=>reopened};
}
for(const mode of ['saved','not-saved'])test('HR lost response '+mode+' resolves original operation without duplicate',async()=>{const f=setup(mode);await assert.rejects(f.submit(),/reply lost/);await f.submit();assert.equal(f.rows.length,1);assert.equal(new Set(f.writes.map(x=>x.id)).size,1);assert.equal(f.writes.length,mode==='saved'?1:2);assert.equal(f.reopened(),1);});
test('HR confirmed invalid input unlocks correction and preserves fields',async()=>{const f=setup('reject');await assert.rejects(f.submit(),/invalid/);assert.ok(f.inputs.every(x=>!x.disabled));assert.equal(f.inputs.find(x=>x.type==='text').value,'Synthetic record');await f.submit();assert.equal(f.rows.length,1);assert.notEqual(f.writes[0].id,f.writes[1].id);});
