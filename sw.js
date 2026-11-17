// Service worker: a small helper script the browser runs in the background.
// It saves a copy of the app's files on the phone so the app opens with no internet.
//
// ===================== WHEN TO CHANGE THE VERSION =====================
// Change CACHE_VERSION (v1 → v2 → v3 …) whenever you change any APP file:
//   index.html, style.css, app.js, progress.js, find-in-case.js, manifest.webmanifest, or the icons,
//   or when you add or remove a file in the APP_FILES list below.
// You do NOT need to change it when you only edit data/questions.json or data/cases.json,
// or add/edit files in data/case-texts/.
// Questions, cases and case texts are always fetched fresh when she's online.
// =====================================================================
const CACHE_VERSION = "v55";
const CACHE_NAME = "bar-reviewer-" + CACHE_VERSION;

// Every file the app needs, written relative to this file so it works
// both on your Mac (localhost) and at username.github.io/bar-reviewer/.
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "find-in-case.js",
  "progress.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "data/questions.json",
  "data/cases.json",
  "data/rules.json"
];

// Full texts of decisions (data/case-texts/case-0001.txt …) are NOT in APP_FILES:
// each one is saved on the phone only after she opens it. They live in their own
// cache that is kept when CACHE_VERSION changes, so an app update doesn't erase them.
const CASE_TEXT_CACHE = "bar-reviewer-case-texts";

// Content files: always try for the newest copy first.
const DATA_FILES = ["data/questions.json", "data/cases.json", "data/rules.json"];

// 1. Install: download a fresh copy of every file into the cache.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES.map(function (file) {
        return new Request(file, { cache: "reload" });  // skip any old browser copy
      }));
    }).then(function () {
      return self.skipWaiting();  // use the new version right away
    })
  );
});

// 2. Activate: delete caches from older versions, then take charge of open pages.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.startsWith("bar-reviewer-") && name !== CACHE_NAME && name !== CASE_TEXT_CACHE) {
          return caches.delete(name);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 3. Fetch: decide where each file comes from.
self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") { return; }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) { return; }

  // A case's full text: try the internet first (newest copy) and save it on the phone.
  // Offline: use the saved copy if she has opened this case's full text before.
  // (A rule's full text, data/rule-texts/…, works the same way and is kept in the same cache.)
  if (url.pathname.indexOf("/data/case-texts/") !== -1 || url.pathname.indexOf("/data/rule-texts/") !== -1) {
    event.respondWith(
      fetch(request, { cache: "no-cache" }).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CASE_TEXT_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.open(CASE_TEXT_CACHE).then(function (cache) {
          return cache.match(request);
        }).then(function (saved) {
          return saved || Response.error();  // not saved: the app shows "you may be offline"
        });
      })
    );
    return;
  }

  // Questions and cases: try the internet first (to get the newest content),
  // and use the saved copy if she's offline.
  const isDataFile = DATA_FILES.some(function (file) { return url.pathname.endsWith("/" + file); });
  if (isDataFile) {
    event.respondWith(
      fetch(request, { cache: "no-cache" }).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match(request);
      })
    );
    return;
  }

  // Everything else: use the saved copy (fast, works offline).
  // If it isn't saved, get it from the internet.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (saved) {
      if (saved) { return saved; }
      return fetch(request).catch(function () {
        // Offline and not saved: for page loads, fall back to the main page.
        if (request.mode === "navigate") { return caches.match("./"); }
      });
    })
  );
});
