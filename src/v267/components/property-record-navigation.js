import {guardPageImport} from './navigation-import.js';

export async function openPropertyContract(d,propertyId,contract,loader=()=>guardPageImport(()=>import('../pages/rental-contracts.js'))){
 const rows=await d.session.request(d.session.client.from('aqari_leases').select('external_ref,aqari_units!inner(property_id)').eq('workspace_id',d.session.bound.workspace).eq('id',contract.id).eq('aqari_units.property_id',propertyId));
 d.session.check();
 if(rows?.length!==1||!rows[0].external_ref)throw Error('تعذر تأكيد ربط العقد بالعقار.');
 const page=await loader();d.session.check();
 if(typeof page.openRentalContracts!=='function')throw Error('تعذر فتح العقد.');
 d.close();return page.openRentalContracts({id:rows[0].external_ref,propertyId});
}

export async function openPropertySavedStatements(d,propertyId,loader=()=>guardPageImport(()=>import('../pages/property-statements.js'))){
 const page=await loader();d.session.check();
 if(typeof page.openPropertyStatements!=='function')throw Error('تعذر فتح الكشف.');
 d.close();return page.openPropertyStatements({propertyId});
}

export async function openPropertyPage(d,loader,exportName,initial){
 const page=await guardPageImport(loader);d.session.check();
 if(typeof page[exportName]!=='function')throw Error('تعذر فتح الصفحة المطلوبة.');
 d.close();return page[exportName](initial);
}
