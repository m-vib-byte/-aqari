// Uses the existing permission-checked property file RPC; no database writes.
export async function readCanonicalPropertyRows({client,workspace,records,check,project}){
 check();
 if(!Array.isArray(records))throw Error('INVALID_PROPERTY_LIST');
 const seen=new Set();
 for(const record of records){
  if(typeof record?.id!=='string'||!record.id||seen.has(record.id))throw Error('INVALID_PROPERTY_ID');
  seen.add(record.id);
 }
 const result=new Array(records.length);let next=0,failed=false;
 async function worker(){
  while(!failed&&next<records.length){
   check();const index=next++,record=records[index];
   const response=await client.rpc('aqari_property_full_file',{p_workspace_id:workspace,p_property_id:record.id});
   check();if(response.error)throw response.error;
   const file=response.data,property=file?.property;
   if(file?.workspace_id!==workspace||property?.id!==record.id||typeof property.name!=='string'||typeof property.address!=='string')throw Error('PROPERTY_SCOPE_OR_DATA_MISMATCH');
   const row=structuredClone(project(record));row[0]=property.name;
   let meta=row.find(value=>value?.aqariPropertyPresentation===1);
   if(!meta){meta={aqariPropertyPresentation:1,photos:[]};row.push(meta);}
   meta.location=property.address;
   result[index]=[record.id,row];
  }
 }
 const settled=await Promise.allSettled(Array.from({length:Math.min(3,records.length)},()=>worker().catch(error=>{failed=true;throw error;})));
 const rejected=settled.find(item=>item.status==='rejected');if(rejected)throw rejected.reason;
 check();return new Map(result);
}
