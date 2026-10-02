import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const all=e=>[e,...e.children.flatMap(all)];
function node(tag,text=''){return {tag,textContent:text,children:[],dataset:{},style:{},classList:{add(){}},append(...parts){this.children.push(...parts);},replaceChildren(...parts){this.children=parts;},setAttribute(){},focus(){this.focused=true;}};}
function fixture(propertyId='p1'){
 const calls=[],body=node('main'),d={body,el:node('main'),status:node('p'),onDispose(){},close(){calls.push('close');},run(fn){return this.pending=Promise.resolve().then(fn);},session:{bound:{role:'general_manager'},check(){}}};
 const manager={setSection(){},setProperty(){},openEditor:(...args)=>calls.push(['write',...args])};
 const context={node,field:(label,el)=>{const out=node('label',label);out.append(el);return out;},t:x=>x,createPage:()=>d,document:{getElementById:()=>true},createTemplateLogoContext:()=>({listProperties:async()=>[{id:'p1',name:'Property One'}],loadLogo:async()=>null}),mountRentalTemplateManager:async()=>manager,mountPropertyContractUpload:async()=>{},guardPageImport:async()=>({openContractFoundation:args=>calls.push(['new',args]),openRentalContracts:args=>calls.push(['existing',args])})};
 const source=fs.readFileSync('src/v267/pages/contract-templates.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
 vm.runInNewContext(source+';this.open=openContractTemplates;',context);context.open({propertyId});
 const click=async label=>{const title=all(body).find(e=>e.tag==='strong'&&e.textContent===label);assert.ok(title,label);const button=all(body).find(e=>e.children.includes(title));button.onclick();await d.pending;};
 return {d,calls,click};
}
test('new and existing intake preserve selected property and do not write contract data on entry',async()=>{
 for(const [label,kind]of [['عقد جديد','new'],['عقد قائم','existing']]){const f=fixture();await f.d.pending;await f.click(label);assert.equal(f.calls[0],'close');assert.equal(f.calls[1][0],kind);assert.equal(f.calls[1][1].propertyId,'p1');if(kind==='existing')assert.equal(f.calls[1][1].intent,'existing');else assert.equal(f.calls[1][1].property,'Property One');}
});
test('missing property prevents navigation, while writing opens an independent editable draft',async()=>{
 const f=fixture(null);await f.d.pending;await assert.rejects(f.click('عقد قائم'),/اختر العقار/);assert.deepEqual(f.calls,[]);await f.click('كتابة نموذج');assert.equal(f.calls[0][0],'write');assert.equal(f.calls[0][1],null);assert.equal(f.calls[0][2].write,true);
});
test('existing intake only offers bound operational contracts and attaches without creating a lease',async()=>{
 const source=fs.readFileSync('src/v267/pages/rental-contracts.js','utf8');
 const entry=source.slice(source.indexOf(' async function existingContractEntry()'),source.indexOf(' async function propertyHome'));
 const body=node('main'),calls=[],rows=[{id:'ok',contract_no:'A',tenant:'Tenant'},{id:'source',source:'statement-import'},{id:'unbound'},{id:'no-lease'}];
 const box={node,input:type=>node(type),field:(_,el)=>el,translateStatic:x=>x,selectedPropertyId:'p1',data:{tenantProfilesV267:[]},load:async()=>{},propertyRecord:()=>({name:'Property One'}),clear:()=>body.replaceChildren(),backButton:()=>node('button'),currentPropertyContracts:()=>rows,scopeSources:()=>({}),resolveContractPropertyBinding:c=>({status:c.id==='unbound'?'unbound':'bound'}),assertContractProperty:c=>({unit:{unit_no:'1'},lease:c.id==='no-lease'?null:{}}),matchesContract:()=>true,button:(label,fn)=>Object.assign(node('button',label),{onclick:fn}),show:(id,options)=>calls.push({id,options}),form:()=>calls.push('register'),d:{body,session:{bound:{role:'general_manager'}}}};
 vm.runInNewContext('let registeringExisting=false;'+entry+';this.open=existingContractEntry;',box);await box.open();const buttons=all(body).filter(e=>e.tag==='button');assert.equal(buttons.length,3);await buttons[1].onclick();assert.equal(calls[0].id,'ok');assert.equal(calls[0].options.attach,true);assert.equal(calls.length,1);
 box.d.session.bound.role='staff';await assert.rejects(box.open(),{code:'42501'});
});
