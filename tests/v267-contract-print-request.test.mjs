import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchContractPrint} from '../src/v267/api/contract-print-request.js';
const prepared={contractId:'qa-only',count:2,mode:'official',revision:7};
function fixture(){let session={access_token:'mock-only',user:{id:'user'}},closed=false;const d={session:{bound:{user:'user',workspace:'workspace'},client:{auth:{getSession:async()=>({data:{session}})}},check(){if(closed)throw Error('closed');},operation:fn=>fn(new AbortController().signal)}};return {d,logout(){session=null;},close(){closed=true;}};}
const response=(body='%PDF-valid',mime='application/pdf',status=200)=>new Response(body,{status,headers:{'content-type':mime}});
test('uses a bound request and accepts only PDF bytes',async()=>{const f=fixture();globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/contract-print');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.deepEqual(JSON.parse(options.body),{workspaceId:'workspace',contractRef:'qa-only',count:2,mode:'official',expectedRevision:7});assert.equal(options.headers.Authorization,'Bearer mock-only');return response();};const pdf=await fetchContractPrint(f.d,prepared);assert.equal(pdf.type,'application/pdf');});
test('rejects HTML, renamed HTML and stale revisions',async()=>{for(const r of [response('<html>','text/html'),response('<html>','application/pdf'),response('error','application/json',409)]){globalThis.fetch=async()=>r;await assert.rejects(fetchContractPrint(fixture().d,prepared));}});
test('discards result after logout or closing the page',async()=>{for(const action of ['logout','close']){const f=fixture();globalThis.fetch=async()=>{f[action]();return response();};await assert.rejects(fetchContractPrint(f.d,prepared));}});
