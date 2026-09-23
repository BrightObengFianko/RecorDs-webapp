const reportsToken = localStorage.getItem("token");
const activityBody = document.getElementById("activityBody");
const activitySummary = document.getElementById("activitySummary");
const previousActivityPage = document.getElementById("previousActivityPage");
const nextActivityPage = document.getElementById("nextActivityPage");
const activityPageInfo = document.getElementById("activityPageInfo");
const ACTIVITY_PAGE_SIZE = 10;
let activityPage = 1;
const activityDetailsModal = document.getElementById("activityDetailsModal");
const activityDetailsBody = document.getElementById("activityDetailsBody");
const activityDetailsTitle = document.getElementById("activityDetailsTitle");
const activityDetailsSubtitle = document.getElementById("activityDetailsSubtitle");

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

function formatDetailValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    return escapeReportHtml(value);
}

function formatDetailDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? formatDetailValue(value)
        : escapeReportHtml(date.toLocaleDateString("en-GB"));
}

function renderActivityDetails(activity) {
    const snapshot = activity.current_record || activity.record_snapshot;
    const deleted = activity.activity_type === "RECORD_DELETED" && !activity.current_record;
    const fieldRows = snapshot
        ? [
            ["Case/Record ID", snapshot.id || activity.record_id],
            ["Name", snapshot.name],
            ["Phone number", snapshot.phone_number],
            ["Category", snapshot.category],
            ["Date of birth", snapshot.date_of_birth],
            ["Date of death", snapshot.date_of_death],
            ["Date of registration", snapshot.registration_date],
            ["Registrar", snapshot.registrar],
            ["Branch", activity.branch_name || snapshot.branch_id],
            ["Status", snapshot.status],
            ["SMS status", snapshot.sms_status],
            ["SMS date/time", snapshot.sms_date],
            ["Note", snapshot.notes]
        ].filter(([, value]) => value !== null && value !== undefined && value !== "")
            .map(([label, value]) => `<div class="activity-detail-row"><dt>${escapeReportHtml(label)}</dt><dd>${label.includes("Date") ? formatDetailDate(value) : formatDetailValue(value)}</dd></div>`)
            .join("")
        : `<p class="activity-detail-muted">No case snapshot was recorded for this activity.</p>`;

    const changes = Array.isArray(activity.change_set) ? activity.change_set : [];
    const changesMarkup = changes.length
        ? `<section class="activity-detail-section"><h3>Changes made</h3><div class="activity-change-list">${changes.map(change => `
            <div class="activity-change">
                <strong>${escapeReportHtml(change.label || change.field || "Field")}</strong>
                <div><span>Old value</span><p>${formatDetailValue(change.oldValue)}</p></div>
                <div><span>New value</span><p>${formatDetailValue(change.newValue)}</p></div>
            </div>`).join("")}</div></section>`
        : activity.activity_type === "RECORD_EDITED"
            ? `<section class="activity-detail-section"><p class="activity-detail-muted">Detailed before/after values were not recorded for this activity.</p></section>`
            : "";

    return `
        ${deleted ? '<div class="activity-deleted-label">Deleted case</div>' : ""}
        <section class="activity-detail-section"><h3>Activity information</h3><dl class="activity-detail-grid">
            <div class="activity-detail-row"><dt>Activity</dt><dd>${escapeReportHtml(activityLabel(activity.activity_type))}</dd></div>
            <div class="activity-detail-row"><dt>Date/time</dt><dd>${formatActivityDate(activity.occurred_at)} ${formatActivityTime(activity.occurred_at)}</dd></div>
            <div class="activity-detail-row"><dt>Changed by</dt><dd>${formatDetailValue(activity.user_name)}</dd></div>
            <div class="activity-detail-row"><dt>Role</dt><dd>${escapeReportHtml(roleLabel(activity.user_role))}</dd></div>
            <div class="activity-detail-row"><dt>Branch</dt><dd>${formatDetailValue(activity.branch_name)}</dd></div>
            <div class="activity-detail-row"><dt>Success</dt><dd>${activity.success === false ? "Failed" : "Successful"}</dd></div>
            <div class="activity-detail-row"><dt>Details</dt><dd>${formatDetailValue(activity.details || activity.new_value)}</dd></div>
        </dl></section>
        ${snapshot ? `<section class="activity-detail-section"><h3>${deleted ? "Deleted case" : "Case information"}</h3><dl class="activity-detail-grid">${fieldRows}</dl></section>` : ""}
        ${changesMarkup}
    `;
}

function closeActivityDetails() {
    if (!activityDetailsModal) return;
    activityDetailsModal.hidden = true;
    document.body.classList.remove("activity-modal-open");
}

async function openActivityDetails(activityId) {
    if (!activityDetailsModal || !activityId) return;
    activityDetailsModal.hidden = false;
    document.body.classList.add("activity-modal-open");
    activityDetailsTitle.textContent = "Loading activity details";
    activityDetailsSubtitle.textContent = "";
    activityDetailsBody.innerHTML = '<p class="activity-detail-muted">Loading...</p>';

    try {
        const response = await fetch(`/api/admin/auth-activity/${encodeURIComponent(activityId)}`, {
            headers: { Authorization: `Bearer ${reportsToken}` }
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.replace("index.html");
            return;
        }
        if (!response.ok) throw new Error(data.message || "Unable to load activity details.");
        const activity = data.activity;
        activityDetailsTitle.textContent = activity.record_id ? "Case activity details" : "Activity details";
        activityDetailsSubtitle.textContent = activity.record_id ? `Case #${activity.record_id}` : activityLabel(activity.activity_type);
        activityDetailsBody.innerHTML = renderActivityDetails(activity);
    } catch (error) {
        activityDetailsBody.innerHTML = `<p class="activity-detail-muted">${escapeReportHtml(error.message)}</p>`;
    }
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

    activityBody.innerHTML = '<tr><td colspan="9" class="reports-empty">Loading activity...</td></tr>';

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
            activityBody.innerHTML = '<tr><td colspan="9" class="reports-empty">No activity logs found.</td></tr>';
            return;
        }

        activityBody.innerHTML = activities.map(activity => `
            <tr class="activity-row" data-activity-id="${escapeReportHtml(activity.id)}" tabindex="0" role="button" aria-label="View activity details">
                <td data-label="User" class="activity-user"><strong>${escapeReportHtml(activity.user_name || "Unknown user")}</strong><span>${escapeReportHtml(activity.user_email || "Email unavailable")}</span></td>
                <td data-label="Role">${escapeReportHtml(roleLabel(activity.user_role))}</td>
                <td data-label="Activity"><span class="activity-badge ${escapeReportHtml(activityClass(activity.activity_type))}">${escapeReportHtml(activityLabel(activity.activity_type))}</span></td>
                <td data-label="Branch">${escapeReportHtml(activity.branch_name || "-")}</td>
                <td data-label="Case">${escapeReportHtml(activity.record_id || "-")}</td>
                <td data-label="Details">${escapeReportHtml(activity.details || activity.new_value || "-")}</td>
                <td data-label="Date">${escapeReportHtml(formatActivityDate(activity.occurred_at))}</td>
                <td data-label="Time">${escapeReportHtml(formatActivityTime(activity.occurred_at))}</td>
                <td data-label="Actions" class="activity-actions">${activity.activity_type === "RECORD_DELETED" ? `<button type="button" class="activity-restore-button" data-restore-activity-id="${escapeReportHtml(activity.id)}">Restore</button>` : "-"}</td>
            </tr>
        `).join("");
        activityBody.querySelectorAll(".activity-row").forEach(row => {
            const open = () => openActivityDetails(row.dataset.activityId);
            row.addEventListener("click", open);
            row.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open();
                }
            });
        });
        activityBody.querySelectorAll("[data-restore-activity-id]").forEach(button => {
            button.addEventListener("click", event => {
                event.stopPropagation();
                restoreDeletedCase(button.dataset.restoreActivityId, button);
            });
        });
    } catch (error) {
        activityBody.innerHTML = `<tr><td colspan="9" class="reports-empty">${escapeReportHtml(error.message)}</td></tr>`;
        if (window.Notification) Notification.error(error.message);
    }
}

async function restoreDeletedCase(activityId, button) {
    const confirmed = await ConfirmDialog.show(
        "Restore this deleted case to the active records?",
        "Restore Case",
        "Restore",
        "Cancel"
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
        const response = await fetch(`/api/admin/auth-activity/${encodeURIComponent(activityId)}/restore`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${reportsToken}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || "Unable to restore deleted case.");
        }

        Notification.success(data.message || "Case restored successfully.");
        await loadActivity();
    } catch (error) {
        button.disabled = false;
        Notification.error(error.message);
    }
}

if (!reportsToken) {
    window.location.replace("index.html");
} else {
    document.querySelectorAll("[data-activity-modal-close]").forEach(element => element.addEventListener("click", closeActivityDetails));
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeActivityDetails();
    });
    async function loadBranches() {
        const response = await fetch("/api/admin/branches", { headers: { Authorization: `Bearer ${reportsToken}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        document.getElementById("branchFilter").innerHTML = '<option value="">All branches</option>' + (data.branches || []).map(branch => `<option value="${escapeReportHtml(branch.id)}">${escapeReportHtml(branch.name)}</option>`).join("");
    }
    document.getElementById("filterButton").addEventListener("click", () => loadActivity({ resetPage: true }));
    document.getElementById("deletedCasesButton").addEventListener("click", () => {
        document.getElementById("activityFilter").value = "RECORD_DELETED";
        loadActivity({ resetPage: true });
    });
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
        const confirmed = await ConfirmDialog.show(
            "Are you sure you want to clear the activity logs? This action cannot be undone.",
            "Clear Activity Logs",
            "Clear Logs",
            "Cancel"
        );
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
