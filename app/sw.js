/* Offline shell. App files are cached so it opens with no connection;
 * calls to Google always hit the network. */
const CACHE = 'aec-v7';
const ASSETS = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './favicon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './js/ui.js', './js/coach.js', './js/gemini.js', './js/ladder.js',
  './js/prompts.js', './js/store.js', './js/notify.js', './js/live.js', './js/i18n.js',
  './js/syllabus.js', './js/check.js', './js/srs.js', './js/items.js', './js/gamify.js', './js/audio.js',
  './js/path.js', './js/session.js', './js/dom.js', './js/version.js', './js/update.js',
  './js/views/start.js', './js/views/path.js', './js/views/lesson.js', './js/views/practice.js',
  './js/views/coach.js', './js/views/progress.js', './js/views/profile.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
