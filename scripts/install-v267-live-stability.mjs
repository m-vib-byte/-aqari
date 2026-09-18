import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const releasePath=new URL('../final-release-ui.js',import.meta.url);
let release=readFileSync(releasePath,'utf8');
const marker='/* AQARI V267 Work1 live stability loader */';
if(!release.includes(marker)){
 release+=`\n${marker}\n;(function(){\n function loadLiveStability(){\n  if(document.getElementById('aqari-v267-live-stability-js'))return;\n  const script=document.createElement('script');script.id='aqari-v267-live-stability-js';script.type='module';\n  script.src='/src/v267/live-stability-runtime.js?release=V267';document.body.appendChild(script);\n }\n window.AQARI_REGISTER_AUTH_UI(loadLiveStability);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 Work1 live visual stability layer after startup blocker fix.');
}
for(const path of ['src/v267/live-stability-runtime.js','final-release-ui.js'])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-live-stability.test.mjs'],{stdio:'inherit'});
console.log('Verified Work1 canonical shell, real-data dashboard augmentation and iPhone/iPad/Desktop stability rules.');
