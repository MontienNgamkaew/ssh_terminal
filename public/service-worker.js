const CACHE_NAME = 'montien-tech-terminal-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/assets/logo.png',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Prompt:wght@300;400;500;600;700&family=Press+Start+2P&family=Silkscreen:wght@400;700&display=swap',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js',
  'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Ignore some failures of external CDNs if they are offline
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Pre-caching some assets failed', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Simple Cache falling back to network strategy
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(e.request).then(response => {
        // Don't cache WebSocket or non-http requests
        if (!response || response.status !== 200 || !e.request.url.startsWith('http')) {
          return response;
        }
        
        // Cache dynamic assets on the fly
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, responseClone);
        });
        
        return response;
      }).catch(() => {
        // Offline fallback
      });
    })
  );
});
