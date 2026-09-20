// Check authentication

const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "index.html";
}

const totalRecordsElement = document.getElementById("totalRecords");
const readyRecordsElement = document.getElementById("readyRecords");
const pendingRecordsElement = document.getElementById("pendingRecords");
const smsSentElement = document.getElementById("smsSent");
const recentRecordsBody = document.getElementById("recentRecords");
const recentRecordsPagination = document.getElementById("recentRecordsPagination");
const recentRecordsCaption = document.getElementById("recentRecordsCaption");
const recentRecordsRefreshButton = document.getElementById("recentRecordsRefresh");
const adminDashboardExtras = document.getElementById("adminDashboardExtras");
const overviewChart = document.getElementById("overviewChart");
const categoryChart = document.getElementById("categoryChart");
const categoryLegend = document.getElementById("categoryLegend");
const categoryTotal = document.getElementById("categoryTotal");
const branchList = document.getElementById("branchList");
const systemOverviewGrid = document.getElementById("systemOverviewGrid");
const overviewTotal = document.getElementById("overviewTotal");
const overviewAverage = document.getElementById("overviewAverage");
const overviewBestPeriod = document.getElementById("overviewBestPeriod");
const overviewGrowth = document.getElementById("overviewGrowth");
const overviewGrowthCaption = document.getElementById("overviewGrowthCaption");
const overviewRegistrarFilter = document.getElementById("overviewRegistrarFilter");
const overviewCategoryFilter = document.getElementById("overviewCategoryFilter");
const overviewYearFilter = document.getElementById("overviewYearFilter");
const registrarPerformanceList = document.getElementById("registrarPerformanceList");
const registrarPerformanceInsight = document.getElementById("registrarPerformanceInsight");
const statusSmsGrid = document.getElementById("statusSmsGrid");
const buySmsBundleButton = document.getElementById("buySmsBundleButton");
const dashboardSmsBalance = document.getElementById("dashboardSmsBalance");
const dashboardPerformanceInsight = document.getElementById("dashboardPerformanceInsight");
const branchStaffDashboardPanel = document.getElementById("branchStaffDashboardPanel");
const branchStaffMetrics = document.getElementById("branchStaffMetrics");
const branchStaffMonthly = document.getElementById("branchStaffMonthly");

const overviewControls = document.querySelector(
    ".admin-panel-chart .overview-controls"
);
const overviewControlsHost = document.getElementById(
    "overviewControlsHost"
);

if (overviewControls && overviewControlsHost) {
    overviewControlsHost.appendChild(overviewControls);
}

const overviewState = {
    period: "daily",
    range: "30d",
    registrar: "",
    category: "",
    year: ""
};

const smsAccountState = {
    loaded: false,
    balance: null,
    bundle: null,
    buyUrl: null,
    error: ""
};

const validDashboardRegistrars = [
    "ADMIN",
    "OFFICE",
    "NEW OFFICE",
    "NEW MARKET",
    "POLYCLINIC"
];

const overviewCategories = new Set();

const recentRecordsState = {
    page: 1,
    totalPages: 0,
    loading: false
};

let dashboardSummaryLoading = false;

function readStoredUser() {
    try {
        return JSON.parse(localStorage.getItem("user") || "null") || {};
    } catch (error) {
        console.error("Unable to read stored user:", error);
        return {};
    }
}

let currentUserRole = String(
    readStoredUser().role || ""
)
    .trim()
    .toLowerCase();

function getCurrentUserRole() {
    return currentUserRole || String(
        readStoredUser().role || ""
    )
        .trim()
        .toLowerCase();
}

function isBranchStaffDashboardUser() {
    return getCurrentUserRole()
        .replace(/[\s-]+/g, "_") === "branch_staff";
}

function getDashboardProfile(apiUser) {
    const settingsProfile =
        window.RecordSettings &&
        typeof window.RecordSettings.readSettings === "function"
            ? window.RecordSettings.readSettings().profile || {}
            : {};

    const storedUser = readStoredUser();
    const sourceUser = apiUser && typeof apiUser === "object" ? apiUser : {};

    return {
        name: settingsProfile.fullName || storedUser.name || sourceUser.name || "Admin",
        email: settingsProfile.emailAddress || storedUser.email || sourceUser.email || "",
        role: storedUser.role || sourceUser.role || "Staff",
        avatar: settingsProfile.avatar || storedUser.avatar || sourceUser.avatar || "",
        phoneNumber: settingsProfile.phoneNumber || storedUser.phoneNumber || sourceUser.phoneNumber || "",
        username: settingsProfile.username || storedUser.username || sourceUser.username || "",
        bio: settingsProfile.bio || storedUser.bio || sourceUser.bio || "",
        branch_id: storedUser.branch_id || sourceUser.branch_id || "",
        branch: storedUser.branch || sourceUser.branch || ""
    };
}

function renderDashboardProfile(profile) {
    if (window.RecordProfile && typeof window.RecordProfile.applyProfile === "function") {
        window.RecordProfile.applyProfile(profile);
        return;
    }

    const name = profile.name || "Admin";
    const role = profile.role || "Staff";
    const firstLetter = name.charAt(0).toUpperCase() || "A";

    const nameTargets = [
        "welcomeName",
        "sidebarUserName",
        "topUserName"
    ];

    nameTargets.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = name;
        }
    });

    const roleTargets = [
        "sidebarUserRole",
        "topUserRole"
    ];

    roleTargets.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = role;
        }
    });

    const sidebarAvatar = document.getElementById("sidebarAvatar");
    if (sidebarAvatar) {
        sidebarAvatar.textContent = firstLetter;
    }

    const topAvatar = document.getElementById("topAvatar");
    if (topAvatar) {
        topAvatar.textContent = firstLetter;
    }
}

function normalizeStatus(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

function formatStatusLabel(value) {
    const status = normalizeStatus(value);

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

function getStatusClass(value) {
    const status = normalizeStatus(value);

    if (status === "ready") {
        return "status-ready";
    }

    if (status === "not ready") {
        return "status-not-ready";
    }

    return "status-pending";
}

function isSmsSent(value) {
    const text = String(value || "")
        .trim()
        .toLowerCase();

    return [
        "true",
        "t",
        "yes",
        "y",
        "1"
    ].includes(text);
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number)
        ? number.toLocaleString("en-US")
        : "0";
}

/**
 * Formats numbers to compact notation (K, M, etc.)
 * Examples: 1000 → 1K, 1500 → 1.5K, 1000000 → 1M
 * Numbers below 1000 are returned unchanged
 */
function formatCompactNumber(value) {
    const number = Number(value || 0);

    if (!Number.isFinite(number)) {
        return "0";
    }

    if (number < 1000) {
        return String(number);
    }

    if (number < 1000000) {
        const k = number / 1000;
        // Show one decimal place if needed
        return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
    }

    const m = number / 1000000;
    // Show one decimal place if needed
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
}

function formatShortDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    });
}

function getRecordDisplayDate(record) {
    const isDeath = String(record?.category || "")
        .trim()
        .toLowerCase() === "death";

    return isDeath
        ? record?.date_of_death
        : record?.date_of_birth;
}

function renderSummaryCounts(summary) {
    const totalRecords =
        Number(summary?.totalRecords ?? summary?.total_records ?? 0) || 0;
    const readyRecords =
        Number(summary?.readyRecords ?? summary?.ready_records ?? 0) || 0;
    const pendingRecords =
        Number(summary?.pendingRecords ?? summary?.pending_records ?? 0) || 0;
    const smsSent =
        Number(summary?.smsSent ?? summary?.sms_sent ?? summary?.sms_sent_records ?? 0) || 0;

    if (totalRecordsElement) {
        totalRecordsElement.textContent = formatCompactNumber(totalRecords);
    }

    if (readyRecordsElement) {
        readyRecordsElement.textContent = formatCompactNumber(readyRecords);
    }

    if (pendingRecordsElement) {
        pendingRecordsElement.textContent = formatCompactNumber(pendingRecords);
    }

    if (smsSentElement) {
        smsSentElement.textContent = formatCompactNumber(smsSent);
    }

}

function formatOverviewPeriod(value, period) {
    if (!value) {
        return "-";
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    if (period === "yearly") {
        return date.toLocaleDateString("en-US", {
            year: "numeric"
        });
    }

    if (period === "monthly") {
        return date.toLocaleDateString("en-US", {
            month: "short",
            year: "numeric"
        });
    }

    return formatShortDate(value);
}

function formatOverviewChartLabel(value, period) {
    if (!value) {
        return "";
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    if (period === "yearly") {
        return date.toLocaleDateString("en-US", {
            year: "numeric"
        });
    }

    if (period === "monthly") {
        return date.toLocaleDateString("en-US", {
            month: "short"
        });
    }

    return formatShortDate(value);
}

function renderOverviewMetrics(summary) {
    const records = Array.isArray(summary?.dailyRecords)
        ? summary.dailyRecords.map(item => ({
            date: item.day || item.date || "",
            count: Number(item.count || 0)
        }))
        : [];

    const total = records.reduce(
        (sum, item) => sum + item.count,
        0
    );

    const average = records.length
        ? total / records.length
        : 0;

    const best = records.reduce(
        (current, item) => item.count > (current?.count || 0)
            ? item
            : current,
        null
    );

    const growth = Number(summary?.overviewGrowth || 0);
    const growthPrefix = growth > 0 ? "+" : "";
    const growthText = `${growthPrefix}${growth.toFixed(1)}%`;

    if (overviewTotal) {
        overviewTotal.textContent = formatNumber(total);
    }

    if (overviewAverage) {
        overviewAverage.textContent = `${average.toFixed(0)}/${overviewState.period === "daily" ? "day" : overviewState.period === "monthly" ? "month" : "year"}`;
    }

    if (overviewBestPeriod) {
        overviewBestPeriod.textContent = best
            ? `${formatOverviewPeriod(best.date, overviewState.period)} (${formatNumber(best.count)})`
            : "-";
    }

    if (overviewGrowth) {
        overviewGrowth.textContent = growthText;
    }

    if (overviewGrowthCaption) {
        overviewGrowthCaption.textContent = `${growthText} compared with previous period`;
    }
}

function renderOverviewCategories(summary) {
    if (!overviewCategoryFilter) {
        return;
    }

    (summary?.categoryOptions || summary?.categoryBreakdown || []).forEach(item => {
        const category = String(item.label || item.category || "").trim();

        if (category) {
            overviewCategories.add(category);
        }
    });

    const selectedCategory = overviewState.category;
    overviewCategoryFilter.innerHTML = `
        <option value="">All Categories</option>
        ${Array.from(overviewCategories)
            .sort((a, b) => a.localeCompare(b))
            .map(category => `
                <option value="${escapeHtml(category)}">${escapeHtml(category)}</option>
            `)
            .join("")}
    `;
    overviewCategoryFilter.value = selectedCategory;
}

function renderOverviewYears(summary) {
    if (!overviewYearFilter) {
        return;
    }

    const years = Array.isArray(summary?.yearOptions)
        ? summary.yearOptions
            .map(item => Number(item.year))
            .filter(year => Number.isInteger(year))
        : [];

    const branchStaff = isBranchStaffDashboardUser();
    const currentYear =
        Number(summary?.overviewYear) ||
        new Date().getFullYear();
    const visibleYears = branchStaff
        ? [currentYear]
        : years;

    overviewYearFilter.innerHTML = `
        ${branchStaff ? "" : '<option value="">All Years</option>'}
        ${visibleYears.map(year => `
            <option value="${year}">${year}</option>
        `).join("")}
    `;
    overviewState.year = branchStaff
        ? String(currentYear)
        : overviewState.year;
    overviewYearFilter.value = overviewState.year;
    overviewYearFilter.disabled = branchStaff;
}

function renderRegistrarPerformance(summary) {
    if (!registrarPerformanceList) {
        return;
    }

    const counts = new Map(
        (summary?.registrarPerformance || []).map(item => [
            String(item.label || "").toUpperCase(),
            Number(item.count || 0)
        ])
    );

    const rows = validDashboardRegistrars.map(label => ({
        label,
        count: counts.get(label) || 0
    }));

    const highest = rows.reduce(
        (current, row) => row.count > (current?.count || 0)
            ? row
            : current,
        null
    );

    const totalCases = rows.reduce(
        (total, row) => total + row.count,
        0
    );
    const barScale = Math.max(10, totalCases);

    registrarPerformanceList.innerHTML = rows.map(row => `
        <div class="registrar-performance-row">
            <div class="registrar-performance-label">
                <strong>${escapeHtml(row.label)}</strong>
                <span>${formatNumber(row.count)} cases</span>
            </div>
            <div class="registrar-performance-bar" aria-hidden="true">
                <span style="width:${Math.min(100, (row.count / barScale) * 100)}%"></span>
            </div>
        </div>
    `).join("");

    if (registrarPerformanceInsight) {
        registrarPerformanceInsight.textContent = highest && highest.count
            ? `Highest-performing registrar: ${highest.label}`
            : "No registrar performance data for this selection.";
    }
}

function renderStatusSms(summary) {
    if (!statusSmsGrid) {
        return;
    }

    window.dashboardSummary = summary || {};

    const statusSms = summary?.statusSms || {};
    const cards = [
        ["Ready", statusSms.readyRecords || 0, "success"],
        ["Not Ready", statusSms.notReadyRecords || 0, "warning"],
        ["SMS Sent", statusSms.smsSent || 0, "success"],
        ["Not Sent", statusSms.smsNotSent || 0, "muted"],
        ["SMS Failed", statusSms.smsFailed || 0, "danger"],
        ["Success Rate", `${Number(statusSms.smsSuccessRate || 0).toFixed(1)}%`, "accent"]
    ];

    if (!isBranchStaffDashboardUser()) {
        cards.push(
            ["SMS Balance", smsAccountState.loaded ? (smsAccountState.balance ?? "Unavailable") : "Loading...", "accent"],
            ["SMS Bundle", smsAccountState.loaded ? (smsAccountState.bundle || "Unavailable") : "Loading...", "accent"]
        );
    }

    statusSmsGrid.innerHTML = cards.map(([label, value, tone]) => `
        <div class="status-sms-item ${tone}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join("");
}

async function loadSmsAccountSummary() {
    if (
        !buySmsBundleButton ||
        isBranchStaffDashboardUser()
    ) {
        if (dashboardSmsBalance) {
            dashboardSmsBalance.remove();
        }
        if (buySmsBundleButton) {
            buySmsBundleButton.remove();
        }
        return;
    }

    if (dashboardSmsBalance) {
        dashboardSmsBalance.hidden = false;
        dashboardSmsBalance.querySelector("strong").textContent = "Loading...";
    }

    smsAccountState.loaded = false;
    renderStatusSms(window.dashboardSummary || {});

    try {
        const response = await fetch("/api/sms/balance", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (dashboardSmsBalance) {
                    dashboardSmsBalance.remove();
                }
                if (buySmsBundleButton) {
                    buySmsBundleButton.remove();
                }
                return;
            }

            throw new Error(data.message || "Unable to load SMS balance.");
        }

        smsAccountState.loaded = true;
        smsAccountState.balance = data.balance;
        smsAccountState.bundle = data.bundle;
        smsAccountState.buyUrl = data.buyUrl;
        smsAccountState.error = "";
        renderStatusSms(window.dashboardSummary || {});

        if (dashboardSmsBalance) {
            dashboardSmsBalance.querySelector("strong").textContent =
                data.balance ?? "Unavailable";
        }

        buySmsBundleButton.hidden = false;
        buySmsBundleButton.onclick = () => {
            if (smsAccountState.buyUrl) {
                window.open(smsAccountState.buyUrl, "_blank", "noopener,noreferrer");
                return;
            }

            Notification.info("Configure ARKESEL_BUNDLE_URL to open the SMS bundle purchase page.");
        };
    } catch (error) {
        smsAccountState.loaded = true;
        smsAccountState.balance = null;
        smsAccountState.bundle = null;
        smsAccountState.error = error.message;
        renderStatusSms(window.dashboardSummary || {});

        if (dashboardSmsBalance) {
            dashboardSmsBalance.querySelector("strong").textContent = "Unavailable";
        }
        buySmsBundleButton.hidden = false;
        buySmsBundleButton.onclick = () => Notification.error(smsAccountState.error);
    }
}

function renderPerformanceInsight(summary) {
    if (!dashboardPerformanceInsight) {
        return;
    }

    const topCategory = summary?.categoryBreakdown?.[0];

    dashboardPerformanceInsight.textContent = topCategory
        ? `Top category: ${topCategory.label} (${formatNumber(topCategory.count)} cases)`
        : "No category insight for this selection.";
}

function renderBranchStaffDashboard(summary) {
    const branchStaff = isBranchStaffDashboardUser();

    if (branchStaffDashboardPanel) {
        branchStaffDashboardPanel.hidden = !branchStaff;
    }

    if (!branchStaff || !branchStaffMetrics || !branchStaffMonthly) {
        return;
    }

    const data = summary?.branchStaffDashboard || {};
    const metrics = [
        ["Total Cases", data.total_records || 0, "accent"],
        ["Ready", data.ready_records || 0, "success"],
        ["Pending", data.pending_records || 0, "warning"],
        ["Birth Certificates", data.birth_certificates || 0, "accent"],
        ["Death Certificates", data.death_certificates || 0, "danger"],
        ["SMS Sent", data.sms_sent || 0, "success"],
        ["SMS Failed", data.sms_failed || 0, "danger"]
    ];

    branchStaffMetrics.innerHTML = metrics.map(([label, value, tone]) => `
        <div class="branch-staff-metric ${tone}">
            <span>${escapeHtml(label)}</span>
            <strong>${formatNumber(value)}</strong>
        </div>
    `).join("");

    const year = Number(summary?.overviewYear) || new Date().getFullYear();
    const monthlyCounts = new Map(
        (data.monthlyProgress || []).map(item => [
            item.month,
            Number(item.count || 0)
        ])
    );

    const currentMonth = new Date().getMonth();
    const months = Array.from(
        { length: currentMonth + 1 },
        (_, index) => {
            const month = String(index + 1).padStart(2, "0");
            const key = `${year}-${month}`;
            return {
                key,
                label: new Date(year, index, 1).toLocaleDateString("en-US", {
                    month: "short"
                }),
                count: monthlyCounts.get(key) || 0
            };
        }
    );

    const maxCount = Math.max(
        1,
        ...months.map(item => item.count)
    );

    branchStaffMonthly.innerHTML = `
        <div class="branch-staff-monthly-heading">
            <strong>Monthly Progress</strong>
            <span>${year}</span>
        </div>
        <div class="branch-staff-monthly-bars">
            ${months.map(item => `
                <div class="branch-staff-month">
                    <div class="branch-staff-month-bar" title="${escapeHtml(`${item.label}: ${item.count} cases`)}">
                        <span style="height:${(item.count / maxCount) * 100}%"></span>
                    </div>
                    <strong>${formatNumber(item.count)}</strong>
                    <small>${item.label}</small>
                </div>
            `).join("")}
        </div>
    `;
}

async function loadOverviewRegistrars() {
    if (!overviewRegistrarFilter) {
        return;
    }

    try {
        const response = await fetch("/api/records/registrars", {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        const registrars = Array.isArray(data.registrars)
            ? data.registrars
            : [];

        overviewRegistrarFilter.innerHTML = `
            <option value="">All Registrars</option>
            ${registrars.map(registrar => `
                <option value="${escapeHtml(registrar)}">${escapeHtml(registrar)}</option>
            `).join("")}
        `;
        overviewRegistrarFilter.value = overviewState.registrar;
    } catch (error) {
        console.error("OVERVIEW REGISTRARS ERROR:", error);
    }
}

function setChartMessage(element, message) {
    if (!element) {
        return;
    }

    element.innerHTML = `
        <text
            x="50%"
            y="50%"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="currentColor"
            font-size="16"
            font-weight="600"
        >
            ${escapeHtml(message)}
        </text>
    `;
}

function renderOverviewChart(records) {
    if (!overviewChart) {
        return;
    }

    const points = Array.isArray(records)
        ? records.map(item => ({
            date: item.day || item.date || "",
            count: Number(item.count || 0)
        }))
        : [];

    if (!points.length) {
        setChartMessage(overviewChart, "No data available");
        return;
    }

    const width = 700;
    const height = 280;
    const padding = 36;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    const maxValue = Math.max(1, ...points.map(point => point.count));
    const stepX = points.length > 1
        ? chartWidth / (points.length - 1)
        : chartWidth;

    const coords = points.map((point, index) => {
        const x = padding + (index * stepX);
        const y = padding + chartHeight - ((point.count / maxValue) * chartHeight);
        return { x, y, ...point };
    });

    const linePath = coords
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    const areaPath = `
        M ${padding} ${height - padding}
        ${coords.map(point => `L ${point.x} ${point.y}`).join(" ")}
        L ${padding + chartWidth} ${height - padding}
        Z
    `;

    const gridLines = Array.from({ length: 5 }, (_, index) => {
        const y = padding + (chartHeight / 4) * index;
        const value = Math.round(maxValue - ((maxValue / 4) * index));
        return `
            <g>
                <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" />
                <text x="${padding - 10}" y="${y + 4}" text-anchor="end">${value}</text>
            </g>
        `;
    }).join("");

    const xLabels = coords
        .map((point, index) => {
            if (index % 2 !== 0 && index !== coords.length - 1) {
                return "";
            }

            return `
                <text x="${point.x}" y="${height - 10}" text-anchor="middle">${escapeHtml(formatOverviewChartLabel(point.date, overviewState.period))}</text>
            `;
        })
        .join("");

    const markers = coords
        .map(point => `
            <circle cx="${point.x}" cy="${point.y}" r="4.5"></circle>
        `)
        .join("");

    overviewChart.innerHTML = `
        <defs>
            <linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"></stop>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"></stop>
            </linearGradient>
        </defs>
        <g class="chart-grid">${gridLines}</g>
        <path class="chart-area" d="${areaPath}"></path>
        <path class="chart-line" d="${linePath}"></path>
        <g class="chart-markers">${markers}</g>
        <g class="chart-labels">${xLabels}</g>
    `;
}

function renderCategoryBreakdown(categories) {
    if (!categoryChart || !categoryLegend || !categoryTotal) {
        return;
    }

    const list = Array.isArray(categories)
        ? categories.map((item, index) => ({
            label: item.label || item.category || "Uncategorized",
            count: Number(item.count || 0),
            color: window.RecordCategoryColors
                ? window.RecordCategoryColors.getColor(item.label || item.category, index)
                : "#6b5bff"
        }))
        : [];

    const total = list.reduce(
        (sum, item) => sum + item.count,
        0
    );

    categoryTotal.textContent = formatCompactNumber(total);

    if (!list.length || !total) {
        categoryChart.style.background = "conic-gradient(#d9dde8 0 100%)";
        categoryLegend.innerHTML = `
            <div class="legend-empty">No category data available.</div>
        `;
        return;
    }

    let current = 0;
    const segments = list.map(item => {
        const next = current + ((item.count / total) * 100);
        const segment = `${item.color} ${current}% ${next}%`;
        current = next;
        return segment;
    });

    categoryChart.style.background = `conic-gradient(${segments.join(", ")})`;

    categoryLegend.innerHTML = list.map(item => {
        const percentage = ((item.count / total) * 100).toFixed(1);

        return `
            <div class="legend-item">
                <span class="legend-swatch" style="--legend-color:${item.color}"></span>
                <div class="legend-copy">
                    <strong>${escapeHtml(item.label)}</strong>
                    <span>${formatNumber(item.count)} cases</span>
                </div>
                <span class="legend-percent">${escapeHtml(percentage)}%</span>
            </div>
        `;
    }).join("");
}

function renderBranchBreakdown(branches) {
    if (!branchList) {
        return;
    }

    const list = Array.isArray(branches)
        ? branches.map(item => ({
            label: item.label || item.branch || "Unknown",
            count: Number(item.count || 0)
        }))
        : [];

    const total = list.reduce(
        (sum, item) => sum + item.count,
        0
    );

    if (!list.length || !total) {
        branchList.innerHTML = `
            <div class="empty-state">No branch data available.</div>
        `;
        return;
    }

    branchList.innerHTML = list.map(item => {
        const percentage = (item.count / total) * 100;
        return `
            <div class="branch-item">
                <div class="branch-icon">
                    <svg class="ui-icon" aria-hidden="true">
                        <use href="#icon-building"></use>
                    </svg>
                </div>
                <div class="branch-copy">
                    <strong>${escapeHtml(item.label)}</strong>
                    <div class="branch-bar">
                        <span style="width:${Math.max(8, percentage)}%"></span>
                    </div>
                </div>
                <div class="branch-meta">
                    <strong>${formatNumber(item.count)}</strong>
                    <span>${percentage.toFixed(1)}%</span>
                </div>
            </div>
        `;
    }).join("");
}

function renderSystemOverview(summary) {
    if (!systemOverviewGrid || getCurrentUserRole() !== "admin") {
        if (adminDashboardExtras) {
            adminDashboardExtras.hidden = getCurrentUserRole() !== "admin";
        }
        return;
    }

    const systemOverview = summary?.systemOverview || {};

    if (adminDashboardExtras) {
        adminDashboardExtras.hidden = false;
    }

    systemOverviewGrid.innerHTML = `
        <div class="system-item">
            <div class="system-icon accent">
                <svg class="ui-icon" aria-hidden="true">
                    <use href="#icon-users"></use>
                </svg>
            </div>
            <div class="system-copy">
                <span>Users</span>
                <strong>${formatNumber(systemOverview.users || 0)}</strong>
                <small>Total users</small>
            </div>
        </div>
        <div class="system-item">
            <div class="system-icon success">
                <svg class="ui-icon" aria-hidden="true">
                    <use href="#icon-building"></use>
                </svg>
            </div>
            <div class="system-copy">
                <span>Branches</span>
                <strong>${formatNumber(systemOverview.branches || 0)}</strong>
                <small>Active branches</small>
            </div>
        </div>
        <div class="system-item">
            <div class="system-icon warning">
                <svg class="ui-icon" aria-hidden="true">
                    <use href="#icon-chart"></use>
                </svg>
            </div>
            <div class="system-copy">
                <span>Records This Month</span>
                <strong>${formatNumber(systemOverview.recordsThisMonth || 0)}</strong>
                <small>This month</small>
            </div>
        </div>
        <div class="system-item">
            <div class="system-icon danger">
                <svg class="ui-icon" aria-hidden="true">
                    <use href="#icon-check"></use>
                </svg>
            </div>
            <div class="system-copy">
                <span>System Status</span>
                <strong>${escapeHtml(systemOverview.systemStatus || "Online")}</strong>
                <small>All systems operational</small>
            </div>
        </div>
    `;
}

function renderAdminOverview(summary) {
    if (adminDashboardExtras) {
        adminDashboardExtras.hidden = false;
    }

    renderOverviewChart(summary?.dailyRecords || []);
    renderBranchStaffDashboard(summary);
    renderOverviewMetrics(summary);
    renderOverviewCategories(summary);
    renderOverviewYears(summary);
    renderRegistrarPerformance(summary);
    renderStatusSms(summary);
    renderPerformanceInsight(summary);
    renderCategoryBreakdown(summary?.categoryBreakdown || []);
    renderBranchBreakdown(summary?.branchBreakdown || []);

    const isAdmin =
        getCurrentUserRole() === "admin";

    const systemPanel =
        systemOverviewGrid?.closest(
            ".admin-panel-system"
        );

    const branchPanel =
        branchList?.closest(
            ".admin-panel-branches"
        );

    const overviewPanel =
        overviewChart?.closest(
            ".admin-panel-chart"
        );

    const overviewCategoryContainer =
        overviewChart?.closest(
            ".overview-category-container"
        );

    const categoryPanel =
        categoryChart?.closest(
            ".admin-panel-donut"
        );

    const registrarPerformancePanel =
        registrarPerformanceList?.closest(
            ".admin-panel-registrars"
        );

    const statusSmsPanel =
        statusSmsGrid?.closest(
            ".admin-panel-status"
        );

    const isBranchStaff =
        getCurrentUserRole() === "branch_staff";

    if (overviewPanel) {
        overviewPanel.hidden = isBranchStaff;
    }

    if (overviewCategoryContainer) {
        overviewCategoryContainer.hidden = isBranchStaff;
    }

    if (categoryPanel) {
        categoryPanel.hidden = isBranchStaff;
    }

    if (registrarPerformancePanel) {
        registrarPerformancePanel.hidden = isBranchStaff;
    }

    if (statusSmsPanel) {
        statusSmsPanel.hidden = isBranchStaff;
    }

    if (branchPanel) {
        branchPanel.hidden = !isAdmin || isBranchStaff;
    }

    if (systemPanel) {
        systemPanel.hidden = !isAdmin || isBranchStaff;
    }

    if (isAdmin) {
        renderSystemOverview(summary);
    }
}

function renderRecentPagination(pagination) {
    if (!recentRecordsPagination) {
        return;
    }

    const total = Number(pagination?.total || 0);
    const limit = Math.max(1, Number(pagination?.limit || 10));
    const reportedTotalPages = Number(pagination?.totalPages || 0);
    const totalPages = reportedTotalPages > 0
        ? reportedTotalPages
        : Math.ceil(total / limit);
    const page = Number(pagination?.page || 1);

    recentRecordsState.page = page;
    recentRecordsState.totalPages = totalPages;

    if (totalPages <= 1) {
        recentRecordsPagination.innerHTML = "";
        recentRecordsPagination.hidden = true;
        return;
    }

    const pages = [];
    const addPage = value => {
        if (!pages.includes(value)) {
            pages.push(value);
        }
    };

    addPage(1);
    if (page > 3) {
        pages.push("ellipsis-left");
    }
    for (let value = Math.max(2, page - 1); value <= Math.min(totalPages - 1, page + 1); value++) {
        addPage(value);
    }
    if (page < totalPages - 2) {
        pages.push("ellipsis-right");
    }
    addPage(totalPages);

    recentRecordsPagination.hidden = false;
    recentRecordsPagination.innerHTML = `
        <button
            type="button"
            class="recent-page-button"
            data-recent-page="${Math.max(1, page - 1)}"
            ${page <= 1 || recentRecordsState.loading ? "disabled" : ""}
        >Previous</button>
        <div class="recent-page-numbers">
            ${pages.map(value => value === "ellipsis-left" || value === "ellipsis-right"
                ? `<span class="recent-page-ellipsis">...</span>`
                : `<button type="button" class="recent-page-button ${value === page ? "is-active" : ""}" data-recent-page="${value}" ${recentRecordsState.loading ? "disabled" : ""} aria-current="${value === page ? "page" : "false"}">${value}</button>`
            ).join("")}
        </div>
        <button
            type="button"
            class="recent-page-button"
            data-recent-page="${Math.min(totalPages, page + 1)}"
            ${page >= totalPages || recentRecordsState.loading ? "disabled" : ""}
        >Next</button>
    `;

    recentRecordsPagination.querySelectorAll("[data-recent-page]").forEach(button => {
        button.addEventListener("click", () => {
            loadRecentRecordsPage(Number(button.dataset.recentPage));
        });
    });
}

function formatRecentSelectedDate(selectedDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(selectedDate || ""))) {
        return "";
    }

    const [year, month, day] = String(selectedDate).split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Accra",
        month: "long",
        day: "numeric",
        year: "numeric"
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function renderRecentRecords(records, pagination, metadata = {}) {
    if (!recentRecordsBody) {
        return;
    }

    if (recentRecordsCaption) {
        const selectedDateLabel = formatRecentSelectedDate(metadata.selectedDate);
        recentRecordsCaption.textContent = selectedDateLabel
            ? `${metadata.isToday ? "Today's Registrations" : "Latest Registrations"} - ${selectedDateLabel}`
            : "No registrations available";
    }

    if (!Array.isArray(records) || !records.length) {
        recentRecordsBody.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty"
                >
                    No records registered today.
                </td>
            </tr>
        `;

        renderRecentPagination(pagination);

        return;
    }

    recentRecordsBody.innerHTML = "";

    const page = Number(pagination?.page || 1);

    records.forEach((record, index) => {
        const row = document.createElement("tr");
        const status = formatStatusLabel(record.status);
        const statusClass = getStatusClass(record.status);
        const registrationDate = formatDateOnly(record.registration_date);
        const dateValue = formatDateOnly(getRecordDisplayDate(record));
        const category = record.category || "-";
        const registrar = window.RecordRegistrar?.normalize(record.registrar) || "-";
        const name = record.name || "-";
        const id = record.id || "";
        const viewAction = record.is_offline
            ? `<span class="record-status status-pending">Pending Sync</span>`
            : `<a class="table-action-link" href="case-details.html?id=${encodeURIComponent(id)}">View</a>`;

        row.innerHTML = `
            <td>${((page - 1) * 10) + index + 1}</td>
            <td>
                <span class="category-badge" style="--category-color:${window.RecordCategoryColors ? window.RecordCategoryColors.getColor(category) : "#6b5bff"}">
                    ${escapeHtml(category)}
                </span>
            </td>
            <td>
                ${escapeHtml(registrationDate)}
            </td>
            <td>
                <strong>
                    ${escapeHtml(name)}
                </strong>
            </td>
            <td>${escapeHtml(dateValue)}</td>
            <td>
                <span class="record-status ${statusClass}">
                    ${escapeHtml(status)}
                </span>
            </td>
            <td>${escapeHtml(registrar)}</td>
            <td>
                ${viewAction}
            </td>
        `;

        recentRecordsBody.appendChild(row);
    });

    renderRecentPagination(pagination);
}

function setDashboardLoading(message) {
    if (!recentRecordsBody) {
        return;
    }

    recentRecordsBody.innerHTML = `
        <tr>
            <td colspan="8" class="empty">
                ${escapeHtml(message)}
            </td>
        </tr>
    `;
}

async function loadRecentRecordsPage(page) {
    if (recentRecordsState.loading || !Number.isInteger(page) || page < 1) {
        return;
    }

    recentRecordsState.loading = true;
    renderRecentPagination({
        page: recentRecordsState.page,
        totalPages: recentRecordsState.totalPages
    });

    try {
        const response = await fetch(
            `/api/records/recent-today?page=${encodeURIComponent(page)}`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load today's records.");
        }

        const pagination = data.pagination || {};
        const totalPages = Number(pagination.totalPages || 0);

        if (totalPages > 0 && page > totalPages) {
            recentRecordsState.loading = false;
            await loadRecentRecordsPage(totalPages);
            return;
        }

        renderRecentRecords(
            data.records || [],
            pagination,
            {
                selectedDate: data.selectedDate,
                isToday: data.isToday
            }
        );
    } catch (error) {
        console.error("RECENT RECORDS ERROR:", error);
    } finally {
        recentRecordsState.loading = false;
        renderRecentPagination({
            page: recentRecordsState.page,
            totalPages: recentRecordsState.totalPages
        });
    }
}

async function loadDashboardSummary() {
    if (dashboardSummaryLoading) {
        return;
    }

    dashboardSummaryLoading = true;

    try {
        setDashboardLoading("Loading recent records...");

        const params = new URLSearchParams({
            period: overviewState.period,
            range: overviewState.range,
            recentPage: String(recentRecordsState.page)
        });

        if (overviewState.registrar) {
            params.set("registrar", overviewState.registrar);
        }

        if (overviewState.category) {
            params.set("category", overviewState.category);
        }

        if (overviewState.year) {
            params.set("year", overviewState.year);
        }

        const response = await fetch(`/api/records/summary?${params.toString()}`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "index.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load dashboard data.");
        }

        const summary = data.summary || data || {};
        const recentRecords = Array.isArray(summary.recentRecords)
            ? summary.recentRecords
            : Array.isArray(summary.records)
                ? summary.records
                : [];

        renderSummaryCounts(summary);
        renderAdminOverview(summary);

        const recentPagination =
            summary.recentRecordsPagination || {
                page: recentRecordsState.page,
                limit: 10,
                total: recentRecords.length,
                totalPages: recentRecords.length ? 1 : 0
            };

        if (!Number(recentPagination.totalPages) && Number(recentPagination.total) > 0) {
            recentPagination.totalPages = Math.ceil(
                Number(recentPagination.total) / Math.max(1, Number(recentPagination.limit || 10))
            );
        }

        if (
            recentPagination.totalPages > 0 &&
            recentPagination.page > recentPagination.totalPages
        ) {
            await loadRecentRecordsPage(recentPagination.totalPages);
        } else {
            renderRecentRecords(
                recentRecords,
                recentPagination,
                {
                    selectedDate: summary.recentRecordsDate,
                    isToday: summary.recentRecordsIsToday
                }
            );
        }
    } catch (error) {
        console.error("DASHBOARD SUMMARY ERROR:", error);

        renderSummaryCounts({});
        renderAdminOverview({});

        let showedOfflineRecords = false;

        if (window.RecordOfflineQueue && typeof window.RecordOfflineQueue.getPendingRecords === "function") {
            try {
                const pendingRecords = await window.RecordOfflineQueue.getPendingRecords();
                const localRecords = pendingRecords.map(entry => ({
                    ...entry.payload,
                    id: `offline_${entry.uuid}`,
                    is_offline: true,
                    status: "Pending Sync"
                }));

                showedOfflineRecords = localRecords.length > 0;

                renderRecentRecords(
                    localRecords.slice(0, 10),
                    {
                        page: 1,
                        limit: 10,
                        total: localRecords.length,
                        totalPages: localRecords.length ? 1 : 0
                    },
                    { selectedDate: "", isToday: false }
                );
            } catch (offlineError) {
                console.error("OFFLINE DASHBOARD ERROR:", offlineError);
            }
        }

        if (recentRecordsBody && !showedOfflineRecords) {
            recentRecordsBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty">
                        ${escapeHtml(error.message || "Unable to load dashboard data.")}
                    </td>
                </tr>
            `;
        }
    } finally {
        dashboardSummaryLoading = false;
    }
}

document.querySelectorAll("[data-overview-period]").forEach(button => {
    button.addEventListener("click", () => {
        overviewState.period = button.dataset.overviewPeriod || "daily";

        document.querySelectorAll("[data-overview-period]").forEach(item => {
            item.classList.toggle("is-active", item === button);
        });

        loadDashboardSummary();
    });
});

document.querySelectorAll("[data-overview-range]").forEach(button => {
    button.addEventListener("click", () => {
        overviewState.range = button.dataset.overviewRange || "30d";

        document.querySelectorAll("[data-overview-range]").forEach(item => {
            item.classList.toggle("is-active", item === button);
        });

        loadDashboardSummary();
    });
});

overviewRegistrarFilter?.addEventListener("change", () => {
    overviewState.registrar = overviewRegistrarFilter.value;
    loadDashboardSummary();
});

overviewCategoryFilter?.addEventListener("change", () => {
    overviewState.category = overviewCategoryFilter.value;
    loadDashboardSummary();
});

overviewYearFilter?.addEventListener("change", () => {
    overviewState.year = overviewYearFilter.value;
    loadDashboardSummary();
});

recentRecordsRefreshButton?.addEventListener("click", async () => {
    if (dashboardSummaryLoading) {
        return;
    }

    recentRecordsRefreshButton.disabled = true;
    recentRecordsRefreshButton.classList.add("is-refreshing");

    try {
        await loadDashboardSummary();
    } finally {
        recentRecordsRefreshButton.disabled = false;
        recentRecordsRefreshButton.classList.remove("is-refreshing");
    }
});

// Get logged-in user

async function loadDashboard() {

    try {

        const response = await fetch("/api/auth/me", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Authentication failed");
        }

        const data = await response.json();

        const user = data.user || data;

        if (user && typeof user === "object") {
            currentUserRole = String(user.role || currentUserRole)
                .trim()
                .toLowerCase();

            if (isBranchStaffDashboardUser()) {
                overviewState.year = String(new Date().getFullYear());
            }

            localStorage.setItem("user", JSON.stringify(user));
            renderDashboardProfile(getDashboardProfile(user));
        }

        await loadDashboardSummary();
        await loadSmsAccountSummary();

    } catch (error) {

        console.error(error);

        const cachedUser = JSON.parse(localStorage.getItem("user") || "null");

        if (cachedUser && cachedUser.role) {
            currentUserRole = String(cachedUser.role).trim().toLowerCase();
            renderDashboardProfile(getDashboardProfile(cachedUser));
            await loadDashboardSummary();
            return;
        }

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        window.location.href = "index.html";
    }
}


// Logout

document
    .getElementById("logoutButton")
    .addEventListener("click", () => {

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        window.location.href = "index.html";

    });


loadDashboard();
loadOverviewRegistrars();
