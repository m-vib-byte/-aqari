import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const releasePath=new URL('../final-release-ui.js',import.meta.url);
let release=readFileSync(releasePath,'utf8');
const marker='/* AQARI V267 owner feedback exact-reference loader */';
if(!release.includes(marker)){
 release+=`\n${marker}\n;(function(){\n  function loadOwnerFeedback(){\n    if(document.getElementById('aqari-v267-owner-feedback-js'))return;\n    const script=document.createElement('script');\n    script.id='aqari-v267-owner-feedback-js';script.type='module';\n    script.src='/src/v267/owner-feedback-runtime.js?release=V267';\n    document.body.appendChild(script);\n  }\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOwnerFeedback,{once:true});else loadOwnerFeedback();\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 exact-reference owner feedback runtime loader.');
}
for(const path of ['src/v267/owner-feedback-runtime.js','src/v267/pages/owner-experience-settings.js','api/owner-assistant.js','api/owner-report-delivery.js'])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-feedback-batch.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 owner feedback batch: navigation, reference shell, auth boundaries, guest control and server integrations.');
