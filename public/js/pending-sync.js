(function () {
    const token = localStorage.getItem("token");
    const list = document.getElementById("pendingSyncList");
    const count = document.getElementById("pendingSyncCount");
    const state = document.getElementById("pendingSyncState");
    const syncButton = document.getElementById("pendingSyncButton");

    if (!token) {
        window.location.replace("index.html");
        return;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(value) {
        if (!value) return "-";
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-GB");
    }

    function formatDateTime(value) {
        if (!value) return "-";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    }

    function getState(entry) {
        if (entry.status === "SYNC_FAILED") return { label: "Sync failed - Retry", className: "failed" };
        if (entry.status === "SYNC_CONFLICT") return { label: "Conflict - Review required", className: "failed" };
        if (entry.status === "SYNCING") return { label: "Syncing...", className: "" };
        return { label: "Waiting to sync", className: "" };
    }

    function detail(label, value) {
        return `<div class="pending-sync-detail"><label>${escapeHtml(label)}</label><span>${escapeHtml(value || "-")}</span></div>`;
    }

    async function renderQueue() {
        const queue = window.RecordOfflineQueue;
        if (!queue || typeof queue.getPendingRecords !== "function") {
            state.textContent = "Offline storage is not available in this browser.";
            list.innerHTML = `<div class="pending-sync-empty">Pending records cannot be loaded.</div>`;
            return;
        }

        const entries = await queue.getPendingRecords();
        const activeEntries = entries.filter(entry => ["PENDING_SYNC", "SYNC_FAILED", "SYNCING", "SYNC_CONFLICT"].includes(entry.status));
        count.textContent = `${activeEntries.length} record${activeEntries.length === 1 ? "" : "s"} waiting to sync`;
        state.textContent = activeEntries.length ? "Stored securely on this device until the server confirms synchronization." : "All local records are synchronized.";

        if (!activeEntries.length) {
            list.innerHTML = `<div class="pending-sync-empty">No pending records.</div>`;
            return;
        }

        list.innerHTML = activeEntries.map(entry => {
            const record = entry.payload || {};
            const syncState = getState(entry);
            const date = record.category && String(record.category).toLowerCase().includes("death")
                ? record.date_of_death
                : record.date_of_birth;

            return `
                <details class="pending-sync-card">
                    <summary>
                        <div>
                            <div class="pending-sync-name">${escapeHtml(record.name || "Unnamed record")}</div>
                            <div class="pending-sync-meta">${escapeHtml(record.category || "-")} · ${escapeHtml(formatDate(date))}</div>
                        </div>
                        <span class="pending-sync-state ${syncState.className}">${escapeHtml(syncState.label)}</span>
                    </summary>
                    <div class="pending-sync-details">
                        ${detail("Customer name", record.name)}
                        ${detail("Phone number", record.phone_number)}
                        ${detail("Date of birth", formatDate(record.date_of_birth))}
                        ${detail("Date of death", formatDate(record.date_of_death))}
                        ${detail("Category", record.category)}
                        ${detail("Registrar", window.RecordRegistrar?.normalize(record.registrar))}
                        ${detail("Registration date", formatDate(record.registration_date))}
                        ${detail("Branch", entry.branchId)}
                        ${detail("Current status", record.status)}
                        ${detail("Created offline", formatDateTime(entry.createdAt))}
                        ${detail("Last error", entry.lastError)}
                        ${detail("Notes", record.notes)}
                    </div>
                </details>
            `;
        }).join("");
    }

    async function syncNow() {
        syncButton.disabled = true;
        syncButton.textContent = "Synchronizing...";
        state.textContent = "Synchronizing pending records...";

        try {
            const result = await window.RecordOfflineQueue.syncForCurrentUser({ force: true });
            if (result.syncedCount) {
                Notification.success(`${result.syncedCount} record${result.syncedCount === 1 ? "" : "s"} synchronized successfully.`);
            }
            if (result.failedCount) {
                Notification.warning(`${result.failedCount} record${result.failedCount === 1 ? "" : "s"} could not be synchronized.`);
            }
            await renderQueue();
        } catch (error) {
            Notification.error("Unable to synchronize pending records.");
            state.textContent = error.message || "Synchronization failed. Records remain queued.";
        } finally {
            syncButton.disabled = false;
            syncButton.textContent = "Sync Now";
        }
    }

    syncButton.addEventListener("click", syncNow);
    window.addEventListener("online", renderQueue);
    window.setInterval(() => {
        if (document.visibilityState === "visible") renderQueue().catch(() => {});
    }, 5000);
    renderQueue().catch(error => {
        state.textContent = error.message || "Unable to load pending records.";
    });
})();
