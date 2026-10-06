// Read-only observations; candidates are never corrections or merge instructions.
export function inspectQuality({properties=[],units=[],tenants=[],leases=[]}) {
 const findings=[];
 const group=(rows,key,kind)=>{const groups=new Map();for(const row of rows){const value=key(row);if(!value)continue;const list=groups.get(value)||[];list.push(row.id);groups.set(value,list);}for(const ids of groups.values())if(ids.length>1)findings.push({kind,ids});};
 group(units,r=>r.property_id&&r.unit_no?.trim()?r.property_id+':'+r.unit_no.trim():null,'duplicate_unit');
 const unitProperties=new Set(units.map(r=>r.property_id).filter(Boolean));
 const incompleteProperties=properties.filter(r=>r?.id&&r?.metadata?.source_only!==true&&String(r?.metadata?.source_only??'').toLowerCase()!=='true'&&!unitProperties.has(r.id));
 if(incompleteProperties.length)findings.push({kind:'property_without_units',ids:incompleteProperties.map(r=>r.id)});
 group(tenants,r=>r.civil_id?.replace(/[\s-]/g,''),'possible_duplicate_civil_id');
 group(tenants,r=>r.phone?.replace(/[\s()-]/g,''),'shared_phone_review');
 for(const row of tenants)if(!row.full_name?.trim())findings.push({kind:'missing_name',ids:[row.id]});
 const draft=leases.filter(r=>r.status==='draft');
 if(draft.length)findings.push({kind:'draft_leases',ids:draft.map(r=>r.id)});
 const missing=leases.filter(r=>!r.start_date||!r.end_date);
 if(missing.length)findings.push({kind:'pending_contract_dates',ids:missing.map(r=>r.id)});
 // Absence from the completed, scoped scan is a review candidate, not proof
 // of a deleted record. Older callers that omitted link fields make no claim.
 for(const [key,records,emptyKind,absentKind]of [
  ['unit_id',units,'lease_without_unit','lease_unit_not_in_scan'],
  ['tenant_id',tenants,'lease_without_tenant','lease_tenant_not_in_scan']
 ]){
  const ids=new Set(records.map(r=>r.id)),selected=leases.filter(r=>Object.hasOwn(r,key));
  const empty=selected.filter(r=>!r[key]),absent=selected.filter(r=>r[key]&&!ids.has(r[key]));
  if(empty.length)findings.push({kind:emptyKind,ids:empty.map(r=>r.id)});
  if(absent.length)findings.push({kind:absentKind,ids:absent.map(r=>r.id)});
 }
 return findings;
}
