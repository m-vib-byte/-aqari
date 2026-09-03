export function beginReadOnly(req, res){
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if(req.method !== 'GET' && req.method !== 'HEAD'){
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ ok:false, error:'method_not_allowed' });
    return false;
  }

  return true;
}

export function sendReadOnlyJson(req, res, payload){
  if(req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
}
