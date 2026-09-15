import {readFileSync,writeFileSync} from 'node:fs';
import {patchProtectedKnetRangeApi,patchKnetRangeUi,KNET_RANGE_API_MARKER,KNET_RANGE_UI_MARKER} from '../src/v267/support/knet-range-patch.js';

const protectedTarget=new URL('../v202-property-os.js',import.meta.url);
const protectedBefore=readFileSync(protectedTarget,'utf8');
const protectedAfter=patchProtectedKnetRangeApi(protectedBefore);
if(protectedAfter!==protectedBefore){
  writeFileSync(protectedTarget,protectedAfter);
  console.log('Installed protected V267 KNET range API for this build.');
}else if(protectedBefore.includes(KNET_RANGE_API_MARKER)){
  console.log('Protected V267 KNET range API already present.');
}else{
  throw Error('Protected V267 KNET range API produced no change.');
}

const uiTarget=new URL('../v210-daily-command-center.js',import.meta.url);
const uiBefore=readFileSync(uiTarget,'utf8');
const uiAfter=patchKnetRangeUi(uiBefore);
if(uiAfter!==uiBefore){
  writeFileSync(uiTarget,uiAfter);
  console.log('Installed V267 KNET range UI for this build.');
}else if(uiBefore.includes(KNET_RANGE_UI_MARKER)){
  console.log('V267 KNET range UI already present.');
}else{
  throw Error('V267 KNET range UI produced no change.');
}
