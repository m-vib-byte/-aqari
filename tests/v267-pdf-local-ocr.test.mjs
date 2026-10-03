import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizePdfPage} from '../src/v267/components/pdf-local-ocr.js';

test('OCR runs with same-origin pinned assets, no persistent cache, and disposes its worker',async()=>{
 const image={pixels:'local'},progress=[];let terminated=0;
 globalThis.Tesseract={async createWorker(languages,mode,options){
  assert.equal(languages,'ara+eng');assert.equal(mode,1);
  for(const key of ['workerPath','corePath','langPath'])assert.ok(options[key].startsWith('/vendor/ocr/'));
  assert.equal(options.workerBlobURL,false);assert.equal(options.cacheMethod,'none');options.logger({progress:.5});
  return {async recognize(value){assert.equal(value,image);return {data:{text:'نص عربي'}};},async terminate(){terminated++;}};
 }};
 try{assert.equal(await recognizePdfPage(image,{onProgress:n=>progress.push(n)}),'نص عربي');assert.deepEqual(progress,[50]);assert.equal(terminated,1);}finally{delete globalThis.Tesseract;}
});

test('cancellation terminates active OCR and never returns stale text',async()=>{
 const controller=new AbortController();let terminated=0,started;
 const ready=new Promise(resolve=>{started=resolve;});
 globalThis.Tesseract={async createWorker(){return {recognize(){started();return new Promise(()=>{});},async terminate(){terminated++;}};}};
 try{const task=recognizePdfPage({}, {signal:controller.signal});await ready;controller.abort();await assert.rejects(task,/OCR_CANCELLED/);assert.ok(terminated>0);}finally{delete globalThis.Tesseract;}
});

test('failed recognition still disposes the worker',async()=>{
 let terminated=0;globalThis.Tesseract={async createWorker(){return {async recognize(){throw Error('invalid image');},async terminate(){terminated++;}};}};
 try{await assert.rejects(recognizePdfPage({}),/invalid image/);assert.equal(terminated,1);}finally{delete globalThis.Tesseract;}
});

test('an already cancelled request never creates a worker',async()=>{
 const controller=new AbortController();controller.abort();let created=0;globalThis.Tesseract={async createWorker(){created++;}};
 try{await assert.rejects(recognizePdfPage({}, {signal:controller.signal}),/OCR_CANCELLED/);assert.equal(created,0);}finally{delete globalThis.Tesseract;}
});
