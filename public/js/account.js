const accountToken = localStorage.getItem("token");
const processingBody = document.getElementById("processingBody");
const registrarFilter = document.getElementById("registrarFilter");
const nameFilter = document.getElementById("nameFilter");
const dateOfBirthFilter = document.getElementById("dateOfBirthFilter");
const totalCases = document.getElementById("totalCases");
const showingInfo = document.getElementById("showingInfo");
const selectedCount = document.getElementById("selectedCount");
const selectAll = document.getElementById("selectAll");
const approveSelectedButton = document.getElementById("approveSelectedButton");
const previousPage = document.getElementById("previousPage");
const nextPage = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const logoutButton = document.getElementById("logoutButton");
const rowsPerPage = 10;
const selectedIds = new Set();
let records = [];
let currentPage = 1;

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.replace("index.html");
    });
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
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-GB");
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

async function accountRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${accountToken}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "index.html";
        return null;
    }

    if (!response.ok) {
        throw new Error(data.message || "Unable to complete request.");
    }

    return data;
}

function updateSummary() {
    const totalPages = Math.max(1, Math.ceil(records.length / rowsPerPage));
    const startIndex = records.length ? (currentPage - 1) * rowsPerPage : 0;
    const endIndex = Math.min(startIndex + rowsPerPage, records.length);

    totalCases.textContent = `${records.length} Case${records.length === 1 ? "" : "s"}`;
    showingInfo.textContent = records.length
        ? `Showing ${startIndex + 1} to ${endIndex} of ${records.length} cases`
        : "Showing 0 cases";
    selectedCount.textContent = `${selectedIds.size} selected`;
    approveSelectedButton.disabled = selectedIds.size === 0;
    selectAll.checked = records.length > 0 && selectedIds.size === records.length;
    pageInfo.textContent = currentPage;
    previousPage.disabled = currentPage === 1;
    nextPage.disabled = currentPage >= totalPages;
}

function closeActionMenus() {
    document.querySelectorAll(".account-action-menu.is-open").forEach(menu => {
        menu.classList.remove("is-open");

        if (menu.__accountMenuPlaceholder) {
            menu.__accountMenuPlaceholder.replaceWith(menu);
            menu.__accountMenuPlaceholder = null;
        }

        menu.style.position = "";
        menu.style.top = "";
        menu.style.left = "";
        menu.style.bottom = "";
    });
}

function positionAccountActionMenu(menu, trigger) {
    if (!menu || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;
    const menuWidth = menu.offsetWidth || 138;
    const menuHeight = menu.offsetHeight || 0;
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - gap - menuHeight;
    const top = belowTop + menuHeight <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, aboveTop);
    const left = Math.max(
        viewportPadding,
        Math.min(rect.right - menuWidth, window.innerWidth - viewportPadding - menuWidth)
    );

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.bottom = "auto";
}

function repositionAccountActionMenus() {
    document.querySelectorAll(".account-action-menu.is-open").forEach(menu => {
        const trigger = [...document.querySelectorAll("[data-menu-id]")]
            .find(button => button.dataset.menuId === menu.dataset.actionMenu);
        positionAccountActionMenu(menu, trigger);
    });
}

function renderRegistrarOptions() {
    const current = registrarFilter.value;
    const registrars = [...new Set(records.map(record => String(record.registrar || "").trim()).filter(Boolean))].sort();
    registrarFilter.innerHTML = `<option value="">All Registrars</option>${registrars.map(registrar => `<option value="${escapeHtml(registrar)}">${escapeHtml(registrar)}</option>`).join("")}`;
    registrarFilter.value = registrars.includes(current) ? current : "";
}

function renderRecords() {
    closeActionMenus();

    if (!records.length) {
        processingBody.innerHTML = `<tr><td colspan="10" class="account-empty">No Processing cases found.</td></tr>`;
        updateSummary();
        return;
    }

    const totalPages = Math.ceil(records.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const pageRecords = records.slice(startIndex, startIndex + rowsPerPage);

    processingBody.innerHTML = pageRecords.map((record, index) => `
        <tr data-id="${escapeHtml(record.id)}">
            <td><input class="record-check" type="checkbox" data-id="${escapeHtml(record.id)}" ${selectedIds.has(String(record.id)) ? "checked" : ""}></td>
            <td>${startIndex + index + 1}</td>
            <td><strong>${escapeHtml(record.name || "-")}</strong></td>
            <td>${escapeHtml(formatDate(record.date_of_birth))}</td>
            <td>${escapeHtml(formatDate(record.date_of_death))}</td>
            <td><span class="category-badge" style="--category-color:${window.RecordCategoryColors ? window.RecordCategoryColors.getColor(record.category) : "#6b5bff"}">${escapeHtml(record.category || "-")}</span></td>
            <td>${escapeHtml(record.registrar || "-")}</td>
            <td>${escapeHtml(formatDateTime(record.registration_date))}</td>
            <td class="${record.notes ? "account-note" : "account-note is-empty"}">${escapeHtml(record.notes || "-")}</td>
            <td>
                <div class="account-actions">
                    <button class="account-menu-button" type="button" data-menu-id="${escapeHtml(record.id)}" aria-label="Open case actions"><svg class="ui-icon"><use href="#account-menu"></use></svg></button>
                    <div class="account-action-menu" data-action-menu="${escapeHtml(record.id)}">
                        <button type="button" data-action="approve" data-id="${escapeHtml(record.id)}"><svg class="ui-icon"><use href="#account-check"></use></svg>Approve</button>
                        <button type="button" data-action="edit" data-id="${escapeHtml(record.id)}"><svg class="ui-icon"><use href="#account-edit"></use></svg>Edit</button>
                        <button type="button" data-action="delete" data-id="${escapeHtml(record.id)}"><svg class="ui-icon"><use href="#account-trash"></use></svg>Delete</button>
                    </div>
                </div>
            </td>
        </tr>
    `).join("");

    updateSummary();
}

async function loadRecords() {
    const params = new URLSearchParams();
    if (nameFilter.value.trim()) params.set("name", nameFilter.value.trim());
    if (dateOfBirthFilter.value) params.set("dateOfBirth", dateOfBirthFilter.value);
    if (registrarFilter.value) params.set("registrar", registrarFilter.value);

    processingBody.innerHTML = `<tr><td colspan="10" class="account-empty">Loading cases...</td></tr>`;

    try {
        const data = await accountRequest(`/api/records/pending-approval?${params.toString()}`);
        if (!data) return;
        records = Array.isArray(data.records) ? data.records : [];
        currentPage = 1;
        selectedIds.clear();
        renderRegistrarOptions();
        renderRecords();
    } catch (error) {
        processingBody.innerHTML = `<tr><td colspan="10" class="account-empty">${escapeHtml(error.message)}</td></tr>`;
        Notification.error(error.message);
    }
}

async function approveRecord(id) {
    const data = await accountRequest(`/api/records/${encodeURIComponent(id)}/approve`, { method: "POST" });
    if (!data) return false;
    records = records.filter(record => String(record.id) !== String(id));
    selectedIds.delete(String(id));
    renderRecords();
    return true;
}

async function approveSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;

    approveSelectedButton.disabled = true;
    let approved = 0;
    for (const id of ids) {
        try {
            if (await approveRecord(id)) approved++;
        } catch (error) {
            Notification.error(error.message);
        }
    }

    if (approved) Notification.success(`${approved} case${approved === 1 ? "" : "s"} approved and moved to Pending.`);
    updateSummary();
}

if (!accountToken) {
    window.location.replace("dashboard.html");
} else {
    document.getElementById("searchButton").addEventListener("click", loadRecords);
    registrarFilter.addEventListener("change", loadRecords);
    document.getElementById("resetButton").addEventListener("click", () => {
        registrarFilter.value = "";
        nameFilter.value = "";
        dateOfBirthFilter.value = "";
        loadRecords();
    });
    document.getElementById("refreshButton").addEventListener("click", loadRecords);
    approveSelectedButton.addEventListener("click", approveSelected);
    previousPage.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderRecords();
        }
    });
    nextPage.addEventListener("click", () => {
        const totalPages = Math.ceil(records.length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderRecords();
        }
    });
    selectAll.addEventListener("change", () => {
        records.forEach(record => {
            if (selectAll.checked) selectedIds.add(String(record.id));
            else selectedIds.delete(String(record.id));
        });
        renderRecords();
    });
    processingBody.addEventListener("change", event => {
        if (!event.target.classList.contains("record-check")) return;
        const id = String(event.target.dataset.id);
        if (event.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateSummary();
    });
    processingBody.addEventListener("click", async event => {
        const menuButton = event.target.closest("[data-menu-id]");
        if (menuButton) {
            closeActionMenus();
            const menu = [...document.querySelectorAll("[data-action-menu]")]
                .find(item => item.dataset.actionMenu === menuButton.dataset.menuId);

            if (menu) {
                const placeholder = document.createComment("account-action-menu");
                menu.before(placeholder);
                menu.__accountMenuPlaceholder = placeholder;
                document.body.appendChild(menu);

                menu.style.position = "fixed";
                menu.classList.add("is-open");
                positionAccountActionMenu(menu, menuButton);
            }

            return;
        }
    });
    document.addEventListener("click", event => {
        const actionButton = event.target.closest("[data-action]");

        if (actionButton) {
            closeActionMenus();

            const id = actionButton.dataset.id;

            (async () => {
                try {
                    if (actionButton.dataset.action === "approve") {
                        if (await approveRecord(id)) Notification.success("Case approved and moved to Pending.");
                    } else if (actionButton.dataset.action === "edit") {
                        window.location.href = `create-record.html?id=${encodeURIComponent(id)}&returnTo=account.html`;
                    } else if (actionButton.dataset.action === "delete") {
                        const confirmed = await ConfirmDialog.show("Delete this case? This action cannot be undone.", "Delete Case", "Delete");
                        if (!confirmed) return;
                        await accountRequest(`/api/records/${encodeURIComponent(id)}`, { method: "DELETE" });
                        records = records.filter(record => String(record.id) !== String(id));
                        selectedIds.delete(String(id));
                        renderRecords();
                        Notification.error("Case deleted successfully.");
                    }
                } catch (error) {
                    Notification.error(error.message);
                }
            })();

            return;
        }

        if (!event.target.closest(".account-actions")) {
            closeActionMenus();
        }
    });
    window.addEventListener("resize", repositionAccountActionMenus, { passive: true });
    window.addEventListener("scroll", repositionAccountActionMenus, { passive: true });
    processingBody.addEventListener("scroll", repositionAccountActionMenus, { passive: true });
    loadRecords();
}
