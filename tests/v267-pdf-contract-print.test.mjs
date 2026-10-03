import test from 'node:test';
import assert from 'node:assert/strict';
import {appendContractPrint} from '../src/v267/components/pdf-contract-print.js';
class Element{
 constructor(tag){this.tag=tag;this.children=[];const classes=new Set(),styles=new Map();this.classList={add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)};this.style={setProperty:(k,v,p='')=>styles.set(k,[v,p]),getPropertyValue:k=>styles.get(k)?.[0]||'',getPropertyPriority:k=>styles.get(k)?.[1]||'',removeProperty:k=>styles.delete(k)};}
 append(...items){this.children.push(...items);}
 setAttribute(){} remove(){this.removed=true;} async decode(){}
}
test('printing waits for all pages, retries failures, prints cached pages on tap and disposes private images',async t=>{
 const prior={document:globalThis.document,window:globalThis.window,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 t.after(()=>{globalThis.document=prior.document;globalThis.window=prior.window;URL.createObjectURL=prior.create;URL.revokeObjectURL=prior.revoke;});
 const body=new Element('body'),target=new Element('section'),listeners=new Map(),revoked=[],printed=[];let serial=0,fail=true,calls=[];
 const app=new Element('main');app.style.setProperty('display','grid','important');body.append(app);
 globalThis.document={body,createElement:tag=>new Element(tag)};globalThis.window={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),print:()=>{listeners.get('beforeprint')();assert.equal(app.style.getPropertyValue('display'),'none');printed.push(body.children.at(-1).children.length);listeners.get('afterprint')();assert.equal(app.style.getPropertyValue('display'),'grid');assert.equal(app.style.getPropertyPriority('display'),'important');}};
 URL.createObjectURL=()=>`blob:${++serial}`;URL.revokeObjectURL=url=>revoked.push(url);
 const printer=appendContractPrint(target,{pageCount:2,renderPage:async(n)=>{calls.push(n);if(fail&&n===2)throw Error('NETWORK');return new Blob(['image'],{type:'image/png'});}}),button=target.children[0];
 await button.onclick();assert.deepEqual(printed,[]);assert.equal(button.disabled,false);assert.deepEqual(revoked,['blob:1']);
 fail=false;await button.onclick();assert.deepEqual(printed,[2]);assert.deepEqual(calls,[1,2,1,2]);
 button.onclick();assert.deepEqual(printed,[2,2]);assert.equal(calls.length,4);
 printer.dispose();assert.equal(body.children.at(-1).removed,true);assert.deepEqual(revoked,['blob:1','blob:2','blob:3']);assert.equal(listeners.size,0);
 let resolvePage,signal;const other=appendContractPrint(target,{pageCount:1,renderPage:(_,s)=>{signal=s;return new Promise(resolve=>resolvePage=resolve);}});const pending=target.children.at(-2).onclick();other.dispose();assert.equal(signal.aborted,true);resolvePage(new Blob(['late'],{type:'image/png'}));await pending;assert.deepEqual(printed,[2,2]);assert.equal(serial,3);
});
