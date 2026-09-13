const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('v202-property-os.js','utf8');
function fixture(){
 const scope={userId:'payment-user',workspaceId:'payment-workspace'},elements={v202PaymentError:{textContent:''}};
 const contract={id:'payment-contract',contract_no:'PAYMENT-CONTRACT',tenant:'مستأجر اختبار',property:'عقار اختبار الدفع',unit:'1',rent:100,status:'signed',start_date:'2026-01-01',end_date:'2028-12-31',source:'v267-cloud'};
 const data={properties:[[contract.property]],contractsV202:[contract],collections:[],rentLedgerV202:[],rentReceiptsV267:[],audit:[]};
 const values={v202PaymentContract:contract.id,v202PaymentNumber:'RECEIPT-TEST',v202PaymentAmount:'10',v202PaymentStatus:'مدفوع',v202PaymentPeriod:'2026-09',v202PaymentDate:'2026-09-10',v202PaymentMethod:'',v267PaymentTransaction:'',v202PaymentNote:''};
 for(const [id,value]of Object.entries(values))elements[id]={value};
 const saved=[];
 const window={AQARI_DATA_GATE:{scope},AQARI_EARLY_STORAGE_GATE:{scope},AQARI_SUPABASE:{context:{user:{id:scope.userId},workspace:{id:scope.workspaceId},membership:{is_active:true,user_id:scope.userId,workspace_id:scope.workspaceId,role:'general_manager'}}}};
 const document={readyState:'loading',documentElement:{classList:{contains:()=>true}},addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById:id=>elements[id]||null,createElement:()=>({}),head:{appendChild(){}},body:{children:[],classList:{add(){},remove(){},toggle(){}}}};
 const context={window,document,db:data,console,setTimeout(){},clearTimeout(){},requestAnimationFrame(){},localContractsV55:()=>[],saved};
 const end=source.lastIndexOf('})();');
 // Only replace the transport boundary; use the real form, lookup and submission code.
 const expose='globalThis.api={paymentDialogMarkup,paymentMethodReferenceError,savePayment,savedVoucher,contextFor};activeProperty='+JSON.stringify(contract.property)+';commitPayment=(record,ledger)=>{saved.push({record,ledger});return true;};';
 vm.runInNewContext(source.slice(0,end)+expose+source.slice(end),context);
 return {api:context.api,elements,data,contract,saved,submit:()=>context.api.savePayment({preventDefault(){}})};
}
test('the rent form requires an explicit payment choice and a reference including cash',()=>{
 const f=fixture(),html=f.api.paymentDialogMarkup(f.api.contextFor(f.contract.property));
 assert.match(html,/<select id="v202PaymentMethod" required><option value="">اختر طريقة الدفع<\/option>/);
 assert.match(html,/<input id="v267PaymentTransaction"[^>]*required/);
 assert.match(html,/سند القبض النقدي/);assert.doesNotMatch(html,/إلزامي لغير الكاش/);
});
test('missing or unsupported payment methods cannot reach submission',()=>{
 for(const method of ['',undefined,'غير محدد','bitcoin','كي نت ']){
  const f=fixture();f.elements.v202PaymentMethod.value=method;f.elements.v267PaymentTransaction.value='TX-TEST';
  assert.equal(f.submit(),false);assert.equal(f.saved.length,0);assert.match(f.elements.v202PaymentError.textContent,/اختر طريقة دفع/);
 }
});
test('all known methods reject absent, placeholder, control-character and oversized references',()=>{
 const f=fixture();for(const method of ['كي نت','KNET','knet','تحويل بنكي','bank','نقدي','cash','شيك','cheque','أخرى','other']){
  for(const reference of ['',null,undefined,'   ','\u00A0','\u00A0\u1680\u2007\u202F\u205F\u3000','—','N/A','غير مسجل','TX\n1','TX\u200B1','TX\u061C1','TX\u00AD1','TX\u180E1','x'.repeat(151)])assert.match(f.api.paymentMethodReferenceError(method,reference),/مرجع الحركة/);
  assert.equal(f.api.paymentMethodReferenceError(method,'TX-001'),'');
  assert.equal(f.api.paymentMethodReferenceError(method,'سند نقدي-١٢٣'),'');
 }
});
test('cash is blocked without a reference and keeps the entered reference when saved',()=>{
 const f=fixture();f.elements.v202PaymentMethod.value='نقدي';assert.equal(f.submit(),false);assert.equal(f.saved.length,0);
 f.elements.v267PaymentTransaction.value='  CASH-0007  ';assert.equal(f.submit(),true);assert.equal(f.saved.length,1);
 assert.equal(f.saved[0].record[9],'نقدي');assert.equal(f.saved[0].ledger.transactionNo,'CASH-0007');
});
test('each selectable method and a known legacy alias reaches the same linked payment boundary',()=>{
 for(const method of ['كي نت','تحويل بنكي','نقدي','شيك','أخرى','KNET']){
  const f=fixture();f.elements.v202PaymentMethod.value=method;f.elements.v267PaymentTransaction.value='TX-'+method;
  assert.equal(f.submit(),true,f.elements.v202PaymentError.textContent);assert.equal(f.saved[0].record[9],method);assert.equal(f.saved[0].ledger.method,method);assert.equal(f.saved[0].ledger.transactionNo,'TX-'+method);
 }
});
test('voucher prints the saved movement reference and does not invent one for old receipts',()=>{
 const f=fixture(),record=['RECEIPT-TEST',f.contract.tenant,10,'جزئي',f.contract.property,'2026-09-10','1','','2026-09','نقدي'];
 f.data.collections.push(record);f.data.rentLedgerV202.push({id:'rent-RECEIPT-TEST',receiptNo:'RECEIPT-TEST',contractId:f.contract.id,contractNo:f.contract.contract_no,property:f.contract.property,tenant:f.contract.tenant,unit:'1',paid:10,due:100,period:'2026-09',paidAt:'2026-09-10',method:'نقدي',status:'جزئي',source:'v202-entry'});
 const saved={id:'RECEIPT-TEST',record,contract:f.contract,brand:{ar:'عقاري'},transactionNo:'CASH-SLIP-123'};f.data.rentReceiptsV267.push(saved);
 const before=JSON.stringify(f.data),printed=f.api.savedVoucher(record);assert.match(printed,/نقدي \/ CASH-SLIP-123/);assert.equal(JSON.stringify(f.data),before);
 delete saved.transactionNo;const historical=JSON.stringify(f.data);assert.match(f.api.savedVoucher(record),/نقدي \/ غير مدون/);assert.doesNotMatch(f.api.savedVoucher(record),/نقدي \/ RECEIPT-TEST/);assert.equal(JSON.stringify(f.data),historical);
});
