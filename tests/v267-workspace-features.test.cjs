const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/workspace.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
test('unfinished database tools remain hidden on older backends, failed access reads and revoked permissions',()=>{
 const staff={hidden:true},finance={hidden:true},context={document:{getElementById:id=>id==='aq267-staff-access'?staff:finance},uiText(){}};
 vm.createContext(context);vm.runInContext(source+'\nthis.update=function(data){access=data;updateFeatureTools();};',context);
 context.update({role:'general_manager',permissions:{finance:{read:true}}});assert.equal(staff.hidden,true);assert.equal(finance.hidden,true);
 context.update({role:'general_manager',features:{staff_access:true,financial_register:true},permissions:{finance:{read:true}}});assert.equal(staff.hidden,false);assert.equal(finance.hidden,false);
 context.update({role:'accountant',features:{staff_access:true,financial_register:true},permissions:{finance:{read:true}}});assert.equal(staff.hidden,true);assert.equal(finance.hidden,false);
 context.update({role:'accountant',features:{financial_register:true},permissions:{finance:{read:false}}});assert.equal(finance.hidden,true);
 context.update(null);assert.equal(staff.hidden,true);assert.equal(finance.hidden,true);
});
