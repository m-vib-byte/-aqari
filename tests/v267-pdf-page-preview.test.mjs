import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPdfPagePreview} from '../src/v267/components/pdf-page-preview.js';

class Element{
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this[k];delete this.attrs[k];}
 remove(){this.removed=true;}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('touch preview renders pages, zooms, retries, and drops stale responses after disposal',async t=>{
 const oldWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){}};
 const oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 t.after(()=>{globalThis.window=oldWindow;globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;});
 globalThis.document={createElement:tag=>new Element(tag),body:{classList:{remove(){}}}};
 const revoked=[];let serial=0;URL.createObjectURL=()=>`blob:page-${++serial}`;URL.revokeObjectURL=u=>revoked.push(u);
 const calls=[];let fail=false,resolvePending;
 const view=appendPdfPagePreview(new Element('div'),{pageCount:3,renderPage:async(number,signal)=>{calls.push({number,signal});if(fail)throw Error('NETWORK');if(number===3)return new Promise(resolve=>resolvePending=resolve);return new Blob(['png'],{type:'image/png'});}});
 await view.ready;assert.equal(view.image.src,'blob:page-1');assert.deepEqual(calls.map(c=>c.number),[1]);
 const [tools,status,retry]=view.root.children,[previous,choice,next,,zoomLabel,zoomIn]=tools.children;
 assert.equal(previous.disabled,true);zoomIn.onclick();assert.equal(view.image.style.width,'150%');assert.equal(zoomLabel.textContent,'150%');
 fail=true;await next.onclick();assert.equal(retry.hidden,false);assert.equal(view.image.src,undefined);
 fail=false;await retry.onclick();assert.equal(view.image.src,'blob:page-2');assert.equal(choice.value,'2');
 await previous.onclick();assert.equal(view.image.src,'blob:page-1');assert.equal(calls.length,3);
 choice.value='3';const pending=choice.onchange();await tick();view.dispose();assert.equal(calls.at(-1).signal.aborted,true);resolvePending(new Blob(['stale'],{type:'image/png'}));await pending;
 assert.equal(serial,2);assert.deepEqual(revoked.sort(),['blob:page-1','blob:page-2']);assert.equal(view.image.src,undefined);assert.equal(view.root.removed,true);
});
