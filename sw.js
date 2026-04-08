const CACHE_NAME = 'poker-trainer-v2';

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
    fetch(event.request)
      .then((fetchRes) => {
        const responseClone = fetchRes.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        );
        return fetchRes;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cachedRes) =>
            cachedRes ||
            new Response('Service unavailable.', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'text/plain',
              },
            })
        )
      )
  );
});
