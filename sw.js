'use strict';

// Keep the registration healthy without caching the 1 MB application shell.
// Offline caching will be introduced only after the monolith is split into
// versioned assets, so users cannot be trapped on a stale release.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
