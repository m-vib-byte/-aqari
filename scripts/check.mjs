import fs from 'node:fs';
import {verifyDeploymentTarget} from './verify-deployment-target.mjs';

// The owner-test navigation exception is applied only after the normal V199/V267
// build installer has produced the fixed-domain navigation layer. Direct local
// package checks on the untransformed source remain unchanged.
const builtNavigation=fs.readFileSync('v199-ui.js','utf8');
if(builtNavigation.includes('window.AQARI_V199_BASE_GO=original'))await import('./fix-v267-owner-test-navigation.mjs');

// Run before a Vercel build can publish an artifact with the wrong data source.
verifyDeploymentTarget();

const requiredFiles = [
  'index.html',
  'vercel.json',
  'api/health.js',
  'api/release.js',
  'api/config-status.js',
  '.env.example'
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    failed = true;
  }
}

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('V198')) {
  console.error('index.html does not contain V198 release marker');
  failed = true;
}

if (failed) process.exit(1);
console.log('AQARI V198 package check: PASS');
