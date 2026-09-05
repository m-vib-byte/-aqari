'use strict';
// Diagnostic metadata only. Never receive tokens, account IDs, payloads or URLs.
const stages = new Set(['starting','session','verify-user','workspace-snapshot','verify-session-final','data','confirm-access','confirm-session-final','render','activate-data','legacy-session','render-home','show-home','ready']);
const outcomes = new Set(['ready','error','stalled','script-error','promise-error']);
let attempt = null;
let timer = null;
function report(outcome){
  if(!attempt || attempt.sent || !outcomes.has(outcome)) return;
  attempt.sent = true;
  clearTimeout(timer);
  const entry = {
    version:'V266-DIAG-1', code:attempt.code, outcome,
    stage:attempt.stage,
    elapsedMs:Math.min(120000, Math.max(0, Date.now()-attempt.started)),
    heartbeatAgeMs:Math.min(120000, Math.max(0, Date.now()-attempt.heartbeat)),
    visible:attempt.visible
  };
  fetch('/api/startup-diagnostic', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(entry), credentials:'omit', cache:'no-store', redirect:'error'
  }).catch(()=>{});
  self.postMessage({type:'reported',code:entry.code,outcome,stage:entry.stage});
}
self.onmessage = ({data}) => {
  if(!data || typeof data !== 'object') return;
  if(data.type === 'start' && /^AQ-[A-F0-9]{8}$/.test(data.code || '')){
    clearTimeout(timer);
    attempt = {code:data.code,started:Date.now(),heartbeat:Date.now(),stage:'starting',visible:true,sent:false};
    timer = setTimeout(()=>{if(attempt?.visible) report('stalled');},15000);
    return;
  }
  if(!attempt || data.code !== attempt.code) return;
  if(data.type === 'stage' && stages.has(data.stage)) attempt.stage = data.stage;
  if(data.type === 'heartbeat'){
    attempt.heartbeat = Date.now();
    attempt.visible = data.visible === true;
    if(attempt.visible && !attempt.sent && Date.now()-attempt.started >= 15000) report('stalled');
  }
  if(data.type === 'finish') report(data.outcome);
};
