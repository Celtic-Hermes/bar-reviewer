// Service worker: a small helper script the browser runs in the background.
// It saves a copy of the app's files on the phone so the app opens with no internet.
//
// ===================== WHEN TO CHANGE THE VERSION =====================
// Change CACHE_VERSION (v1 → v2 → v3 …) whenever you change any APP file:
//   index.html, style.css, app.js, progress.js, find-in-case.js, manifest.webmanifest, or the icons,
//   or when you add or remove a file in the APP_FILES list below.
// You do NOT need to change it when you only edit content: data/catalog.json, data/rules.json,
// data/class-notes.json, data/notebooklm.json, the topic files in data/content/, or files in data/case-texts/ and data/rule-texts/.
// Content is always fetched fresh when she's online.
// =====================================================================
const CACHE_VERSION = "v116";
const CACHE_NAME = "bar-reviewer-" + CACHE_VERSION;

// Every file the app needs, written relative to this file so it works
// both on your Mac (localhost) and at username.github.io/bar-reviewer/.
const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "find-in-case.js",
  "icons.js",
  "progress.js",
  "tests.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "data/catalog.json",
  "data/rules.json",
  "data/quotes.json",
  "data/syllabus-2027.json",
  "data/class-notes.json",
  "data/notebooklm.json",
  "data/for-clarification.json"
];

// Full texts of decisions (data/case-texts/case-0001.txt …) are NOT in APP_FILES:
// each one is saved on the phone only after she opens it. They live in their own
// cache that is kept when CACHE_VERSION changes, so an app update doesn't erase them.
const CASE_TEXT_CACHE = "bar-reviewer-case-texts";

// Topic files (data/content/<subject>/<topic>.json, listed in data/catalog.json), with the
// questions and cases: kept in their own cache too, also kept when CACHE_VERSION changes.
const CONTENT_CACHE = "bar-reviewer-content";

// Content files: always try for the newest copy first.
const DATA_FILES = ["data/catalog.json", "data/rules.json", "data/quotes.json", "data/syllabus-2027.json", "data/class-notes.json", "data/notebooklm.json", "data/for-clarification.json"];

// 1. Install: download a fresh copy of every file into the cache.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_FILES.map(function (file) {
        return new Request(file, { cache: "reload" });  // skip any old browser copy
      }));
    }).then(function () {
      return saveAllTopics();
    }).then(function () {
      return self.skipWaiting();  // use the new version right away
    })
  );
});

// Save every topic file listed in the catalog, so all questions work offline from the
// very first visit. A file that can't be downloaded is skipped (the app reports it).
function saveAllTopics() {
  return fetch("data/catalog.json", { cache: "reload" }).then(function (response) {
    return response.json();
  }).then(function (catalog) {
    return caches.open(CONTENT_CACHE).then(function (cache) {
      return Promise.all(catalog.topics.map(function (entry) {
        return fetch(entry.file, { cache: "reload" }).then(function (response) {
          if (response.ok) { return cache.put(entry.file, response); }
        }).catch(function () {});
      }));
    });
  }).catch(function () {});
}

// 2. Activate: delete caches from older versions, then take charge of open pages.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name.startsWith("bar-reviewer-") && name !== CACHE_NAME && name !== CASE_TEXT_CACHE && name !== CONTENT_CACHE) {
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

  // A topic file (questions and cases): newest copy first, saved in the content cache.
  if (url.pathname.indexOf("/data/content/") !== -1) {
    event.respondWith(
      fetch(request, { cache: "no-cache" }).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CONTENT_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.open(CONTENT_CACHE).then(function (cache) {
          return cache.match(request, { ignoreSearch: true });
        }).then(function (saved) {
          return saved || Response.error();
        });
      })
    );
    return;
  }

  // The catalog and the list of rules: try the internet first (to get the newest content),
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
