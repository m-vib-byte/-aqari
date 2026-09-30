import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPdfViewer} from '../src/v267/components/pdf-viewer.js';

for(const touch of [true,false])test(`PDF viewer keeps the exact artifact with touch=${touch}`,t=>{
 const priorDocument=globalThis.document,priorMedia=globalThis.matchMedia;
 t.after(()=>{globalThis.document=priorDocument;globalThis.matchMedia=priorMedia;});
 globalThis.document={createElement:tag=>({tag,style:{}})};
 globalThis.matchMedia=()=>({matches:touch});
 const children=[],target={append(...nodes){children.push(...nodes);}};
 let opened=0;
 const result=appendPdfViewer(target,'blob:verified-artifact',{filename:'folder/contract.pdf',onOpen:()=>opened++});
 assert.equal(result.open.href,'blob:verified-artifact');
 assert.equal(result.download.href,result.open.href);
 assert.equal(result.open.target,'_blank');
 assert.equal(result.open.rel,'noopener noreferrer');
 assert.equal(result.download.download,'folder_contract.pdf');
 assert.equal(children[0],result.open);
 result.open.onclick();assert.equal(opened,1);
 if(touch){assert.equal(result.frame,null);assert.equal(children.length,2);}
 else{assert.equal(result.frame.src,result.open.href);assert.equal(children.length,3);}
});
