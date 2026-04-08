const CACHE_NAME = 'poker-trainer-v1';
const createServiceUnavailableResponse = () => new Response(
  'Unable to reach server. Please check your connection and try again.',
  {
  status: 503,
  statusText: 'Service Unavailable',
  headers: { 'Content-Type': 'text/plain' }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Offline fallback caching
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const oldCaches = keys.filter((key) => key !== CACHE_NAME);
        return Promise.all(oldCaches.map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === 'GET' && event.request.url.startsWith('http')) {
            cache.put(event.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/').then((response) =>
          response || createServiceUnavailableResponse()
        );
      }
      return createServiceUnavailableResponse();
    })
  );
});
