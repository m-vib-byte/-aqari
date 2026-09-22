import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../src/v267/workspace.js',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function directoryScope(){'),source.indexOf('const ui=uiText;'));
function fixture(){
 const cycle={hidden:true},bound={workspace:'workspace',user:'manager',role:'general_manager'};
 const access={workspace_id:'workspace',user_id:'manager',role:'general_manager',sections:{contracts:true},permissions:{contracts:{read:true}}};
 let refreshes=0;
 const context={access,currentScope:()=>bound,document:{getElementById:id=>id==='aq267-rental-document-cycle'?cycle:null},serviceDirectory:{refresh(){refreshes++;}},propertyExperience:null};
 vm.runInNewContext(functions+';this.refresh=updateFeatureTools;',context);
 return {context,access,bound,cycle,refreshes:()=>refreshes};
}

test('the real feature refresh exposes the rental document cycle to its authorized manager',()=>{
 const f=fixture();f.context.refresh();assert.equal(f.cycle.hidden,false);assert.equal(f.refreshes(),1);
});

test('the same document-cycle entry closes on access removal, workspace/user switch or non-manager role',()=>{
 for(const alter of [f=>f.access.permissions.contracts.read=false,f=>f.access.sections.contracts=false,f=>f.bound.workspace='other',f=>f.bound.user='other',f=>{f.bound.role='accountant';f.access.role='accountant';},f=>f.context.access=null]){
  const f=fixture();f.context.refresh();assert.equal(f.cycle.hidden,false);alter(f);f.context.refresh();assert.equal(f.cycle.hidden,true);
 }
});
