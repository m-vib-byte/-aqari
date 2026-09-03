import fs from 'node:fs';

const required = [
  'cloud-sync.js',
  'first-run-migration.js',
  'first-run-migration.css',
  'api/migration-status.js'
];

let failed = false;
for(const f of required){
  if(!fs.existsSync(f)){
    console.error('Missing', f);
    failed = true;
  }
}

const html = fs.readFileSync('index.html', 'utf8');
for(const ref of ['/cloud-sync.js','/first-run-migration.js','/first-run-migration.css']){
  if(!html.includes(ref)){
    console.error('Missing reference in index.html:', ref);
    failed = true;
  }
}

if(failed) process.exit(1);
console.log('AQARI V198 first-run migration self-test: PASS');
