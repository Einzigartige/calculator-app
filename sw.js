const CACHE = 'calc-cache-v1';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'main.js',
  'manifest.json',
  'assets/sounds/click.mp3',
  'assets/sounds/delete.mp3',
  'assets/sounds/clear.mp3',
  'assets/sounds/equals.mp3',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.all(
        ASSETS.map(url => 
          fetch(url)
            .then(res => cache.put(url, res))
            .catch(err => console.warn('Asset failed to cache:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE) ? caches.delete(k) : Promise.resolve()))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;

  if (req.mode === 'navigate' || req.destination === 'document') {
    ev.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  ev.respondWith(
    caches.match(req).then(m => m || fetch(req).then(r => {
      return caches.open(CACHE).then(cache => { 
        cache.put(req, r.clone()); 
        return r; 
      });
    }))
  );
});
