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

// Preserve the existing feedback layer but harden the shortcut and WebKit CSS escape lookup.
const runtimePath=new URL('../src/v267/owner-feedback-runtime.js',import.meta.url);
let runtime=readFileSync(runtimePath,'utf8');
runtime=runtime.replaceAll('CSS?.escape?.','globalThis.CSS?.escape?.');
const oldShortcut="window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&scope()){event.preventDefault();openAssistant();}});";
const newShortcut="document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&scope()){event.preventDefault();event.stopImmediatePropagation();openAssistant();}},true);";
if(runtime.includes(oldShortcut))runtime=runtime.replace(oldShortcut,newShortcut);
else if(!runtime.includes("event.stopImmediatePropagation();openAssistant();}},true)"))throw Error('V267_OWNER_ASSISTANT_SHORTCUT_ANCHOR_MISSING');
if(runtime.includes(oldShortcut)||!runtime.includes('globalThis.CSS?.escape?.'))throw Error('V267_OWNER_FEEDBACK_HARDENING_INCOMPLETE');
writeFileSync(runtimePath,runtime);

// Final owner-test layer: warm beige/brown/gold theme plus permission-rechecked navigation.
release=readFileSync(releasePath,'utf8');
const finalMarker='/* AQARI V267 final beige owner-test loader */';
if(!release.includes(finalMarker)){
 release+=`\n${finalMarker}\n;(function(){\n  function loadOwnerFinal(){\n    if(document.getElementById('aqari-v267-owner-final-js'))return;\n    const script=document.createElement('script');script.id='aqari-v267-owner-final-js';script.type='module';\n    script.src='/src/v267/owner-final-runtime.js?release=V267';document.body.appendChild(script);\n  }\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOwnerFinal,{once:true});else loadOwnerFinal();\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 final warm-beige owner-test runtime loader.');
}

// The standalone login uses the same final identity, layered after the prior compatible skin.
const loginPath=new URL('../login.html',import.meta.url);let login=readFileSync(loginPath,'utf8');
const finalLoginCss='<link id="aqari-v267-owner-final-login-css" rel="stylesheet" href="/src/v267/styles/owner-final-login.css?release=V267">';
if(!login.includes('aqari-v267-owner-final-login-css')){
 if(!login.includes('</head>'))throw Error('V267_OWNER_FINAL_LOGIN_HEAD_ANCHOR_MISSING');
 login=login.replace('</head>',finalLoginCss+'\n</head>');writeFileSync(loginPath,login);
}

for(const path of [
 'src/v267/owner-feedback-runtime.js','src/v267/owner-final-runtime.js','src/v267/pages/owner-experience-settings.js',
 'api/owner-assistant.js','api/owner-report-delivery.js','final-release-ui.js'
])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-owner-feedback-batch.test.mjs','tests/v267-owner-final-batch.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 owner feedback/final batch: real navigation, beige reference identity, OpenAI boundary, guest control and owner delivery targets.');
