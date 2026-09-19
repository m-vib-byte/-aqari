import {readFileSync,writeFileSync} from 'node:fs';
import {patchTodayPayments,TODAY_PAYMENTS_MARKER} from '../src/v267/support/today-payments-patch.js';
import {patchDailyPaymentDetails,PAYMENT_DETAIL_MARKER} from '../src/v267/support/payment-detail-patch.js';

const sourceTarget=new URL('../v202-property-os.js',import.meta.url);
const sourceBefore=readFileSync(sourceTarget,'utf8');
const sourceAfter=patchDailyPaymentDetails(sourceBefore);
if(sourceAfter!==sourceBefore){
  writeFileSync(sourceTarget,sourceAfter);
  console.log('Installed protected V267 payment detail source for this build.');
}else if(!sourceBefore.includes(PAYMENT_DETAIL_MARKER)){
  throw Error('V267 protected payment detail integration produced no change.');
}

const target=new URL('../v210-daily-command-center.js',import.meta.url);
const before=readFileSync(target,'utf8');
const after=patchTodayPayments(before);
if(after!==before){
  writeFileSync(target,after);
  console.log('Installed bounded V267 today payments integration for this build.');
}else if(before.includes(TODAY_PAYMENTS_MARKER)){
  console.log('V267 today payments integration already present.');
}else{
  throw Error('V267 today payments integration produced no change.');
}
