'use strict';

const CACHE_NAME = 'lda-shell-v3.1';
const SHELL_ASSETS = [
  './',
  './style.css',
  './core.js',
  './static-vault.js',
  './templates.js',
  './krutidev-client.js',
  './phrasebook.js',
  './modules-ui.js',
  './app.js',
  './vendor/fuse.js',
  './vendor/signature_pad.js',
  './assets/icon.svg',
  './fonts/Karma-Regular.ttf',
  './fonts/Karma-Bold.ttf',
  './fonts/Mukta-Regular.ttf',
  './fonts/Mukta-Bold.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.includes('/api/') || url.pathname.endsWith('/verify')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
