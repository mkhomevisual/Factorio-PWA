/* One-time bridge from the legacy auto-update registration to the prompt flow.
   Future workers do not cache registerSW.js, so they remain waiting for the UI action. */
self.addEventListener('install', (event) => {
  event.waitUntil(caches.match('/registerSW.js').then((legacyRegistration) => {
    if (legacyRegistration) return self.skipWaiting();
    return undefined;
  }));
});
