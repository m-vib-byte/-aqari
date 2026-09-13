const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/v267/workspace.js','utf8').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
test('unfinished database tools remain hidden on older backends, failed access reads and revoked permissions',()=>{
 const staff={hidden:true},finance={hidden:true},deposits={hidden:true},vacating={hidden:true},context={document:{getElementById:id=>({'aq267-staff-access':staff,'aq267-financial-register':finance,'aq267-deposit-ledger':deposits,'aq267-vacating-review':vacating})[id]||null},uiText(){}};
 vm.createContext(context);vm.runInContext(source+'\nthis.update=function(data){access=data;updateFeatureTools();};',context);
 context.update({role:'general_manager',permissions:{finance:{read:true}}});assert.equal(staff.hidden,true);assert.equal(finance.hidden,true);
 context.update({role:'general_manager',features:{staff_access:true,financial_register:true},permissions:{finance:{read:true}}});assert.equal(staff.hidden,false);assert.equal(finance.hidden,false);
 context.update({role:'accountant',features:{staff_access:true,financial_register:true},permissions:{finance:{read:true}}});assert.equal(staff.hidden,true);assert.equal(finance.hidden,false);
 context.update({role:'accountant',features:{financial_register:true},permissions:{finance:{read:false}}});assert.equal(finance.hidden,true);
 context.update(null);assert.equal(staff.hidden,true);assert.equal(finance.hidden,true);
 assert.equal(deposits.hidden,true);
 context.update({role:'collector',features:{deposit_register:true},permissions:{collections:{read:true}}});assert.equal(deposits.hidden,false);
 context.update({role:'collector',features:{deposit_register:true},permissions:{collections:{read:false}}});assert.equal(deposits.hidden,true);
 context.update({role:'general_manager',permissions:{collections:{read:true}}});assert.equal(deposits.hidden,true,'older backends cannot expose a missing ledger');
 context.update({role:'general_manager',features:{deposit_register:true},permissions:{collections:{read:true}}});assert.equal(deposits.hidden,false);
 context.update(null);assert.equal(deposits.hidden,true,'auth/access loss hides the ledger');
 context.update({role:'general_manager',features:{vacating_review:true}});assert.equal(vacating.hidden,false);
 context.update({role:'accountant',features:{vacating_review:true}});assert.equal(vacating.hidden,true);
 context.update({role:'general_manager',features:{}});assert.equal(vacating.hidden,true);
 context.update(null);assert.equal(vacating.hidden,true);
});
test('incremental release never offers a new RPC tool just because the user is a manager',()=>{
 const ids=['final-gap-center','official-document-center','integration-center','financial-archive','compliance-center','kpi-dashboard','maintenance-plans','maintenance-report','operations-center','unit-readiness'];
 const elements=Object.fromEntries(ids.map(id=>['aq267-'+id,{hidden:true}]));
 const context={document:{getElementById:id=>elements[id]||null},uiText(){}};vm.createContext(context);vm.runInContext(source+'\nthis.update=function(data){access=data;updateFeatureTools();};',context);
 const manager={role:'general_manager',permissions:{finance:{read:true},maintenance:{read:true},reports:{read:true},properties:{read:true}}};
 context.update(manager);assert.ok(Object.values(elements).every(x=>x.hidden),'missing backend capabilities must keep all new tools hidden');
 context.update({...manager,features:{final_gap_register:true,official_documents:true,external_integrations:true,financial_archive:true,compliance_register:true,kpi_dashboard:true,maintenance_plans:true,maintenance_report:true,operations_register:true,unit_readiness:true}});assert.ok(Object.values(elements).every(x=>!x.hidden));
 context.update({...manager,features:{financial_archive:true},permissions:{...manager.permissions,finance:{read:false}}});assert.equal(elements['aq267-financial-archive'].hidden,true);
 context.update({...manager,features:{unit_readiness:true},permissions:{...manager.permissions,properties:{read:false}}});assert.equal(elements['aq267-unit-readiness'].hidden,true);
 context.update({...manager,features:{maintenance_report:true},permissions:{...manager.permissions,reports:{read:false}}});assert.equal(elements['aq267-maintenance-report'].hidden,true);
 context.update({...manager,features:{maintenance_report:true},permissions:{...manager.permissions,maintenance:{read:false}}});assert.equal(elements['aq267-maintenance-report'].hidden,true);
 context.update(null);assert.ok(Object.values(elements).every(x=>x.hidden),'revocation must hide previously available tools');
});
test('financial completion tools require installed services, manager and document access',()=>{
 const mapping={'aq267-opening-balances':'opening_balance_reconciliation','aq267-partner-distributions':'partner_distribution_register','aq267-commercial-collections':'commercial_collections'};
 const elements=Object.fromEntries(Object.keys(mapping).map(id=>[id,{hidden:true}]));
 const context={document:{getElementById:id=>elements[id]||null},uiText(){}};vm.createContext(context);vm.runInContext(source+'\nthis.update=function(data){access=data;updateFeatureTools();};',context);
 const granted={role:'general_manager',features:Object.fromEntries(Object.values(mapping).map(key=>[key,true])),permissions:{finance:{read:true},documents:{read:true},partners:{read:true}}};
 context.update(granted);assert.ok(Object.values(elements).every(x=>!x.hidden));
 for(const role of ['accountant','collector','property_manager','partner']){context.update({...granted,role});assert.ok(Object.values(elements).every(x=>x.hidden),role);}
 for(const section of ['finance','documents']){context.update({...granted,permissions:{...granted.permissions,[section]:{read:false}}});assert.ok(Object.values(elements).every(x=>x.hidden),section);}
 context.update({...granted,permissions:{...granted.permissions,partners:{read:false}}});assert.equal(elements['aq267-partner-distributions'].hidden,true);assert.equal(elements['aq267-opening-balances'].hidden,false);
 context.update({...granted,features:{}});assert.ok(Object.values(elements).every(x=>x.hidden));
 context.update(null);assert.ok(Object.values(elements).every(x=>x.hidden));
});
