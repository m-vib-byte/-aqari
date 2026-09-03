import fs from 'node:fs';

const expected = [
  'api/health.js',
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

if(fs.existsSync('api/db/status.js')){
  console.error('Legacy compatibility must not consume an extra Vercel Function');
  failed = true;
}

const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const compatibilityRewrite = vercel.rewrites?.filter((rewrite) =>
  rewrite.source === '/api/db/status'
);
if(
  compatibilityRewrite?.length !== 1 ||
  compatibilityRewrite[0].destination !== '/api/supabase-status'
){
  console.error('Missing exact legacy database status rewrite');
  failed = true;
}

const manifest = JSON.parse(fs.readFileSync('DEPLOYMENT_MANIFEST.json','utf8'));
if(manifest.version !== 'V203' || manifest.runtimeBase !== 'V198' || manifest.dataContract !== 'V202'){
  console.error('V203 deployment identity or preserved runtime/data contract mismatch');
  failed = true;
}

if(!manifest.required_routes.includes('/api/db/status')){
  console.error('Deployment manifest missing compatibility database status route');
  failed = true;
}

if(failed) process.exit(1);
console.log('AQARI V203 route contract self-test: PASS');
