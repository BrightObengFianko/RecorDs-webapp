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
    }

    function notificationMarkup(item) {
        const priority = String(item.priority || "INFO").toLowerCase();
        const grouped = Array.isArray(item.metadata?.record_ids) && item.metadata.record_ids.length > 1;
        return `<button type="button" class="admin-notification-item ${item.is_read ? "" : "is-unread"}" data-notification-id="${escapeHtml(item.id)}">
            <span class="admin-notification-item-icon priority-${priority}">${TYPE_ICONS[item.type] || "🔔"}</span>
            <span class="admin-notification-item-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.message)}</span>${grouped ? "<small>View affected records</small>" : ""}<small>${escapeHtml(timeAgo(item.created_at))}</small></span>
        </button>`;
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
                ? items.map(notificationMarkup).join("")
                : '<p class="admin-notification-state">🔔<br><strong>You\'re all caught up.</strong><br>No notifications yet.</p>';
            panel.querySelectorAll("[data-notification-id]").forEach(item => {
                item.notificationData = items.find(entry => String(entry.id) === String(item.dataset.notificationId));
                item.addEventListener("click", () => handleNotificationClick(item));
            });
        } catch (error) {
            panel.querySelector(".admin-notification-list").innerHTML = `<p class="admin-notification-state">Unable to load notifications.<br><button type="button" class="admin-notification-retry">Try Again</button></p>`;
            panel.querySelector(".admin-notification-retry")?.addEventListener("click", loadDropdown);
        }
    }

    async function loadUnreadCount() {
        try { updateBadge((await request("/unread-count")).unreadCount); } catch { /* Header remains usable if notifications are unavailable. */ }
    }

    async function markRead(id, item) {
        if (!item.classList.contains("is-unread")) return;
        item.classList.remove("is-unread");
        try { await request(`/${encodeURIComponent(id)}/read`, { method: "PATCH" }); updateBadge(unreadCount - 1); } catch { item.classList.add("is-unread"); }
    }

    async function markAllRead() {
        try { await request("/read-all", { method: "POST" }); updateBadge(0); await loadDropdown(); } catch { /* Keep the current list on a transient failure. */ }
    }

    async function handleNotificationClick(item) {
        await markRead(item.dataset.notificationId, item);
        const destination = notificationDestination(item.notificationData || {});
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
        if (panel && !panel.hidden && !panel.contains(event.target) && event.target !== button) panel.hidden = true;
    }

    function createBell() {
        const target = document.querySelector(".topbar-right, .reports-topbar, .page-top-right, .account-heading, .pending-sync-heading, .page-heading, .settings-main .hero");
        if (!target || document.getElementById("adminNotificationButton")) return;
        button = document.createElement("button");
        button.id = "adminNotificationButton";
        button.className = "admin-notification-button";
        button.type = "button";
        button.setAttribute("aria-label", "Notifications");
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
        panel.className = "admin-notification-panel";
        panel.hidden = true;
        panel.innerHTML = `<header><strong>Notifications</strong><button type="button" class="admin-notification-mark-all">Mark all read</button></header><div class="admin-notification-list"></div><a class="admin-notification-view-all" href="reports.html#notifications">View All Notifications →</a>`;
        document.body.appendChild(panel);
        button.addEventListener("click", async () => { panel.hidden = !panel.hidden; if (!panel.hidden) { positionPanel(); await loadDropdown(); } });
        panel.querySelector(".admin-notification-mark-all").addEventListener("click", markAllRead);
        document.addEventListener("click", closePanel);
        window.addEventListener("resize", positionPanel);
        window.addEventListener("scroll", positionPanel, true);
        loadUnreadCount();
    }

    async function loadReportNotifications() {
        const list = document.getElementById("notificationReportList");
        if (!list) return;
        const params = new URLSearchParams({ page: String(reportPage), limit: "10" });
        if (reportFilter === "unread") params.set("unread", "true");
        if (reportFilter === "important") params.set("priority", "CRITICAL,IMPORTANT");
        list.innerHTML = '<p class="admin-notification-state">Loading notifications...</p>';
        try {
            const data = await request(`/?${params}`);
            const items = data.notifications || [];
            list.innerHTML = items.length ? items.map(notificationMarkup).join("") : `<p class="admin-notification-state">${reportFilter === "unread" ? "✓<br><strong>You\'re all caught up.</strong><br>No unread notifications." : "🔔<br><strong>No notifications yet.</strong>"}</p>`;
            document.getElementById("notificationReportPage").textContent = `Page ${data.pagination?.page || 1} of ${data.pagination?.totalPages || 1}`;
            document.getElementById("notificationReportPrevious").disabled = reportPage <= 1;
            document.getElementById("notificationReportNext").disabled = reportPage >= (data.pagination?.totalPages || 1);
            list.querySelectorAll("[data-notification-id]").forEach(item => {
                item.notificationData = items.find(entry => String(entry.id) === String(item.dataset.notificationId));
                item.addEventListener("click", () => handleNotificationClick(item));
            });
        } catch (error) { list.innerHTML = `<p class="admin-notification-state">Unable to load notifications.<br><button type="button" class="admin-notification-retry">Try Again</button></p>`; list.querySelector("button")?.addEventListener("click", loadReportNotifications); }
    }

    function initReportSection() {
        const section = document.getElementById("notifications");
        if (!section) return;
        section.hidden = window.location.hash !== "#notifications";
        document.querySelectorAll("[data-notification-filter]").forEach(tab => tab.addEventListener("click", () => { reportFilter = tab.dataset.notificationFilter; reportPage = 1; document.querySelectorAll("[data-notification-filter]").forEach(item => item.classList.toggle("is-active", item === tab)); loadReportNotifications(); }));
        document.getElementById("notificationReportPrevious")?.addEventListener("click", () => { if (reportPage > 1) { reportPage--; loadReportNotifications(); } });
        document.getElementById("notificationReportNext")?.addEventListener("click", () => { reportPage++; loadReportNotifications(); });
        if (window.location.hash === "#notifications") loadReportNotifications();
    }

    function start() { createBell(); initReportSection(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
    window.setTimeout(start, 700);
})();
