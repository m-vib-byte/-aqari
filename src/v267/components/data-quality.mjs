// Read-only observations; candidates are never corrections or merge instructions.
export function inspectQuality({units=[],tenants=[],leases=[]}) {
 const findings=[];
 const group=(rows,key,kind)=>{const groups=new Map();for(const row of rows){const value=key(row);if(!value)continue;const list=groups.get(value)||[];list.push(row.id);groups.set(value,list);}for(const ids of groups.values())if(ids.length>1)findings.push({kind,ids});};
 group(units,r=>r.property_id&&r.unit_no?.trim()?r.property_id+':'+r.unit_no.trim():null,'duplicate_unit');
 group(tenants,r=>r.civil_id?.replace(/[\s-]/g,''),'possible_duplicate_civil_id');
 group(tenants,r=>r.phone?.replace(/[\s()-]/g,''),'shared_phone_review');
 for(const row of tenants)if(!row.full_name?.trim())findings.push({kind:'missing_name',ids:[row.id]});
 const draft=leases.filter(r=>r.status==='draft');
 if(draft.length)findings.push({kind:'draft_leases',ids:draft.map(r=>r.id)});
 const missing=leases.filter(r=>!r.start_date||!r.end_date);
 if(missing.length)findings.push({kind:'pending_contract_dates',ids:missing.map(r=>r.id)});
 return findings;
}
