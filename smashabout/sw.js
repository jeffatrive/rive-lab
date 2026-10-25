// Smashabout: makes this page cross-origin isolated on a host that can't send headers (GitHub Pages).
//
// The game makes its sound effects with an audio processor (the synth), which needs Rive's threaded
// runtime, and that needs shared memory: a page sent with
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Embedder-Policy: require-corp
// GitHub Pages can't add headers, so this worker re-serves the page's own (same-origin) responses with them, plus
// Cross-Origin-Resource-Policy: same-origin where a response has none. Cross-origin requests (the jsDelivr runtime and
// its wasm, the analytics beacon) go to the network untouched: those servers send CORS and CORP headers themselves.
// index.html registers it and reloads once so the page comes back through it. Our own code, nothing third-party.
'use strict';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// Responses that may not carry a body
var NULL_BODY = { 101: true, 103: true, 204: true, 205: true, 304: true };

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // (another site's: untouched)
  // a request only the cache may answer can't be made by a worker for anything but the same origin
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  event.respondWith(fetch(request).then(function (response) {
    if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) return response;
    var headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    if (!headers.has('Cross-Origin-Resource-Policy')) headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(NULL_BODY[response.status] ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  }));
});
