import {readFileSync,writeFileSync} from 'node:fs';

const sessionUrl=new URL('../src/v267/api/partner-session.js',import.meta.url);
let session=readFileSync(sessionUrl,'utf8');
if(!session.includes("aqari_partner_property_finance")){
 const allowed="if(!['summary','distributions','owner_fields'].includes(kind)";
 const ownerCondition="||kind==='owner_fields'&&(!propertyId||!workspaceId))throw Error('PARTNER_INVALID_SELECTION');";
 const rpc="const rpcName=kind==='distributions'?'aqari_partner_distribution_statement':kind==='owner_fields'?'aqari_partner_owner_fields':'aqari_partner_summary';";
 const scope="if(data.property_id!==propertyId||data.workspace_id!==workspaceId||kind!=='owner_fields'&&data.month!==month)throw Error('PARTNER_SCOPE_MISMATCH');";
 const validate="if(kind==='owner_fields')validateOwnerFields(data);";
 if(!session.includes(allowed)||!session.includes(ownerCondition)||!session.includes(rpc)||!session.includes(scope)||!session.includes(validate))throw Error('V267 partner finance session anchor not found.');
 session=session.replace(allowed,"if(!['summary','distributions','owner_fields','finance'].includes(kind)");
 session=session.replace(ownerCondition,"||kind==='owner_fields'&&(!propertyId||!workspaceId)\n   ||kind==='finance'&&(!propertyId||!workspaceId||!/^\\d{4}-(0[1-9]|1[0-2])-01$/.test(month||'')))throw Error('PARTNER_INVALID_SELECTION');");
 session=session.replace(rpc,"const rpcName=kind==='distributions'?'aqari_partner_distribution_statement':kind==='owner_fields'?'aqari_partner_owner_fields':kind==='finance'?'aqari_partner_property_finance':'aqari_partner_summary';");
 session=session.replace(scope,"if(data.property_id!==propertyId||data.workspace_id!==workspaceId)throw Error('PARTNER_SCOPE_MISMATCH');\n    if(kind==='finance'&&data.period!==month||kind!=='finance'&&kind!=='owner_fields'&&data.month!==month)throw Error('PARTNER_SCOPE_MISMATCH');");
 session=session.replace(validate,`if(kind==='owner_fields')validateOwnerFields(data);\n   if(kind==='finance'){\n    const integer=value=>typeof value==='string'&&/^-?(0|[1-9]\\d{0,17})$/.test(value);\n    if(data.currency!=='KWD'||typeof data.available!=='boolean'||!/^\\d{4}-\\d{2}-01$/.test(data.period||''))throw Error('PARTNER_FINANCE_INVALID');\n    if(!data.available){if(data.reason!=='FUTURE_MONTH')throw Error('PARTNER_FINANCE_INVALID');}\n    else{\n     if(typeof data.complete!=='boolean'||!integer(data.arrears_fils)||!['','UNALLOCATED_SHARED_PAYROLL'].includes(data.warning)||!data.month||!data.year)throw Error('PARTNER_FINANCE_INVALID');\n     for(const bucket of [data.month,data.year])for(const key of ['income_fils','expected_income_fils','expenses_fils','net_fils','collection_variance_fils'])if(!integer(bucket[key]))throw Error('PARTNER_FINANCE_INVALID');\n     if(data.complete&&data.warning!==''||!data.complete&&data.warning!=='UNALLOCATED_SHARED_PAYROLL')throw Error('PARTNER_FINANCE_INVALID');\n    }\n   }`);
 writeFileSync(sessionUrl,session);
 console.log('Installed bounded V267 partner finance session integration for this build.');
}else console.log('V267 partner finance session integration already present.');

const portalUrl=new URL('../v267-partner-portal.js',import.meta.url);
let portal=readFileSync(portalUrl,'utf8');
if(!portal.includes('partnerPropertyFinanceView')){
 const importAnchor="import {partnerDistributionView} from './src/v267/components/partner-distribution-view.js';";
 const ownerRead="const ownerFields=await session.read({propertyId:property.id,workspaceId:property.workspace_id,kind:'owner_fields'});if(ticket!==operation)return;";
 const append="const ownerView=ownerFieldsView(ownerFields);$('partnerSummary').append(heading,list,partnerDistributionView(distributions));if(ownerView)$('partnerSummary').append(ownerView);notice('تمت قراءة البيانات المصرح بها من قاعدة البيانات.');";
 if(!portal.includes(importAnchor)||!portal.includes(ownerRead)||!portal.includes(append))throw Error('V267 partner finance portal anchor not found.');
 portal=portal.replace(importAnchor,importAnchor+"\nimport {partnerPropertyFinanceView} from './src/v267/components/partner-property-finance-view.js';");
 portal=portal.replace(ownerRead,"const finance=await session.read({propertyId:property.id,workspaceId:property.workspace_id,month:month+'-01',kind:'finance'});if(ticket!==operation)return;\n "+ownerRead);
 portal=portal.replace(append,"const ownerView=ownerFieldsView(ownerFields);$('partnerSummary').append(heading,list,partnerPropertyFinanceView(finance,{propertyName:property.name,period:month}),partnerDistributionView(distributions));if(ownerView)$('partnerSummary').append(ownerView);notice('تمت قراءة البيانات المصرح بها من قاعدة البيانات.');");
 writeFileSync(portalUrl,portal);
 console.log('Installed bounded V267 partner finance portal integration for this build.');
}else console.log('V267 partner finance portal integration already present.');
