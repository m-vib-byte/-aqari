'use strict';

// This worker intentionally keeps no application-shell cache. Its only upgrade
// job is to retire caches left by older AQARI releases so iOS cannot stay pinned
// to an obsolete page after production has moved forward.
const AQARI_RELEASE = 'V266';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for(const client of windows){
      client.postMessage({ type:'AQARI_RELEASE_READY', release:AQARI_RELEASE });
    }
  })());
});

self.addEventListener('message', (event) => {
  if(event.data?.type === 'AQARI_SKIP_WAITING') self.skipWaiting();
});
