(function () {
    const DB_NAME = "recor_ds_offline_records";
    const DB_VERSION = 1;
    const STORE_NAME = "pending_records";
    const PENDING_STATUS = "PENDING_SYNC";

    let dbPromise = null;

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
                record.status === PENDING_STATUS &&
                (
                    !normalizedOwnerKey ||
                    record.ownerKey === normalizedOwnerKey
                )
        ).length;
    }

    async function queueRecord(recordData) {
        const payload =
            clonePayload(recordData);

        const uuid =
            String(
                payload.client_uuid ||
                ""
            )
                .trim();

        if (!uuid) {
            throw new Error(
                "A client UUID is required for offline records."
            );
        }

        const ownerKey =
            getCurrentUserKey();

        const existing =
            await getRecord(uuid);

        const createdAt =
            existing?.createdAt ||
            new Date().toISOString();

        const entry = {
            uuid,
            ownerKey,
            status: PENDING_STATUS,
            payload: {
                ...payload,
                client_uuid: uuid
            },
            createdAt,
            updatedAt: new Date().toISOString(),
            attempts: existing?.attempts || 0,
            lastError: null
        };

        await saveRecord(entry);

        return entry;
    }

    async function syncPendingRecords(options = {}) {
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

        const records =
            (await getAllRecords())
                .filter(
                    record =>
                        record &&
                        record.status === PENDING_STATUS &&
                        (
                            !ownerKey ||
                            record.ownerKey === ownerKey
                        )
                )
                .sort(
                    (left, right) =>
                        new Date(left.createdAt).getTime() -
                        new Date(right.createdAt).getTime()
                );

        let syncedCount = 0;
        let failedCount = 0;

        for (const entry of records) {

            try {

                const response =
                    await fetch(
                        "/api/records",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/json",
                                "Authorization":
                                    `Bearer ${token}`
                            },
                            body: JSON.stringify(
                                entry.payload
                            )
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
                    return {
                        online: true,
                        syncedCount,
                        failedCount,
                        pendingCount: await countPendingRecords(ownerKey),
                        authError: true,
                        networkError: false
                    };
                }

                if (
                    !response.ok ||
                    data?.success === false
                ) {
                    failedCount++;

                    await saveRecord({
                        ...entry,
                        attempts: (entry.attempts || 0) + 1,
                        updatedAt: new Date().toISOString(),
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
                    attempts: (entry.attempts || 0) + 1,
                    updatedAt: new Date().toISOString(),
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

    async function syncForCurrentUser() {
        const result = await syncPendingRecords({
            token: localStorage.getItem("token") || "",
            ownerKey: getCurrentUserKey()
        });

        if (result.syncedCount > 0) {
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

        return result;
    }

    window.addEventListener("online", () => {
        showSyncMessage(
            "You are back online. Syncing pending records...",
            "success"
        );

        syncForCurrentUser().catch(error => {
            console.error("OFFLINE SYNC ERROR:", error);
        });
    });

    window.addEventListener("offline", () => {
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

    window.RecordOfflineQueue = {
        isSupported: isIndexedDbSupported,
        getCurrentUserKey,
        queueRecord,
        syncPendingRecords,
        syncForCurrentUser,
        countPendingRecords
    };
})();
