(function () {
    const token = localStorage.getItem("token");
    const user = (() => {
        try { return JSON.parse(localStorage.getItem("user") || "null") || {}; } catch { return {}; }
    })();
    const isAdmin = String(user.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_") === "admin";
    const API = "/api/notifications";
    const TYPE_ICONS = {
        RECORD_CREATED: "🔵", RECORD_UPDATED: "🔵", RECORD_APPROVED: "🟢", RECORD_DELETED: "🗑️", RECORD_RESTORED: "🟢",
        PENDING_APPROVAL: "🟠", SMS_FAILED: "🔴", SMS_SERVICE_UNAVAILABLE: "🔴", SYNC_FAILED: "🔴",
        OFFLINE_RECORDS_PENDING: "🟠", DUPLICATE_DETECTED: "⚠️", USER_CREATED: "🔵", USER_DISABLED: "🔴",
        USER_ENABLED: "🟢", BRANCH_ASSIGNMENT_CHANGED: "🔵", FAILED_LOGIN_ALERT: "🔴",
        SETTINGS_CHANGED: "🔵", SYSTEM_ALERT: "⚠️"
    };
    let button;
    let panel;
    let unreadCount = 0;
    let reportPage = 1;
    let reportFilter = "";
    let notificationSearchTimer = null;
    let refreshTimer = null;
    let pollingStarted = false;
    let panelUnreadIndicator = null;

    if (!token || !isAdmin) return;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    }

    function timeAgo(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
        if (seconds < 60) return "Just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minute${Math.floor(seconds / 60) === 1 ? "" : "s"} ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour${Math.floor(seconds / 3600) === 1 ? "" : "s"} ago`;
        if (seconds < 172800) return "Yesterday";
        return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function notificationIcon(type) {
        const paths = {
            RECORD_CREATED: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 4v-4h-1A1.5 1.5 0 0 1 4 14.5z"/>',
            RECORD_UPDATED: '<path d="M5 19h4l10-10-4-4L5 15z"/><path d="m13.5 6.5 4 4"/>',
            RECORD_APPROVED: '<path d="m5 12 4 4L19 6"/>',
            RECORD_DELETED: '<path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13"/>',
            RECORD_RESTORED: '<path d="M6 8V4m0 0h4M6 4a8 8 0 1 1-1.2 10.6"/>',
            PENDING_APPROVAL: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
            SMS_ACTIVITY: '<path d="M6 4h12v16H6z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
            SYNC_SUCCEEDED: '<path d="M4 12a8 8 0 0 1 13.5-5.8L20 8"/><path d="M20 4v4h-4M20 12a8 8 0 0 1-13.5 5.8L4 16"/><path d="M4 20v-4h4"/>',
            SYNC_FAILED: '<path d="M12 4v8"/><path d="M12 16h.01"/><path d="M5 20h14L12 4z"/>',
            DUPLICATE_DETECTED: '<circle cx="9" cy="9" r="5"/><circle cx="15" cy="15" r="5"/>',
            SYSTEM_ALERT: '<path d="M12 4 3 20h18z"/><path d="M12 9v5M12 17h.01"/>'
        };
        return `<svg class="admin-notification-svg" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[type] || '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'}</g></svg>`;
    }

    Object.keys(TYPE_ICONS).forEach(type => {
        TYPE_ICONS[type] = notificationIcon(type);
    });

    async function request(path, options = {}) {
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Unable to load notifications.");
        return data;
    }

    function updateBadge(count) {
        unreadCount = Math.max(0, Number(count) || 0);
        if (!button) return;
        button.classList.toggle("has-unread", unreadCount > 0);
        const badge = button.querySelector(".admin-notification-badge");
        if (badge) {
            badge.hidden = unreadCount === 0;
            badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        }
        if (panelUnreadIndicator) {
            panelUnreadIndicator.hidden = unreadCount === 0;
            panelUnreadIndicator.textContent = unreadCount > 99 ? "99+ unread" : `${unreadCount} unread`;
        }
    }

    function notificationMarkup(item) {
        const priority = String(item.priority || "INFO").toLowerCase();
        const grouped = Array.isArray(item.metadata?.record_ids) && item.metadata.record_ids.length > 1;
        return `<button type="button" class="admin-notification-item ${item.is_read ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}">
            <span class="admin-notification-item-icon priority-${priority}">${TYPE_ICONS[item.type] || "🔔"}</span>
            <span class="admin-notification-item-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span>${grouped ? "<small>View affected records</small>" : ""}<small>${escapeHtml(timeAgo(item.created_at))}</small></span>
        </button>`;
    }

    function notificationAction(item) {
        const type = String(item.type || "").toUpperCase();
        const grouped = Array.isArray(item.metadata?.record_ids) && item.metadata.record_ids.length > 1;
        if (type === "PENDING_APPROVAL") return "Review Records";
        if (type === "RECORD_DELETED") return "View Details";
        if (type === "DUPLICATE_DETECTED") return "Check Record";
        if (["SYNC_SUCCEEDED", "SYNC_FAILED", "OFFLINE_RECORDS_PENDING"].includes(type)) return "View Sync";
        if (["SMS_ACTIVITY", "SMS_FAILED"].includes(type)) return "View SMS";
        return grouped ? "View Records" : "View Record";
    }

    function notificationMarkupWithAction(item) {
        const priority = String(item.priority || "INFO").toLowerCase();
        const grouped = Array.isArray(item.metadata?.record_ids) && item.metadata.record_ids.length > 1;
        const label = `${item.title}. ${item.message}`;
        return `<div class="admin-notification-row ${item.is_read ? "" : "is-unread"}">
            <button type="button" class="admin-notification-item ${item.is_read ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}">
                <span class="admin-notification-item-icon priority-${priority}">${notificationIcon(item.type)}</span>
                <span class="admin-notification-item-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span>${grouped ? "<small>View affected records</small>" : ""}<small>${escapeHtml(timeAgo(item.created_at))}</small></span>
            </button>
            <button type="button" class="admin-notification-action" data-notification-action-id="${escapeHtml(item.id)}">${escapeHtml(notificationAction(item))}</button>
        </div>`;
    }

    function notificationDestination(item) {
        const recordIds = Array.isArray(item.metadata?.record_ids) ? item.metadata.record_ids : [];
        const recordId = item.record_id || item.metadata?.record_id || recordIds[0];
        switch (String(item.type || "").toUpperCase()) {
            case "RECORD_DELETED":
                return `reports.html?activity=RECORD_DELETED${recordId ? `&case_id=${encodeURIComponent(recordId)}` : ""}`;
            case "PENDING_APPROVAL":
                return "account.html";
            case "RECORD_CREATED":
            case "RECORD_UPDATED":
            case "RECORD_APPROVED":
            case "RECORD_RESTORED":
                if (recordIds.length > 1) return "search-cases.html";
                return recordId ? `case-details.html?id=${encodeURIComponent(recordId)}` : "";
            case "SMS_ACTIVITY":
                return recordIds.length > 1
                    ? "search-cases.html"
                    : recordId
                        ? `case-details.html?id=${encodeURIComponent(recordId)}`
                        : "reports.html#notifications";
            case "SYNC_SUCCEEDED":
            case "SYNC_FAILED":
            case "OFFLINE_RECORDS_PENDING":
                return "pending-sync.html";
            default:
                return "";
        }
    }

    async function loadDropdown() {
        if (!panel) return;
        panel.querySelector(".admin-notification-list").innerHTML = '<p class="admin-notification-state">Loading notifications...</p>';
        try {
            const data = await request("/?page=1&limit=10");
            const items = data.notifications || [];
            panel.querySelector(".admin-notification-list").innerHTML = items.length
                ? items.map(notificationMarkupWithAction).join("")
                : '<p class="admin-notification-state">🔔<br><strong>You\'re all caught up.</strong><br>No notifications yet.</p>';
            panel.querySelectorAll("[data-notification-id]").forEach(item => {
                item.notificationData = items.find(entry => String(entry.id) === String(item.dataset.notificationId));
                item.addEventListener("click", () => handleNotificationClick(item));
            });
            panel.querySelectorAll("[data-notification-action-id]").forEach(action => {
                action.notificationData = items.find(entry => String(entry.id) === String(action.dataset.notificationActionId));
                action.addEventListener("click", event => {
                    event.stopPropagation();
                    handleNotificationAction(action);
                });
            });
        } catch (error) {
            panel.querySelector(".admin-notification-list").innerHTML = `<p class="admin-notification-state">Unable to load notifications.<br><button type="button" class="admin-notification-retry">Try Again</button></p>`;
            panel.querySelector(".admin-notification-retry")?.addEventListener("click", loadDropdown);
        }
    }

    async function loadUnreadCount() {
        try {
            updateBadge((await request("/unread-count")).unreadCount);
            if (panel && !panel.hidden && !panel.contains(document.activeElement)) {
                await loadDropdown();
            }
        } catch { /* Header remains usable if notifications are unavailable. */ }
    }

    function startNotificationPolling() {
        if (pollingStarted) return;
        pollingStarted = true;
        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = window.setInterval(() => {
            if (document.visibilityState === "visible") loadUnreadCount();
        }, 30000);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") loadUnreadCount();
        });
    }

    async function markRead(id, item) {
        if (!item.classList.contains("is-unread")) return;
        item.classList.remove("is-unread");
        try { await request(`/${encodeURIComponent(id)}/read`, { method: "PATCH" }); updateBadge(unreadCount - 1); } catch { item.classList.add("is-unread"); }
    }

    async function markAllRead() {
        try { await request("/read-all", { method: "POST" }); updateBadge(0); await loadDropdown(); } catch { /* Keep the current list on a transient failure. */ }
    }

    async function clearAllNotifications() {
        const confirmed = await window.ConfirmDialog?.show(
            "Are you sure you want to clear all notification messages? This will not delete records or activity logs.",
            "Clear All Notifications",
            "Clear All",
            "Cancel"
        );
        if (!confirmed) return;

        try {
            const result = await request("/clear-all", { method: "DELETE" });
            updateBadge(0);
            if (panel) await loadDropdown();
            if (document.getElementById("notificationReportList")) await loadReportNotifications();
            window.Notification?.success?.(result.message || "All notifications cleared.");
        } catch (error) {
            window.Notification?.error?.(error.message || "Unable to clear notifications.");
        }
    }

    async function handleNotificationClick(item) {
        await markRead(item.dataset.notificationId, item);
        const destination = notificationDestination(item.notificationData || {});
        if (destination) window.location.assign(destination);
    }

    async function handleNotificationAction(action) {
        const item = action.closest(".admin-notification-row")?.querySelector("[data-notification-id]") || action;
        await markRead(action.dataset.notificationActionId, item);
        const destination = notificationDestination(action.notificationData || {});
        if (destination) window.location.assign(destination);
    }

    function positionPanel() {
        if (!panel || panel.hidden || !button) return;
        const rect = button.getBoundingClientRect();
        const mobile = window.matchMedia("(max-width: 600px)").matches;
        panel.classList.toggle("is-mobile", mobile);
        if (!mobile) {
            panel.style.top = `${Math.min(window.innerHeight - 18, rect.bottom + 10)}px`;
            panel.style.left = `${Math.max(12, Math.min(window.innerWidth - 360, rect.right - 340))}px`;
        }
    }

    function closePanel(event) {
        if (panel && !panel.hidden && !panel.contains(event.target) && event.target !== button) {
            panel.hidden = true;
            button.setAttribute("aria-expanded", "false");
        }
    }

    function createBell() {
        const target = document.querySelector(".topbar-right, .reports-topbar, .page-top-right, .account-heading, .pending-sync-heading, .page-heading, .settings-main .hero");
        if (!target || document.getElementById("adminNotificationButton")) return;
        button = document.createElement("button");
        button.id = "adminNotificationButton";
        button.className = "admin-notification-button";
        button.type = "button";
        button.setAttribute("aria-label", "Notifications");
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "adminNotificationPanel");
        button.innerHTML = "🔔<span class=\"admin-notification-badge\" hidden></span>";
        const smsBalance = target.querySelector(".dashboard-sms-balance, .search-sms-balance");
        const logout = target.querySelector("#logoutButton");
        if (smsBalance) {
            target.insertBefore(button, smsBalance);
        } else if (logout) {
            target.insertBefore(button, logout);
        } else {
            target.appendChild(button);
        }
        panel = document.createElement("section");
        panel.id = "adminNotificationPanel";
        panel.className = "admin-notification-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Notifications");
        panel.hidden = true;
        panel.innerHTML = `<header><strong>Notifications</strong><span class="admin-notification-header-actions"><button type="button" class="admin-notification-mark-all">Mark all read</button><button type="button" class="admin-notification-clear-all">Clear all</button></span></header><div class="admin-notification-list"></div><a class="admin-notification-view-all" href="reports.html#notifications">View All Notifications →</a>`;
        panelUnreadIndicator = document.createElement("span");
        panelUnreadIndicator.className = "admin-notification-unread-copy";
        panelUnreadIndicator.hidden = true;
        panel.querySelector("header > strong").after(panelUnreadIndicator);
        document.body.appendChild(panel);
        button.addEventListener("click", async () => {
            panel.hidden = !panel.hidden;
            button.setAttribute("aria-expanded", String(!panel.hidden));
            if (!panel.hidden) { positionPanel(); await loadDropdown(); }
        });
        panel.querySelector(".admin-notification-mark-all").addEventListener("click", markAllRead);
        panel.querySelector(".admin-notification-clear-all").addEventListener("click", clearAllNotifications);
        document.addEventListener("click", closePanel);
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && panel && !panel.hidden) {
                panel.hidden = true;
                button.setAttribute("aria-expanded", "false");
                button.focus();
            }
        });
        window.addEventListener("resize", positionPanel);
        window.addEventListener("scroll", positionPanel, true);
        loadUnreadCount();
    }

    async function loadReportNotifications() {
        const list = document.getElementById("notificationReportList");
        if (!list) return;
        const params = new URLSearchParams({ page: String(reportPage), limit: "10" });
        const searchInput = document.getElementById("notificationSearchInput");
        const typeInput = document.getElementById("notificationTypeFilter");
        const dateInput = document.getElementById("notificationDateFilter");
        const dateFromInput = document.getElementById("notificationDateFrom");
        const dateToInput = document.getElementById("notificationDateTo");
        const sortInput = document.getElementById("notificationSort");
        if (reportFilter === "unread" || reportFilter === "read") params.set("readStatus", reportFilter);
        if (searchInput?.value.trim()) params.set("search", searchInput.value.trim());
        if (typeInput?.value) params.set("type", typeInput.value);
        if (sortInput?.value) params.set("sort", sortInput.value);
        if (dateInput?.value === "custom") {
            if (dateFromInput?.value) params.set("dateFrom", dateFromInput.value);
            if (dateToInput?.value) params.set("dateTo", dateToInput.value);
        } else if (["today", "yesterday", "7", "30"].includes(dateInput?.value)) {
            const now = new Date();
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (dateInput.value === "yesterday") end.setDate(end.getDate() - 1);
            const start = new Date(end);
            if (dateInput.value === "7" || dateInput.value === "30") start.setDate(start.getDate() - Number(dateInput.value) + 1);
            const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            params.set("dateFrom", formatDate(start));
            params.set("dateTo", formatDate(end));
        }
        list.innerHTML = '<p class="admin-notification-state">Loading notifications...</p>';
        try {
            const data = await request(`/?${params}`);
            const items = data.notifications || [];
            list.innerHTML = items.length ? items.map(notificationMarkupWithAction).join("") : `<p class="admin-notification-state">${reportFilter === "unread" ? "✓<br><strong>You\'re all caught up.</strong><br>No unread notifications." : "🔔<br><strong>No notifications yet.</strong>"}</p>`;
            document.getElementById("notificationReportPage").textContent = `Page ${data.pagination?.page || 1} of ${data.pagination?.totalPages || 1}`;
            document.getElementById("notificationReportPrevious").disabled = reportPage <= 1;
            document.getElementById("notificationReportNext").disabled = reportPage >= (data.pagination?.totalPages || 1);
            list.querySelectorAll("[data-notification-id]").forEach(item => {
                item.notificationData = items.find(entry => String(entry.id) === String(item.dataset.notificationId));
                item.addEventListener("click", () => handleNotificationClick(item));
            });
            list.querySelectorAll("[data-notification-action-id]").forEach(action => {
                action.notificationData = items.find(entry => String(entry.id) === String(action.dataset.notificationActionId));
                action.addEventListener("click", event => {
                    event.stopPropagation();
                    handleNotificationAction(action);
                });
            });
        } catch (error) { list.innerHTML = `<p class="admin-notification-state">Unable to load notifications.<br><button type="button" class="admin-notification-retry">Try Again</button></p>`; list.querySelector("button")?.addEventListener("click", loadReportNotifications); }
    }

    function initReportSection() {
        const section = document.getElementById("notifications");
        if (!section) return;
        section.hidden = window.location.hash !== "#notifications";
        document.querySelectorAll("[data-notification-filter]").forEach(tab => tab.addEventListener("click", () => { reportFilter = tab.dataset.notificationFilter; reportPage = 1; document.querySelectorAll("[data-notification-filter]").forEach(item => item.classList.toggle("is-active", item === tab)); loadReportNotifications(); }));
        const searchInput = document.getElementById("notificationSearchInput");
        const typeInput = document.getElementById("notificationTypeFilter");
        const dateInput = document.getElementById("notificationDateFilter");
        const dateFromInput = document.getElementById("notificationDateFrom");
        const dateToInput = document.getElementById("notificationDateTo");
        const sortInput = document.getElementById("notificationSort");
        searchInput?.addEventListener("input", () => {
            window.clearTimeout(notificationSearchTimer);
            notificationSearchTimer = window.setTimeout(() => { reportPage = 1; loadReportNotifications(); }, 350);
        });
        [typeInput, dateInput, dateFromInput, dateToInput, sortInput].forEach(input => input?.addEventListener("change", () => {
            if (input === dateInput) {
                const custom = dateInput.value === "custom";
                dateFromInput.hidden = !custom;
                dateToInput.hidden = !custom;
            }
            reportPage = 1;
            loadReportNotifications();
        }));
        document.getElementById("notificationClearFilters")?.addEventListener("click", () => {
            reportFilter = "";
            if (searchInput) searchInput.value = "";
            if (typeInput) typeInput.value = "";
            if (dateInput) dateInput.value = "";
            if (dateFromInput) { dateFromInput.value = ""; dateFromInput.hidden = true; }
            if (dateToInput) { dateToInput.value = ""; dateToInput.hidden = true; }
            if (sortInput) sortInput.value = "newest";
            document.querySelectorAll("[data-notification-filter]").forEach(item => item.classList.toggle("is-active", item.dataset.notificationFilter === ""));
            reportPage = 1;
            loadReportNotifications();
        });
        document.getElementById("notificationReportPrevious")?.addEventListener("click", () => { if (reportPage > 1) { reportPage--; loadReportNotifications(); } });
        document.getElementById("notificationReportNext")?.addEventListener("click", () => { reportPage++; loadReportNotifications(); });
        document.getElementById("notificationReportClearAll")?.addEventListener("click", clearAllNotifications);
        if (window.location.hash === "#notifications") loadReportNotifications();
    }

    function start() { createBell(); initReportSection(); startNotificationPolling(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
    window.setTimeout(start, 700);
})();
