(function () {
    const DB_NAME = "recor_ds_offline_records";
    const DB_VERSION = 3;
    const STORE_NAME = "pending_records";
    const PENDING_STATUS = "PENDING_SYNC";
    const FAILED_STATUS = "SYNC_FAILED";
    const SYNCING_STATUS = "SYNCING";
    const CONFLICT_STATUS = "SYNC_CONFLICT";
    const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

    let dbPromise = null;
    let syncPromise = null;
    let statusElement = null;

    function isIndexedDbSupported() {
        return typeof indexedDB !== "undefined";
    }

    function getCurrentUserKey() {
        try {
            const storedUser = JSON.parse(
                localStorage.getItem("user") || "null"
            );

            const user = storedUser || {};

            return String(
                user.id ||
                user.email ||
                user.name ||
                ""
            )
                .trim()
                .toLowerCase();
        } catch (error) {
            return "";
        }
    }

    function openDatabase() {
        if (!isIndexedDbSupported()) {
            return Promise.reject(
                new Error("IndexedDB is not supported in this browser.")
            );
        }

        if (dbPromise) {
            return dbPromise;
        }

        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(
                DB_NAME,
                DB_VERSION
            );

            request.onupgradeneeded = event => {
                const database =
                    event.target.result;

                if (
                    !database.objectStoreNames.contains(
                        STORE_NAME
                    )
                ) {
                    const store =
                        database.createObjectStore(
                            STORE_NAME,
                            {
                                keyPath: "uuid"
                            }
                        );

                    store.createIndex(
                        "status",
                        "status",
                        {
                            unique: false
                        }
                    );

                    store.createIndex(
                        "ownerKey",
                        "ownerKey",
                        {
                            unique: false
                        }
                    );

                    store.createIndex(
                        "createdAt",
                        "createdAt",
                        {
                            unique: false
                        }
                    );
                }

                const store = event.target.transaction.objectStore(STORE_NAME);
                if (!store.indexNames.contains("status")) {
                    store.createIndex("status", "status", { unique: false });
                }
                if (!store.indexNames.contains("ownerKey")) {
                    store.createIndex("ownerKey", "ownerKey", { unique: false });
                }
                if (!store.indexNames.contains("createdAt")) {
                    store.createIndex("createdAt", "createdAt", { unique: false });
                }
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(
                    request.error ||
                    new Error("Unable to open offline database.")
                );
            };
        });

        return dbPromise;
    }

    function requestToPromise(request, errorMessage) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(
                    request.error ||
                    new Error(errorMessage)
                );
            };
        });
    }

    function clonePayload(payload) {
        const output = {};

        for (const [key, value] of Object.entries(payload || {})) {
            if (value !== undefined) {
                output[key] = value;
            }
        }

        return output;
    }

    async function getRecord(uuid) {
        const database = await openDatabase();
        const transaction = database.transaction(
            STORE_NAME,
            "readonly"
        );
        const store = transaction.objectStore(STORE_NAME);
        const result = await requestToPromise(
            store.get(uuid),
            "Unable to read offline record."
        );

        return result || null;
    }

    async function saveRecord(entry) {
        const database = await openDatabase();
        const transaction = database.transaction(
            STORE_NAME,
            "readwrite"
        );
        const store = transaction.objectStore(STORE_NAME);

        const completion = new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => {
                reject(
                    transaction.error ||
                    new Error("Unable to save offline record.")
                );
            };
            transaction.onabort = () => {
                reject(
                    transaction.error ||
                    new Error("Unable to save offline record.")
                );
            };
        });

        const request = requestToPromise(
            store.put(entry),
            "Unable to save offline record."
        );

        await Promise.all([
            request,
            completion
        ]);

        return entry;
    }

    async function deleteRecord(uuid) {
        const database = await openDatabase();
        const transaction = database.transaction(
            STORE_NAME,
            "readwrite"
        );
        const store = transaction.objectStore(STORE_NAME);

        const completion = new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => {
                reject(
                    transaction.error ||
                    new Error("Unable to remove offline record.")
                );
            };
            transaction.onabort = () => {
                reject(
                    transaction.error ||
                    new Error("Unable to remove offline record.")
                );
            };
        });

        const request = requestToPromise(
            store.delete(uuid),
            "Unable to remove offline record."
        );

        await Promise.all([
            request,
            completion
        ]);

        return true;
    }

    async function getAllRecords() {
        const database = await openDatabase();
        const transaction = database.transaction(
            STORE_NAME,
            "readonly"
        );
        const store = transaction.objectStore(STORE_NAME);
        const result = await requestToPromise(
            store.getAll(),
            "Unable to read offline queue."
        );

        return result || [];
    }

    async function countPendingRecords(ownerKey) {
        const records =
            await getAllRecords();

        const normalizedOwnerKey =
            String(
                ownerKey || getCurrentUserKey()
            )
                .trim()
                .toLowerCase();

        return records.filter(
            record =>
                record &&
                [PENDING_STATUS, FAILED_STATUS, SYNCING_STATUS, CONFLICT_STATUS].includes(record.status) &&
                (
                    !normalizedOwnerKey ||
                    record.ownerKey === normalizedOwnerKey
                )
        ).length;
    }

    async function getQueueStats(ownerKey) {
        const normalizedOwnerKey = String(ownerKey || getCurrentUserKey()).trim().toLowerCase();
        const records = (await getAllRecords()).filter(record =>
            record && (!normalizedOwnerKey || record.ownerKey === normalizedOwnerKey)
        );

        return {
            waiting: records.filter(record => record.status === PENDING_STATUS).length,
            syncing: records.filter(record => record.status === SYNCING_STATUS).length,
            failed: records.filter(record => record.status === FAILED_STATUS).length,
            conflicts: records.filter(record => record.status === CONFLICT_STATUS).length,
            total: records.length
        };
    }

    async function getPendingRecords(ownerKey) {
        const normalizedOwnerKey = String(ownerKey || getCurrentUserKey()).trim().toLowerCase();
        return (await getAllRecords())
            .filter(record => record && record.payload && (!normalizedOwnerKey || record.ownerKey === normalizedOwnerKey))
            .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    }

    async function queueRecord(recordData, options = {}) {
        const payload =
            clonePayload(recordData);

        const operationType = options.operationType === "UPDATE"
            ? "UPDATE"
            : "CREATE";
        const recordId = String(options.recordId || payload.record_id || "").trim();
        const uuid =
            String(
                payload.client_uuid ||
                (operationType === "UPDATE" ? `update_${recordId}` : "")
            )
                .trim();

        if (!uuid || (operationType === "UPDATE" && !recordId)) {
            throw new Error(
                "Offline operation is missing its record identity."
            );
        }

        const ownerKey =
            getCurrentUserKey();
        const storedUser = JSON.parse(localStorage.getItem("user") || "null");

        const existing =
            await getRecord(uuid);

        const createdAt =
            existing?.createdAt ||
            new Date().toISOString();

        const entry = {
            uuid,
            operationType,
            recordId: recordId || null,
            ownerKey,
            status: PENDING_STATUS,
            payload: {
                ...payload,
                client_uuid: uuid
            },
            createdAt,
            updatedAt: new Date().toISOString(),
            attempts: existing?.attempts || 0,
            lastError: null,
            lastAttemptAt: null,
            nextRetryAt: null,
            userId: storedUser?.id || "",
            branchId: storedUser?.branch_id || ""
        };

        await saveRecord(entry);

        return entry;
    }

    async function syncPendingRecords(options = {}) {
        if (syncPromise) {
            return syncPromise;
        }

        syncPromise = syncPendingRecordsInternal(options);

        try {
            return await syncPromise;
        } finally {
            syncPromise = null;
        }
    }

    async function syncPendingRecordsInternal(options = {}) {
        if (
            typeof navigator !== "undefined" &&
            navigator.onLine === false
        ) {
            return {
                online: false,
                syncedCount: 0,
                failedCount: 0,
                pendingCount: await countPendingRecords(options.ownerKey),
                authError: false,
                networkError: false
            };
        }

        const token =
            options.token ||
            localStorage.getItem("token");

        const ownerKey =
            String(
                options.ownerKey ||
                getCurrentUserKey()
            )
                .trim()
                .toLowerCase();

        if (!token) {
            return {
                online: true,
                syncedCount: 0,
                failedCount: 0,
                pendingCount: await countPendingRecords(ownerKey),
                authError: true,
                networkError: false
            };
        }

        const now = Date.now();
        const records =
            (await getPendingRecords(ownerKey))
                .filter(
                    record =>
                        record &&
                        (record.status === PENDING_STATUS || record.status === FAILED_STATUS || record.status === SYNCING_STATUS) &&
                        (options.force === true || !record.nextRetryAt || new Date(record.nextRetryAt).getTime() <= now)
                );

        let syncedCount = 0;
        let failedCount = 0;

        for (const entry of records) {

            try {

                await saveRecord({
                    ...entry,
                    status: SYNCING_STATUS,
                    lastAttemptAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });

                const requestPayload = { ...entry.payload };
                delete requestPayload.record_id;

                const isUpdate = entry.operationType === "UPDATE";
                const response =
                    await fetch(
                        isUpdate
                            ? `/api/records/${encodeURIComponent(entry.recordId)}`
                            : "/api/records",
                        {
                            method: isUpdate ? "PATCH" : "POST",
                            headers: {
                                "Content-Type":
                                    "application/json",
                                "Authorization":
                                    `Bearer ${token}`
                            },
                            body: JSON.stringify(requestPayload)
                        }
                    );

                let data = null;

                try {
                    data = await response.json();
                } catch (parseError) {
                    data = null;
                }

                if (
                    response.status === 401 ||
                    response.status === 403
                ) {
                    await saveRecord({
                        ...entry,
                        status: PENDING_STATUS,
                        lastError: "Authentication required.",
                        updatedAt: new Date().toISOString()
                    });
                    return {
                        online: true,
                        syncedCount,
                        failedCount,
                        pendingCount: await countPendingRecords(ownerKey),
                        authError: true,
                        networkError: false
                    };
                }

                if (response.status === 409 && isUpdate) {
                    await saveRecord({
                        ...entry,
                        status: CONFLICT_STATUS,
                        updatedAt: new Date().toISOString(),
                        lastError: data?.message || "The server record changed while this edit was offline."
                    });
                    failedCount++;
                    continue;
                }

                if (
                    !response.ok ||
                    data?.success === false
                ) {
                    failedCount++;

                    const attempts = (entry.attempts || 0) + 1;
                    const retryDelay = Math.min(
                        MAX_RETRY_DELAY_MS,
                        5000 * (2 ** Math.min(attempts - 1, 6))
                    );

                    await saveRecord({
                        ...entry,
                        status: FAILED_STATUS,
                        attempts,
                        updatedAt: new Date().toISOString(),
                        nextRetryAt: new Date(Date.now() + retryDelay).toISOString(),
                        lastError:
                            data?.message ||
                            `HTTP ${response.status}`
                    });

                    continue;
                }

                await deleteRecord(entry.uuid);
                syncedCount++;

            } catch (error) {

                await saveRecord({
                    ...entry,
                    status: FAILED_STATUS,
                    attempts: (entry.attempts || 0) + 1,
                    updatedAt: new Date().toISOString(),
                    nextRetryAt: new Date(Date.now() + Math.min(
                        MAX_RETRY_DELAY_MS,
                        5000 * (2 ** Math.min((entry.attempts || 0), 6))
                    )).toISOString(),
                    lastError:
                        error?.message ||
                        "Network error"
                });

                return {
                    online: true,
                    syncedCount,
                    failedCount,
                    pendingCount: await countPendingRecords(ownerKey),
                    authError: false,
                    networkError: true
                };

            }
        }

        return {
            online: true,
            syncedCount,
            failedCount,
            pendingCount: await countPendingRecords(ownerKey),
            authError: false,
            networkError: false
        };
    }

    function showSyncMessage(message, type) {
        if (
            typeof window.Notification === "object" &&
            typeof window.Notification[type] === "function"
        ) {
            window.Notification[type](message);
        }
    }

    function updateOfflineBanners(message) {
        document.querySelectorAll("#offlineStatusBanner").forEach(banner => {
            banner.textContent = message;
            banner.hidden = false;
        });
    }

    function ensureOfflineNavigationItem() {
        const navigation = document.querySelector(".navigation");
        if (!navigation) return null;

        let pendingLink = navigation.querySelector('a[href="pending-sync.html"]');
        if (!pendingLink) {
            pendingLink = document.createElement("a");
            pendingLink.href = "pending-sync.html";
            pendingLink.className = "nav-item offline-pending-nav-link";
        }

        pendingLink.classList.add("offline-pending-nav-link");
        if (!pendingLink.querySelector(".offline-nav-icon")) {
            pendingLink.innerHTML = `
                <i class="offline-nav-icon" aria-hidden="true"></i>
                <span class="offline-nav-label">Online</span>
            `;
        }

        const settingsLink = navigation.querySelector('a[href="settings.html"]');
        if (settingsLink) {
            settingsLink.after(pendingLink);
        } else if (pendingLink.parentElement !== navigation) {
            navigation.appendChild(pendingLink);
        }

        const currentPage = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
        if (currentPage === "pending-sync.html") {
            pendingLink.classList.add("active");
            pendingLink.setAttribute("aria-current", "page");
        }

        return pendingLink;
    }

    function updateOfflineNavigation(state, pendingCount) {
        const pendingLink = ensureOfflineNavigationItem();
        if (!pendingLink) return;

        const isOffline = state === "offline";
        const label = pendingLink.querySelector(".offline-nav-label");
        if (label) label.textContent = isOffline ? "Offline" : "Online";

        pendingLink.dataset.state = isOffline ? "offline" : "online";
        pendingLink.title = pendingCount > 0
            ? `${isOffline ? "Offline" : "Online"} - ${pendingCount} pending record${pendingCount === 1 ? "" : "s"}`
            : isOffline
                ? "Offline - records will sync when internet returns"
                : "Online";
        pendingLink.setAttribute("aria-label", pendingLink.title);
    }

    function ensureStatusElement() {
        if (statusElement || !document.body) return statusElement;

        statusElement = document.createElement("aside");
        statusElement.className = "offline-sync-indicator";
        statusElement.hidden = true;
        statusElement.setAttribute("aria-live", "polite");
        statusElement.innerHTML = `
            <span class="offline-sync-copy"></span>
            <a class="offline-sync-link" href="pending-sync.html">Pending Sync</a>
            <button type="button" class="offline-sync-button">Sync</button>
        `;
        const host = document.querySelector(".topbar-right, .page-top-right, .account-heading, .page-heading") || document.body;
        host.appendChild(statusElement);

        ensureOfflineNavigationItem();

        statusElement.querySelector("button").addEventListener("click", async () => {
            const button = statusElement.querySelector("button");
            button.disabled = true;
            try {
                await syncForCurrentUser({ force: true });
            } finally {
                button.disabled = false;
                await refreshStatusIndicator();
            }
        });
        return statusElement;
    }

    async function refreshStatusIndicator() {
        const element = ensureStatusElement();
        if (!element) return;

        const stats = await getQueueStats();
        const copy = element.querySelector(".offline-sync-copy");
        const pendingLink = element.querySelector(".offline-sync-link");
        const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
        const pendingCount = stats.waiting + stats.syncing + stats.failed + stats.conflicts;

        pendingLink.hidden = pendingCount === 0;
        pendingLink.textContent = pendingCount ? `Pending ${pendingCount}` : "Pending Sync";

        if (!isOnline) {
            updateOfflineBanners("Offline - Records will be saved and synced when internet returns.");
            copy.textContent = `Offline · ${pendingCount} pending`;
            element.dataset.state = "offline";
        } else if (stats.failed || stats.conflicts) {
            const attentionCount = stats.failed + stats.conflicts;
            updateOfflineBanners(`${attentionCount} offline change${attentionCount === 1 ? "" : "s"} need attention.`);
            copy.textContent = `Online · ${pendingCount} pending`;
            element.dataset.state = "failed";
        } else if (stats.waiting) {
            updateOfflineBanners(`${stats.waiting} offline record${stats.waiting === 1 ? "" : "s"} waiting to sync.`);
            copy.textContent = `Online · ${pendingCount} pending`;
            element.dataset.state = "waiting";
        } else if (stats.syncing) {
            copy.textContent = `Syncing ${stats.syncing}...`;
            element.dataset.state = "syncing";
        } else {
            document.querySelectorAll("#offlineStatusBanner").forEach(banner => {
                banner.hidden = true;
            });
            copy.textContent = "Online · 0 pending";
            element.dataset.state = "online";
        }

        updateOfflineNavigation(isOnline ? "online" : "offline", pendingCount);
    }

    async function syncForCurrentUser(options = {}) {
        ensureStatusElement();
        const before = await getQueueStats();
        if (before.waiting || before.failed) {
            const copy = statusElement?.querySelector(".offline-sync-copy");
            if (copy) copy.textContent = `Syncing ${before.waiting + before.failed} records...`;
            if (statusElement) statusElement.dataset.state = "syncing";
        }

        const result = await syncPendingRecords({
            token: localStorage.getItem("token") || "",
            ownerKey: getCurrentUserKey(),
            force: options.force === true
        });

        if (result.syncedCount > 0) {
            localStorage.setItem("recordOfflineLastSync", new Date().toISOString());
            showSyncMessage(
                `${result.syncedCount} offline record${result.syncedCount === 1 ? "" : "s"} synced successfully.`,
                "success"
            );
        }

        if (result.failedCount > 0) {
            showSyncMessage(
                `${result.failedCount} offline record${result.failedCount === 1 ? "" : "s"} still need syncing.`,
                "warning"
            );
        }

        await refreshStatusIndicator();

        return result;
    }

    window.addEventListener("online", () => {
        updateOfflineNavigation("online", 0);
        updateOfflineBanners("Online - syncing pending records...");
        showSyncMessage(
            "You are back online. Syncing pending records...",
            "success"
        );

        syncForCurrentUser().catch(error => {
            console.error("OFFLINE SYNC ERROR:", error);
        });
    });

    window.addEventListener("offline", () => {
        updateOfflineNavigation("offline", 0);
        updateOfflineBanners("Offline - Records will be saved and synced when internet returns.");
        showSyncMessage(
            "You are Offline - Records will be saved and synced when internet returns.",
            "warning"
        );
    });

    if (typeof navigator === "undefined" || navigator.onLine !== false) {
        syncForCurrentUser().catch(error => {
            console.error("INITIAL OFFLINE SYNC ERROR:", error);
        });
    }

    window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
            syncForCurrentUser().catch(() => {});
        }
    }, 30000);

    window.addEventListener("focus", () => {
        syncForCurrentUser().catch(() => {});
    });

    window.setTimeout(() => {
        ensureStatusElement();
        refreshStatusIndicator().catch(() => {});
    }, 0);

    window.RecordOfflineQueue = {
        isSupported: isIndexedDbSupported,
        getCurrentUserKey,
        queueRecord,
        syncPendingRecords,
        syncForCurrentUser,
        countPendingRecords,
        getQueueStats,
        getPendingRecords
    };
})();
