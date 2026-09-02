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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const configured = Object.fromEntries(
    required.map((key) => [key, Boolean(process.env[key])])
  );

  const present = Object.values(configured).filter(Boolean).length;

  return res.status(200).json({
    ok: true,
    version: 'V198',
    configured,
    summary: {
      present,
      required: required.length,
      ready: present === required.length
    },
    note: 'This endpoint only reports whether variables exist; it never returns secret values.'
  });
}
