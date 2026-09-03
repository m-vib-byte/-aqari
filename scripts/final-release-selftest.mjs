import fs from 'node:fs';

const required = [
  'index.html',
  'pre-migration-backup.js',
  'final-release-ui.js',
  'final-release-ui.css',
  'api/final-release-status.js',
  'DEPLOYMENT_MANIFEST.json'
];

let failed = false;
for(const f of required){
  if(!fs.existsSync(f)){
    console.error('Missing',f);
    failed = true;
  }
}

const html = fs.readFileSync('index.html','utf8');
for(const ref of ['/pre-migration-backup.js','/final-release-ui.js','/final-release-ui.css']){
  if(!html.includes(ref)){
    console.error('Missing reference',ref);
    failed = true;
  }
}

if(!html.includes('<meta name="aqari-release" content="V203">')){
  console.error('V203 public release marker missing');
  failed = true;
}

if(failed) process.exit(1);
console.log('AQARI V203 final release self-test: PASS');

