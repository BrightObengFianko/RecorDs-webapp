const pool = require("../config/database");
const { getDefaultBranchId } = require("../utils/branchUtils");
const {
    hashPassword,
    validatePassword
} = require("../utils/authSecurity");
const { boundedText, isIsoDate } = require("../utils/inputValidation");
const { ACTIVITY_TYPES, recordActivity } = require("../utils/authActivity");

function logAdminActivity(req, activityType, data = {}) {
    return recordActivity({
        request: req,
        userId: req.user?.id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        activityType,
        ...data
    });
}

const VALID_ROLES = new Set([
    "admin",
    "staff",
    "branch_staff"
]);

const VALID_ACCOUNT_STATUSES = new Set([
    "PENDING",
    "APPROVED",
    "DECLINED"
]);

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function parseActiveValue(value, fallback = true) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    if (typeof value === "boolean") {
        return value;
    }

    const normalized = String(value)
        .trim()
        .toLowerCase();

    if (["active", "true", "1", "yes", "y"].includes(normalized)) {
        return true;
    }

    if (["inactive", "false", "0", "no", "n"].includes(normalized)) {
        return false;
    }

    return fallback;
}

function normalizeAccountStatus(status, fallback = "APPROVED") {
    const normalized = String(status || "")
        .trim()
        .toUpperCase();

    if (!normalized) {
        return fallback;
    }

    if (!VALID_ACCOUNT_STATUSES.has(normalized)) {
        return fallback;
    }

    return normalized;
}

async function fetchUserById(userId) {
    const result = await pool.query(
        `
            SELECT
                u.id,
                u.name,
                u.email,
                LOWER(u.role) AS role,
                u.branch_id,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                CASE
                    WHEN COALESCE(u.is_active, TRUE) THEN 'Active'
                    ELSE 'Inactive'
                END AS status,
                COALESCE(b.name, '') AS branch,
                u.created_at
            FROM users u
            LEFT JOIN branches b
                ON b.id = u.branch_id
            WHERE u.id = $1
            LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}

async function fetchBranchById(branchId) {
    const result = await pool.query(
        `
            SELECT id, name, created_at
            FROM branches
            WHERE id = $1
            LIMIT 1
        `,
        [branchId]
    );

    return result.rows[0] || null;
}

// =========================================
// USERS
// =========================================

async function listUsers(req, res) {
    try {
        const result = await pool.query(
            `
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    LOWER(u.role) AS role,
                    u.branch_id,
                    COALESCE(u.is_active, TRUE) AS is_active,
                    UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                    CASE
                        WHEN COALESCE(u.is_active, TRUE) THEN 'Active'
                        ELSE 'Inactive'
                    END AS status,
                    COALESCE(b.name, '') AS branch,
                    u.created_at
                FROM users u
                LEFT JOIN branches b
                    ON b.id = u.branch_id
                ORDER BY u.id ASC
            `
        );

        return res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error("LIST USERS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load users."
        });
    }
}

async function listAuthActivity(req, res) {
    try {
        const {
            date,
            from_date: fromDate,
            to_date: toDate,
            user,
            role,
            activity_type: activityType,
            branch,
            search,
            sort
        } = req.query;

        const requestedPage = Number.parseInt(req.query.page || "1", 10);
        const requestedLimit = Number.parseInt(req.query.limit || "10", 10);
        const page = Number.isInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;
        const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 50)
            : 10;

        const conditions = [];
        const values = [];

        const startDate = fromDate || date;
        const endDate = toDate || date || fromDate;

        if (startDate) {
            if (!isIsoDate(startDate)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid activity start date."
                });
            }

            values.push(startDate);
            conditions.push(`occurred_at >= $${values.length}::date`);
        }

        if (endDate) {
            if (!isIsoDate(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid activity end date."
                });
            }

            values.push(endDate);
            conditions.push(`occurred_at < ($${values.length}::date + INTERVAL '1 day')`);
        }

        if (user) {
            const userFilter = boundedText(user, 150);

            if (!userFilter) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user filter."
                });
            }

            values.push(`%${userFilter}%`);
            conditions.push(`(user_name ILIKE $${values.length} OR user_email ILIKE $${values.length})`);
        }

        if (role) {
            const normalizedRole = String(role).trim().toLowerCase();

            if (!VALID_ROLES.has(normalizedRole)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid role filter."
                });
            }

            values.push(normalizedRole);
            conditions.push(`LOWER(COALESCE(user_role, '')) = $${values.length}`);
        }

        if (activityType) {
            const normalizedActivity = String(activityType).trim().toUpperCase();
            const allowedActivities = new Set(Object.values(ACTIVITY_TYPES));

            if (!allowedActivities.has(normalizedActivity)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid activity filter."
                });
            }

            values.push(normalizedActivity);
            conditions.push(`activity_type = $${values.length}`);
        }

        if (branch) {
            const branchFilter = boundedText(branch, 100);
            if (!branchFilter) {
                return res.status(400).json({ success: false, message: "Invalid branch filter." });
            }
            values.push(branchFilter);
            conditions.push(`(CAST(branch_id AS TEXT) = $${values.length} OR branch_name ILIKE $${values.length} OR EXISTS (SELECT 1 FROM branches fb WHERE fb.id = auth_activity_logs.branch_id AND fb.name ILIKE $${values.length}))`);
        }

        if (search) {
            const searchFilter = boundedText(search, 200);
            if (!searchFilter) {
                return res.status(400).json({ success: false, message: "Invalid activity search." });
            }
            values.push(`%${searchFilter}%`);
            conditions.push(`(user_name ILIKE $${values.length} OR user_email ILIKE $${values.length} OR activity_type ILIKE $${values.length} OR details ILIKE $${values.length} OR affected_user_name ILIKE $${values.length} OR CAST(record_id AS TEXT) ILIKE $${values.length})`);
        }

        const whereClause = conditions.length
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM auth_activity_logs ${whereClause}`,
            values
        );

        const offset = (page - 1) * limit;
        const queryValues = [...values, limit, offset];

        const result = await pool.query(
            `
                SELECT
                    id,
                    user_id,
                    user_name,
                    user_email,
                    user_role,
                    activity_type,
                    occurred_at,
                    branch_id,
                    COALESCE(branch_name, b.name) AS branch_name,
                    record_id,
                    affected_user_id,
                    affected_user_name,
                    details,
                    previous_value,
                    new_value,
                    success,
                    ip_address,
                    user_agent
                FROM auth_activity_logs
                LEFT JOIN branches b ON b.id = auth_activity_logs.branch_id
                ${whereClause}
                ORDER BY auth_activity_logs.occurred_at ${String(sort).toLowerCase() === "oldest" ? "ASC" : "DESC"}, auth_activity_logs.id ${String(sort).toLowerCase() === "oldest" ? "ASC" : "DESC"}
                LIMIT $${queryValues.length - 1}
                OFFSET $${queryValues.length}
            `,
            queryValues
        );

        return res.json({
            success: true,
            activities: result.rows,
            pagination: {
                page,
                limit,
                total: countResult.rows[0]?.total || 0,
                totalPages: Math.max(1, Math.ceil((countResult.rows[0]?.total || 0) / limit))
            }
        });
    } catch (error) {
        console.error("LIST AUTH ACTIVITY ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load authentication activity."
        });
    }
}

async function clearAuthActivity(req, res) {
    try {
        await pool.query("DELETE FROM auth_activity_logs");
        return res.json({ success: true, message: "Activity logs cleared successfully." });
    } catch (error) {
        console.error("CLEAR AUTH ACTIVITY ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to clear activity logs." });
    }
}

async function listPendingUsers(req, res) {
    try {
        const result = await pool.query(
            `
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    LOWER(u.role) AS role,
                    u.branch_id,
                    UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                    COALESCE(u.is_active, TRUE) AS is_active,
                    COALESCE(b.name, '') AS branch,
                    u.created_at
                FROM users u
                LEFT JOIN branches b
                    ON b.id = u.branch_id
                WHERE UPPER(COALESCE(u.account_status, 'APPROVED')) = 'PENDING'
                ORDER BY u.created_at ASC, u.id ASC
            `
        );

        return res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error("LIST PENDING USERS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load pending users."
        });
    }
}

async function changeAccountStatus(req, res, nextStatus) {
    try {
        const { id } = req.params;

        const existing = await fetchUserById(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const currentStatus = normalizeAccountStatus(existing.account_status);
        const desiredStatus = normalizeAccountStatus(nextStatus);

        if (currentStatus === desiredStatus) {
            return res.status(409).json({
                success: false,
                message: `User is already ${desiredStatus.toLowerCase()}.`
            });
        }

        await pool.query(
            `
            UPDATE users
                SET account_status = $1,
                    auth_token_version = COALESCE(auth_token_version, 0) + 1
                WHERE id = $2
            `,
            [desiredStatus, id]
        );

        const user = await fetchUserById(id);

        await logAdminActivity(req, desiredStatus === "APPROVED" ? ACTIVITY_TYPES.USER_ENABLED : ACTIVITY_TYPES.USER_DISABLED, {
            affectedUserId: user.id,
            affectedUserName: user.name,
            branchId: user.branch_id,
            branchName: user.branch,
            previousValue: currentStatus,
            newValue: desiredStatus,
            details: `User account status changed to ${desiredStatus}.`
        });

        return res.json({
            success: true,
            message: `User ${desiredStatus.toLowerCase()} successfully.`,
            user
        });
    } catch (error) {
        console.error("CHANGE ACCOUNT STATUS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update user status."
        });
    }
}

async function approveUser(req, res) {
    return changeAccountStatus(req, res, "APPROVED");
}

async function declineUser(req, res) {
    return changeAccountStatus(req, res, "DECLINED");
}

async function createUser(req, res) {
    try {
        const { name, email, password, role, branch_id, is_active, status } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required."
            });
        }

        const passwordError = validatePassword(password);

        if (passwordError) {
            return res.status(400).json({
                success: false,
                message: passwordError
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (
            boundedText(cleanName, 100) === null ||
            boundedText(cleanEmail, 150) === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Name or email is too long."
            });
        }
        const cleanRole = normalizeRole(role || "staff");
        const cleanIsActive = parseActiveValue(
            is_active !== undefined ? is_active : status,
            true
        );

        if (!VALID_ROLES.has(cleanRole)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        const duplicate = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (duplicate.rowCount) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists."
            });
        }

        let resolvedBranchId = branch_id;

        if (
            resolvedBranchId === undefined ||
            resolvedBranchId === null ||
            resolvedBranchId === ""
        ) {
            resolvedBranchId = await getDefaultBranchId();
        } else {
            resolvedBranchId = Number.parseInt(
                resolvedBranchId,
                10
            );

            if (Number.isNaN(resolvedBranchId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid branch."
                });
            }
        }

        if (!resolvedBranchId) {
            return res.status(500).json({
                success: false,
                message: "Unable to determine the user branch."
            });
        }

        const branch = await fetchBranchById(resolvedBranchId);

        if (!branch) {
            return res.status(404).json({
                success: false,
                message: "Branch not found."
            });
        }

        const hashedPassword = await hashPassword(password);

        const created = await pool.query(
            `
                INSERT INTO users
                (name, email, password, role, branch_id, is_active, account_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                cleanRole,
                branch.id,
                cleanIsActive,
                "APPROVED"
            ]
        );

        const user = await fetchUserById(created.rows[0].id);

        await logAdminActivity(req, ACTIVITY_TYPES.USER_CREATED, {
            affectedUserId: user.id,
            affectedUserName: user.name,
            branchId: user.branch_id,
            branchName: user.branch,
            details: "User account created."
        });

        return res.status(201).json({
            success: true,
            message: "User created successfully.",
            user
        });
    } catch (error) {
        console.error("CREATE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create user."
        });
    }
}

async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { name, email, password, role, branch_id, is_active, status } = req.body;

        const existing = await fetchUserById(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const nextName = name !== undefined ? String(name).trim() : existing.name;
        const nextEmail = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
        const nextRole = role !== undefined ? normalizeRole(role) : normalizeRole(existing.role);
        let nextBranchId = branch_id !== undefined ? branch_id : existing.branch_id;
        const nextIsActive = parseActiveValue(
            is_active !== undefined ? is_active : status,
            existing.is_active !== false
        );

        if (!nextName) {
            return res.status(400).json({
                success: false,
                message: "Name is required."
            });
        }

        if (!nextEmail) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        if (
            boundedText(nextName, 100) === null ||
            boundedText(nextEmail, 150) === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Name or email is too long."
            });
        }

        if (!VALID_ROLES.has(nextRole)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        if (
            String(req.user.id) === String(id) &&
            nextIsActive === false
        ) {
            return res.status(409).json({
                success: false,
                message: "You cannot deactivate your own account."
            });
        }

        if (branch_id !== undefined) {
            nextBranchId = Number.parseInt(
                branch_id,
                10
            );

            if (Number.isNaN(nextBranchId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid branch."
                });
            }

            const branch = await fetchBranchById(nextBranchId);

            if (!branch) {
                return res.status(404).json({
                    success: false,
                    message: "Branch not found."
                });
            }

            nextBranchId = branch.id;
        }

        const duplicate = await pool.query(
            `
                SELECT id
                FROM users
                WHERE email = $1
                  AND id <> $2
                LIMIT 1
            `,
            [nextEmail, id]
        );

        if (duplicate.rowCount) {
            return res.status(409).json({
                success: false,
                message: "Another user with this email already exists."
            });
        }

        const updateValues = [
            nextName,
            nextEmail,
            nextRole
        ];

        let query = `
            UPDATE users
            SET
                name = $1,
                email = $2,
                role = $3
        `;

        if (password) {
            const passwordError = validatePassword(password);

            if (passwordError) {
                return res.status(400).json({
                    success: false,
                    message: passwordError
                });
            }

            const hashedPassword = await hashPassword(password);

            updateValues.push(hashedPassword);

            query += `,
                password = $4`;
        }

        const isActiveIndex = updateValues.length + 1;

        updateValues.push(nextIsActive);

        query += `,
                is_active = $${isActiveIndex},
                auth_token_version = COALESCE(auth_token_version, 0) + 1`;

        const branchIndex = updateValues.length + 1;

        updateValues.push(nextBranchId);

        query += `,
                branch_id = $${branchIndex}
            WHERE id = $${branchIndex + 1}
            RETURNING id
        `;

        updateValues.push(id);

        const result = await pool.query(query, updateValues);

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = await fetchUserById(id);

        if (existing.is_active !== user.is_active) {
            await logAdminActivity(req, user.is_active ? ACTIVITY_TYPES.USER_ENABLED : ACTIVITY_TYPES.USER_DISABLED, {
                affectedUserId: user.id,
                affectedUserName: user.name,
                branchId: user.branch_id,
                branchName: user.branch,
                details: `User ${user.is_active ? "enabled" : "disabled"}.`
            });
        }

        if (String(existing.branch_id) !== String(user.branch_id)) {
            await logAdminActivity(req, ACTIVITY_TYPES.BRANCH_ASSIGNMENT_CHANGED, {
                affectedUserId: user.id,
                affectedUserName: user.name,
                branchId: user.branch_id,
                branchName: user.branch,
                previousValue: existing.branch,
                newValue: user.branch,
                details: "User branch assignment changed."
            });
        }

        return res.json({
            success: true,
            message: "User updated successfully.",
            user
        });
    } catch (error) {
        console.error("UPDATE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update user."
        });
    }
}

async function deleteUser(req, res) {
    try {
        const { id } = req.params;

        if (String(req.user.id) === String(id)) {
            return res.status(409).json({
                success: false,
                message: "You cannot delete your own account."
            });
        }

        const result = await pool.query(
            `
                DELETE FROM users
                WHERE id = $1
                RETURNING id
            `,
            [id]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        return res.json({
            success: true,
            message: "User deleted successfully."
        });
    } catch (error) {
        console.error("DELETE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to delete user."
        });
    }
}

// =========================================
// BRANCHES
// =========================================

async function listBranches(req, res) {
    try {
        const result = await pool.query(
            `
                SELECT id, name, created_at
                FROM branches
                ORDER BY name ASC
            `
        );

        return res.json({
            success: true,
            branches: result.rows
        });
    } catch (error) {
        console.error("LIST BRANCHES ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load branches."
        });
    }
}

async function createBranch(req, res) {
    try {
        const { name } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Branch name is required."
            });
        }

        const cleanName = String(name).trim();

        if (boundedText(cleanName, 100) === null) {
            return res.status(400).json({
                success: false,
                message: "Branch name is too long."
            });
        }

        const duplicate = await pool.query(
            "SELECT id FROM branches WHERE LOWER(name) = LOWER($1) LIMIT 1",
            [cleanName]
        );

        if (duplicate.rowCount) {
            return res.status(409).json({
                success: false,
                message: "A branch with this name already exists."
            });
        }

        const result = await pool.query(
            `
                INSERT INTO branches (name)
                VALUES ($1)
                RETURNING id, name, created_at
            `,
            [cleanName]
        );

        return res.status(201).json({
            success: true,
            message: "Branch created successfully.",
            branch: result.rows[0]
        });
    } catch (error) {
        console.error("CREATE BRANCH ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create branch."
        });
    }
}

async function updateBranch(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: "Branch name is required."
            });
        }

        const cleanName = String(name).trim();

        if (boundedText(cleanName, 100) === null) {
            return res.status(400).json({
                success: false,
                message: "Branch name is too long."
            });
        }

        const duplicate = await pool.query(
            `
                SELECT id
                FROM branches
                WHERE LOWER(name) = LOWER($1)
                  AND id <> $2
                LIMIT 1
            `,
            [cleanName, id]
        );

        if (duplicate.rowCount) {
            return res.status(409).json({
                success: false,
                message: "Another branch with this name already exists."
            });
        }

        const result = await pool.query(
            `
                UPDATE branches
                SET name = $1
                WHERE id = $2
                RETURNING id, name, created_at
            `,
            [cleanName, id]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "Branch not found."
            });
        }

        return res.json({
            success: true,
            message: "Branch updated successfully.",
            branch: result.rows[0]
        });
    } catch (error) {
        console.error("UPDATE BRANCH ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update branch."
        });
    }
}

async function deleteBranch(req, res) {
    try {
        const { id } = req.params;

        const userCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM users WHERE branch_id = $1",
            [id]
        );

        const recordCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM records WHERE branch_id = $1",
            [id]
        );

        if (
            userCount.rows[0].count > 0 ||
            recordCount.rows[0].count > 0
        ) {
            return res.status(409).json({
                success: false,
                message: "Branch still has users or records assigned to it."
            });
        }

        const result = await pool.query(
            `
                DELETE FROM branches
                WHERE id = $1
                RETURNING id
            `,
            [id]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "Branch not found."
            });
        }

        return res.json({
            success: true,
            message: "Branch deleted successfully."
        });
    } catch (error) {
        console.error("DELETE BRANCH ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to delete branch."
        });
    }
}

module.exports = {
    listAuthActivity,
    clearAuthActivity,
    listUsers,
    listPendingUsers,
    approveUser,
    declineUser,
    createUser,
    updateUser,
    deleteUser,
    listBranches,
    createBranch,
    updateBranch,
    deleteBranch
};
