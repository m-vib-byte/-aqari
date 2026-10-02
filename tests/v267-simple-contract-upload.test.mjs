import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const all=e=>[e,...e.children.flatMap(all)];
function fixture({fail=false}={}){
 const node=(tag,text='')=>({tag,textContent:text,style:{},children:[],files:[],_value:'',get value(){return this._value;},set value(v){this._value=v;if(this.type==='file'&&v==='')this.files=[];},append(...parts){for(const p of parts){p.parentElement=this;this.children.push(p);}},prepend(...parts){for(const p of parts)p.parentElement=this;this.children.unshift(...parts);},insertBefore(p,b){p.parentElement=this;this.children.splice(this.children.indexOf(b),0,p);},replaceChildren(...parts){this.children=[];this.append(...parts);},setAttribute(k,v){this[k]=v;},querySelectorAll(tag){return all(this).slice(1).filter(e=>e.tag===tag);}});
 const field=(label,control)=>{const e=node('label',label);e.append(control);return e;};
 const property={id:'p1',externalRef:'p-ref',name:'عقار اختبار'},calls=[];
 const d={session:{check(){}},status:node('p'),onDispose(){},run(task){return this.pending=Promise.resolve().then(task);}};
 const context={node,field,t:x=>x,URL,File,MAX_SCAN_PAGES:20,createTemplateLogoContext:()=>({getAccess:async()=>({canUpload:true}),listProperties:async()=>[property]}),originalDocument:async file=>file,createOriginalDocumentUpload:()=>async(file,scope)=>{calls.push({file,scope});if(fail){fail=false;throw Error('network');}return {id:'doc',original_filename:file.name,metadata:{property_id:scope.propertyId}};},listPropertyContractArchive:async()=>{calls.push('archive');return {items:[],hasMore:false,nextOffset:100};},readPropertyContractArchive:async()=>new Blob(['%PDF-1.7'])};
 const source=fs.readFileSync('src/v267/components/property-contract-upload.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
 const mount=vm.runInNewContext(source+'\nmountPropertyContractUpload',context),target=node('div');
 return {d,calls,target,mount,property,find:text=>all(target).find(e=>e.textContent===text)};
}
test('simple upload reveals save only after choosing a file and keeps archive separate',async()=>{
 const f=fixture();await f.mount(f.d,f.target,{propertyId:f.property.id});
 const save=f.find('حفظ الملف'),archive=f.find('أرشيف عقود PDF للعقار').parentElement;
 assert.equal(save.hidden,true);assert.equal(save.disabled,true);assert.equal(archive.hidden,true);assert.deepEqual(f.calls,[]);
 const input=all(f.target).find(e=>e.name==='contract_pdf');input.files=[new File(['%PDF-1.7'],'sample.pdf',{type:'application/pdf'})];input.onchange();
 assert.equal(save.hidden,false);assert.equal(save.disabled,false);assert.ok(f.find('sample.pdf'));
 const form=all(f.target).find(e=>e.tag==='form');form.onsubmit({preventDefault(){}});await f.d.pending;
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].scope.propertyId,'p1');assert.equal(save.hidden,true);assert.equal(archive.hidden,true);
 assert.equal(f.find('✓ تم حفظ الملف').parentElement.hidden,false);assert.equal(f.find('عرض الملف المحفوظ').type,'button');
 f.find('عرض الملف المحفوظ').onclick();await f.d.pending;
 const link=all(f.target).find(e=>e.download==='sample.pdf');assert.ok(link);assert.equal(await (await fetch(link.href)).text(),'%PDF-1.7');URL.revokeObjectURL(link.href);
});
test('failed upload retains selection and permits retry without a false success',async()=>{
 const f=fixture({fail:true});await f.mount(f.d,f.target,{propertyId:f.property.id});
 const input=all(f.target).find(e=>e.name==='contract_pdf');input.files=[new File(['%PDF-1.7'],'retry.pdf',{type:'application/pdf'})];input.onchange();
 const form=all(f.target).find(e=>e.tag==='form');form.onsubmit({preventDefault(){}});await assert.rejects(f.d.pending,/network/);
 assert.equal(f.find('حفظ الملف').disabled,false);assert.equal(input.files[0].name,'retry.pdf');assert.equal(f.find('✓ تم حفظ الملف').parentElement.hidden,true);
 form.onsubmit({preventDefault(){}});await f.d.pending;assert.equal(f.calls.length,2);assert.equal(f.find('✓ تم حفظ الملف').parentElement.hidden,false);
});
