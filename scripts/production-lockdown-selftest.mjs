import fs from 'node:fs';

const required = [
  'production-lockdown.js',
  'production-lockdown.css',
  'api/production-meta.js'
];

let failed = false;
for(const f of required){
  if(!fs.existsSync(f)){
    console.error('Missing', f);
    failed = true;
  }
}

const html = fs.readFileSync('index.html','utf8');
for(const ref of ['/production-lockdown.js','/production-lockdown.css']){
  if(!html.includes(ref)){
    console.error('Missing reference', ref);
    failed = true;
  }
}

if(!html.includes('<meta name="aqari-release" content="V203">')){
  console.error('V203 public release marker missing');
  failed = true;
}

if(failed) process.exit(1);
console.log('AQARI V203 production lockdown self-test: PASS');

