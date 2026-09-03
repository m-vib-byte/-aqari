import fs from 'node:fs';

const required = [
  'cloud-sync.js',
  'supabase-adapter.js',
  'secure-auth-bridge.js',
  'public-config.js',
  'api/cloud-sync-status.js'
];

let fail = false;
for(const f of required){
  if(!fs.existsSync(f)){
    console.error('Missing', f);
    fail = true;
  }
}

const html = fs.readFileSync('index.html','utf8');
const adapter = fs.readFileSync('supabase-adapter.js','utf8');
const sync = fs.readFileSync('cloud-sync.js','utf8');
const bridge = fs.readFileSync('secure-auth-bridge.js','utf8');
if(!adapter.includes('storage: window.sessionStorage') ||
   !adapter.includes(".eq('revision', expected)") || adapter.includes('.upsert(') ||
   !adapter.includes('.update({ payload })') || !sync.includes('SENSITIVE_KEY') ||
   !sync.includes('AQARI_CLOUD_NOT_EMPTY') || !sync.includes('saveAppState(payload') ||
   !html.includes('aqari-v198-secure-cloud-js') ||
   !bridge.includes('window.login = window.cloudLoginV198')){
  console.error('Supabase session, CAS, sensitive-key, or manual transfer hardening missing');
  fail = true;
}

for(const ref of ['/public-config.js','/supabase-adapter.js','/cloud-sync.js']){
  if(!html.includes(ref)){
    console.error('index.html missing', ref);
    fail = true;
  }
}

if(fail) process.exit(1);
console.log('AQARI V203 cloud sync package self-test: PASS');

