import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEMPLATE_KEYS,defaultTemplate,validateTemplate,loadTemplateDraft,draftRequest,saveTemplateDraft} from '../src/v267/domain/contract-template-drafts.js';
const id='10000000-0000-4000-8000-000000000001';
function session({rows=[],role='general_manager',insertError=null,readError=null,afterCommitError=false}={}){
 const state={rows:[...rows],inserts:0,checked:0};
 const s={bound:{workspace:'w',user:'u',role},check(){state.checked++;},client:{from(table){assert.equal(table,'aqari_contract_template_drafts');const filters=[];let mode='read',row;return {select(){return this;},eq(k,v){filters.push([k,v]);return this;},order(){return this;},limit(){return this;},insert(value){mode='insert';row=value;return this;},async then(resolve,reject){try{if(mode==='insert'){state.inserts++;if(insertError)throw insertError;if(state.rows.some(r=>r.workspace_id===row.workspace_id&&r.template_key===row.template_key&&r.revision===row.revision))throw {code:'23505'};state.rows.push({...row,created_at:'2026-09-13T09:30:00Z'});if(afterCommitError)throw Error('connection lost');return resolve([]);}if(readError)throw readError;return resolve(state.rows.filter(r=>filters.every(([k,v])=>r[k]===v)).sort((a,b)=>b.revision-a.revision).slice(0,1));}catch(e){return reject(e);}}};}},async request(query){return await query;}};
 return {s,state};
}
const modified=(key='apartment')=>({...defaultTemplate(key),body:defaultTemplate(key).body+'\nبند قيد المراجعة'});
test('five separate draft templates with fresh copies',()=>{assert.equal(TEMPLATE_KEYS.length,5);for(const key of TEMPLATE_KEYS){const a=defaultTemplate(key);assert.equal(a.status,'draft');assert.equal(a.revision,0);a.title='changed';assert.notEqual(defaultTemplate(key).title,'changed');}});
test('rental templates have serial, Kuwait header, PACI and distinct dates',()=>{for(const key of ['house','apartment','shop']){const b=defaultTemplate(key).body;for(const token of ['contract_no','written_day','written_date','unit_paci','floor','unit_no','civil_id','passport_no','deposit','start_date','end_date'])assert.ok(b.includes('{{'+token+'}}'));assert.ok(b.includes('بدولة الكويت'));}});
test('handover date is separate and never auto-filled',()=>{const b=defaultTemplate('unit_handover').body;assert.ok(b.includes('{{written_date}}'));assert.ok(b.includes('{{handover_date}}'));assert.ok(b.includes('{{handover_time}}'));assert.ok(!b.includes('2026-09-13'));});
test('tenant signature and fingerprint; owner signature only',()=>{const b=defaultTemplate('house').body;const last=b.slice(b.lastIndexOf('الطرف الأول:'));assert.ok(last.includes('التوقيع'));assert.ok(!last.includes('البصمة'));assert.ok(b.includes('الطرف الثاني:'));});
test('reject unknown keys and empty or oversize wording',()=>{assert.throws(()=>defaultTemplate('official'));assert.throws(()=>validateTemplate({...modified(),title:' '}));assert.throws(()=>validateTemplate({...modified(),body:'a'.repeat(30001)}));});
test('an unsaved template loads defaults only after a successful database read',async()=>{const {s}=session();assert.equal((await loadTemplateDraft(s,'house')).revision,0);const {s:bad}=session({readError:Error('offline')});await assert.rejects(loadTemplateDraft(bad,'house'));});
test('deny non-manager access before querying',async()=>{const {s,state}=session({role:'accountant'});await assert.rejects(loadTemplateDraft(s,'house'),/ACCESS_DENIED/);assert.equal(state.inserts,0);});
test('save appends and verifies exact persisted content',async()=>{const {s,state}=session();const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);const saved=await saveTemplateDraft(s,req);assert.equal(saved.revision,1);assert.equal(saved.body,modified().body);assert.equal(state.inserts,1);assert.ok(state.checked>=3);});
test('same request retry never duplicates a saved revision',async()=>{const {s,state}=session();const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);await saveTemplateDraft(s,req);await saveTemplateDraft(s,req);assert.equal(state.inserts,1);});
test('lost acknowledgement is reconciled by independent readback',async()=>{const {s,state}=session({afterCommitError:true});const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);assert.equal((await saveTemplateDraft(s,req)).id,id);assert.equal(state.inserts,1);});
test('concurrent revision conflict never overwrites the earlier version',async()=>{const {s,state}=session();const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);await saveTemplateDraft(s,req);const other={...req,id:'10000000-0000-4000-8000-000000000002',body:'other'};await assert.rejects(saveTemplateDraft(s,other),e=>e.code==='TEMPLATE_CONFLICT');assert.equal(state.rows.length,1);assert.equal(state.rows[0].body,req.body);});
test('wrong user/workspace cannot reuse a request',async()=>{const {s}=session();const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);await assert.rejects(saveTemplateDraft(s,{...req,workspace_id:'other'}),/ACCESS_DENIED/);await assert.rejects(saveTemplateDraft(s,{...req,created_by:'other'}),/ACCESS_DENIED/);});
test('failed insert is not reported as success',async()=>{const {s,state}=session({insertError:Error('offline')});const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);await assert.rejects(saveTemplateDraft(s,req),/offline/);assert.equal(state.rows.length,0);});
test('same request id with different content is rejected',async()=>{const {s}=session();const req=draftRequest(s,defaultTemplate('apartment'),modified(),id);await saveTemplateDraft(s,req);await assert.rejects(saveTemplateDraft(s,{...req,body:'changed'}),/تأكيد/);});
test('database policy is manager-scoped and append-only for authenticated users',()=>{
 const sql=readFileSync(new URL('../staging-database/supabase/migrations/20260913095018_v267_contract_template_drafts.sql',import.meta.url),'utf8');
 assert.match(sql,/revoke all on public\.aqari_contract_template_drafts from public,anon,authenticated;/);
 assert.match(sql,/grant select,insert on public\.aqari_contract_template_drafts to authenticated;/);
 assert.equal((sql.match(/private\.aqari_manager\(workspace_id\)/g)||[]).length,2);
 assert.doesNotMatch(sql,/grant\s+(?:update|delete)/i);
 assert.doesNotMatch(sql,/for\s+(?:update|delete)\s+to authenticated/i);
});
