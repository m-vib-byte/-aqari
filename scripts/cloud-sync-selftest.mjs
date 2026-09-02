import fs from 'node:fs';

const required = [
  'cloud-sync.js',
  'supabase-adapter.js',
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

const html = fs.readFileSync('index.html', 'utf8');
for(const ref of ['/public-config.js','/supabase-adapter.js','/cloud-sync.js']){
  if(!html.includes(ref)){
    console.error('index.html missing', ref);
    fail = true;
  }
}

if(fail) process.exit(1);
console.log('AQARI V198 cloud sync package self-test: PASS');
