const CACHE_NAME = "records-shell-v26";
const APP_SHELL = [
    "/",
    "/index.html",
    "/dashboard.html",
    "/create-record.html",
    "/search-cases.html",
    "/pending-sync.html",
    "/account.html",
    "/case-details.html",
    "/reports.html",
    "/settings.html",
    "/users.html",
    "/css/style.css",
    "/css/sidebar.css",
    "/css/notification.css",
    "/css/confirm-dialog.css",
    "/css/offline.css",
    "/css/mobile-form-controls.css",
    "/css/dashboard.css",
    "/css/create-record.css",
    "/css/search-cases.css",
    "/css/account.css",
    "/css/case-details.css",
    "/css/reports.css",
    "/css/settings.css",
    "/css/users.css",
    "/css/pending-sync.css",
    "/js/app-settings.js",
    "/js/offline-records.js",
    "/js/notification.js",
    "/js/confirm-dialog.js",
    "/js/create-record.js",
    "/js/search-cases.js",
    "/js/dashboard.js",
    "/js/account.js",
    "/js/case-details.js",
    "/js/reports.js",
    "/js/settings.js",
    "/js/users.js",
    "/js/pending-sync.js",
    "/assets/navigation-icons.svg",
    "/assets/records-logo.jpeg",
    "/assets/records-icon-192.png",
    "/assets/records-icon-512.png",
    "/assets/records-icon-maskable-512.png",
    "/manifest.webmanifest"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    if (request.url.includes("/api/")) {
        return;
    }

    if (request.mode === "navigate") {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);

        event.respondWith(
            fetch(request, { signal: controller.signal })
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request, { ignoreSearch: true })
                    .then(cached => cached || caches.match("/index.html")))
                .finally(() => clearTimeout(timeout))
        );
        return;
    }

    // Shell CSS/JS/images should be available immediately offline. Refresh the
    // cache in the background when a network is available.
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then(cached => {
            const refresh = fetch(request)
                .then(response => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => null);

            return cached || refresh.then(response => response || Response.error());
        })
    );
});
