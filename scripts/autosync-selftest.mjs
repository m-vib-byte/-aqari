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

if(failed) process.exit(1);
console.log('AQARI V198 autosync self-test: PASS');
