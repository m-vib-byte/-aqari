import {readFileSync,writeFileSync} from 'node:fs';
import {patchKnetRangeFilters,KNET_RANGE_MARKER} from '../src/v267/support/knet-range-filters-patch.js';

const target=new URL('../v210-daily-command-center.js',import.meta.url);
const before=readFileSync(target,'utf8');
const after=patchKnetRangeFilters(before);
if(after!==before){writeFileSync(target,after);console.log('Installed V267 KNET date-range filters for this build.');}
else if(before.includes(KNET_RANGE_MARKER))console.log('V267 KNET date-range filters already present.');
else throw Error('V267 KNET date-range filters produced no change.');
