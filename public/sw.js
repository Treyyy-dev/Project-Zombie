// Project Zombie: keeps the game playable from the home screen, including offline.
const C = 'projectzombie-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (/cdnjs\.cloudflare\.com$|fonts\.googleapis\.com$|fonts\.gstatic\.com$/.test(u.host)) {      // libraries and fonts never change: saved copy first
    e.respondWith(caches.open(C).then(c => c.match(r).then(h => h || fetch(r).then(res => { c.put(r, res.clone()); return res; }))));
    return;
  }
  if (u.origin !== self.location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); } return res; })      // the game itself: newest version when online
    .catch(() => caches.match(r, { ignoreSearch: true })));                                                                                 // and the saved one when not
});
