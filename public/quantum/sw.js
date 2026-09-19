/*
 * Offline shell. The instrument is entirely self-contained and needs the
 * network only to arrive, so once it has, it should keep working in a field
 * with no signal.
 *
 * Cache-first for everything in the shell, network-first for nothing: there
 * is no server-side state to go stale. Bump VERSION to ship an update.
 */
var VERSION = 'quantum-lens-v1';

var SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'js/constants.js',
  'js/scales.js',
  'js/camera.js',
  'js/field.js',
  'js/render.js',
  'js/segment.js',
  'js/resonance.js',
  'js/layers/matter.js',
  'js/layers/quantum.js',
  'js/layers/cymatic.js',
  'js/hud.js',
  'js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      // One missing file should not fail the whole install.
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(url).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === VERSION ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        // Keep anything same-origin we did not think to precache.
        if (res.ok && new URL(e.request.url).origin === self.location.origin) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
