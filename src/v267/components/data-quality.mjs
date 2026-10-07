// Read-only observations; candidates are never corrections or merge instructions.
export function inspectQuality(data={}) {
 const {properties=[],units=[],tenants=[],leases=[],documents=[],rentPayments=[]}=data;
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
 // Archive links use external_ref, exactly as the server's entity guard does.
 // Missing scope/columns must not be treated as a confirmed missing record.
 const targets=new Map();
 for(const [type,key,rows]of [['property','properties',properties],['tenant','tenants',tenants],['lease','leases',leases]]){
  if(!Object.hasOwn(data,key)||!rows.every(row=>Object.hasOwn(row,'external_ref')))continue;
  const refs=new Map();for(const row of rows)if(typeof row.external_ref==='string'&&row.external_ref)refs.set(row.external_ref,(refs.get(row.external_ref)||0)+1);
  targets.set(type,refs);
 }
 const observations={document_without_record_link:[],document_scope_not_checked:[],document_record_not_in_scan:[],document_ambiguous_record:[]};
 for(const doc of documents){
  if(typeof doc.entity_type!=='string'||!doc.entity_type.trim()||typeof doc.entity_ref!=='string'||!doc.entity_ref.trim())observations.document_without_record_link.push(doc.id);
  else if(!targets.has(doc.entity_type))observations.document_scope_not_checked.push(doc.id);
  else {const count=targets.get(doc.entity_type).get(doc.entity_ref)||0;if(!count)observations.document_record_not_in_scan.push(doc.id);else if(count>1)observations.document_ambiguous_record.push(doc.id);}
 }
 for(const [kind,ids]of Object.entries(observations))if(ids.length)findings.push({kind,ids});
 // This reference is the rent receipt number, not a bank transfer reference.
 // Only identity metadata is inspected; no amounts or balances are inferred.
 const paymentObservations={rent_payment_without_reference:[],rent_payment_without_method:[],rent_payment_without_lease:[],rent_payment_lease_not_in_scan:[],rent_payment_scope_not_checked:[]};
 const completeLeaseScope=Object.hasOwn(data,'leases')&&leases.every(row=>typeof row.id==='string'&&row.id),leaseIds=new Set(leases.map(row=>row.id)),checkedPayments=[];
 const nonempty=value=>typeof value==='string'&&Boolean(value.trim());
 for(const payment of rentPayments){
  if(!['reference','payment_method','lease_id'].every(key=>Object.hasOwn(payment,key))){paymentObservations.rent_payment_scope_not_checked.push(payment.id);continue;}
  checkedPayments.push(payment);
  if(!nonempty(payment.reference))paymentObservations.rent_payment_without_reference.push(payment.id);
  if(!nonempty(payment.payment_method))paymentObservations.rent_payment_without_method.push(payment.id);
  if(!nonempty(payment.lease_id))paymentObservations.rent_payment_without_lease.push(payment.id);
  else if(!completeLeaseScope)paymentObservations.rent_payment_scope_not_checked.push(payment.id);
  else if(!leaseIds.has(payment.lease_id))paymentObservations.rent_payment_lease_not_in_scan.push(payment.id);
 }
 for(const [kind,ids]of Object.entries(paymentObservations))if(ids.length)findings.push({kind,ids});
 group(checkedPayments,row=>nonempty(row.reference)?row.reference:null,'rent_payment_duplicate_reference');
 return findings;
}
