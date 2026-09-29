(function () {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "index.html";
        return;
    }

    const usersBody = document.getElementById("usersBody");
    const usersCount = document.getElementById("usersCount");
    const searchInput = document.getElementById("searchInput");
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
    const deviceModal = document.getElementById("deviceModal");
    const deviceModalSummary = document.getElementById("deviceModalSummary");
    const deviceSessionList = document.getElementById("deviceSessionList");
    const closeDeviceModalButton = document.getElementById("closeDeviceModalButton");
    const closeDeviceModalFooter = document.getElementById("closeDeviceModalFooter");
    const forceLogoutAllButton = document.getElementById("forceLogoutAllButton");

    // Create Staff Account Modal Elements
    const createStaffBtn = document.getElementById("createStaffBtn");
    const createStaffModal = document.getElementById("createStaffModal");
    const createStaffForm = document.getElementById("createStaffForm");
    const createStaffCloseButton = createStaffModal?.querySelector(".modal-close");
    const togglePasswordBtn = document.getElementById("togglePassword");
    const cancelCreateStaffBtn = document.getElementById("cancelCreateStaffBtn");
    const staffPasswordInput = document.getElementById("staffPassword");

    let allUsers = [];
    let allBranches = [];
    let pendingUsers = [];

    function normalize(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");
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
                <td colspan="8" class="empty">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }

    function renderUsers() {
        if (!usersBody || !usersCount) {
            return;
        }

        const query = normalize(searchInput ? searchInput.value : "");
        const filteredUsers = allUsers.filter(user => {
            if (!query) {
                return true;
            }

            return getSearchText(user).includes(query);
        });

        usersCount.textContent = `${filteredUsers.length} user${filteredUsers.length === 1 ? "" : "s"} found`;

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
            const branchLabel = user.branch || "-";

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
                    <td>${escapeHtml(branchLabel)}</td>
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
                        <button
                            type="button"
                            class="action-button"
                            data-user-id="${escapeHtml(user.id)}"
                            title="Edit user"
                        >
                            <svg class="ui-icon" aria-hidden="true">
                                <use href="#icon-edit"></use>
                            </svg>
                            <span>Edit</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    function renderPendingUsers() {
        if (!pendingUsersBody || !pendingUsersCount) {
            return;
        }

        pendingUsersCount.textContent =
            `${pendingUsers.length} user${pendingUsers.length === 1 ? "" : "s"} pending approval`;

        if (!pendingUsers.length) {
            pendingUsersBody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty">
                        No pending users.
                    </td>
                </tr>
            `;
            return;
        }

        pendingUsersBody.innerHTML = pendingUsers.map((user, index) => {
            const statusLabel = getStatusLabel(user);
            const statusClass = getStatusClass(user);
            const roleClass = getRoleClass(user.role);
            const branchLabel = user.branch || "-";
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
                    <td>${escapeHtml(branchLabel)}</td>
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

    function buildBranchOptions(selectedBranchId, selectedBranchName) {
        const branches = Array.isArray(allBranches) ? allBranches : [];
        const seenIds = new Set();

        const options = branches
            .map(branch => {
                const id = String(branch.id);
                seenIds.add(id);

                return `
                    <option value="${escapeHtml(id)}">
                        ${escapeHtml(branch.name || `Branch ${id}`)}
                    </option>
                `;
            })
            .join("");

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
            ${options}
        `;
    }

    function openModal(user) {
        if (!userModal || !userForm) {
            return;
        }

        userIdInput.value = user.id || "";
        userNameInput.value = user.name || "";
        userEmailInput.value = user.email || "";
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
                            <span>${escapeHtml(session.browser || "Unknown browser")} - ${escapeHtml(session.operating_system || "Unknown")}</span>
                            <small>Logged in: ${escapeHtml(formatSessionDate(session.created_at))}<br>Last active: ${escapeHtml(formatSessionDate(session.last_active_at))}</small>
                        </div>
                        <button type="button" class="danger-button device-revoke-button" data-device-session-id="${escapeHtml(session.session_id)}">Force Logout</button>
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
        return allBranches;
    }

    async function loadUsers() {
        setLoadingState("Loading users...");

        const data = await fetchJson("/api/admin/users");
        allUsers = Array.isArray(data.users) ? data.users : [];

        renderUsers();

        return allUsers;
    }

    async function loadPendingUsers() {
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

        if (!name || !email || !role || !branchId || !Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 50) {
            Notification.warning("Please complete all fields.");
            return;
        }

        const payload = {
            name,
            email,
            role,
            branch_id: Number(branchId),
            is_active: status === "Active",
            max_devices: maxDevices
        };

        if (!Number.isFinite(payload.branch_id)) {
            Notification.warning("Please choose a valid branch.");
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

    function openCreateStaffModal() {
        if (createStaffModal) {
            createStaffModal.classList.add("active");
            createStaffForm.reset();
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

        if (!staffName || !staffEmail || !staffPassword) {
            Notification.warning("Please fill in all fields.");
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
                    password: staffPassword
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
            
        } catch (error) {
            Notification.error(error.message || "Unable to create staff account.");
            console.error("Create staff account error:", error);
        } finally {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = "Create Account";
            }
        }
    }

    function togglePasswordVisibility() {
        if (!staffPasswordInput) return;

        const isPassword = staffPasswordInput.type === "password";
        staffPasswordInput.type = isPassword ? "text" : "password";
    }

    function bindEvents() {
        if (searchInput) {
            searchInput.addEventListener("input", renderUsers);
        }

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
        bindEvents();
        setLoadingState("Loading users...");
        setPendingLoadingState("Loading pending users...");

        try {
            const results = await Promise.allSettled([
                loadBranches(),
                loadUsers(),
                loadPendingUsers()
            ]);

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

            if (usersCount) {
                usersCount.textContent = "0 users found";
            }
        }
    }

    init();
})();
