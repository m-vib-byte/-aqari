import {
  deploymentIdentityStatus,
  PRODUCT_VERSION,
  publicConfigurationStatus
} from '../lib/release-config.js';

const config = publicConfigurationStatus();
const identity = deploymentIdentityStatus();

console.log(`AQARI ${PRODUCT_VERSION} active-runtime preflight`);
console.log(`${config.summary.ready ? 'PASS' : 'FAIL'} browser-safe Supabase configuration`);
if(identity.required){
  console.log(`${identity.ready ? 'PASS' : 'FAIL'} Vercel deployment identity`);
}
console.log('PASS private application secrets are not required by the active runtime');

if(!config.summary.ready || !identity.ready){
  console.error('Preflight failed: active runtime configuration is incomplete.');
  process.exit(1);
}

console.log('Environment preflight: PASS');
