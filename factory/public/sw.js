const CACHE = 'gutpopper-factory-shell-v0.31-project-hub';
const SHELL = ['/', '/styles.css', '/platform.css', '/device-preview.css', '/quality-lab.css', '/theme-picker.css', '/asset-lab.css', '/studio-tools.css', '/plan-first.css', '/workflow.css', '/project-hub.css', '/app.js', '/device-preview.js', '/test-funnel.js', '/asset-lab.js', '/studio-tools.js', '/studio-tools-actions.js', '/asset-autopilot.js', '/workflow.js', '/project-hub.js', '/doctor-live.js', '/agent-teams-ui.js', '/plan-first.js', '/quality-lab.js', '/manifest.webmanifest', '/factory-icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/game/') || url.pathname.startsWith('/artifacts/') || url.pathname.startsWith('/quality-artifacts/')) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    void caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
});
