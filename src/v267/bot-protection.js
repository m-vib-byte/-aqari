let started = false;

export async function startBotProtection(){
  if(started) return;
  const { initBotId } = await import('./vendor/botid-client.js');
  initBotId({ protect:[{ path:'/api/owner-assistant', method:'POST' }] });
  started = true;
}
