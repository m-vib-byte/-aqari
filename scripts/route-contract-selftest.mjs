import fs from 'node:fs';

const expected = [
  'api/health.js',
  'api/db/status.js',
  'api/release.js',
  'api/config-status.js',
  'api/supabase-status.js',
  'api/cloud-sync-status.js',
  'api/migration-status.js',
  'api/autosync-status.js',
  'api/production-readiness.js'
];

let failed = false;
for(const f of expected){
  if(!fs.existsSync(f)){
    console.error('Missing route file:', f);
    failed = true;
  }
}

const manifest = JSON.parse(fs.readFileSync('DEPLOYMENT_MANIFEST.json','utf8'));
if(manifest.version !== 'V198'){
  console.error('Deployment manifest version mismatch');
  failed = true;
}

if(!manifest.required_routes.includes('/api/db/status')){
  console.error('Deployment manifest missing compatibility database status route');
  failed = true;
}

if(failed) process.exit(1);
console.log('AQARI V198 route contract self-test: PASS');
