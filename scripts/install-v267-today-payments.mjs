import {readFileSync,writeFileSync} from 'node:fs';
import {patchTodayPayments,TODAY_PAYMENTS_MARKER} from '../src/v267/support/today-payments-patch.js';

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
