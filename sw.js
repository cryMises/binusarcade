/* Binus Arcade app shell.
 * Only the shell is cached. ROMs, saves, states, API responses and emulator
 * core downloads are never put in this cache.
 */

const VERSION = "binusarcade-v30";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/components.css",
  "./css/views.css",
  "./js/app.js",
  "./js/config.js",
  "./js/i18n.js",
  "./js/locales/id-core.js",
  "./js/locales/id-home.js",
  "./js/locales/id-library.js",
  "./js/locales/id-detail.js",
  "./js/locales/id-profile.js",
  "./js/locales/id-register.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/theme.js",
  "./js/router.js",
  "./js/components.js",
  "./js/vendor/qrcode.js",
  "./js/views/home.js",
  "./js/views/library.js",
  "./js/views/detail.js",
  "./js/views/shelf.js",
  "./js/views/profile.js",
  "./js/views/register.js",
  "./js/views/signup.js",
  "./js/views/trial.js",
  "./js/play-frame.js",
  "./play-frame.html",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon-maskable.svg",
  "./icons/og-image.svg",
  "./icons/og-image.png",
  "./icons/devices/atari2600.svg",
  "./icons/devices/browser.svg",
  "./icons/devices/flash.svg",
  "./icons/devices/gb.svg",
  "./icons/devices/gba.svg",
  "./icons/devices/gbc.svg",
  "./icons/devices/genesis.svg",
  "./icons/devices/nds.svg",
  "./icons/devices/nes.svg",
  "./icons/devices/psp.svg",
  "./icons/devices/psx.svg",
  "./icons/devices/snes.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;
  if (url.href.startsWith("blob:")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
