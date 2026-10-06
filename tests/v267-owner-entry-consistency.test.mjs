import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ownershipShareBasisPoints} from '../src/v267/domain/ownership-shares.js';

function editor(kind){
 class Element{constructor(tag,value=''){this.tag=tag;this.value=value;this.children=[];}append(...xs){this.children.push(...xs);}remove(){}all(){return this.children.flatMap(x=>[x,...x.all()]);}}
 const node=(tag,value='')=>new Element(tag,value),input=(type,value='')=>Object.assign(node('input',value),{type}),field=(label,control)=>{const n=node('label',label);n.append(control);return n;},button=(label,fn)=>Object.assign(node('button',label),{onclick:fn});
 const source=readFileSync(new URL('../src/v267/pages/'+(kind==='onboarding'?'property-onboarding.js':'property-master-file.js'),import.meta.url),'utf8');
 const start=source.indexOf(kind==='onboarding'?'function ownerRows(':' function ownerEditor('),end=source.indexOf(kind==='onboarding'?'async function compressedPreview':' function masterPayload',start);
 const scope={node,input,field,button,action:button,translateStatic:x=>x,clean:x=>String(x??'').trim(),normalizeEmail:x=>String(x??''),normalizePhone:x=>String(x??''),ownershipShareBasisPoints};vm.createContext(scope);vm.runInContext(source.slice(start,end),scope);
 const target=node('div'),read=kind==='onboarding'?scope.ownerRows(target):scope.ownerEditor(target);
 const control=label=>target.all().find(n=>n.tag==='label'&&n.value===label).children[0];
 return {read,name:control('اسم المالك / الشريك'),share:control('النسبة %'),email:control('البريد'),phone:control('الهاتف'),role:control('الصفة')};
}
for(const kind of ['onboarding','master']){
 test(kind+' rejects excess precision in the actual owner editor',()=>{const e=editor(kind);e.name.value='اختبار';e.share.value='80.884';assert.throws(e.read,/النسبة/);});
 test(kind+' accepts exact Arabic shares',()=>{const e=editor(kind);e.name.value='اختبار';e.share.value='٨٠٫٨٨';assert.equal(e.read()[0].bps,8088);});
 test(kind+' permits leaving the optional owner list empty',()=>{const e=editor(kind);assert.equal(e.read().length,0);});
}

test('empty optional master row does not fail native required validation',()=>{const e=editor('master');assert.equal(Boolean(e.name.required),false);assert.equal(Boolean(e.share.required),false);assert.equal(e.read().length,0);});
test('master rejects a share without an owner name',()=>{const e=editor('master');e.share.value='100';assert.throws(e.read,/اسم المالك/);});
test('master rejects an owner name without a share',()=>{const e=editor('master');e.name.value='اختبار';assert.throws(e.read,/النسبة/);});
for(const field of ['email','phone','role'])test('master does not silently discard a partial owner: '+field,()=>{const e=editor('master');e[field].value=field==='email'?'test@example.test':field==='phone'?'123':'شريك';assert.throws(e.read,/اسم المالك/);});

for(const field of ['email','phone','role'])test('onboarding does not silently discard a partial owner: '+field,()=>{const e=editor('onboarding');e[field].value=field==='email'?'test@example.test':field==='phone'?'123':'شريك';assert.throws(e.read,/اسم المالك/);});
