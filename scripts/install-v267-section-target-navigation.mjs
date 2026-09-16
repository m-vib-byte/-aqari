import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

// Owner-test blocker fix only: once the existing router has opened and verified a
// destination, align the viewport to that destination instead of page top.
// This preserves every existing route, permission check and data key.
const path=new URL('../v199-ui.js',import.meta.url);
let source=readFileSync(path,'utf8');
const oldLine="        if(routeVisible(target)===true)window.scrollTo({top:0,behavior:'auto'});";
const newBlock=`        const page=routeNode(target);\n        if(routeVisible(target)===true&&page){\n          if(typeof page.scrollIntoView==='function')page.scrollIntoView({block:'start',behavior:'auto'});\n          else if(typeof window.scrollTo==='function'){\n            const rect=page.getBoundingClientRect?.();\n            const top=Math.max(0,(Number(rect?.top)||0)+(Number(window.scrollY)||0));\n            window.scrollTo({top,behavior:'auto'});\n          }\n        }`;
if(source.includes(oldLine))source=source.replace(oldLine,newBlock);
else if(!source.includes("page.scrollIntoView({block:'start',behavior:'auto'})"))throw Error('V267_SECTION_TARGET_NAVIGATION_ANCHOR_MISSING');
if(source.includes(oldLine))throw Error('V267_SECTION_TARGET_NAVIGATION_TOP_SCROLL_REMAINS');
if(!source.includes("page.scrollIntoView({block:'start',behavior:'auto'})"))throw Error('V267_SECTION_TARGET_NAVIGATION_MISSING');
writeFileSync(path,source);
execFileSync(process.execPath,['--check','v199-ui.js'],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-section-target-navigation.test.mjs'],{stdio:'inherit'});
console.log('Installed and verified V267 destination-aligned section navigation.');
