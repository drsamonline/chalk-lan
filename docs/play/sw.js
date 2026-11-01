/* sw.js — the board's offline shell.
 *
 * The rule this file follows, learned the hard way elsewhere: serve the HTML
 * network-first, so a new release is seen on the next load, and let the cache be
 * only the offline fallback. Assets are cache-first with a background refresh.
 *
 * BUMP `CACHE` ON EVERY RELEASE. A cache-first HTML with an unchanged cache name
 * is how a shipped change becomes invisible to everyone who already visited.
 *
 * PolyForm Noncommercial License 1.0.0. (c) 2026 Dr Sohil Momin.
 */
"use strict";

const CACHE = "chalk-v2.0.1";
const SHELL = [
  "./",
  "index.html",
  "chalk.js",
  "lan-kit.js",
  "web-kit.js",
  "qr.js",
  "icon.svg",
  "manifest.webmanifest"
];

/* The room's own endpoints must never be answered from a cache. */
const LIVE = ["/events", "/send", "/health", "/boards"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (LIVE.some(function (p) { return url.pathname.endsWith(p); })) return;

  const wantsHTML = req.mode === "navigate" ||
    (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (wantsHTML) {
    /* network first: a release is never hidden behind a cache */
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (hit) {
            return hit || caches.match("index.html");
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) {
        fetch(req).then(function (res) {
          caches.open(CACHE).then(function (c) { c.put(req, res); });
        }).catch(function () {});
        return hit;
      }
      return fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    })
  );
});
