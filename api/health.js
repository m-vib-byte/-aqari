export default async function handler(req, res) {
  const started = Date.now();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    service: 'aqari',
    version: 'V198',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - started
  });
}
