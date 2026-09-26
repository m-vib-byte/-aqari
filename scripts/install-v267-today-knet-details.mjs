import {readFileSync,writeFileSync} from 'node:fs';
import {patchProtectedKnetApi,patchTodayKnetUi,KNET_API_MARKER,KNET_UI_MARKER} from '../src/v267/support/today-knet-details-patch.js';

const protectedTarget=new URL('../v202-property-os.js',import.meta.url);
const protectedBefore=readFileSync(protectedTarget,'utf8');
const protectedAfter=patchProtectedKnetApi(protectedBefore);
if(protectedAfter!==protectedBefore){
  writeFileSync(protectedTarget,protectedAfter);
  console.log('Installed protected V267 KNET daily API for this build.');
}else if(protectedBefore.includes(KNET_API_MARKER)){
  console.log('Protected V267 KNET daily API already present.');
}else{
  throw Error('Protected V267 KNET daily API produced no change.');
}

const uiTarget=new URL('../v210-daily-command-center.js',import.meta.url);
const uiBefore=readFileSync(uiTarget,'utf8');
const uiAfter=patchTodayKnetUi(uiBefore);
if(uiAfter!==uiBefore){
  writeFileSync(uiTarget,uiAfter);
  console.log('Installed V267 KNET today details UI for this build.');
}else if(uiBefore.includes(KNET_UI_MARKER)){
  console.log('V267 KNET today details UI already present.');
}else{
  throw Error('V267 KNET today details UI produced no change.');
}
