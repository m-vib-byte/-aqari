import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const releasePath=new URL('../final-release-ui.js',import.meta.url);
let release=readFileSync(releasePath,'utf8');
const marker="aqari-v267-owner-reference-js";
if(!release.includes(marker)){
 const anchor=`    }else{\n      continueExistingScript('aqari-v199-ui-js',installV201Experience);\n    }\n  }\n\n  syncReleaseIdentity();`;
 const replacement=`    }else{\n      continueExistingScript('aqari-v199-ui-js',installV201Experience);\n    }\n\n    // Owner-approved visual/workflow package. It is an additive module only: the\n    // existing auth/data boundaries and every original page remain authoritative.\n    window.AQARI_REGISTER_AUTH_UI(function(){\n    if(!document.getElementById('aqari-v267-owner-reference-js')){\n      const ownerReference=document.createElement('script');\n      ownerReference.id='aqari-v267-owner-reference-js';\n      ownerReference.type='module';\n      ownerReference.src=releaseAsset('/src/v267/owner-reference-runtime.js');\n      document.body.appendChild(ownerReference);\n    }\n    });\n  }\n\n  syncReleaseIdentity();`;
 if(!release.includes(anchor))throw Error('V267_OWNER_REFERENCE_LOADER_ANCHOR_MISSING');
 release=release.replace(anchor,replacement);writeFileSync(releasePath,release);
 console.log('Installed additive V267 owner-reference runtime loader.');
}else console.log('V267 owner-reference runtime loader already installed.');

const loginPath=new URL('../login.html',import.meta.url);
let login=readFileSync(loginPath,'utf8');
const loginCss='<link id="aqari-v267-owner-login-css" rel="stylesheet" href="/src/v267/styles/owner-reference-login.css?release=V267">';
const loginJs='<script id="aqari-v267-owner-login-js" defer src="/src/v267/login-owner-reference.js?release=V267"></script>';
if(!login.includes('aqari-v267-owner-login-css')){
 if(!login.includes('</head>'))throw Error('V267_OWNER_LOGIN_HEAD_ANCHOR_MISSING');
 login=login.replace('</head>',loginCss+'\n</head>');
}
if(!login.includes('aqari-v267-owner-login-js')){
 if(!login.includes('</body>'))throw Error('V267_OWNER_LOGIN_BODY_ANCHOR_MISSING');
 login=login.replace('</body>',loginJs+'\n</body>');
}
writeFileSync(loginPath,login);
console.log('Installed owner-approved black/gold login and no-data guest preview.');

for(const path of [
 'src/v267/owner-reference-runtime.js',
 'src/v267/login-owner-reference.js',
 'src/v267/pages/owner-task-center.js',
 'src/v267/pages/owner-report.js',
 'src/v267/pages/approval-center.js',
 'src/v267/pages/tenant-timeline.js',
 'final-release-ui.js'
])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-reference-package.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 owner-reference package without replacing existing workflows.');
