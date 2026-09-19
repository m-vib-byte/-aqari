import {readFileSync,writeFileSync} from 'node:fs';

const target=new URL('../src/v267/pages/property-hub.js',import.meta.url);
let source=readFileSync(target,'utf8');
const functionMarker="async function maintenanceEvidence(){d.close();const m=await import('./maintenance-evidence.js');return m.openMaintenanceEvidence(propertyId);}";
const functionAnchor="async function ownershipProfile(){d.close();const m=await import('./property-ownership.js');return m.openPropertyOwnership(propertyId);}";
const ui=text=>source.includes("t as translateStatic")?"translateStatic('"+text+"')":"'"+text+"'";
const opsAnchor="const ops=section("+ui('الصيانة والموظفون والتنبيهات')+");";
const opsInjection=opsAnchor+"if(access?.permissions?.maintenance?.read===true)ops.append(button("+ui('أدلة الصيانة قبل/بعد ومؤشرات الزمن')+",maintenanceEvidence));";

if(!source.includes('openMaintenanceEvidence(propertyId)')){
 if(!source.includes(functionAnchor))throw Error('MAINTENANCE_EVIDENCE_PROPERTY_HUB_FUNCTION_ANCHOR_MISSING');
 source=source.replace(functionAnchor,functionAnchor+'\n '+functionMarker);
}
if(!source.includes('أدلة الصيانة قبل/بعد ومؤشرات الزمن')){
 if(!source.includes(opsAnchor))throw Error('MAINTENANCE_EVIDENCE_PROPERTY_HUB_OPS_ANCHOR_MISSING');
 source=source.replace(opsAnchor,opsInjection);
}
if(!source.includes('openMaintenanceEvidence(propertyId)')||!source.includes('أدلة الصيانة قبل/بعد ومؤشرات الزمن'))throw Error('MAINTENANCE_EVIDENCE_INSTALL_FAILED');
writeFileSync(target,source);
console.log('Installed V267 maintenance evidence/SLA entry into current Property Hub.');

