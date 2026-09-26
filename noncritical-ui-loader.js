(function () {
  'use strict';

  const sources = [
    '/safe-autosync-ui.js',
    '/production-status.js',
    '/pre-migration-backup.js',
    '/final-release-ui.js'
  ];

  function load(source) {
    const script = document.createElement('script');
    script.src = source;
    script.async = false;
    document.body.appendChild(script);
  }

  function start() {
    sources.forEach(load);
  }

  function schedule() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: 2500 });
    } else {
      window.setTimeout(start, 250);
    }
  }

  if (document.readyState === 'complete') {
    schedule();
  } else {
    window.addEventListener('load', schedule, { once: true });
  }
}());
