const required = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'MFA_ENCRYPTION_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'RESEND_API_KEY',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'PAYMENT_WEBHOOK_SECRET'
];

const optional = [
  'APP_BASE_URL',
  'OPS_STATUS_TOKEN'
];

let failed = false;

console.log('AQARI V203 Environment Preflight');
console.log('--------------------------------');

for (const key of required) {
  const ok = Boolean(process.env[key]);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key}`);
  if (!ok) failed = true;
}

for (const key of optional) {
  const ok = Boolean(process.env[key]);
  console.log(`${ok ? 'PASS' : 'WARN'} ${key} (optional)`);
}

if (failed) {
  console.error('Preflight failed: one or more required environment variables are missing.');
  process.exit(1);
}

console.log('Environment preflight: PASS');

