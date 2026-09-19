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
        LOGIN_FAILURE: "Failed login"
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
    const date = document.getElementById("dateFilter").value;
    const user = document.getElementById("userFilter").value.trim();
    const role = document.getElementById("roleFilter").value;
    const activityType = document.getElementById("activityFilter").value;

    if (date) params.set("date", date);
    if (user) params.set("user", user);
    if (role) params.set("role", role);
    if (activityType) params.set("activity_type", activityType);
    params.set("page", String(activityPage));
    params.set("limit", String(ACTIVITY_PAGE_SIZE));

    activityBody.innerHTML = '<tr><td colspan="5" class="reports-empty">Loading activity...</td></tr>';

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
            activityBody.innerHTML = '<tr><td colspan="5" class="reports-empty">No authentication activity found.</td></tr>';
            return;
        }

        activityBody.innerHTML = activities.map(activity => `
            <tr>
                <td class="activity-user"><strong>${escapeReportHtml(activity.user_name || "Unknown user")}</strong><span>${escapeReportHtml(activity.user_email || "Email unavailable")}</span></td>
                <td>${escapeReportHtml(roleLabel(activity.user_role))}</td>
                <td><span class="activity-badge ${escapeReportHtml(activityClass(activity.activity_type))}">${escapeReportHtml(activityLabel(activity.activity_type))}</span></td>
                <td>${escapeReportHtml(formatActivityDate(activity.occurred_at))}</td>
                <td>${escapeReportHtml(formatActivityTime(activity.occurred_at))}</td>
            </tr>
        `).join("");
    } catch (error) {
        activityBody.innerHTML = `<tr><td colspan="5" class="reports-empty">${escapeReportHtml(error.message)}</td></tr>`;
        if (window.Notification) Notification.error(error.message);
    }
}

if (!reportsToken) {
    window.location.replace("index.html");
} else {
    document.getElementById("filterButton").addEventListener("click", () => loadActivity({ resetPage: true }));
    document.getElementById("refreshButton").addEventListener("click", () => loadActivity());
    document.getElementById("resetButton").addEventListener("click", () => {
        document.getElementById("dateFilter").value = "";
        document.getElementById("userFilter").value = "";
        document.getElementById("roleFilter").value = "";
        document.getElementById("activityFilter").value = "";
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
    loadActivity({ resetPage: true });
}
