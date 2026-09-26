import {readFileSync,writeFileSync} from 'node:fs';
import {patchMultiSourceProtectedHydration,MULTI_SOURCE_MARKER} from '../src/v267/support/multi-source-protected-hydration-patch.js';

const target=new URL('../v202-property-os.js',import.meta.url);
const before=readFileSync(target,'utf8');
const after=patchMultiSourceProtectedHydration(before);
if(after!==before){
  writeFileSync(target,after);
  console.log('Installed multi-source protected rent-ledger hydration for this build.');
}else if(before.includes(MULTI_SOURCE_MARKER)){
  console.log('Multi-source protected rent-ledger hydration already present.');
}else{
  throw Error('Multi-source protected hydration produced no change.');
}
