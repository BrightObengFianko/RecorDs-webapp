const reportsToken = localStorage.getItem("token");
const activityBody = document.getElementById("activityBody");
const activitySummary = document.getElementById("activitySummary");
const previousActivityPage = document.getElementById("previousActivityPage");
const nextActivityPage = document.getElementById("nextActivityPage");
const activityPageInfo = document.getElementById("activityPageInfo");
const ACTIVITY_PAGE_SIZE = 10;
let activityPage = 1;

function escapeReportHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatActivityDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("en-GB");
}

function formatActivityTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function roleLabel(role) {
    return String(role || "Unknown")
        .replace(/_/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function activityLabel(type) {
    return {
        LOGIN_SUCCESS: "Successful login",
        LOGOUT_SUCCESS: "Successful logout",
        LOGIN_FAILURE: "Failed login",
        RECORD_CREATED: "Record created",
        RECORD_EDITED: "Record edited",
        RECORD_APPROVED: "Record approved",
        RECORD_DELETED: "Record deleted",
        RECORD_RESTORED: "Record restored",
        SMS_ACTIVITY: "SMS activity",
        USER_CREATED: "User created",
        USER_DISABLED: "User disabled",
        USER_ENABLED: "User enabled",
        SETTINGS_CHANGED: "Settings changed",
        BRANCH_ASSIGNMENT_CHANGED: "Branch assignment changed"
    }[type] || type || "Unknown";
}

function activityClass(type) {
    return String(type || "").toLowerCase().replace("_", "-");
}

function updateActivityPagination(total) {
    const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));

    if (activityPage > totalPages) {
        activityPage = totalPages;
    }

    activityPageInfo.textContent = `Page ${activityPage} of ${totalPages}`;
    previousActivityPage.disabled = activityPage <= 1;
    nextActivityPage.disabled = activityPage >= totalPages;
}

async function loadActivity({ resetPage = false } = {}) {
    if (resetPage) {
        activityPage = 1;
    }

    const params = new URLSearchParams();
    const fromDate = document.getElementById("fromDateFilter").value;
    const toDate = document.getElementById("toDateFilter").value;
    const user = document.getElementById("userFilter").value.trim();
    const search = document.getElementById("searchFilter").value.trim();
    const branch = document.getElementById("branchFilter").value;
    const role = document.getElementById("roleFilter").value;
    const activityType = document.getElementById("activityFilter").value;
    const sort = document.getElementById("sortFilter").value;

    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (user) params.set("user", user);
    if (search) params.set("search", search);
    if (branch) params.set("branch", branch);
    if (role) params.set("role", role);
    if (activityType) params.set("activity_type", activityType);
    if (sort) params.set("sort", sort);
    params.set("page", String(activityPage));
    params.set("limit", String(ACTIVITY_PAGE_SIZE));

    activityBody.innerHTML = '<tr><td colspan="8" class="reports-empty">Loading activity...</td></tr>';

    try {
        const response = await fetch(`/api/admin/auth-activity?${params.toString()}`, {
            headers: { Authorization: `Bearer ${reportsToken}` }
        });
        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.replace("index.html");
            return;
        }

        if (!response.ok) throw new Error(data.message || "Unable to load authentication activity.");

        const activities = Array.isArray(data.activities) ? data.activities : [];
        const total = Number(data.pagination?.total) || 0;
        activitySummary.textContent = `${total} activit${total === 1 ? "y" : "ies"} found`;
        updateActivityPagination(total);

        if (!activities.length) {
            activityBody.innerHTML = '<tr><td colspan="8" class="reports-empty">No activity logs found.</td></tr>';
            return;
        }

        activityBody.innerHTML = activities.map(activity => `
            <tr>
                <td data-label="User" class="activity-user"><strong>${escapeReportHtml(activity.user_name || "Unknown user")}</strong><span>${escapeReportHtml(activity.user_email || "Email unavailable")}</span></td>
                <td data-label="Role">${escapeReportHtml(roleLabel(activity.user_role))}</td>
                <td data-label="Activity"><span class="activity-badge ${escapeReportHtml(activityClass(activity.activity_type))}">${escapeReportHtml(activityLabel(activity.activity_type))}</span></td>
                <td data-label="Branch">${escapeReportHtml(activity.branch_name || "-")}</td>
                <td data-label="Case">${escapeReportHtml(activity.record_id || "-")}</td>
                <td data-label="Details">${escapeReportHtml(activity.details || activity.new_value || "-")}</td>
                <td data-label="Date">${escapeReportHtml(formatActivityDate(activity.occurred_at))}</td>
                <td data-label="Time">${escapeReportHtml(formatActivityTime(activity.occurred_at))}</td>
            </tr>
        `).join("");
    } catch (error) {
        activityBody.innerHTML = `<tr><td colspan="8" class="reports-empty">${escapeReportHtml(error.message)}</td></tr>`;
        if (window.Notification) Notification.error(error.message);
    }
}

if (!reportsToken) {
    window.location.replace("index.html");
} else {
    async function loadBranches() {
        const response = await fetch("/api/admin/branches", { headers: { Authorization: `Bearer ${reportsToken}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        document.getElementById("branchFilter").innerHTML = '<option value="">All branches</option>' + (data.branches || []).map(branch => `<option value="${escapeReportHtml(branch.id)}">${escapeReportHtml(branch.name)}</option>`).join("");
    }
    document.getElementById("filterButton").addEventListener("click", () => loadActivity({ resetPage: true }));
    document.getElementById("refreshButton").addEventListener("click", () => loadActivity());
    document.getElementById("resetButton").addEventListener("click", () => {
        document.getElementById("fromDateFilter").value = "";
        document.getElementById("toDateFilter").value = "";
        document.getElementById("userFilter").value = "";
        document.getElementById("searchFilter").value = "";
        document.getElementById("branchFilter").value = "";
        document.getElementById("roleFilter").value = "";
        document.getElementById("activityFilter").value = "";
        document.getElementById("sortFilter").value = "newest";
        loadActivity({ resetPage: true });
    });
    previousActivityPage.addEventListener("click", () => {
        if (activityPage > 1) {
            activityPage -= 1;
            loadActivity();
        }
    });
    nextActivityPage.addEventListener("click", () => {
        if (!nextActivityPage.disabled) {
            activityPage += 1;
            loadActivity();
        }
    });
    document.getElementById("clearLogsButton").addEventListener("click", async () => {
        const confirmed = window.confirm("Are you sure you want to clear the activity logs? This action cannot be undone.");
        if (!confirmed) return;
        const response = await fetch("/api/admin/auth-activity", { method: "DELETE", headers: { Authorization: `Bearer ${reportsToken}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (window.Notification) Notification.error(data.message || "Unable to clear activity logs.");
            return;
        }
        if (window.Notification) Notification.success(data.message || "Activity logs cleared successfully.");
        loadActivity({ resetPage: true });
    });
    loadBranches().finally(() => loadActivity({ resetPage: true }));
}
