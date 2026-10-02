// Read-only starting structures, not approved legal forms or saved records.
// A library card creates an independent in-memory draft; persistence remains
// the editor's responsibility after the owner edits or explicitly saves it.
import {documentFieldCatalog} from './rental-document-cycle.js';
import {defaultTemplatePresentation} from './rental-document-layout.js';

const field=(key,required=true)=>{
 const {label,type}=documentFieldCatalog[key];
 return {key,label,type,required};
};
const detail=(key,label)=>({key,label,type:'text',required:false});
const row=(key,english)=>documentFieldCatalog[key].label+' / '+english+': {{'+key+'}}';
const section=(title,entries)=>({title,text:entries.map(([key,english])=>row(key,english)).join('\n')});
const details=(title,key)=>({title,text:'{{'+key+'}}'});
const freeze=value=>{
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
};
const starter=(starterId,kind,kind_label,title,fields,clauses)=>({starterId,kind,kind_label,title,fields,clauses,presentation:defaultTemplatePresentation(kind)});

/** Only headings and empty labelled slots are provided. The owner supplies
 * and reviews the legal wording; no names, addresses, balances, quantities,
 * promises, acknowledgements, signature marks or approval are prefilled.
 */
export const rentalTemplateStarters=freeze([
 ...[
  ['starter-investment-apartment-v1','investment_apartment','عقد شقة استثمارية'],
  ['starter-commercial-shop-v1','commercial_shop','عقد محل'],
  ['starter-house-apartment-v1','house_apartment','عقد شقة داخل بيت']
 ].map(([id,kind,label])=>starter(id,kind,label,'مسودة '+label,
  ['property_name','unit_no','owner_name','tenant_name','tenant_civil_id','start_date','end_date','monthly_rent'].filter(key=>documentFieldCatalog[key]).map(key=>field(key)).concat(detail('contract_terms','بنود العقد / Contract terms')),
  [{title:'بيانات العقد / Contract details',text:'اسم العقار: {{property_name}}\nالوحدة: {{unit_no}}\nالمالك: {{owner_name}}\nالمستأجر: {{tenant_name}}'},
   section('بيانات المستأجر / Tenant identity',[['tenant_civil_id','Civil ID']]),
   section('مدة العقد والإيجار / Lease term and rent',[['start_date','Start Date'],['end_date','End Date'],['monthly_rent','Monthly Rent (KWD)']]),
   {title:'بنود العقد / Contract terms',text:'{{contract_terms}}'}]
 )),
 starter('starter-rent-receipt-v1','rent_receipt','وصل إيجار','مسودة وصل إيجار',[
  ...['receipt_no','receipt_date','tenant_name','property_name','unit_no','contract_no','rent_period','amount','payment_method'].map(key=>field(key)),
  ...['payment_reference','receiver_name','accountant_name'].map(key=>field(key,false))
 ],[
  section('وصل إيجار / Rent Voucher',[
   ['receipt_no','Receipt No.'],['receipt_date','Date'],['tenant_name','Tenant Name']
  ]),
  section('بيانات الإيجار / Rental Details',[
   ['contract_no','Contract No.'],['property_name','Property'],['unit_no','Unit No.'],['rent_period','Rental Period']
  ]),
  section('المبلغ وطريقة الدفع / Amount and Payment Method',[
   ['amount','Amount'],['payment_method','Payment Method'],['payment_reference','Payment Reference']
  ]),
  section('المستلم والمحاسب / Receiver and Accountant',[
   ['receiver_name','Receiver Name'],['accountant_name','Accountant Name']
  ])
 ]),
 starter('starter-eviction-v1','eviction','تعهد بالإخلاء','مسودة تعهد بالإخلاء',[
  ...['document_no','issued_at','owner_name','tenant_name','tenant_civil_id','tenant_nationality','contract_no','contract_date','property_name','floor_no','unit_no','vacate_date'].map(key=>field(key)),
  field('property_address',false)
 ],[
  section('قرار تعهد بالإخلاء من المستأجر / Tenant Pledge to Evict',[
   ['document_no','Document No.'],['issued_at','Issue Date']
  ]),
  section('بيانات الأطراف / Party Details',[
   ['owner_name','Property Owner'],['tenant_name','Tenant Name'],['tenant_civil_id','Civil ID'],['tenant_nationality','Nationality']
  ]),
  section('العقد والوحدة / Contract and Unit',[
   ['contract_no','Contract No.'],['contract_date','Contract Date'],['property_name','Property'],['property_address','Address'],['floor_no','Floor'],['unit_no','Unit No.']
  ]),
  section('تاريخ الإخلاء / Vacation Date',[
   ['vacate_date','Vacation Date']
  ])
 ]),
 starter('starter-apartment-handover-v1','apartment_handover','استلام الوحدة / الشقة','مسودة استلام وحدة',[
  ...['contract_no','property_name','floor_no','unit_no','tenant_name','tenant_civil_id','tenant_nationality','handover_date'].map(key=>field(key)),
  detail('handover_sanitary_items','الأدوات الصحية'),
  detail('handover_electrical_items','الأدوات الكهربائية'),
  detail('handover_carpentry_items','أدوات النجارة والمنيوم والزجاج'),
  detail('handover_keys_details','المفاتيح'),
  detail('handover_decor_details','الديكور والدهان والسيراميك'),
  field('key_count',false),field('unit_condition',false)
 ],[
  section('استلام الوحدة / Apartment Handover',[
   ['contract_no','Contract No.'],['property_name','Property'],['floor_no','Floor'],['unit_no','Unit No.'],['handover_date','Handover Date']
  ]),
  section('بيانات المستأجر / Tenant Details',[
   ['tenant_name','Name'],['tenant_civil_id','Civil ID'],['tenant_nationality','Nationality']
  ]),
  details('الأدوات الصحية / Sanitary Ware','handover_sanitary_items'),
  details('الأدوات الكهربائية / Electrical Equipment','handover_electrical_items'),
  details('أدوات النجارة والمنيوم والزجاج / Carpentry, Aluminium and Glass','handover_carpentry_items'),
  details('المفاتيح / Keys','handover_keys_details'),
  details('الديكور والدهان والسيراميك / Decoration, Paint and Ceramics','handover_decor_details'),
  section('بيانات الوحدة / Unit Details',[
   ['key_count','Number of Keys'],['unit_condition','Unit Condition']
  ])
 ]),
 starter('starter-owner-final-clearance-v1','owner_final_clearance','براءة ذمة ومخالصة نهائية','مسودة براءة ذمة ومخالصة نهائية',[
  ...['document_no','issued_at','owner_name','tenant_name','tenant_civil_id','tenant_nationality','property_name','floor_no','unit_no','contract_no','start_date','end_date'].map(key=>field(key)),
  ...['owner_civil_id','representative_name','property_address','settlement_reference','net_balance'].map(key=>field(key,false))
 ],[
  section('براءة ذمة ومخالصة نهائية من مالك العقار / Clearance and Final Discharge from the Property Owner',[
   ['document_no','Document No.'],['issued_at','Issue Date']
  ]),
  section('المالك والوكيل / Owner and Representative',[
   ['owner_name','Property Owner'],['owner_civil_id','Owner Civil ID'],['representative_name','Representative Name']
  ]),
  section('بيانات المستأجر / Tenant Details',[
   ['tenant_name','Name'],['tenant_civil_id','Civil ID'],['tenant_nationality','Nationality']
  ]),
  section('العقد والوحدة / Contract and Unit',[
   ['contract_no','Contract No.'],['start_date','Contract Start'],['end_date','Contract End'],['property_name','Property'],['property_address','Address'],['floor_no','Floor'],['unit_no','Unit No.']
  ]),
  section('بيانات التسوية / Settlement Details',[
   ['settlement_reference','Settlement Reference'],['net_balance','Final Balance']
  ])
 ])
]);

/** A starter identifier must never be used as a database/family identifier. */
export function cloneRentalTemplateStarter(starterId,{createId=()=>globalThis.crypto.randomUUID()}={}){
 const source=rentalTemplateStarters.find(item=>item.starterId===starterId);
 if(!source)throw Error('مسودة البداية غير موجودة؛ اختر إحدى المسودات المتاحة.');
 const id=createId();
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('تعذر إنشاء معرّف مستقل للمسودة؛ أعد فتحها.');
 const {starterId:unused,...contents}=JSON.parse(JSON.stringify(source));
 return {id,family_id:id,revision:0,status:'draft',_unsaved:true,...contents};
}
