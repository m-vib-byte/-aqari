import fs from 'node:fs';
import crypto from 'node:crypto';

const required = [
  '.github/workflows/preview-e2e.yml',
  '.github/workflows/release-gate.yml',
  '.github/workflows/runtime-contracts.yml',
  'index.html',
  'vercel.json',
  'package.json',
  'VERSION.json',
  'FILE_INVENTORY.json',
  'DEPLOYMENT_MANIFEST.json',
  'ENVIRONMENT_CONTRACT.json',
  'public-config.js',
  'supabase-adapter.js',
  'cloud-sync.js',
  'first-run-migration.js',
  'safe-autosync.js',
  'safe-autosync-ui.js',
  'production-lockdown.js',
  'final-release-ui.js',
  'v202-property-os.js',
  'v202-rent-operations.css',
  'v202-rent-operations.js',
  'v203-simple.css',
  'v203-simple.js',
  'tests/runtime-contracts.test.cjs',
  'tests/v202-property-os.test.cjs',
  'tests/preview.e2e.mjs',
  'api/health.js',
  'api/health/deep.js',
  'api/ops/status.js',
  'api/release.js',
  'api/config-status.js',
  'api/supabase-status.js',
  'api/cloud-sync-status.js',
  'api/migration-status.js',
  'api/autosync-status.js',
  'api/production-readiness.js',
  'api/final-release-status.js',
  'api/production-meta.js',
  'production-status.js'
];

let failed = false;

function fail(message, value) {
  console.error(message, value ?? '');
  failed = true;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Invalid or unreadable JSON: ${file}`, error.message);
    return null;
  }
}

for (const f of required) {
  if (!fs.existsSync(f)) {
    fail('Missing required file:', f);
  }
}

const html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('<meta name="aqari-release" content="V203">')) {
  fail('V203 public release marker missing');
}
if (!html.includes('<meta name="aqari-stage" content="release-candidate">')) {
  fail('Release-candidate public stage marker missing');
}
if (/supabase\s+connected/i.test(html)) {
  fail('UI must not claim a live Supabase connection without a live check');
}

const version = readJson('VERSION.json');
const deployment = readJson('DEPLOYMENT_MANIFEST.json');
const environment = readJson('ENVIRONMENT_CONTRACT.json');
const inv = readJson('FILE_INVENTORY.json');
const identity = { version:'V203', runtimeBase:'V198', dataContract:'V202' };

for (const [name, document] of Object.entries({ version, deployment, environment, inventory:inv })) {
  if (!document) continue;
  for (const [key, expected] of Object.entries(identity)) {
    if (document[key] !== expected) fail(`${name}.${key} must be ${expected}`, document[key]);
  }
}

if (version) {
  const actualIndexHash = crypto.createHash('sha256').update(fs.readFileSync('index.html')).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(version.index_sha256 || '') || version.index_sha256 !== actualIndexHash) {
    fail('VERSION.index_sha256 does not match index.html', `${version.index_sha256 || 'missing'} != ${actualIndexHash}`);
  }
  if (version.stage !== 'release-candidate') fail('VERSION.stage must be release-candidate', version.stage);
  if (version.release_frozen !== true) fail('VERSION.release_frozen must be true', version.release_frozen);

  const expectedGates = ['runtime_contracts', 'release_gate', 'preview_e2e'];
  for (const gate of expectedGates) {
    const status = version.validation?.[gate];
    if (status !== 'required_by_ci' || /pending/i.test(String(status))) {
      fail(`VERSION.validation.${gate} must remain required_by_ci until CI runs`, status);
    }
  }
  if (version.validation?.production !== 'not_deployed' || version.production_deployed !== false) {
    fail('VERSION must state that Production is not deployed');
  }
  if (version.preview_e2e_executed !== false) {
    fail('VERSION must not claim that Preview E2E has executed before CI', version.preview_e2e_executed);
  }
  if (version.supabase_live_verified !== false) {
    fail('VERSION must not claim a live Supabase verification', version.supabase_live_verified);
  }
  const selftests = Array.isArray(version.selftests) ? version.selftests : [];
  if (!selftests.length || selftests.some((test) => test?.status !== 'passed')) {
    fail('All declared local self-tests must be recorded as passed');
  }
  if (new Set(selftests.map((test) => test?.cmd)).size !== selftests.length) {
    fail('VERSION.selftests contains duplicate commands');
  }
}

if (deployment && version) {
  if (deployment.stage !== version.stage) fail('Deployment stage does not match VERSION.stage', deployment.stage);
  const expectedComponents = {
    design:version.design_version,
    experience:version.experience_version,
    rentOperations:version.operations_version
  };
  for (const [name, expected] of Object.entries(expectedComponents)) {
    if (deployment.components?.[name] !== expected) {
      fail(`DEPLOYMENT_MANIFEST.components.${name} mismatch`, deployment.components?.[name]);
    }
  }
  for (const gate of ['runtime_contracts', 'release_gate', 'preview_e2e']) {
    const manifestStatus = deployment.gates?.[gate];
    if (manifestStatus !== version.validation?.[gate] || /pending/i.test(String(manifestStatus))) {
      fail(`DEPLOYMENT_MANIFEST.gates.${gate} must match the required CI state`, manifestStatus);
    }
  }
  if (deployment.gates?.production_status !== 'not_deployed' ||
      deployment.gates?.production_deployed !== false ||
      deployment.gates?.production_env_verified !== false) {
    fail('Deployment manifest must explicitly keep Production unverified and not deployed');
  }
}

const publicConfig = fs.readFileSync('public-config.js', 'utf8');
if (!publicConfig.includes('releaseStage: "release-candidate"') ||
    !publicConfig.includes('releaseFrozen: true') ||
    !publicConfig.includes('supabaseConnectionVerified: false')) {
  fail('Public configuration does not expose the safe release-candidate identity');
}

if (inv && Array.isArray(inv.files)) {
  const inventoryPaths = new Set(inv.files.map((row) => row.path));
  if (inventoryPaths.size !== inv.files.length) {
    fail('Inventory contains duplicate paths');
  }
  for (const file of required) {
    if (file !== 'FILE_INVENTORY.json' && !inventoryPaths.has(file)) {
      fail('Required release file missing from inventory:', file);
    }
  }

  for (const row of inv.files) {
    if (!fs.existsSync(row.path)) {
      fail('Inventory file missing:', row.path);
      continue;
    }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(row.path)).digest('hex');
    if (hash !== row.sha256) {
      fail('Checksum mismatch:', row.path);
    }
  }
} else {
  fail('FILE_INVENTORY.files must be an array');
}

if (failed) process.exit(1);
console.log('AQARI V203 release freeze self-test: PASS');
