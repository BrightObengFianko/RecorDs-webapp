(function () {
    const token = localStorage.getItem("token");
    const list = document.getElementById("pendingSyncList");
    const count = document.getElementById("pendingSyncCount");
    const state = document.getElementById("pendingSyncState");
    const syncButton = document.getElementById("pendingSyncButton");
    let openCard = null;
    let deletedEntry = null;
    let undoTimer = null;
    const pageSize = 10;
    let currentPage = 1;
    let activeEntries = [];

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
        const status = String(entry.status || "").toUpperCase();
        if (status === "SYNC_FAILED") return { label: "Sync failed - Retry", className: "failed" };
        if (status === "SYNC_CONFLICT") return { label: "Conflict - Review required", className: "failed" };
        if (status === "SYNCING") return { label: "Syncing...", className: "" };
        return { label: "Waiting to sync", className: "" };
    }

    function detail(label, value) {
        return `<div class="pending-sync-detail"><label>${escapeHtml(label)}</label><span>${escapeHtml(value || "-")}</span></div>`;
    }

    function closeOpenCard() {
        if (!openCard) return;
        openCard.classList.remove("is-open-left", "is-open-right");
        openCard.querySelector(".pending-sync-swipe-content").style.transform = "";
        openCard = null;
    }

    function showUndoNotice() {
        const notice = document.createElement("div");
        notice.className = "pending-sync-undo";
        notice.innerHTML = `<span>Case deleted</span><button type="button">Undo</button>`;
        document.body.appendChild(notice);
        notice.querySelector("button").addEventListener("click", async () => {
            if (!deletedEntry) return;
            await window.RecordOfflineQueue.restoreRecord(deletedEntry);
            deletedEntry = null;
            window.clearTimeout(undoTimer);
            notice.remove();
            await renderQueue();
            Notification.success("Case restored.");
        });
        undoTimer = window.setTimeout(() => {
            deletedEntry = null;
            notice.remove();
        }, 6000);
    }

    async function deleteOfflineCase(card) {
        const uuid = card.dataset.offlineUuid;
        const entry = await window.RecordOfflineQueue.getRecord(uuid);
        if (!entry) return;
        if (!window.confirm("Are you sure you want to delete this recorded case?")) return;

        await window.RecordOfflineQueue.removeRecord(uuid);
        deletedEntry = entry;
        closeOpenCard();
        await renderQueue();
        showUndoNotice();
    }

    async function editOfflineCase(card) {
        const entry = await window.RecordOfflineQueue.getRecord(card.dataset.offlineUuid);
        const record = entry?.payload;
        if (!record) return;

        const overlay = document.createElement("div");
        overlay.className = "pending-sync-editor-overlay";
        overlay.innerHTML = `
            <section class="pending-sync-editor" role="dialog" aria-modal="true" aria-labelledby="offlineEditorTitle">
                <div class="pending-sync-editor-heading">
                    <div><h2 id="offlineEditorTitle">Edit offline case</h2><p>Changes stay on this device until synchronization.</p></div>
                    <button type="button" class="pending-sync-editor-close" aria-label="Close editor">&times;</button>
                </div>
                <form class="pending-sync-editor-form">
                    <label>Customer name<input name="name" required value="${escapeHtml(record.name || "")}"></label>
                    <label>Category<select name="category">
                        <option value="Birth" ${record.category === "Birth" ? "selected" : ""}>Birth</option>
                        <option value="Death" ${record.category === "Death" ? "selected" : ""}>Death</option>
                    </select></label>
                    <label>Phone number<input name="phone_number" inputmode="tel" value="${escapeHtml(record.phone_number || "")}"></label>
                    <label>Date of birth<input name="date_of_birth" placeholder="YYYY-MM-DD" value="${escapeHtml(record.date_of_birth || "")}"></label>
                    <label>Date of death<input name="date_of_death" placeholder="YYYY-MM-DD" value="${escapeHtml(record.date_of_death || "")}"></label>
                    <label class="pending-sync-editor-wide">Notes<textarea name="notes">${escapeHtml(record.notes || "")}</textarea></label>
                    <div class="pending-sync-editor-actions"><button type="button" class="pending-sync-editor-cancel">Cancel</button><button type="submit">Save changes</button></div>
                </form>
            </section>
        `;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector(".pending-sync-editor-close").addEventListener("click", close);
        overlay.querySelector(".pending-sync-editor-cancel").addEventListener("click", close);
        overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
        overlay.querySelector("form").addEventListener("submit", async event => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const updatedPayload = {
                ...record,
                client_uuid: record.client_uuid || card.dataset.offlineUuid,
                name: String(values.get("name") || "").trim().toUpperCase(),
                category: String(values.get("category") || record.category || "Birth"),
                phone_number: String(values.get("phone_number") || "").trim(),
                date_of_birth: String(values.get("date_of_birth") || "").trim() || null,
                date_of_death: String(values.get("date_of_death") || "").trim() || null,
                notes: String(values.get("notes") || "").trim()
            };
            if (!updatedPayload.name) return;
            await window.RecordOfflineQueue.queueRecord(updatedPayload, { operationType: "CREATE" });
            close();
            await renderQueue();
            Notification.success("Offline case updated.");
        });
    }

    function enableSwipe(card) {
        const content = card.querySelector(".pending-sync-swipe-content");
        let startX = 0;
        let startY = 0;
        let dragging = false;

        card.addEventListener("pointerdown", event => {
            if (event.pointerType === "mouse") return;
            startX = event.clientX;
            startY = event.clientY;
            dragging = false;
            card.setPointerCapture?.(event.pointerId);
        });

        card.addEventListener("pointermove", event => {
            if (event.pointerType === "mouse") return;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            if (!dragging && Math.abs(deltaX) < 12) return;
            if (!dragging && Math.abs(deltaY) > Math.abs(deltaX)) return;
            dragging = true;
            event.preventDefault();
            const offset = Math.max(-104, Math.min(104, deltaX));
            content.style.transform = `translateX(${offset}px)`;
        });

        card.addEventListener("pointerup", event => {
            if (!dragging || event.pointerType === "mouse") return;
            const deltaX = event.clientX - startX;
            dragging = false;
            if (Math.abs(deltaX) < 56) {
                closeOpenCard();
                return;
            }
            closeOpenCard();
            openCard = card;
            // Swiping left exposes the right-side Edit action; swiping right
            // exposes the left-side Delete action.
            const direction = deltaX < 0 ? "is-open-right" : "is-open-left";
            card.classList.add(direction);
            content.style.transform = deltaX < 0 ? "translateX(-104px)" : "translateX(104px)";
        });

        card.addEventListener("pointercancel", () => {
            dragging = false;
            closeOpenCard();
        });
    }

    async function renderQueue() {
        const queue = window.RecordOfflineQueue;
        if (!queue || typeof queue.getPendingRecords !== "function") {
            state.textContent = "Offline storage is not available in this browser.";
            list.innerHTML = `<div class="pending-sync-empty">Pending records cannot be loaded.</div>`;
            return;
        }

        const entries = await queue.getPendingRecords();
        activeEntries = entries;
        const totalPages = Math.max(1, Math.ceil(activeEntries.length / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        count.textContent = `${activeEntries.length} record${activeEntries.length === 1 ? "" : "s"} waiting to sync`;
        state.textContent = activeEntries.length ? "Stored securely on this device until the server confirms synchronization." : "All local records are synchronized.";

        if (!activeEntries.length) {
            list.innerHTML = `<div class="pending-sync-empty">No pending records.</div>`;
            renderPagination(1);
            return;
        }

        const start = (currentPage - 1) * pageSize;
        const pageEntries = activeEntries.slice(start, start + pageSize);

        list.innerHTML = pageEntries.map(entry => {
            const record = entry.payload || {};
            const syncState = getState(entry);
            const date = record.category && String(record.category).toLowerCase().includes("death")
                ? record.date_of_death
                : record.date_of_birth;

            return `
                <article class="pending-sync-swipe-card" data-offline-uuid="${escapeHtml(entry.uuid)}">
                    <div class="pending-sync-swipe-actions pending-sync-swipe-actions-left">
                        <button type="button" data-offline-action="delete" aria-label="Delete case">Delete</button>
                    </div>
                    <div class="pending-sync-swipe-actions pending-sync-swipe-actions-right">
                        <button type="button" data-offline-action="edit" aria-label="Edit case">Edit</button>
                    </div>
                    <div class="pending-sync-swipe-content">
                <details class="pending-sync-card">
                    <summary>
                        <div>
                            <div class="pending-sync-name">${escapeHtml(record.name || "Unnamed record")}</div>
                            <div class="pending-sync-meta">${escapeHtml(record.category || "-")} · ${escapeHtml(formatDate(date))}</div>
                        </div>
                        <div class="pending-sync-card-controls">
                            <span class="pending-sync-state ${syncState.className}">${escapeHtml(syncState.label)}</span>
                            <button type="button" data-offline-action="edit" aria-label="Edit case">Edit</button>
                            <button type="button" data-offline-action="delete" aria-label="Delete case">Delete</button>
                        </div>
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
                    </div>
                </article>
            `;
        }).join("");

        list.querySelectorAll(".pending-sync-swipe-card").forEach(enableSwipe);
        list.querySelectorAll('[data-offline-action="delete"]').forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                deleteOfflineCase(button.closest(".pending-sync-swipe-card"));
            });
        });
        list.querySelectorAll('[data-offline-action="edit"]').forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                editOfflineCase(button.closest(".pending-sync-swipe-card"));
            });
        });

        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        let pagination = document.getElementById("pendingSyncPagination");
        if (!pagination) {
            pagination = document.createElement("nav");
            pagination.id = "pendingSyncPagination";
            pagination.className = "pending-sync-pagination";
            pagination.setAttribute("aria-label", "Pending records pagination");
            list.insertAdjacentElement("afterend", pagination);
        }

        if (activeEntries.length <= pageSize) {
            pagination.hidden = true;
            pagination.innerHTML = "";
            return;
        }

        pagination.hidden = false;
        pagination.innerHTML = `
            <button type="button" data-pending-page="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>Previous</button>
            <span>Page ${currentPage} of ${totalPages}</span>
            <button type="button" data-pending-page="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>Next</button>
        `;
        pagination.querySelectorAll("[data-pending-page]").forEach(button => {
            button.addEventListener("click", () => {
                const page = Number(button.dataset.pendingPage);
                if (page < 1 || page > totalPages || page === currentPage) return;
                currentPage = page;
                renderQueue().catch(error => {
                    state.textContent = error.message || "Unable to load pending records.";
                });
            });
        });
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
    document.addEventListener("pointerdown", event => {
        if (openCard && !openCard.contains(event.target)) closeOpenCard();
    });
    window.setInterval(() => {
        if (document.visibilityState === "visible") renderQueue().catch(() => {});
    }, 5000);
    renderQueue().catch(error => {
        state.textContent = error.message || "Unable to load pending records.";
    });
})();
