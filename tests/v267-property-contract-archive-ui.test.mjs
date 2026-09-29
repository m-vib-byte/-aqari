import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('archive offers the next 100 contracts without replacing the first page',async()=>{
 const children=element=>[element,...element.children.flatMap(children)];
 const node=(tag,text='')=>({tag,_text:text,style:{},children:[],append(...parts){this.children.push(...parts);},prepend(...parts){this.children.unshift(...parts);},
  replaceChildren(...parts){this.children=parts;},get textContent(){return this._text+this.children.map(part=>part.textContent).join('');},
  set textContent(value){this._text=value;this.children=[];}});
 const field=(label,control)=>{const wrapper=node('label',label);wrapper.append(control);return wrapper;};
 const property={id:'property-id',externalRef:'property-ref',name:'عقار اختبار'},offsets=[];
 const session={bound:{workspace:'workspace'},check(){}};
 const target=node('div'),d={session,status:node('p'),onDispose(){},run(task){this.pending=Promise.resolve().then(task);return this.pending;}};
 const context={node,field,t:x=>x,createOriginalDocumentUpload:()=>()=>{},originalDocument:()=>{},
  createTemplateLogoContext:()=>({getAccess:async()=>({canUpload:true}),listProperties:async()=>[property]}),
  listPropertyContractArchive:async(_session,_property,offset)=>{offsets.push(offset);const count=offset===0?100:5;
   return {items:Array.from({length:count},(_,index)=>({id:String(index+offset),title:'عقد',original_filename:'عقد صوري.pdf',created_at:'2026-09-26T00:00:00Z'})),hasMore:offset===0,nextOffset:offset+100};},
  readPropertyContractArchive:async()=>new Blob(['%PDF-1.7']),URL};
 vm.createContext(context);
 const source=fs.readFileSync('src/v267/components/property-contract-upload.js','utf8')
  .replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 const mount=vm.runInContext(source+'\nmountPropertyContractUpload',context);
 await mount(d,target,{propertyId:property.id});
 const find=label=>children(target).find(element=>element.tag==='button'&&element._text===label);
 const refresh=find('عرض عقود PDF المحفوظة'),more=find('عرض المزيد من العقود');
 assert.ok(refresh);assert.ok(more);assert.equal(more.hidden,true);
 refresh.onclick();await d.pending;
 assert.equal(children(target).filter(element=>element.tag==='button'&&element._text==='عرض PDF المحفوظ').length,100);
 assert.equal(more.hidden,false);
 assert.ok(children(target).some(element=>element.tag==='span'&&element.textContent.includes('عقد صوري.pdf')));
 more.onclick();await d.pending;
 assert.equal(children(target).filter(element=>element.tag==='button'&&element._text==='عرض PDF المحفوظ').length,105);
 assert.equal(more.hidden,true);assert.deepEqual(offsets,[0,100]);
 find('عرض PDF المحفوظ').onclick();await d.pending;
 const links=children(target).filter(element=>element.tag==='a');
 const full=links.find(element=>element.target==='_blank');
 const download=links.find(element=>element.download==='عقد صوري.pdf');
 assert.ok(full);assert.ok(download);assert.equal(full.href,download.href);
 assert.equal(await (await fetch(full.href)).text(),'%PDF-1.7');
 assert.equal(children(target).some(element=>element.tag==='iframe'),false);
 URL.revokeObjectURL(full.href);
});
