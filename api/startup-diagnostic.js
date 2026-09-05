const stages = new Set(['starting','session','verify-user','workspace-snapshot','verify-session-final','data','confirm-access','confirm-session-final','render','activate-data','legacy-session','render-home','show-home','ready']);
const outcomes = new Set(['ready','error','stalled','script-error','promise-error']);
const fields = new Set(['version','code','outcome','stage','elapsedMs','heartbeatAgeMs','visible']);
export default function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method !== 'POST'){
    res.setHeader('Allow','POST');
    return res.status(405).end();
  }
  // This endpoint never grants access, returns business data, or changes data.
  // Do not log arbitrary body text, browser URLs, headers, identity, or errors.
  const origin = req.headers?.origin;
  const host = req.headers?.host;
  if(origin && origin !== 'https://' + host && origin !== 'http://' + host) return res.status(403).end();
  let body = req.body;
  if(typeof body === 'string'){
    if(body.length > 1024) return res.status(413).end();
    try{body = JSON.parse(body);}catch{return res.status(400).end();}
  }
  if(!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).end();
  if(Object.keys(body).some(key=>!fields.has(key)) ||
     body.version !== 'V266-DIAG-1' || !/^AQ-[A-F0-9]{8}$/.test(body.code || '') ||
     !stages.has(body.stage) || !outcomes.has(body.outcome) || typeof body.visible !== 'boolean' ||
     !Number.isInteger(body.elapsedMs) || body.elapsedMs < 0 || body.elapsedMs > 120000 ||
     !Number.isInteger(body.heartbeatAgeMs) || body.heartbeatAgeMs < 0 || body.heartbeatAgeMs > 120000){
    return res.status(400).end();
  }
  console.info('AQARI_STARTUP_DIAGNOSTIC', JSON.stringify({
    version:body.version,code:body.code,outcome:body.outcome,stage:body.stage,
    elapsedMs:body.elapsedMs,heartbeatAgeMs:body.heartbeatAgeMs,visible:body.visible
  }));
  return res.status(204).end();
}
