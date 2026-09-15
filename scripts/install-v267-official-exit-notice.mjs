import {readFileSync,writeFileSync} from 'node:fs';
import {patchOfficialExitNotice,EXIT_NOTICE_PATCH_MARKER} from '../src/v267/support/official-exit-notice-patch.js';
const target=new URL('../src/v267/pages/official-document-center.js',import.meta.url),before=readFileSync(target,'utf8'),after=patchOfficialExitNotice(before);
if(after!==before){writeFileSync(target,after);console.log('Installed V267 official exit notice form for this build.');}
else if(before.includes(EXIT_NOTICE_PATCH_MARKER))console.log('V267 official exit notice form already present.');
else throw Error('V267 exit notice patch produced no change.');
