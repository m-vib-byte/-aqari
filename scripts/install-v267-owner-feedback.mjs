import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const releasePath=new URL('../final-release-ui.js',import.meta.url);
let release=readFileSync(releasePath,'utf8');
const marker='/* AQARI V267 owner feedback exact-reference loader */';
if(!release.includes(marker)){
 release+=`\n${marker}\n;(function(){\n  function loadOwnerFeedback(){\n    if(document.getElementById('aqari-v267-owner-feedback-js'))return;\n    const script=document.createElement('script');\n    script.id='aqari-v267-owner-feedback-js';script.type='module';\n    script.src='/src/v267/owner-feedback-runtime.js?release=V267';\n    document.body.appendChild(script);\n  }\n  window.AQARI_REGISTER_AUTH_UI(loadOwnerFeedback);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 exact-reference owner feedback runtime loader.');
}
const runtimePath=new URL('../src/v267/owner-feedback-runtime.js',import.meta.url);
let runtime=readFileSync(runtimePath,'utf8');
runtime=runtime.replaceAll('CSS?.escape?.','globalThis.CSS?.escape?.');
const oldShortcut="window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&scope()){event.preventDefault();openAssistant();}});";
const newShortcut="document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&scope()){event.preventDefault();event.stopImmediatePropagation();openAssistant();}},true);";
if(runtime.includes(oldShortcut))runtime=runtime.replace(oldShortcut,newShortcut);
else if(!runtime.includes("event.stopImmediatePropagation();openAssistant();}},true)"))throw Error('V267_OWNER_ASSISTANT_SHORTCUT_ANCHOR_MISSING');
if(runtime.includes(oldShortcut)||!runtime.includes('globalThis.CSS?.escape?.'))throw Error('V267_OWNER_FEEDBACK_HARDENING_INCOMPLETE');
writeFileSync(runtimePath,runtime);
release=readFileSync(releasePath,'utf8');
const finalMarker='/* AQARI V267 final beige owner-test loader */';
if(!release.includes(finalMarker)){
 release+=`\n${finalMarker}\n;(function(){\n  function loadOwnerFinal(){\n    if(document.getElementById('aqari-v267-owner-final-js'))return;\n    const script=document.createElement('script');script.id='aqari-v267-owner-final-js';script.type='module';\n    script.src='/src/v267/owner-final-runtime.js?release=V267';document.body.appendChild(script);\n  }\n  window.AQARI_REGISTER_AUTH_UI(loadOwnerFinal);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 final warm-beige owner-test runtime loader.');
}

release=readFileSync(releasePath,'utf8');
const unifiedMarker='/* AQARI V267 unified structural layout loader */';
if(!release.includes(unifiedMarker)){
 release+=`\n${unifiedMarker}\n;(function(){\n function loadUnifiedLayout(){\n  if(!document.getElementById('aqari-v267-unified-layout-css')){const link=document.createElement('link');link.id='aqari-v267-unified-layout-css';link.rel='stylesheet';link.href='/src/v267/styles/unified-layout.css?release=V267';document.head.appendChild(link);}\n  if(!document.getElementById('aqari-v267-unified-virtual-css')){const link=document.createElement('link');link.id='aqari-v267-unified-virtual-css';link.rel='stylesheet';link.href='/src/v267/styles/unified-layout-virtual.css?release=V267';document.head.appendChild(link);}\n  if(document.getElementById('aqari-v267-unified-layout-js'))return;\n  const script=document.createElement('script');script.id='aqari-v267-unified-layout-js';script.type='module';script.src='/src/v267/unified-layout-runtime.js?release=V267';document.body.appendChild(script);\n }\n window.AQARI_REGISTER_AUTH_UI(loadUnifiedLayout);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 unified structural layout above compatible business workflows.');
}

release=readFileSync(releasePath,'utf8');
const premiumMarker='/* AQARI V267 premium refinement loader */';
if(!release.includes(premiumMarker)){
 release+=`\n${premiumMarker}\n;(function(){\n function loadPremiumRefinement(){\n  if(!document.getElementById('aqari-v267-premium-refinement-css')){const link=document.createElement('link');link.id='aqari-v267-premium-refinement-css';link.rel='stylesheet';link.href='/src/v267/styles/premium-refinement.css?release=V267';document.head.appendChild(link);}\n  if(document.getElementById('aqari-v267-premium-navigation-js'))return;\n  const script=document.createElement('script');script.id='aqari-v267-premium-navigation-js';script.type='module';script.src='/src/v267/premium-navigation-runtime.js?release=V267';document.body.appendChild(script);\n }\n window.AQARI_REGISTER_AUTH_UI(loadPremiumRefinement);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 premium visual refinement and direct-function navigation layer.');
}

release=readFileSync(releasePath,'utf8');
const luxuryMarker='/* AQARI V267 luxury warm beige final visual loader */';
if(!release.includes(luxuryMarker)){
 release+=`\n${luxuryMarker}\n;(function(){\n function loadLuxuryWarmBeige(){\n  let link=document.getElementById('aqari-v267-luxury-warm-css');\n  if(!link){link=document.createElement('link');link.id='aqari-v267-luxury-warm-css';link.rel='stylesheet';link.href='/src/v267/styles/luxury-warm-beige.css?release=V267';}\n  if(document.head&&document.head.lastElementChild!==link)document.head.appendChild(link);\n }\n window.AQARI_REGISTER_AUTH_UI(loadLuxuryWarmBeige);\n})();\n`;
 writeFileSync(releasePath,release);
 console.log('Installed V267 final luxury warm-beige visual layer after the existing owner surfaces.');
}

const portalCss='<link id="aqari-v267-unified-portal-css" rel="stylesheet" href="/src/v267/styles/unified-portal.css?release=V267">';
const premiumPortalCss='<link id="aqari-v267-premium-portal-css" rel="stylesheet" href="/src/v267/styles/premium-portal-refinement.css?release=V267">';
const luxuryPortalCss='<link id="aqari-v267-luxury-warm-css" rel="stylesheet" href="/src/v267/styles/luxury-warm-beige.css?release=V267">';
for(const relative of ['login.html','tenant.html','partner.html']){
 const path=new URL('../'+relative,import.meta.url);let html=readFileSync(path,'utf8');
 if(!html.includes('aqari-v267-unified-portal-css')){
  if(html.includes('</head>'))html=html.replace('</head>',portalCss+'\n</head>');
  else if(html.includes('<style>'))html=html.replace('<style>',portalCss+'\n<style>');
  else if(html.includes('<main'))html=html.replace('<main',portalCss+'\n<main');
  else throw Error('V267_UNIFIED_PORTAL_STYLE_ANCHOR_MISSING:'+relative);
 }
 if(!html.includes('aqari-v267-premium-portal-css')){
  if(html.includes('</head>'))html=html.replace('</head>',premiumPortalCss+'\n</head>');
  else if(html.includes('<style>'))html=html.replace('<style>',premiumPortalCss+'\n<style>');
  else if(html.includes('<main'))html=html.replace('<main',premiumPortalCss+'\n<main');
  else throw Error('V267_PREMIUM_PORTAL_STYLE_ANCHOR_MISSING:'+relative);
 }
 if(!html.includes('aqari-v267-luxury-warm-css')){
  if(html.includes('</head>'))html=html.replace('</head>',luxuryPortalCss+'\n</head>');
  else if(html.includes('<style>'))html=html.replace('<style>',luxuryPortalCss+'\n<style>');
  else if(html.includes('<main'))html=html.replace('<main',luxuryPortalCss+'\n<main');
  else throw Error('V267_LUXURY_PORTAL_STYLE_ANCHOR_MISSING:'+relative);
 }
 writeFileSync(path,html);
}
const loginPath=new URL('../login.html',import.meta.url);let login=readFileSync(loginPath,'utf8');
const finalLoginCss='<link id="aqari-v267-owner-final-login-css" rel="stylesheet" href="/src/v267/styles/owner-final-login.css?release=V267">';
if(!login.includes('aqari-v267-owner-final-login-css')){if(!login.includes('</head>'))throw Error('V267_OWNER_FINAL_LOGIN_HEAD_ANCHOR_MISSING');login=login.replace('</head>',finalLoginCss+'\n</head>');writeFileSync(loginPath,login);}

for(const path of ['src/v267/owner-feedback-runtime.js','src/v267/owner-final-runtime.js','src/v267/unified-layout-runtime.js','src/v267/premium-navigation-runtime.js','src/v267/pages/owner-experience-settings.js','api/owner-assistant.js','api/owner-report-delivery.js','final-release-ui.js'])execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
execFileSync(process.execPath,['--test','tests/v267-service-directory.test.mjs','tests/v267-hero-record-search.test.mjs','tests/v267-owner-feedback-batch.test.mjs','tests/v267-owner-final-batch.test.mjs','tests/v267-owner-delivery-meta.test.mjs','tests/v267-unified-layout.test.mjs','tests/v267-premium-refinement.test.mjs','tests/v267-luxury-warm-beige.test.mjs'],{stdio:'inherit'});
console.log('Verified V267 luxury warm-beige owner design across app, internal functions and portals without changing authoritative business workflows.');

await import('./install-v267-iphone-startup-fix.mjs');
await import('./install-v267-live-stability.mjs');

