import fs from 'node:fs';

const required = [
  'safe-autosync.js',
  'safe-autosync-ui.js',
  'safe-autosync.css',
  'api/autosync-status.js'
];

let failed = false;
for(const f of required){
  if(!fs.existsSync(f)){
    console.error('Missing',f);
    failed = true;
  }
}

const html = fs.readFileSync('index.html','utf8');
for(const ref of ['/safe-autosync.js','/safe-autosync-ui.js','/safe-autosync.css']){
  if(!html.includes(ref)){
    console.error('Missing reference',ref);
    failed = true;
  }
}

const source = fs.readFileSync('safe-autosync.js','utf8');
const ui = fs.readFileSync('safe-autosync-ui.js','utf8');
const cloud = fs.readFileSync('cloud-sync.js','utf8');
if(!source.includes("mode:'manual_only'") || !source.includes('AQARI_AUTOSYNC_DISABLED') ||
   source.includes('saveAppState') || source.includes('setTimeout(') ||
   source.includes("addEventListener('storage'") || ui.includes('syncNow(') ||
   ui.includes('uploadLocal(') || !cloud.includes('async function uploadLocal()')){
  console.error('Manual-only synchronization boundary is missing');
  failed = true;
}

if(failed) process.exit(1);
console.log('AQARI V198 autosync self-test: PASS');
