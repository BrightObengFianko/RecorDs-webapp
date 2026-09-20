const token = localStorage.getItem("token");

const searchParams = new URLSearchParams(window.location.search);
const recordId = searchParams.get("id");

const detailsPanel = document.getElementById("detailsPanel");
const caseSubtitle = document.getElementById("caseSubtitle");
const detailsAvatar = document.getElementById("detailsAvatar");
const detailsCategory = document.getElementById("detailsCategory");
const detailsName = document.getElementById("detailsName");
const detailsBranch = document.getElementById("detailsBranch");
const detailsId = document.getElementById("detailsId");
const detailsStatus = document.getElementById("detailsStatus");
const detailsDate = document.getElementById("detailsDate");
const detailsPhone = document.getElementById("detailsPhone");
const detailsRegistration = document.getElementById("detailsRegistration");
const detailsRegistrar = document.getElementById("detailsRegistrar");
const detailsSms = document.getElementById("detailsSms");
const detailsBranchName = document.getElementById("detailsBranchName");
const detailsNotes = document.getElementById("detailsNotes");
const editCaseButton = document.getElementById("editCaseButton");
const logoutButton = document.getElementById("logoutButton");

if (!token) {
    window.location.href = "index.html";
}

function readStoredUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "null") || {};
    } catch (error) {
        console.error("Unable to read stored user:", error);
        return {};
    }
}

function getCurrentRole() {
    return String(readStoredUser().role || "").trim().toLowerCase();
}

function canEditRecords() {
    return ["admin", "staff"].includes(getCurrentRole());
}

function formatDateOnly(value) {
    if (!value || value === "-") {
        return "-";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        const [year, month, day] = String(value).split("-");
        return `${day}/${month}/${year}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-GB");
}

function formatStatus(value) {
    const status = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");

    if (status === "ready") {
        return "Ready";
    }

    if (status === "not ready") {
        return "Not Ready";
    }

    if (status === "pending") {
        return "Pending";
    }

    return value ? String(value) : "-";
}

function formatSmsDetails(smsSent, smsDate) {
    const sent =
        smsSent === true ||
        smsSent === "true" ||
        smsSent === "TRUE" ||
        smsSent === "Yes" ||
        smsSent === "YES" ||
        smsSent === 1 ||
        smsSent === "1";

    if (!sent) {
        return "Not Sent";
    }

    if (!smsDate) {
        return "Sent";
    }

    const date = new Date(smsDate);

    if (Number.isNaN(date.getTime())) {
        return "Sent";
    }

    const dateText = new Intl.DateTimeFormat("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(date);

    const timeText = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    }).format(date).toUpperCase();

    return `Sent on ${dateText} at ${timeText}`;
}

function setText(element, value) {
    if (element) {
        element.textContent = value || "-";
    }
}

function setStatusChip(element, value) {
    if (!element) {
        return;
    }

    element.textContent = value || "-";
    element.classList.remove("status-pending", "status-ready", "status-not-ready");
    element.classList.add("is-status");

    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "ready") {
        element.classList.add("status-ready");
    } else if (normalized === "not ready") {
        element.classList.add("status-not-ready");
    } else {
        element.classList.add("status-pending");
    }
}

function setAvatar(name) {
    if (!detailsAvatar) {
        return;
    }

    const initial = String(name || "R").trim().charAt(0).toUpperCase() || "R";
    detailsAvatar.textContent = initial;
}

function renderEmpty(message) {
    if (!detailsPanel) {
        return;
    }

    detailsPanel.innerHTML = "";

    const card = document.createElement("div");
    card.className = "detail-card";

    const label = document.createElement("span");
    label.className = "detail-label";
    label.textContent = "Notice";

    const value = document.createElement("strong");
    value.className = "detail-value";
    value.textContent = message;

    card.appendChild(label);
    card.appendChild(value);
    detailsPanel.appendChild(card);
}

async function loadRecord() {
    if (!recordId) {
        renderEmpty("Record ID is missing.");
        return;
    }

    try {
        const response = await fetch(`/api/records/${encodeURIComponent(recordId)}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "index.html";
            return;
        }

        const data = await response.json();

        if (response.status === 403) {
            Notification.error(data.message || "You do not have permission to view this record.");
            window.location.href = "search-cases.html";
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Unable to load record.");
        }

        const record = data.record;

        if (!record) {
            throw new Error("Record not found.");
        }

        const isDeath = String(record.category || "").trim().toLowerCase() === "death";
        const dateValue = isDeath ? record.date_of_death : record.date_of_birth;
        const branchName = record.branch_name || "-";
        const statusValue = formatStatus(record.status);

        document.title = `RecorDs - ${record.name || "Case Details"}`;
        setText(caseSubtitle, `Record #${record.id}`);
        setText(detailsCategory, record.category || "-");
        setText(detailsName, record.name || "-");
        setText(detailsBranch, branchName);
        setText(detailsId, record.id || "-");
        setStatusChip(detailsStatus, statusValue);
        setText(detailsDate, formatDateOnly(dateValue));
        setText(detailsPhone, record.phone_number || "-");
        setText(detailsRegistration, formatDateOnly(record.registration_date));
        setText(
            detailsRegistrar,
            window.RecordRegistrar?.normalize(record.registrar) || "-"
        );
        setText(detailsSms, formatSmsDetails(record.sms_sent, record.sms_date));
        setText(detailsBranchName, branchName);
        setText(detailsNotes, record.notes || "-");
        setAvatar(record.name || "R");

        if (editCaseButton) {
            if (canEditRecords()) {
                editCaseButton.hidden = false;
                editCaseButton.href = `create-record.html?id=${encodeURIComponent(record.id)}`;
            } else {
                editCaseButton.hidden = true;
            }
        }
    } catch (error) {
        console.error("LOAD CASE DETAILS ERROR:", error);

        if (caseSubtitle) {
            caseSubtitle.textContent = "Unable to load record details.";
        }

        renderEmpty(error.message || "Unable to load record details.");
    }
}

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "index.html";
    });
}

loadRecord();
