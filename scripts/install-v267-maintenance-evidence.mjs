import {readFileSync,writeFileSync} from 'node:fs';

const target=new URL('../src/v267/pages/property-hub.js',import.meta.url);
let source=readFileSync(target,'utf8');
const functionMarker="async function maintenanceEvidence(){d.close();const m=await import('./maintenance-evidence.js');return m.openMaintenanceEvidence(propertyId);}";
const legalAnchor=" async function propertyLegal(){d.close();const m=await import('./property-legal.js');return m.openPropertyLegalFile(propertyId);}";
const opsAnchor="const ops=section('الصيانة والموظفون والتنبيهات');";
const opsInjection="const ops=section('الصيانة والموظفون والتنبيهات');if(access?.permissions?.maintenance?.read===true)ops.append(button('أدلة الصيانة قبل/بعد ومؤشرات الزمن',maintenanceEvidence));";

if(!source.includes(functionMarker)){
 if(!source.includes(legalAnchor))throw Error('MAINTENANCE_EVIDENCE_PROPERTY_HUB_FUNCTION_ANCHOR_MISSING');
 source=source.replace(legalAnchor,legalAnchor+'\n '+functionMarker);
}
if(!source.includes("أدلة الصيانة قبل/بعد ومؤشرات الزمن")){
 if(!source.includes(opsAnchor))throw Error('MAINTENANCE_EVIDENCE_PROPERTY_HUB_OPS_ANCHOR_MISSING');
 source=source.replace(opsAnchor,opsInjection);
}
if(!source.includes(functionMarker)||!source.includes("أدلة الصيانة قبل/بعد ومؤشرات الزمن"))throw Error('MAINTENANCE_EVIDENCE_INSTALL_FAILED');
writeFileSync(target,source);
console.log('Installed V267 maintenance evidence entry into Property Hub for this build.');
