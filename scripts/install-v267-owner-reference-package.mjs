import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const releasePath=new URL('../final-release-ui.js',import.meta.url);
let release=readFileSync(releasePath,'utf8');
const marker="aqari-v267-owner-reference-js";
if(!release.includes(marker)){
 const anchor=`    }else{\n      continueExistingScript('aqari-v199-ui-js',installV201Experience);\n    }\n  }\n\n  syncReleaseIdentity();`;
 const replacement=`    }else{\n      continueExistingScript('aqari-v199-ui-js',installV201Experience);\n    }\n\n    // Owner-approved visual/workflow package. It is an additive module only: the\n    // existing auth/data boundaries and every original page remain authoritative.\n    if(!document.getElementById('aqari-v267-owner-reference-js')){\n      const ownerReference=document.createElement('script');\n      ownerReference.id='aqari-v267-owner-reference-js';\n      ownerReference.type='module';\n      ownerReference.src=releaseAsset('/src/v267/owner-reference-runtime.js');\n      document.body.appendChild(ownerReference);\n    }\n  }\n\n  syncReleaseIdentity();`;
 if(!release.includes(anchor))throw Error('V267_OWNER_REFERENCE_LOADER_ANCHOR_MISSING');
 release=release.replace(anchor,replacement);writeFileSync(releasePath,release);
 console.log('Installed additive V267 owner-reference runtime loader.');
}else console.log('V267 owner-reference runtime loader already installed.');

for(const path of [
 'src/v267/owner-reference-runtime.js',
 'src/v267/pages/owner-task-center.js',
 'src/v267/pages/owner-report.js',
 'src/v267/pages/approval-center.js',
 'src/v267/pages/tenant-timeline.js',
 'final-release-ui.js'
])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-reference-package.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 owner-reference package without replacing existing workflows.');
