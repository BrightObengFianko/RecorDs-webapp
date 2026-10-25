(function () {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const usersBody = document.getElementById("usersBody");
    const staffQuotaSummary = document.getElementById("staffQuotaSummary");
    const searchInput = document.getElementById("searchInput");
    const userOfficeFilter = document.getElementById("userOfficeFilter");
    const userRoleFilter = document.getElementById("userRoleFilter");
    const userBranchFilter = document.getElementById("userBranchFilter");
    const userStatusFilter = document.getElementById("userStatusFilter");
    const userModal = document.getElementById("userModal");
    const closeModalButton = document.getElementById("closeModalButton");
    const cancelModalButton = document.getElementById("cancelModalButton");
    const userForm = document.getElementById("userForm");
    const userIdInput = document.getElementById("userId");
    const userNameInput = document.getElementById("userName");
    const userEmailInput = document.getElementById("userEmail");
    const userRoleInput = document.getElementById("userRole");
    const userBranchInput = document.getElementById("userBranch");
    const userStatusInput = document.getElementById("userStatus");
    const userMaxDevicesInput = document.getElementById("userMaxDevices");
    const saveUserButton = document.getElementById("saveUserButton");
    const deleteUserButton = document.getElementById("deleteUserButton");
    const logoutButton = document.getElementById("logoutButton");
    const pendingUsersBody = document.getElementById("pendingUsersBody");
    const pendingUsersCount = document.getElementById("pendingUsersCount");
    const pendingUsersSection = document.querySelector(".pending-shell");
    const deviceModal = document.getElementById("deviceModal");
    const deviceModalSummary = document.getElementById("deviceModalSummary");
    const deviceSessionList = document.getElementById("deviceSessionList");
    const closeDeviceModalButton = document.getElementById("closeDeviceModalButton");
    const closeDeviceModalFooter = document.getElementById("closeDeviceModalFooter");
    const forceLogoutAllButton = document.getElementById("forceLogoutAllButton");
    const officesShell = document.getElementById("officesShell");
    const officesBody = document.getElementById("officesBody");
    const officesCount = document.getElementById("officesCount");
    const createOfficeBtn = document.getElementById("createOfficeBtn");
    const officeModal = document.getElementById("officeModal");
    const officeModalTitle = document.getElementById("officeModalTitle");
    const closeOfficeModalButton = document.getElementById("closeOfficeModalButton");
    const cancelOfficeButton = document.getElementById("cancelOfficeButton");
    const officeForm = document.getElementById("officeForm");
    const officeIdInput = document.getElementById("officeId");
    const officeNameInput = document.getElementById("officeName");
    const officeCodeInput = document.getElementById("officeCode");
    const officeDescriptionInput = document.getElementById("officeDescription");
    const officeAddressInput = document.getElementById("officeAddress");
    const officePhoneInput = document.getElementById("officePhone");
    const officeEmailInput = document.getElementById("officeEmail");
    const officeLogoUrlInput = document.getElementById("officeLogoUrl");
    const officePrimaryColorInput = document.getElementById("officePrimaryColor");
    const officeSecondaryColorInput = document.getElementById("officeSecondaryColor");
    const officeDashboardTitleInput = document.getElementById("officeDashboardTitle");
    const officeN8nWebhookUrlInput = document.getElementById("officeN8nWebhookUrl");
    const officeN8nWebhookSecretInput = document.getElementById("officeN8nWebhookSecret");
    const officeN8nTimeoutInput = document.getElementById("officeN8nTimeout");
    const officeArkeselApiKeyInput = document.getElementById("officeArkeselApiKey");
    const officeSmsSenderIdInput = document.getElementById("officeSmsSenderId");
    const officeSmsStatus = document.getElementById("officeSmsStatus");
    const testOfficeSmsButton = document.getElementById("testOfficeSmsButton");
    const disconnectOfficeSmsButton = document.getElementById("disconnectOfficeSmsButton");
    const officeStaffAccountLimitInput = document.getElementById("officeStaffAccountLimit");
    const officeStatusInput = document.getElementById("officeStatus");
    const saveOfficeButton = document.getElementById("saveOfficeButton");
    const officeDestructiveModal = document.getElementById("officeDestructiveModal");
    const officeDestructiveTitle = document.getElementById("officeDestructiveTitle");
    const officeDestructiveDescription = document.getElementById("officeDestructiveDescription");
    const officeDestructivePreview = document.getElementById("officeDestructivePreview");
    const officeNameConfirmation = document.getElementById("officeNameConfirmation");
    const officeBackupVerified = document.getElementById("officeBackupVerified");
    const closeOfficeDestructiveButton = document.getElementById("closeOfficeDestructiveButton");
    const cancelOfficeDestructiveButton = document.getElementById("cancelOfficeDestructiveButton");
    const confirmOfficeDestructiveButton = document.getElementById("confirmOfficeDestructiveButton");
    const branchModal = document.getElementById("branchModal");
    const branchModalTitle = document.getElementById("branchModalTitle");
    const branchForm = document.getElementById("branchForm");
    const branchNameInput = document.getElementById("branchName");
    const branchOfficeLabel = document.getElementById("branchOfficeLabel");
    const closeBranchModalButton = document.getElementById("closeBranchModalButton");
    const cancelBranchButton = document.getElementById("cancelBranchButton");
    const saveBranchButton = document.getElementById("saveBranchButton");
    const createBranchStaffInput = document.getElementById("createBranchStaff");
    const branchStaffFields = document.getElementById("branchStaffFields");
    const branchStaffNameInput = document.getElementById("branchStaffName");
    const branchStaffEmailInput = document.getElementById("branchStaffEmail");
    const branchStaffPasswordInput = document.getElementById("branchStaffPassword");
    const branchManagementModal = document.getElementById("branchManagementModal");
    const branchManagementTitle = document.getElementById("branchManagementTitle");
    const branchManagementSubtitle = document.getElementById("branchManagementSubtitle");
    const branchManagementBody = document.getElementById("branchManagementBody");
    const managementTabs = document.getElementById("managementTabs");
    const branchSearchInput = document.getElementById("branchSearchInput");
    const closeBranchManagementButton = document.getElementById("closeBranchManagementButton");
    const createBranchFromManagementButton = document.getElementById("createBranchFromManagementButton");
    const createUserFromBranchManagementButton = document.getElementById("createUserFromBranchManagementButton");

    // Create Staff Account Modal Elements
    const createStaffBtn = document.getElementById("createStaffBtn");
    const createStaffModal = document.getElementById("createStaffModal");
    const createStaffForm = document.getElementById("createStaffForm");
    const createStaffCloseButton = createStaffModal?.querySelector(".modal-close");
    const togglePasswordBtn = document.getElementById("togglePassword");
    const cancelCreateStaffBtn = document.getElementById("cancelCreateStaffBtn");
    const staffPasswordInput = document.getElementById("staffPassword");
    const staffRoleInput = document.getElementById("staffRole");
    const staffOfficeInput = document.getElementById("staffOffice");

    let allUsers = [];
    let allBranches = [];
    let pendingUsers = [];
    let allOffices = [];
    let selectedOfficeForBranches = null;
    let selectedOfficeBranches = [];
    let officeMenu = null;
    let editingBranchId = null;
    let officeDestructiveState = null;

    function normalize(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");
    }

    function getStrongPasswordError(password) {
        const value = String(password || "");
        if (value.length < 12) return "at least 12 characters";
        if (!/[A-Z]/.test(value)) return "an uppercase letter";
        if (!/[a-z]/.test(value)) return "a lowercase letter";
        if (!/[0-9]/.test(value)) return "a number";
        if (!/[^A-Za-z0-9]/.test(value)) return "a special character";
        return "";
    }

    function isSystemAdmin() {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        const role = normalize(user?.role).replace(/\s+/g, "_");
        return role === "system_super_admin";
    }

    function updateRoleOptions() {
        if (!userRoleInput) {
            return;
        }

        const privilegedRoles = new Set(["admin", "office_admin", "system_super_admin"]);
        Array.from(userRoleInput.options).forEach(option => {
            const role = normalize(option.value).replace(/\s+/g, "_");
            const restricted = privilegedRoles.has(role) && !isSystemAdmin();
            option.hidden = restricted;
            option.disabled = restricted;
        });
    }

    function isProtectedSuperAdmin(user) {
        const role = normalize(user?.role).replace(/\s+/g, "_");
        return role === "system_super_admin" || role === "super_admin";
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatRole(role) {
        const normalized = normalize(role);

        if (normalized === "admin") {
            return "Admin";
        }

        if (normalized === "system super admin" || normalized === "system_super_admin") {
            return "System Super Admin";
        }

        if (normalized === "office admin" || normalized === "office_admin") {
            return "Office Admin";
        }

        if (normalized === "branch staff") {
            return "Branch Staff";
        }

        if (normalized === "branch_staff") {
            return "Branch Staff";
        }

        if (normalized === "staff") {
            return "Staff";
        }

        return role ? String(role) : "Staff";
    }

    function getRoleClass(role) {
        const normalized = normalize(role).replace(/\s+/g, "_");

        if (normalized === "admin") {
            return "role-admin";
        }

        if (normalized === "system_super_admin" || normalized === "office_admin") {
            return "role-admin";
        }

        if (normalized === "branch_staff") {
            return "role-branch_staff";
        }

        return "role-staff";
    }

    function normalizeAccountStatus(status) {
        const normalized = String(status || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_")
            .replace(/_+/g, "_");

        if (normalized === "pending") {
            return "pending";
        }

        if (normalized === "approved") {
            return "approved";
        }

        if (normalized === "declined") {
            return "declined";
        }

        return "";
    }

    function isActiveUser(user) {
        if (typeof user?.is_active === "boolean") {
            return user.is_active;
        }

        if (typeof user?.status === "string") {
            return normalize(user.status) !== "inactive";
        }

        return true;
    }

    function getStatusLabel(user) {
        const status = normalizeAccountStatus(user?.account_status);

        if (status === "pending") {
            return "Pending";
        }

        if (status === "declined") {
            return "Declined";
        }

        if (status === "approved") {
            return isActiveUser(user)
                ? "Approved"
                : "Inactive";
        }

        return isActiveUser(user)
            ? "Approved"
            : "Inactive";
    }

    function getStatusClass(user) {
        const status = normalizeAccountStatus(user?.account_status);

        if (status === "pending") {
            return "status-pending";
        }

        if (status === "declined") {
            return "status-declined";
        }

        if (status === "approved") {
            return isActiveUser(user)
                ? "status-approved"
                : "status-inactive";
        }

        return isActiveUser(user)
            ? "status-approved"
            : "status-inactive";
    }

    function getSearchText(user) {
        return [
            user.name,
            user.email,
            user.role,
            user.branch,
            user.account_status,
            getStatusLabel(user)
        ]
            .map(normalize)
            .join(" ");
    }

    function handleAuthFailure() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "index.html";
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            cache: "no-store",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        if (response.status === 401 || response.status === 403) {
            handleAuthFailure();
            throw new Error("Authentication failed.");
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || "Request failed.");
        }

        return data;
    }

    function setLoadingState(message) {
        if (!usersBody) {
            return;
        }

        usersBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }

    function setPendingLoadingState(message) {
        if (!pendingUsersBody) {
            return;
        }

        pendingUsersBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }

    function renderUsers() {
        if (!usersBody) {
            return;
        }

        const query = normalize(searchInput ? searchInput.value : "");
        const visibleUsers = isSystemAdmin()
            ? allUsers
            : allUsers.filter(user => !isProtectedSuperAdmin(user));
        const selectedOffice = String(userOfficeFilter?.value || "");
        const selectedRole = normalize(userRoleFilter?.value || "").replace(/\s+/g, "_");
        const selectedBranch = String(userBranchFilter?.value || "");
        const selectedStatus = normalize(userStatusFilter?.value || "");
        const filteredUsers = visibleUsers.filter(user => {
            const role = normalize(user.role).replace(/\s+/g, "_");
            const status = normalizeAccountStatus(user.account_status) || (isActiveUser(user) ? "approved" : "inactive");
            return (!query || getSearchText(user).includes(query)) &&
                (!selectedOffice || String(user.office_id || "") === selectedOffice) &&
                (!selectedRole || role === selectedRole) &&
                (!selectedBranch || String(user.branch_id || "") === selectedBranch) &&
                (!selectedStatus || status === selectedStatus);
        });

        if (!filteredUsers.length) {
            usersBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty">
                        No users found.
                    </td>
                </tr>
            `;
            return;
        }

        usersBody.innerHTML = filteredUsers.map((user, index) => {
            const roleClass = getRoleClass(user.role);
            const statusClass = getStatusClass(user);
            const statusLabel = getStatusLabel(user);
            const officeFromId = allOffices.find(office => String(office.id) === String(user.office_id));
            const officeLabel = officeFromId?.name || user.office || user.office_name || "-";
            const canEdit = isSystemAdmin() || normalize(user.role).replace(/\s+/g, "_") !== "system_super_admin";

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td class="name-cell">
                        <strong>${escapeHtml(user.name || "-")}</strong>
                    </td>
                    <td>${escapeHtml(user.email || "-")}</td>
                    <td>${escapeHtml(officeLabel)}</td>
                    <td>
                        <span class="role-pill ${roleClass}">
                            ${escapeHtml(formatRole(user.role))}
                        </span>
                    </td>
                    <td>
                        <button type="button" class="device-summary-button" data-device-user-id="${escapeHtml(user.id)}" title="Manage active devices">
                            ${escapeHtml(`${Number(user.active_devices || 0)} / ${Math.max(1, Number(user.max_devices || 2))}`)}
                        </button>
                    </td>
                    <td>
                        <span class="status-pill ${statusClass}">
                            ${escapeHtml(statusLabel)}
                        </span>
                    </td>
                    <td>
                        ${canEdit ? `<button
                            type="button"
                            class="action-button"
                            data-user-id="${escapeHtml(user.id)}"
                            title="Edit user"
                        >
                            <svg class="ui-icon" aria-hidden="true">
                                <use href="#icon-edit"></use>
                            </svg>
                            <span>Edit</span>
                        </button>` : '<span class="status-pill status-inactive">Protected</span>'}
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function loadStaffQuota() {
        if (!staffQuotaSummary || isSystemAdmin()) return;
        try {
            const data = await fetchJson("/api/admin/staff-quota");
            const quota = data.quota || {};
            staffQuotaSummary.hidden = false;
            staffQuotaSummary.textContent = `${quota.used || 0} of ${quota.limit || 0} staff accounts used (${quota.remaining || 0} remaining)`;
            if (createStaffBtn) {
                createStaffBtn.disabled = Number(quota.remaining || 0) <= 0;
                createStaffBtn.title = createStaffBtn.disabled
                    ? "Staff account limit reached. Contact the System Super Admin."
                    : "Create a new staff account";
            }
        } catch (error) {
            staffQuotaSummary.hidden = true;
        }
    }

    function renderPendingUsers() {
        if (!pendingUsersBody || !pendingUsersCount) {
            return;
        }

        const visiblePendingUsers = isSystemAdmin()
            ? pendingUsers
            : pendingUsers.filter(user => !isProtectedSuperAdmin(user));
        pendingUsersCount.textContent =
            `${visiblePendingUsers.length} user${visiblePendingUsers.length === 1 ? "" : "s"} pending approval`;

        if (!visiblePendingUsers.length) {
            pendingUsersBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty">
                        No pending users.
                    </td>
                </tr>
            `;
            return;
        }

        pendingUsersBody.innerHTML = visiblePendingUsers.map((user, index) => {
            const statusLabel = getStatusLabel(user);
            const statusClass = getStatusClass(user);
            const roleClass = getRoleClass(user.role);
            const createdAt = user.created_at
                ? new Date(user.created_at).toLocaleDateString("en-GB")
                : "-";

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td class="name-cell">
                        <strong>${escapeHtml(user.name || "-")}</strong>
                    </td>
                    <td>${escapeHtml(user.email || "-")}</td>
                    <td>
                        <span class="role-pill ${roleClass}">
                            ${escapeHtml(formatRole(user.role))}
                        </span>
                    </td>
                    <td>${escapeHtml(createdAt)}</td>
                    <td>
                        <span class="status-pill ${statusClass}">
                            ${escapeHtml(statusLabel)}
                        </span>
                    </td>
                    <td>
                        <div class="pending-actions">
                            <button
                                type="button"
                                class="action-button is-approve"
                                data-pending-action="approve"
                                data-user-id="${escapeHtml(user.id)}"
                            >
                                <svg class="ui-icon" aria-hidden="true">
                                    <use href="#icon-check"></use>
                                </svg>
                                <span>Approve</span>
                            </button>
                            <button
                                type="button"
                                class="action-button is-decline"
                                data-pending-action="decline"
                                data-user-id="${escapeHtml(user.id)}"
                            >
                                <svg class="ui-icon" aria-hidden="true">
                                    <use href="#icon-x"></use>
                                </svg>
                                <span>Decline</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function getAvailableOffices() {
        if (allOffices.length) return allOffices;
        const offices = new Map();
        allUsers.forEach(user => {
            if (!user.office_id || offices.has(String(user.office_id))) return;
            offices.set(String(user.office_id), {
                id: user.office_id,
                name: user.office || user.office_name || `Office ${user.office_id}`,
                code: user.office_code || ""
            });
        });
        allBranches.forEach(branch => {
            if (!branch.office_id || offices.has(String(branch.office_id))) return;
            offices.set(String(branch.office_id), {
                id: branch.office_id,
                name: branch.office_name || "Office",
                code: branch.office_code || ""
            });
        });
        if (!isSystemAdmin()) {
            const currentUser = JSON.parse(localStorage.getItem("user") || "null");
            if (currentUser?.office_id && !offices.has(String(currentUser.office_id))) {
                offices.set(String(currentUser.office_id), {
                    id: currentUser.office_id,
                    name: currentUser.office || `Office ${currentUser.office_id}`,
                    code: currentUser.office_code || ""
                });
            }
        }
        return Array.from(offices.values()).sort((left, right) => String(left.name).localeCompare(String(right.name)));
    }

    function buildOfficeOptions(selectedOfficeId) {
        const offices = getAvailableOffices();
        const selectedId = selectedOfficeId ? String(selectedOfficeId) : "";
        return `<option value="">Select office</option>${offices.map(office => `
            <option value="${escapeHtml(office.id)}" ${String(office.id) === selectedId ? "selected" : ""}>
                ${escapeHtml(`${office.name}${office.code ? ` (${office.code})` : ""}`)}
            </option>
        `).join("")}`;
    }

    function buildBranchOptions(selectedBranchId, selectedBranchName, officeId) {
        const branches = (Array.isArray(allBranches) ? allBranches : [])
            .filter(branch => !officeId || String(branch.office_id) === String(officeId));
        const seenIds = new Set();
        const options = branches.map(branch => {
            const id = String(branch.id);
            seenIds.add(id);
            return `<option value="${escapeHtml(id)}">${escapeHtml(branch.name || `Branch ${id}`)}</option>`;
        }).join("");

        const selectedId = selectedBranchId !== undefined && selectedBranchId !== null && selectedBranchId !== ""
            ? String(selectedBranchId)
            : "";

        if (selectedId && !seenIds.has(selectedId)) {
            return `
                <option value="">Select branch</option>
                <option value="${escapeHtml(selectedId)}" selected>
                    ${escapeHtml(selectedBranchName || `Branch ${selectedId}`)}
                </option>
                ${options}
            `;
        }

        return `
            <option value="">Select branch</option>
            ${options || '<option value="" disabled>No branches created for this office</option>'}
        `;
    }

    function openModal(user) {
        if (!userModal || !userForm) {
            return;
        }

        userIdInput.value = user.id || "";
        userNameInput.value = user.name || "";
        userEmailInput.value = user.email || "";
        updateRoleOptions();
        userRoleInput.value = normalize(user.role).replace(/\s+/g, "_") || "staff";
        userStatusInput.value = isActiveUser(user) ? "Active" : "Inactive";
        if (userMaxDevicesInput) {
            userMaxDevicesInput.value = Math.max(1, Number(user.max_devices || 2));
        }
        userBranchInput.innerHTML = buildBranchOptions(user.branch_id, user.branch);
        userBranchInput.value = user.branch_id ? String(user.branch_id) : "";

        userModal.hidden = false;

        window.requestAnimationFrame(() => {
            userNameInput.focus();
            userNameInput.select();
        });
    }

    function closeModal() {
        if (!userModal || !userForm) {
            return;
        }

        userModal.hidden = true;
        userForm.reset();
        userIdInput.value = "";
        userBranchInput.innerHTML = "<option value=\"\">Select branch</option>";
    }

    let managedUserId = null;

    function formatSessionDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
    }

    function formatSessionAge(value) {
        if (!value) return "-";
        const timestamp = new Date(value).getTime();
        if (Number.isNaN(timestamp)) return "-";
        const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
        if (minutes < 1) return "Active now";
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? "" : "s"} ago`;
    }

    async function loadManagedSessions(userId) {
        managedUserId = String(userId);
        const user = allUsers.find(item => String(item.id) === managedUserId);
        if (!deviceModal || !deviceSessionList || !user) return;

        deviceModal.hidden = false;
        deviceModalSummary.textContent = `${user.name} - loading active devices...`;
        deviceSessionList.innerHTML = '<p class="device-session-empty">Loading active devices...</p>';

        try {
            const data = await fetchJson(`/api/admin/users/${encodeURIComponent(managedUserId)}/sessions`);
            const sessions = Array.isArray(data.sessions) ? data.sessions : [];
            deviceModalSummary.textContent = `${user.name} - ${sessions.length} active of ${data.max_devices || 2} allowed`;
            deviceSessionList.innerHTML = sessions.length
                ? sessions.map(session => `
                    <article class="device-session-card">
                        <div>
                            <strong>${escapeHtml(session.device_name || "Unknown device")}</strong>
                            <span>${escapeHtml(session.device_type || "Desktop")} - ${escapeHtml(session.operating_system || "Unknown")} - ${escapeHtml(session.browser || "Unknown browser")}</span>
                            <small>IP address: ${escapeHtml(session.ip_address || "-")}<br>Logged in: ${escapeHtml(formatSessionDate(session.created_at))}<br>Last active: ${escapeHtml(formatSessionAge(session.last_active_at))} (${escapeHtml(formatSessionDate(session.last_active_at))})</small>
                        </div>
                        <div class="device-session-actions">
                            <span class="device-session-status">${escapeHtml(session.status || "ACTIVE")}</span>
                            <button type="button" class="danger-button device-revoke-button" data-device-session-id="${escapeHtml(session.session_id)}">Force Logout</button>
                        </div>
                    </article>
                `).join("")
                : '<p class="device-session-empty">No active devices.</p>';
        } catch (error) {
            deviceSessionList.innerHTML = `<p class="device-session-empty">${escapeHtml(error.message || "Unable to load active devices.")}</p>`;
        }
    }

    function closeDeviceModal() {
        if (deviceModal) deviceModal.hidden = true;
        managedUserId = null;
    }

    async function forceLogoutManagedSession(sessionId) {
        if (!managedUserId || !sessionId) return;
        const confirmed = await ConfirmDialog.show(
            "The selected device will lose access to this account.",
            "Force logout this device?",
            "Force Logout"
        );
        if (!confirmed) return;

        try {
            await fetchJson(`/api/admin/users/${encodeURIComponent(managedUserId)}/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST" });
            Notification.success("Device logged out.");
            await loadManagedSessions(managedUserId);
            await loadUsers();
        } catch (error) {
            Notification.error(error.message || "Unable to log out device.");
        }
    }

    async function forceLogoutAllManagedSessions() {
        if (!managedUserId) return;
        const confirmed = await ConfirmDialog.show(
            "All active devices for this user will lose access. This action cannot be undone.",
            "Log out all devices?",
            "Log Out All"
        );
        if (!confirmed) return;

        try {
            await fetchJson(`/api/admin/users/${encodeURIComponent(managedUserId)}/sessions/revoke-all`, { method: "POST" });
            Notification.success("All devices logged out.");
            await loadManagedSessions(managedUserId);
            await loadUsers();
        } catch (error) {
            Notification.error(error.message || "Unable to log out devices.");
        }
    }

    async function loadBranches() {
        const data = await fetchJson("/api/admin/branches");
        allBranches = Array.isArray(data.branches) ? data.branches : [];
        renderUserFilterOptions();
        return allBranches;
    }

    function renderUserFilterOptions() {
        const systemAdmin = isSystemAdmin();
        const selectedOffice = String(userOfficeFilter?.value || "");
        const selectedBranch = String(userBranchFilter?.value || "");
        const currentUser = JSON.parse(localStorage.getItem("user") || "null") || {};

        if (userOfficeFilter) {
            userOfficeFilter.hidden = !systemAdmin;
            userOfficeFilter.innerHTML = `<option value="">All offices</option>${allOffices.map(office =>
                `<option value="${escapeHtml(office.id)}">${escapeHtml(office.name || `Office ${office.id}`)}</option>`
            ).join("")}`;
            userOfficeFilter.value = allOffices.some(office => String(office.id) === selectedOffice)
                ? selectedOffice
                : "";
        }

        if (userBranchFilter) {
            const officeId = systemAdmin
                ? String(userOfficeFilter?.value || "")
                : String(currentUser.office_id || "");
            const branches = allBranches.filter(branch => !officeId || String(branch.office_id) === officeId);
            userBranchFilter.innerHTML = `<option value="">All branches</option>${branches.map(branch =>
                `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name || `Branch ${branch.id}`)}</option>`
            ).join("")}`;
            userBranchFilter.value = branches.some(branch => String(branch.id) === selectedBranch)
                ? selectedBranch
                : "";
        }
    }

    function officeStatusLabel(status) {
        return String(status || "").toUpperCase() === "ACTIVE" ? "Active" : "Disabled";
    }

    function renderOffices() {
        if (!officesBody || !officesCount) return;
        officesCount.textContent = `${allOffices.length} office${allOffices.length === 1 ? "" : "s"} configured`;
        if (!allOffices.length) {
            officesBody.innerHTML = '<tr><td colspan="8" class="empty">No offices found.</td></tr>';
            return;
        }

        officesBody.innerHTML = allOffices.map(office => {
            const active = String(office.status || "").toUpperCase() === "ACTIVE";
            const smsConfigured = String(office.sms_config_status || "").toUpperCase() === "ACTIVE";
            return `
                <tr>
                    <td class="name-cell" data-label="Office">
                        <strong>${escapeHtml(office.name)}</strong>
                        <span>${escapeHtml(office.address || "No address")}</span>
                        ${office.phone ? `<span class="office-contact">Phone: ${escapeHtml(office.phone)}</span>` : ""}
                        ${office.email ? `<span class="office-contact">Email: ${escapeHtml(office.email)}</span>` : ""}
                    </td>
                    <td data-label="Code"><strong>${escapeHtml(office.code)}</strong></td>
                    <td data-label="Users">${Number(office.user_count || 0).toLocaleString()}</td>
                    <td data-label="Staffs"><strong>${Number(office.staff_account_count ?? 0).toLocaleString()}/${Number(office.staff_account_limit ?? 50).toLocaleString()}</strong><span class="office-usage-note">${Math.max(0, Number(office.staff_account_limit ?? 50) - Number(office.staff_account_count ?? 0)).toLocaleString()} remaining</span></td>
                    <td data-label="Records">${Number(office.record_count || 0).toLocaleString()}</td>
                    <td data-label="SMS"><span class="office-sms-status-text ${smsConfigured ? "is-configured" : "is-not-configured"}">${smsConfigured ? "Configured" : "Not configured"}</span></td>
                    <td data-label="Status"><span class="status-pill ${active ? "status-approved" : "status-inactive"}">${officeStatusLabel(office.status)}</span></td>
                    <td data-label="Actions"><button type="button" class="office-menu-button" data-office-menu-id="${escapeHtml(office.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Actions for ${escapeHtml(office.name)}">&#8942;</button></td>
                </tr>
            `;
        }).join("");
    }

    function closeOfficeMenu() {
        officeMenu?.remove();
        officeMenu = null;
        document.querySelectorAll("[data-office-menu-id]").forEach(button => button.setAttribute("aria-expanded", "false"));
    }

    function positionOfficeMenu(menu, button) {
        const gap = 8;
        const rect = button.getBoundingClientRect();
        menu.style.visibility = "hidden";
        menu.style.display = "block";
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(Math.max(12, rect.right - menuRect.width), window.innerWidth - menuRect.width - 12);
        const top = rect.bottom + menuRect.height + gap <= window.innerHeight
            ? rect.bottom + gap
            : Math.max(12, rect.top - menuRect.height - gap);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = "visible";
    }

    function openOfficeMenu(office, button) {
        closeOfficeMenu();
        const active = String(office.status || "").toUpperCase() === "ACTIVE";
        officeMenu = document.createElement("div");
        officeMenu.className = "office-action-menu";
        officeMenu.setAttribute("role", "menu");
        officeMenu.innerHTML = `
            <button type="button" data-menu-action="users" role="menuitem">Manage Office Users</button>
            <button type="button" data-menu-action="dashboard" role="menuitem">View Office Dashboard</button>
            <button type="button" data-menu-action="branches" role="menuitem">View Branches</button>
            <button type="button" data-menu-action="create-user" role="menuitem">Create User in Office</button>
            <button type="button" data-menu-action="sms" role="menuitem">Configure SMS</button>
            <button type="button" data-menu-action="edit" role="menuitem">Edit Office</button>
            <button type="button" data-menu-action="toggle" role="menuitem">${active ? "Deactivate Office" : "Activate Office"}</button>
            <button type="button" data-menu-action="clear-data" role="menuitem">Clear Office Data</button>
            <button type="button" class="is-danger" data-menu-action="delete" role="menuitem">Delete Office</button>
        `;
        document.body.appendChild(officeMenu);
        button.setAttribute("aria-expanded", "true");
        positionOfficeMenu(officeMenu, button);
        officeMenu.addEventListener("click", event => {
            const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
            if (!action) return;
            closeOfficeMenu();
            if (action === "users") {
                if (searchInput) searchInput.value = office.name;
                renderUsers();
                document.querySelector(".users-all-shell")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            if (action === "dashboard") {
                window.location.href = `dashboard.html?office_id=${encodeURIComponent(office.id)}`;
            }
            if (action === "branches") openBranchManagement(office);
            if (action === "create-user") openCreateStaffModal(office.id);
            if (action === "sms") openOfficeModal(office);
            if (action === "edit") openOfficeModal(office);
            if (action === "toggle") toggleOffice(office);
            if (action === "clear-data") openOfficeDestructiveModal(office, "clear");
            if (action === "delete") deleteOffice(office);
        });
    }

    function renderBranchManagement() {
        if (!branchManagementBody) return;
        const query = normalize(branchSearchInput?.value || "");
        const branches = selectedOfficeBranches.filter(branch => !query || normalize(`${branch.name} ${branch.id}`).includes(query));
        if (!branches.length) {
            branchManagementBody.innerHTML = '<p class="empty">No branches found for this office.</p>';
            return;
        }
        branchManagementBody.innerHTML = branches.map(branch => {
            const staff = Array.isArray(branch.staff) ? branch.staff : [];
            return `<article class="branch-management-item">
                <div class="branch-management-copy">
                    <strong>${escapeHtml(branch.name)}</strong>
                    <span>Branch ID: ${escapeHtml(branch.id)}</span>
                    <small>${staff.length ? staff.map(user => `${escapeHtml(user.name || user.email || "User")} (${escapeHtml(formatRole(user.role))})`).join(", ") : "No staff assigned"}</small>
                </div>
                <div class="branch-management-actions">
                    <span class="status-pill status-approved">${staff.length} staff</span>
                    <button type="button" class="action-button" data-branch-action="edit" data-branch-id="${escapeHtml(branch.id)}">Edit</button>
                    <button type="button" class="action-button is-decline" data-branch-action="delete" data-branch-id="${escapeHtml(branch.id)}">Delete</button>
                    <button type="button" class="action-button" data-create-user-office-id="${escapeHtml(branch.office_id)}" data-create-user-branch-id="${escapeHtml(branch.id)}">Create User</button>
                    ${staff.map(user => `<button type="button" class="action-button" data-branch-user-id="${escapeHtml(user.id)}">Manage Role</button>`).join("")}
                </div>
            </article>`;
        }).join("");
    }

    async function loadOfficeBranches(office) {
        selectedOfficeForBranches = office;
        if (branchManagementBody) branchManagementBody.innerHTML = '<p class="empty">Loading branches...</p>';
        const data = await fetchJson(`/api/admin/branches?office_id=${encodeURIComponent(office.id)}`);
        selectedOfficeBranches = Array.isArray(data.branches) ? data.branches : [];
        renderBranchManagement();
    }

    async function openBranchManagement(office) {
        if (!branchManagementModal) return;
        branchManagementTitle.textContent = `${office.name} Branches`;
        branchManagementSubtitle.textContent = `Branches, staff, and roles assigned to ${office.name}.`;
        if (branchSearchInput) branchSearchInput.value = "";
        branchManagementModal.hidden = false;
        try {
            await loadOfficeBranches(office);
        } catch (error) {
            branchManagementBody.innerHTML = `<p class="empty">${escapeHtml(error.message || "Unable to load branches.")}</p>`;
        }
    }

    function closeBranchManagement() {
        if (branchManagementModal) branchManagementModal.hidden = true;
        selectedOfficeForBranches = null;
        selectedOfficeBranches = [];
    }

    async function loadOffices() {
        if (!isSystemAdmin() || !officesShell) return [];
        officesShell.hidden = false;
        if (officesBody) officesBody.innerHTML = '<tr><td colspan="8" class="empty">Loading offices...</td></tr>';
        const data = await fetchJson("/api/admin/offices");
        allOffices = Array.isArray(data.offices) ? data.offices : [];
        renderUserFilterOptions();
        renderOffices();
        renderUsers();
        return allOffices;
    }

    function openOfficeModal(office = null) {
        if (!officeModal || !officeForm) return;
        officeForm.reset();
        officeIdInput.value = office?.id || "";
        officeNameInput.value = office?.name || "";
        officeCodeInput.value = office?.code || "";
        officeDescriptionInput.value = office?.description || "";
        officeAddressInput.value = office?.address || "";
        officePhoneInput.value = office?.phone || "";
        officeEmailInput.value = office?.email || "";
        officeLogoUrlInput.value = office?.logo_url || "";
        officePrimaryColorInput.value = office?.primary_color || "#5b4df5";
        officeSecondaryColorInput.value = office?.secondary_color || "#eef0ff";
        officeDashboardTitleInput.value = office?.dashboard_title || office?.name || "";
        officeN8nWebhookUrlInput.value = office?.n8n_webhook_url || "";
        officeN8nWebhookSecretInput.value = "";
        officeN8nTimeoutInput.value = office?.n8n_timeout_ms || 10000;
        officeSmsSenderIdInput.value = office?.sms_sender_id || "";
        if (officeArkeselApiKeyInput) officeArkeselApiKeyInput.value = "";
        if (officeSmsStatus) {
            const status = String(office?.sms_config_status || "NOT_CONFIGURED").replace(/_/g, " ");
            officeSmsStatus.textContent = status.charAt(0) + status.slice(1).toLowerCase();
            officeSmsStatus.className = `status-pill ${String(office?.sms_config_status || "").toUpperCase() === "ACTIVE" ? "status-approved" : "status-inactive"}`;
        }
        officeStaffAccountLimitInput.value = office?.staff_account_limit ?? 50;
        officeStatusInput.value = office?.status || "ACTIVE";
        officeCodeInput.readOnly = Boolean(office);
        officeModalTitle.textContent = office ? "Edit Office" : "Create Office";
        saveOfficeButton.textContent = office ? "Save Changes" : "Create Office";
        officeModal.hidden = false;
        window.setTimeout(() => officeNameInput.focus(), 0);
    }

    function closeOfficeModal() {
        if (officeModal) officeModal.hidden = true;
    }

    async function testOfficeSmsConnection() {
        const officeId = officeIdInput?.value;
        if (!officeId) {
            Notification.info("Save the office before testing its SMS connection.");
            return;
        }
        testOfficeSmsButton.disabled = true;
        try {
            const result = await fetchJson("/api/sms/office-config/test", {
                method: "POST",
                body: JSON.stringify({ office_id: officeId })
            });
            if (officeSmsStatus) {
                officeSmsStatus.textContent = "Active";
                officeSmsStatus.className = "status-pill status-approved";
            }
            Notification.success(`Arkesel connection verified${result.balance === null || result.balance === undefined ? "" : `: ${result.balance} credits`}.`);
            await loadOffices();
        } catch (error) {
            if (officeSmsStatus) {
                officeSmsStatus.textContent = "Error";
                officeSmsStatus.className = "status-pill status-inactive";
            }
            Notification.error(error.message || "Unable to test the Arkesel connection.");
        } finally {
            testOfficeSmsButton.disabled = false;
        }
    }

    async function disconnectOfficeSms() {
        const officeId = officeIdInput?.value;
        if (!officeId) return;
        const confirmed = await ConfirmDialog.show("Disconnect this office's Arkesel SMS account?", "Disconnect SMS", "Disconnect");
        if (!confirmed) return;
        disconnectOfficeSmsButton.disabled = true;
        try {
            await fetchJson("/api/sms/office-config", {
                method: "DELETE",
                body: JSON.stringify({ office_id: officeId })
            });
            if (officeSmsStatus) {
                officeSmsStatus.textContent = "Disconnected";
                officeSmsStatus.className = "status-pill status-inactive";
            }
            Notification.success("Office SMS account disconnected.");
            await loadOffices();
        } catch (error) {
            Notification.error(error.message || "Unable to disconnect the office SMS account.");
        } finally {
            disconnectOfficeSmsButton.disabled = false;
        }
    }

    async function saveOffice(event) {
        event.preventDefault();
        const officeId = officeIdInput.value;
        const name = officeNameInput.value.trim();
        const code = officeCodeInput.value.trim().toUpperCase();
        if (!name || (!officeId && !code)) {
            Notification.warning("Office name and code are required.");
            return;
        }

        const payload = {
            name,
            ...(officeId ? {} : { code }),
            description: officeDescriptionInput.value.trim() || null,
            address: officeAddressInput.value.trim() || null,
            phone: officePhoneInput.value.trim() || null,
            email: officeEmailInput.value.trim() || null,
            logo_url: officeLogoUrlInput.value.trim() || null,
            primary_color: officePrimaryColorInput.value || null,
            secondary_color: officeSecondaryColorInput.value || null,
            dashboard_title: officeDashboardTitleInput.value.trim() || name,
            n8n_webhook_url: officeN8nWebhookUrlInput.value.trim() || null,
            ...(officeN8nWebhookSecretInput.value.trim() ? { n8n_webhook_secret: officeN8nWebhookSecretInput.value.trim() } : {}),
            n8n_timeout_ms: Number.parseInt(officeN8nTimeoutInput.value || "10000", 10),
            sms_sender_id: officeSmsSenderIdInput.value.trim() || null,
            staff_account_limit: Number.parseInt(String(officeStaffAccountLimitInput.value || "").trim(), 10),
            status: officeStatusInput.value
        };
        saveOfficeButton.disabled = true;
        saveOfficeButton.textContent = officeId ? "Saving..." : "Creating...";
        try {
            const data = await fetchJson(officeId ? `/api/admin/offices/${encodeURIComponent(officeId)}` : "/api/admin/offices", {
                method: officeId ? "PATCH" : "POST",
                body: JSON.stringify(payload)
            });
            const configuredOfficeId = data.office?.id || officeId;
            if (configuredOfficeId && (officeArkeselApiKeyInput?.value.trim() || officeSmsSenderIdInput.value.trim())) {
                await fetchJson("/api/sms/office-config", {
                    method: "PUT",
                    body: JSON.stringify({
                        office_id: configuredOfficeId,
                        api_key: officeArkeselApiKeyInput?.value.trim() || "",
                        sender_id: officeSmsSenderIdInput.value.trim()
                    })
                });
            }
            closeOfficeModal();
            if (officeId && data.office) {
                const savedOffice = {
                    ...data.office,
                    staff_account_limit: data.office.staff_account_limit ?? payload.staff_account_limit
                };
                allOffices = allOffices.map(office => String(office.id) === String(officeId)
                    ? { ...office, ...savedOffice }
                    : office);
                renderOffices();
                window.dispatchEvent(new CustomEvent("office-configuration-updated", { detail: savedOffice }));
            } else {
                await loadOffices();
            }
            Notification.success(data.message || (officeId ? "Office updated successfully." : "Office created successfully."));
        } catch (error) {
            Notification.error(error.message || "Unable to save office.");
        } finally {
            saveOfficeButton.disabled = false;
            saveOfficeButton.textContent = officeId ? "Save Changes" : "Create Office";
        }
    }

    async function toggleOffice(office) {
        const active = String(office.status || "").toUpperCase() === "ACTIVE";
        const confirmed = await ConfirmDialog.show(
            `${active ? "Disable" : "Enable"} ${escapeHtml(office.name)}?`,
            `${active ? "Disable" : "Enable"} Office`,
            active ? "Disable" : "Enable"
        );
        if (!confirmed) return;
        try {
            await fetchJson(`/api/admin/offices/${encodeURIComponent(office.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ status: active ? "DISABLED" : "ACTIVE" })
            });
            await loadOffices();
            Notification.success(`Office ${active ? "disabled" : "enabled"}.`);
        } catch (error) {
            Notification.error(error.message || "Unable to update office status.");
        }
    }

    function closeOfficeDestructiveModal() {
        if (officeDestructiveModal) officeDestructiveModal.hidden = true;
        officeDestructiveState = null;
        if (officeNameConfirmation) officeNameConfirmation.value = "";
        if (officeBackupVerified) officeBackupVerified.checked = false;
        if (confirmOfficeDestructiveButton) confirmOfficeDestructiveButton.disabled = true;
    }

    function updateOfficeDestructiveConfirmation() {
        if (!officeDestructiveState || !confirmOfficeDestructiveButton) return;
        const nameMatches = String(officeNameConfirmation?.value || "").trim() === String(officeDestructiveState.office.name || "").trim();
        confirmOfficeDestructiveButton.disabled = !officeDestructiveState.backupVerified || !nameMatches || !officeBackupVerified?.checked;
    }

    function officePreviewMarkup(office, operation) {
        const preview = officeDestructiveState.preview;
        const counts = operation === "clear" ? preview.clearData.removes : preview.deleteOffice.blockedBy;
        const retained = operation === "clear"
            ? `Retained: office configuration, ${preview.clearData.retains.users} users, ${preview.clearData.retains.branches} branches, quota, settings, and audit logs.`
            : `Will remove the office-owned users, branches, records, and notifications. ${preview.deleteOffice.securityAuditLogsRetained} audit records will be retained.`;
        return `<strong>${escapeHtml(office.name)} (${escapeHtml(office.code)})</strong>
            <span>Records affected: ${Number(counts.records || 0).toLocaleString()}</span>
            <span>Notifications affected: ${Number(counts.notifications || 0).toLocaleString()}</span>
            <span>Users: ${Number(preview.office.users || 0).toLocaleString()} | Branches: ${Number(preview.office.branches || 0).toLocaleString()}</span>
            <span>${retained}</span>
            ${officeDestructiveState.backupVerified ? "" : "<strong>Destructive operations are disabled until the server confirms a verified restorable backup.</strong>"}`;
    }

    async function openOfficeDestructiveModal(office, operation) {
        try {
            const data = await fetchJson(`/api/admin/offices/${encodeURIComponent(office.id)}/operation-preview`);
            officeDestructiveState = { office, operation, preview: data, backupVerified: data.backupVerified === true };
            officeDestructiveTitle.textContent = operation === "clear" ? "Clear Office Data" : "Delete Office and Dependencies";
            officeDestructiveDescription.textContent = operation === "clear"
                ? "Remove operational records while retaining the office and its configuration."
                : "Permanently remove this office and its office-owned data. Audit history is retained.";
            officeDestructivePreview.innerHTML = officePreviewMarkup(office, operation);
            officeNameConfirmation.value = "";
            officeBackupVerified.checked = false;
            confirmOfficeDestructiveButton.textContent = operation === "clear" ? "Clear Data" : "Delete Office";
            confirmOfficeDestructiveButton.disabled = true;
            officeDestructiveModal.hidden = false;
            officeNameConfirmation.focus();
        } catch (error) {
            Notification.error(error.message || "Unable to preview office data.");
        }
    }

    async function runOfficeDestructiveOperation() {
        if (!officeDestructiveState) return;
        const { office, operation } = officeDestructiveState;
        try {
            const body = JSON.stringify({
                office_name_confirmation: officeNameConfirmation.value.trim(),
                backup_verified: officeBackupVerified.checked,
                final_confirm: true
            });
            await fetchJson(
                operation === "clear"
                    ? `/api/admin/offices/${encodeURIComponent(office.id)}/clear-data`
                    : `/api/admin/offices/${encodeURIComponent(office.id)}`,
                { method: operation === "clear" ? "POST" : "DELETE", body }
            );
            closeOfficeDestructiveModal();
            await loadOffices();
            Notification.success(operation === "clear" ? "Office data cleared successfully." : "Office and its data deleted successfully.");
        } catch (error) {
            Notification.error(error.message || "Unable to complete the office operation.");
        }
    }

    async function deleteOffice(office) {
        await openOfficeDestructiveModal(office, "delete");
    }

    function openBranchModal(office, branch = null) {
        if (!branchModal || !branchForm) return;
        branchForm.reset();
        branchStaffFields.hidden = true;
        editingBranchId = branch?.id || null;
        branchModal.dataset.officeId = office.id;
        branchModalTitle.textContent = branch ? "Edit Branch" : "Create Branch";
        branchOfficeLabel.textContent = branch
            ? `Update ${branch.name} in ${office.name}.`
            : `Add a branch to ${office.name}${office.code ? ` (${office.code})` : ""}.`;
        createBranchStaffInput.closest(".branch-staff-toggle").hidden = Boolean(branch);
        saveBranchButton.textContent = branch ? "Save Branch" : "Create Branch";
        branchNameInput.value = branch?.name || "";
        branchModal.hidden = false;
        window.setTimeout(() => branchNameInput.focus(), 0);
    }

    function closeBranchModal() {
        if (branchModal) branchModal.hidden = true;
        editingBranchId = null;
    }

    async function deleteBranch(branch) {
        const confirmed = await ConfirmDialog.show(
            `Delete branch "${escapeHtml(branch.name)}"? It must have no assigned users or records.`,
            "Delete Branch",
            "Delete"
        );
        if (!confirmed) return;
        try {
            await fetchJson(`/api/admin/branches/${encodeURIComponent(branch.id)}`, { method: "DELETE" });
            await Promise.all([loadOffices(), loadBranches()]);
            if (selectedOfficeForBranches) await loadOfficeBranches(selectedOfficeForBranches);
            Notification.success("Branch deleted successfully.");
        } catch (error) {
            Notification.error(error.message || "Unable to delete branch.");
        }
    }

    async function saveBranch(event) {
        event.preventDefault();
        const name = branchNameInput.value.trim();
        const officeId = Number.parseInt(branchModal.dataset.officeId || "", 10);
        const createStaff = Boolean(createBranchStaffInput.checked);
        if (!name || !Number.isInteger(officeId)) {
            Notification.warning("Enter a branch name.");
            return;
        }
        if (!editingBranchId && createStaff && (!branchStaffNameInput.value.trim() || !branchStaffEmailInput.value.trim() || !branchStaffPasswordInput.value)) {
            Notification.warning("Complete the branch staff account details.");
            return;
        }
        if (!editingBranchId && createStaff) {
            const passwordRequirement = getStrongPasswordError(branchStaffPasswordInput.value);
            if (passwordRequirement) {
                Notification.warning(`Password must contain ${passwordRequirement}.`);
                branchStaffPasswordInput.focus();
                return;
            }
        }
        saveBranchButton.disabled = true;
        saveBranchButton.textContent = "Creating...";
        try {
            const data = await fetchJson(editingBranchId
                ? `/api/admin/branches/${encodeURIComponent(editingBranchId)}`
                : "/api/admin/branches", {
                method: editingBranchId ? "PATCH" : "POST",
                body: JSON.stringify({
                    name,
                    ...(editingBranchId ? {} : { office_id: officeId }),
                    create_staff: editingBranchId ? false : createStaff,
                    staff_name: createStaff ? branchStaffNameInput.value.trim() : undefined,
                    staff_email: createStaff ? branchStaffEmailInput.value.trim() : undefined,
                    staff_password: createStaff ? branchStaffPasswordInput.value : undefined
                })
            });
            closeBranchModal();
            await Promise.all([loadOffices(), loadBranches()]);
            if (selectedOfficeForBranches) {
                await loadOfficeBranches(selectedOfficeForBranches);
            }
            Notification.success(data.message || "Branch created successfully.");
        } catch (error) {
            Notification.error(error.message || "Unable to create branch.");
        } finally {
            saveBranchButton.disabled = false;
            saveBranchButton.textContent = "Create Branch";
        }
    }

    async function loadUsers() {
        setLoadingState("Loading users...");

        const data = await fetchJson("/api/admin/users");
        allUsers = Array.isArray(data.users) ? data.users : [];

        renderUsers();

        return allUsers;
    }

    async function loadPendingUsers() {
        if (!isSystemAdmin()) {
            pendingUsers = [];
            return pendingUsers;
        }

        setPendingLoadingState("Loading pending users...");

        const data = await fetchJson("/api/admin/users/pending");
        pendingUsers = Array.isArray(data.users) ? data.users : [];

        renderPendingUsers();

        return pendingUsers;
    }

    async function refreshUsers() {
        await Promise.allSettled([
            loadUsers(),
            loadPendingUsers()
        ]);
    }

    async function handlePendingAction(userId, action) {
        if (!userId || !action) {
            return;
        }

        const title = action === "approve" ? "Approve User" : "Decline User";
        const message = action === "approve" ? "Approve this user?" : "Decline this user?";
        const confirmed = await ConfirmDialog.show(message, title, action === "approve" ? "Approve" : "Decline");

        if (!confirmed) {
            return;
        }

        const endpoint = action === "approve"
            ? `/api/admin/users/${encodeURIComponent(userId)}/approve`
            : `/api/admin/users/${encodeURIComponent(userId)}/decline`;

        try {
            const data = await fetchJson(endpoint, {
                method: "PUT"
            });

            Notification.success(data.message || "User status updated successfully.");
            await refreshUsers();
        } catch (error) {
            Notification.error(error.message || "Unable to update user status.");
        }
    }

    async function saveUser(event) {
        event.preventDefault();

        const userId = userIdInput.value;
        const name = String(userNameInput.value || "").trim();
        const email = String(userEmailInput.value || "").trim();
        const role = String(userRoleInput.value || "").trim();
        const branchId = String(userBranchInput.value || "").trim();
        const status = String(userStatusInput.value || "Active").trim();
        const maxDevices = Number.parseInt(String(userMaxDevicesInput?.value || "1"), 10);

        if (!userId) {
            return;
        }

        if (!name || !email || !role || !Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 50) {
            Notification.warning("Please complete all fields.");
            return;
        }

        const parsedBranchId = branchId ? Number(branchId) : null;

        const payload = {
            name,
            email,
            role,
            branch_id: parsedBranchId,
            is_active: status === "Active",
            max_devices: maxDevices
        };

        if (branchId && !Number.isFinite(payload.branch_id)) {
            Notification.warning("Please choose a valid branch or leave it unassigned.");
            return;
        }

        if (saveUserButton) {
            saveUserButton.disabled = true;
            saveUserButton.textContent = "Saving...";
        }

        try {
            const data = await fetchJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
                method: "PATCH",
                body: JSON.stringify(payload)
            });

            const updatedUser = data.user || null;

            if (updatedUser) {
                const index = allUsers.findIndex(item => String(item.id) === String(updatedUser.id));

                if (index !== -1) {
                    allUsers[index] = updatedUser;
                }
            }

            await refreshUsers();
            closeModal();

            Notification.success(data.message || "User updated successfully.");
        } catch (error) {
            Notification.error(error.message || "Unable to update user.");
        } finally {
            if (saveUserButton) {
                saveUserButton.disabled = false;
                saveUserButton.textContent = "Save Changes";
            }
        }
    }

    async function deleteUser(event) {
        event.preventDefault();

        const userId = userIdInput.value;

        if (!userId) {
            return;
        }

        const user = allUsers.find(item => String(item.id) === String(userId));

        if (!user) {
            Notification.error("User not found.");
            return;
        }

        const confirmed = await ConfirmDialog.show(
            `Are you sure you want to delete the user "${escapeHtml(user.name)}"? This action cannot be undone.`,
            "Delete User",
            "Delete"
        );

        if (!confirmed) {
            return;
        }

        if (deleteUserButton) {
            deleteUserButton.disabled = true;
            deleteUserButton.textContent = "Deleting...";
        }

        try {
            const data = await fetchJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
                method: "DELETE"
            });

            await refreshUsers();
            await loadStaffQuota();
            if (selectedOfficeForBranches) {
                await loadOfficeBranches(selectedOfficeForBranches);
            }
            closeModal();

            Notification.success(data.message || "User deleted successfully.");
        } catch (error) {
            Notification.error(error.message || "Unable to delete user.");
        } finally {
            if (deleteUserButton) {
                deleteUserButton.disabled = false;
                deleteUserButton.textContent = "Delete User";
            }
        }
    }

    // =================================
    // CREATE STAFF ACCOUNT MODAL
    // =================================

    function updateCreateStaffRoleOptions() {
        if (!staffRoleInput) return;
        Array.from(staffRoleInput.options).forEach(option => {
            const role = normalize(option.value).replace(/\s+/g, "_");
            const restricted = role === "office_admin" && !isSystemAdmin();
            option.hidden = restricted;
            option.disabled = restricted;
        });
    }

    function openCreateStaffModal(preselectedOfficeId = "") {
        if (createStaffModal) {
            createStaffModal.classList.add("active");
            createStaffForm.reset();
            if (staffOfficeInput) staffOfficeInput.innerHTML = buildOfficeOptions();
            updateCreateStaffRoleOptions();
            if (staffRoleInput) staffRoleInput.value = "staff";
            if (staffOfficeInput) {
                const currentUser = JSON.parse(localStorage.getItem("user") || "null");
                staffOfficeInput.disabled = !isSystemAdmin();
                if (!isSystemAdmin() && currentUser?.office_id) {
                    staffOfficeInput.value = String(currentUser.office_id);
                }
            }
            if (preselectedOfficeId && staffOfficeInput) {
                staffOfficeInput.value = String(preselectedOfficeId);
            }
            const staffNameInput = document.getElementById("staffName");
            if (staffNameInput) {
                staffNameInput.focus();
            }
        }
    }

    function closeCreateStaffModal() {
        if (createStaffModal) {
            createStaffModal.classList.remove("active");
            createStaffForm.reset();
        }
    }

    async function handleCreateStaffSubmit(event) {
        event.preventDefault();

        const staffName = document.getElementById("staffName")?.value?.trim();
        const staffEmail = document.getElementById("staffEmail")?.value?.trim();
        const staffPassword = document.getElementById("staffPassword")?.value?.trim();
        const staffRole = staffRoleInput?.value || "staff";
        const staffOffice = staffOfficeInput?.value || "";
        if (!staffName || !staffEmail || !staffPassword || !staffRole || !staffOffice) {
            Notification.warning("Please complete the user details and office selection.");
            return;
        }

        const passwordRequirement = getStrongPasswordError(staffPassword);
        if (passwordRequirement) {
            Notification.warning(`Password must contain ${passwordRequirement}.`);
            staffPasswordInput?.focus();
            return;
        }

        const createBtn = createStaffForm.querySelector('button[type="submit"]');
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = "Creating...";
        }

        try {
            const response = await fetch("/api/auth/staff/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: staffName,
                    email: staffEmail,
                    password: staffPassword,
                    role: staffRole,
                    office_id: Number(staffOffice)
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || 
                    "Unable to create staff account."
                );
            }

            // Show success with account details
            const message = `
Staff Account Created Successfully!

Name: ${escapeHtml(data.user.name)}
Email: ${escapeHtml(data.user.email)}
Temporary Password: ${escapeHtml(staffPassword)}

⚠️ Share these credentials with the staff member.
They can login immediately.
            `;

            Notification.success(data.message || "Staff account created successfully.");
            
            // Copy credentials to clipboard (optional)
            const credentials = `Email: ${staffEmail}\nPassword: ${staffPassword}`;
            navigator.clipboard.writeText(credentials).catch(() => {
                // Clipboard write failed, but account was created
            });

            closeCreateStaffModal();
            await loadUsers();
            await loadStaffQuota();
            
        } catch (error) {
            Notification.error(error.message || "Unable to create staff account.");
            console.error("Create staff account error:", error);
        } finally {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = "Create User";
            }
        }
    }

    function togglePasswordVisibility() {
        if (!staffPasswordInput) return;

        const isPassword = staffPasswordInput.type === "password";
        staffPasswordInput.type = isPassword ? "text" : "password";
    }

    function bindEvents() {
        document.querySelectorAll("[data-management-target]").forEach(tab => {
            tab.addEventListener("click", () => {
                document.querySelectorAll("[data-management-target]").forEach(item => item.classList.toggle("is-active", item === tab));
                const target = document.getElementById(tab.dataset.managementTarget);
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });

        if (searchInput) {
            searchInput.addEventListener("input", renderUsers);
        }
        userRoleFilter?.addEventListener("change", renderUsers);
        userOfficeFilter?.addEventListener("change", () => {
            renderUserFilterOptions();
            renderUsers();
        });
        userBranchFilter?.addEventListener("change", renderUsers);
        userStatusFilter?.addEventListener("change", renderUsers);

        createOfficeBtn?.addEventListener("click", () => openOfficeModal());
        closeOfficeModalButton?.addEventListener("click", closeOfficeModal);
        cancelOfficeButton?.addEventListener("click", closeOfficeModal);
        testOfficeSmsButton?.addEventListener("click", testOfficeSmsConnection);
        disconnectOfficeSmsButton?.addEventListener("click", disconnectOfficeSms);
        officeForm?.addEventListener("submit", saveOffice);
        closeOfficeDestructiveButton?.addEventListener("click", closeOfficeDestructiveModal);
        cancelOfficeDestructiveButton?.addEventListener("click", closeOfficeDestructiveModal);
        officeNameConfirmation?.addEventListener("input", updateOfficeDestructiveConfirmation);
        officeBackupVerified?.addEventListener("change", updateOfficeDestructiveConfirmation);
        confirmOfficeDestructiveButton?.addEventListener("click", runOfficeDestructiveOperation);
        closeBranchModalButton?.addEventListener("click", closeBranchModal);
        cancelBranchButton?.addEventListener("click", closeBranchModal);
        branchForm?.addEventListener("submit", saveBranch);
        closeBranchManagementButton?.addEventListener("click", closeBranchManagement);
        createBranchFromManagementButton?.addEventListener("click", () => {
            if (selectedOfficeForBranches) openBranchModal(selectedOfficeForBranches);
        });
        createUserFromBranchManagementButton?.addEventListener("click", () => {
            if (selectedOfficeForBranches) openCreateStaffModal(selectedOfficeForBranches.id);
        });
        branchSearchInput?.addEventListener("input", renderBranchManagement);
        createBranchStaffInput?.addEventListener("change", () => {
            branchStaffFields.hidden = !createBranchStaffInput.checked;
            branchStaffNameInput.required = createBranchStaffInput.checked;
            branchStaffEmailInput.required = createBranchStaffInput.checked;
            branchStaffPasswordInput.required = createBranchStaffInput.checked;
            if (createBranchStaffInput.checked) branchStaffNameInput.focus();
        });
        officeModal?.addEventListener("click", event => {
            if (event.target === officeModal) closeOfficeModal();
        });
        officeDestructiveModal?.addEventListener("click", event => {
            if (event.target === officeDestructiveModal) closeOfficeDestructiveModal();
        });
        branchManagementModal?.addEventListener("click", event => {
            if (event.target === branchManagementModal) closeBranchManagement();
            const createUserButton = event.target.closest("[data-create-user-office-id]");
            if (createUserButton) {
                openCreateStaffModal(createUserButton.dataset.createUserOfficeId);
                return;
            }
            const branchActionButton = event.target.closest("[data-branch-action]");
            if (branchActionButton && selectedOfficeForBranches) {
                const branch = selectedOfficeBranches.find(item => String(item.id) === String(branchActionButton.dataset.branchId));
                if (branchActionButton.dataset.branchAction === "edit" && branch) {
                    openBranchModal(selectedOfficeForBranches, branch);
                } else if (branchActionButton.dataset.branchAction === "delete" && branch) {
                    deleteBranch(branch);
                }
                return;
            }
            const userButton = event.target.closest("[data-branch-user-id]");
            if (userButton) {
                const user = allUsers.find(item => String(item.id) === String(userButton.dataset.branchUserId));
                if (user) openModal(user);
            }
        });
        officesBody?.addEventListener("click", event => {
            const menuButton = event.target.closest("[data-office-menu-id]");
            if (menuButton) {
                const office = allOffices.find(item => String(item.id) === String(menuButton.dataset.officeMenuId));
                if (office) openOfficeMenu(office, menuButton);
                return;
            }
            const button = event.target.closest("[data-office-action]");
            if (!button) return;
            const office = allOffices.find(item => String(item.id) === String(button.dataset.officeId));
            if (!office) return;
            if (button.dataset.officeAction === "edit") openOfficeModal(office);
            if (button.dataset.officeAction === "branch") openBranchModal(office);
            if (button.dataset.officeAction === "toggle") toggleOffice(office);
             if (button.dataset.officeAction === "clear-data") openOfficeDestructiveModal(office, "clear");
            if (button.dataset.officeAction === "delete") deleteOffice(office);
        });
        document.addEventListener("click", event => {
            if (officeMenu && !officeMenu.contains(event.target) && !event.target.closest("[data-office-menu-id]")) {
                closeOfficeMenu();
            }
        });
        window.addEventListener("resize", closeOfficeMenu);
        window.addEventListener("scroll", closeOfficeMenu, true);

        if (usersBody) {
            usersBody.addEventListener("click", event => {
                const deviceButton = event.target.closest("[data-device-user-id]");
                if (deviceButton) {
                    loadManagedSessions(deviceButton.dataset.deviceUserId);
                    return;
                }

                const button = event.target.closest(".action-button");

                if (!button) {
                    return;
                }

                const userId = button.dataset.userId;
                const user = allUsers.find(item => String(item.id) === String(userId));

                if (!user) {
                    Notification.error("User not found.");
                    return;
                }

                openModal(user);
            });
        }

        if (deviceSessionList) {
            deviceSessionList.addEventListener("click", event => {
                const button = event.target.closest("[data-device-session-id]");
                if (button) forceLogoutManagedSession(button.dataset.deviceSessionId);
            });
        }

        closeDeviceModalButton?.addEventListener("click", closeDeviceModal);
        closeDeviceModalFooter?.addEventListener("click", closeDeviceModal);
        forceLogoutAllButton?.addEventListener("click", forceLogoutAllManagedSessions);

        deviceModal?.addEventListener("click", event => {
            if (event.target === deviceModal) closeDeviceModal();
        });

        if (pendingUsersBody) {
            pendingUsersBody.addEventListener("click", event => {
                const button = event.target.closest(".action-button");

                if (!button) {
                    return;
                }

                const action = button.dataset.pendingAction;
                const userId = button.dataset.userId;

                handlePendingAction(userId, action);
            });
        }

        if (closeModalButton) {
            closeModalButton.addEventListener("click", closeModal);
        }

        if (cancelModalButton) {
            cancelModalButton.addEventListener("click", closeModal);
        }

        if (userModal) {
            userModal.addEventListener("click", event => {
                if (event.target === userModal) {
                    closeModal();
                }
            });
        }

        if (userForm) {
            userForm.addEventListener("submit", saveUser);
        }

        if (deleteUserButton) {
            deleteUserButton.addEventListener("click", deleteUser);
        }

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && userModal && !userModal.hidden) {
                closeModal();
            }
            if (event.key === "Escape" && deviceModal && !deviceModal.hidden) {
                closeDeviceModal();
            }
            if (event.key === "Escape" && officeModal && !officeModal.hidden) {
                closeOfficeModal();
            }
            if (event.key === "Escape" && officeDestructiveModal && !officeDestructiveModal.hidden) {
                closeOfficeDestructiveModal();
            }
            if (event.key === "Escape" && branchModal && !branchModal.hidden) {
                closeBranchModal();
            }
            if (event.key === "Escape" && branchManagementModal && !branchManagementModal.hidden) {
                closeBranchManagement();
            }
            if (event.key === "Escape" && officeMenu) {
                closeOfficeMenu();
            }
        });

        if (logoutButton) {
            logoutButton.addEventListener("click", () => {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                window.location.href = "index.html";
            });
        }

        // Create Staff Account Modal Events
        if (createStaffBtn) {
            createStaffBtn.addEventListener("click", () => {
                createStaffBtn.classList.remove("is-activating");
                void createStaffBtn.offsetWidth;
                createStaffBtn.classList.add("is-activating");
                window.setTimeout(() => createStaffBtn.classList.remove("is-activating"), 380);
                openCreateStaffModal();
            });
        }

        if (cancelCreateStaffBtn) {
            cancelCreateStaffBtn.addEventListener("click", closeCreateStaffModal);
        }

        if (createStaffCloseButton) {
            createStaffCloseButton.addEventListener("click", closeCreateStaffModal);
        }

        if (createStaffModal) {
            createStaffModal.addEventListener("click", event => {
                if (event.target === createStaffModal) {
                    closeCreateStaffModal();
                }
            });
        }

        if (createStaffForm) {
            createStaffForm.addEventListener("submit", handleCreateStaffSubmit);
        }

        if (togglePasswordBtn) {
            togglePasswordBtn.addEventListener("click", togglePasswordVisibility);
        }

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                if (createStaffModal && createStaffModal.classList.contains("active")) {
                    closeCreateStaffModal();
                } else if (userModal && !userModal.hidden) {
                    closeModal();
                }
            }
        });
    }

    async function init() {
        const canManagePendingUsers = isSystemAdmin();
        if (pendingUsersSection) {
            pendingUsersSection.hidden = !canManagePendingUsers;
            pendingUsersSection.setAttribute("aria-hidden", String(!canManagePendingUsers));
        }
        if (managementTabs) {
            managementTabs.hidden = !isSystemAdmin();
        }
        bindEvents();
        setLoadingState("Loading users...");
        if (canManagePendingUsers) {
            setPendingLoadingState("Loading pending users...");
        }

        try {
            const results = await Promise.allSettled([
                loadBranches(),
                loadUsers(),
                canManagePendingUsers ? loadPendingUsers() : Promise.resolve([]),
                loadOffices()
            ]);
            await loadStaffQuota();

            const usersResult = results[1];
            const pendingResult = results[2];

            if (usersResult.status === "rejected") {
                throw usersResult.reason;
            }

            if (pendingResult.status === "rejected" && pendingUsersBody) {
                pendingUsersBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="empty">
                            Unable to load pending users.
                        </td>
                    </tr>
                `;
            }
        } catch (error) {
            console.error("USER PAGE LOAD ERROR:", error);
            if (usersBody) {
                usersBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="empty">
                            Unable to load users.
                        </td>
                    </tr>
                `;
            }

        }
    }

    init();
})();
