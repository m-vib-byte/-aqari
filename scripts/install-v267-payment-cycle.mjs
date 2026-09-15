import {readFileSync,writeFileSync} from 'node:fs';
import {patchContractFoundation,patchRentalContracts,FOUNDATION_MARKER,CONTRACTS_MARKER} from '../src/v267/support/payment-cycle-patch.js';

for(const [path,patch,marker]of [
 ['src/v267/pages/contract-foundation.js',patchContractFoundation,FOUNDATION_MARKER],
 ['src/v267/pages/rental-contracts.js',patchRentalContracts,CONTRACTS_MARKER]
]){
 const url=new URL('../'+path,import.meta.url),before=readFileSync(url,'utf8'),after=patch(before);
 if(after!==before){writeFileSync(url,after);console.log('Installed V267 payment-cycle integration in '+path);}
 else if(before.includes(marker))console.log('V267 payment-cycle integration already present in '+path);
 else throw Error('V267 payment-cycle integration produced no change for '+path);
}
