const pool = require("../config/database");
const {
    hashPassword,
    validatePassword
} = require("../utils/authSecurity");
const { boundedText, isIsoDate } = require("../utils/inputValidation");
const { ACTIVITY_TYPES, recordActivity, makeRecordSnapshot } = require("../utils/authActivity");
const { NOTIFICATION_TYPES, notifyAdmins } = require("../utils/notifications");
const { isSystemSuperAdmin, isOfficeSystemSuperAdmin } = require("../utils/officeUtils");
const {
    DEFAULT_STAFF_ACCOUNT_LIMIT,
    countsTowardStaffLimit,
    lockStaffAccountQuota
} = require("../utils/staffQuota");
const {
    encryptOfficeSecret,
    validateOfficeWebhookUrl
} = require("../utils/officeIntegration");

async function logAdminActivity(req, activityType, data = {}) {
    const activity = await recordActivity({
        request: req,
        userId: req.user?.id,
        name: req.user?.name,
        email: req.user?.email,
        role: req.user?.role,
        activityType,
        ...data
    });

    const notificationTypeByActivity = {
        [ACTIVITY_TYPES.USER_CREATED]: NOTIFICATION_TYPES.USER_CREATED,
        [ACTIVITY_TYPES.USER_ENABLED]: NOTIFICATION_TYPES.USER_ENABLED,
        [ACTIVITY_TYPES.USER_DISABLED]: NOTIFICATION_TYPES.USER_DISABLED,
        [ACTIVITY_TYPES.BRANCH_ASSIGNMENT_CHANGED]: NOTIFICATION_TYPES.BRANCH_ASSIGNMENT_CHANGED,
        [ACTIVITY_TYPES.STAFF_QUOTA_CHANGED]: NOTIFICATION_TYPES.SYSTEM_ALERT,
        [ACTIVITY_TYPES.STAFF_QUOTA_REJECTED]: NOTIFICATION_TYPES.SYSTEM_ALERT,
        [ACTIVITY_TYPES.BRANCH_CREATED]: NOTIFICATION_TYPES.SYSTEM_ALERT
    };
    const notificationType = notificationTypeByActivity[activityType];
    if (notificationType) {
        try {
            const officeId = data.officeId || req.user?.office_id || null;
            await notifyAdmins({
                type: notificationType,
                title: activityType === ACTIVITY_TYPES.STAFF_QUOTA_REJECTED
                    ? "Staff Quota Rejected"
                    : "Administration Activity",
                message: String(data.details || `${activityType} completed.`).slice(0, 2000),
                priority: activityType === ACTIVITY_TYPES.STAFF_QUOTA_REJECTED
                    ? "IMPORTANT"
                    : "INFO",
                officeId,
                branchId: data.branchId || null,
                metadata: {
                    event_id: `admin-activity:${activity?.id || Date.now()}`,
                    activity_type: activityType,
                    affected_user_id: data.affectedUserId || null
                }
            });
        } catch (notificationError) {
            console.error("ADMIN ACTIVITY NOTIFICATION ERROR:", notificationError.message);
        }
    }

    return activity;
}

const VALID_ROLES = new Set([
    "admin",
    "office_admin",
    "system_super_admin",
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

function canAssignRole(actor, targetRole) {
    const normalizedTargetRole = normalizeRole(targetRole);

    if (!VALID_ROLES.has(normalizedTargetRole)) {
        return false;
    }

    if (["admin", "office_admin", "system_super_admin"].includes(normalizedTargetRole)) {
        return isOfficeSystemSuperAdmin(actor);
    }

    return true;
}

async function fetchUserById(userId) {
    const result = await pool.query(
        `
            SELECT
                u.id,
                u.name,
                u.email,
                LOWER(u.role) AS role,
                u.office_id,
                u.branch_id,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                CASE
                    WHEN COALESCE(u.is_active, TRUE) THEN 'Active'
                    ELSE 'Inactive'
                END AS status,
                COALESCE(u.max_devices, 2) AS max_devices,
                (
                    SELECT COUNT(DISTINCT us.device_id)::int
                    FROM user_sessions us
                    WHERE us.user_id = u.id
                      AND us.is_active = TRUE
                      AND us.revoked_at IS NULL
                      AND us.expires_at > CURRENT_TIMESTAMP
                ) AS active_devices,
                COALESCE(b.name, '') AS branch,
                COALESCE(o.name, '') AS office,
                u.created_at
            FROM users u
            LEFT JOIN branches b
                ON b.id = u.branch_id
            LEFT JOIN offices o
                ON o.id = u.office_id
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
            SELECT id, name, office_id, created_at
            FROM branches
            WHERE id = $1
            LIMIT 1
        `,
        [branchId]
    );

    return result.rows[0] || null;
}

async function recordQuotaRejection(req, officeId, error) {
    await logAdminActivity(req, ACTIVITY_TYPES.STAFF_QUOTA_REJECTED, {
        details: error.message,
        newValue: JSON.stringify({ office_id: officeId, used: error.used, limit: error.limit }),
        success: false
    });
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
                    u.office_id,
                    u.branch_id,
                    COALESCE(u.is_active, TRUE) AS is_active,
                    UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                    CASE
                        WHEN COALESCE(u.is_active, TRUE) THEN 'Active'
                        ELSE 'Inactive'
                    END AS status,
                    COALESCE(u.max_devices, 2) AS max_devices,
                    (
                        SELECT COUNT(DISTINCT us.device_id)::int
                        FROM user_sessions us
                        WHERE us.user_id = u.id
                          AND us.is_active = TRUE
                          AND us.revoked_at IS NULL
                          AND us.expires_at > CURRENT_TIMESTAMP
                    ) AS active_devices,
                    COALESCE(b.name, '') AS branch,
                    COALESCE(o.name, '') AS office,
                    o.staff_account_limit,
                    (SELECT COUNT(*)::int FROM users quota_user
                     WHERE quota_user.office_id = u.office_id
                       AND LOWER(REPLACE(REPLACE(COALESCE(quota_user.role, ''), '-', '_'), ' ', '_'))
                           NOT IN ('system_super_admin', 'super_admin')) AS staff_account_count,
                    u.created_at
                FROM users u
                LEFT JOIN branches b
                    ON b.id = u.branch_id
                LEFT JOIN offices o
                    ON o.id = u.office_id
                WHERE ($1::int IS NULL OR u.office_id = $1)
                  AND (
                      $2::boolean = TRUE
                      OR LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '-', '_'), ' ', '_'))
                         NOT IN ('system_super_admin', 'super_admin')
                  )
                ORDER BY u.id ASC
            `,
            [
                isSystemSuperAdmin(req.user) ? null : req.user.office_id,
                isOfficeSystemSuperAdmin(req.user)
            ]
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

async function getStaffQuota(req, res) {
    try {
        const requestedOfficeId = Number.parseInt(String(req.query?.office_id || ""), 10);
        const officeId = isSystemSuperAdmin(req.user) && Number.isInteger(requestedOfficeId)
            ? requestedOfficeId
            : req.user.office_id;

        if (!Number.isInteger(Number(officeId))) {
            return res.status(400).json({ success: false, message: "No office is assigned to this account." });
        }

        const result = await pool.query(
            `
                SELECT o.id, o.name, o.staff_account_limit,
                       (SELECT COUNT(*)::int FROM users u
                        WHERE u.office_id = o.id
                          AND LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '-', '_'), ' ', '_'))
                              NOT IN ('system_super_admin', 'super_admin')) AS staff_account_count
                FROM offices o
                WHERE o.id = $1
                LIMIT 1
            `,
            [officeId]
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Office not found." });
        const office = result.rows[0];
        return res.json({
            success: true,
            quota: {
                office_id: office.id,
                office_name: office.name,
                used: Number(office.staff_account_count || 0),
                limit: Number(office.staff_account_limit || DEFAULT_STAFF_ACCOUNT_LIMIT),
                remaining: Math.max(0, Number(office.staff_account_limit || DEFAULT_STAFF_ACCOUNT_LIMIT) - Number(office.staff_account_count || 0))
            }
        });
    } catch (error) {
        console.error("GET STAFF QUOTA ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load staff account usage." });
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
            office_id: officeId,
            result: resultFilter,
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

        if (!isSystemSuperAdmin(req.user)) {
            values.push(req.user.office_id);
            conditions.push(`auth_activity_logs.office_id = $${values.length}`);
        } else if (officeId) {
            const requestedOfficeId = Number.parseInt(String(officeId), 10);
            if (!Number.isInteger(requestedOfficeId) || requestedOfficeId <= 0) {
                return res.status(400).json({ success: false, message: "Invalid office filter." });
            }
            values.push(requestedOfficeId);
            conditions.push(`auth_activity_logs.office_id = $${values.length}`);
        }

        if (resultFilter) {
            const normalizedResult = String(resultFilter).trim().toLowerCase();
            if (!["success", "failed"].includes(normalizedResult)) {
                return res.status(400).json({ success: false, message: "Invalid activity result filter." });
            }
            values.push(normalizedResult === "success");
            conditions.push(`auth_activity_logs.success = $${values.length}`);
        }

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
            conditions.push(`auth_activity_logs.occurred_at >= $${values.length}::date`);
        }

        if (endDate) {
            if (!isIsoDate(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid activity end date."
                });
            }

            values.push(endDate);
            conditions.push(`auth_activity_logs.occurred_at < ($${values.length}::date + INTERVAL '1 day')`);
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
            conditions.push(`(auth_activity_logs.user_name ILIKE $${values.length} OR auth_activity_logs.user_email ILIKE $${values.length})`);
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
            conditions.push(`LOWER(COALESCE(auth_activity_logs.user_role, '')) = $${values.length}`);
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
            conditions.push(`auth_activity_logs.activity_type = $${values.length}`);
        }

        if (branch) {
            const branchFilter = boundedText(branch, 100);
            if (!branchFilter) {
                return res.status(400).json({ success: false, message: "Invalid branch filter." });
            }
            values.push(branchFilter);
            conditions.push(`(CAST(auth_activity_logs.branch_id AS TEXT) = $${values.length} OR auth_activity_logs.branch_name ILIKE $${values.length} OR EXISTS (SELECT 1 FROM branches fb WHERE fb.id = auth_activity_logs.branch_id AND fb.name ILIKE $${values.length}))`);
        }

        if (search) {
            const searchFilter = boundedText(search, 200);
            if (!searchFilter) {
                return res.status(400).json({ success: false, message: "Invalid activity search." });
            }
            values.push(`%${searchFilter}%`);
            conditions.push(`(auth_activity_logs.user_name ILIKE $${values.length} OR auth_activity_logs.user_email ILIKE $${values.length} OR auth_activity_logs.activity_type ILIKE $${values.length} OR auth_activity_logs.details ILIKE $${values.length} OR auth_activity_logs.affected_user_name ILIKE $${values.length} OR CAST(auth_activity_logs.record_id AS TEXT) ILIKE $${values.length})`);
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
                    auth_activity_logs.id,
                    auth_activity_logs.user_id,
                    auth_activity_logs.user_name,
                    auth_activity_logs.user_email,
                    auth_activity_logs.user_role,
                    auth_activity_logs.activity_type,
                    auth_activity_logs.occurred_at,
                    auth_activity_logs.branch_id,
                    COALESCE(auth_activity_logs.branch_name, b.name) AS branch_name,
                    auth_activity_logs.record_id,
                    auth_activity_logs.affected_user_id,
                    auth_activity_logs.affected_user_name,
                    auth_activity_logs.details,
                    auth_activity_logs.previous_value,
                    auth_activity_logs.new_value,
                    auth_activity_logs.record_snapshot,
                    auth_activity_logs.change_set,
                    auth_activity_logs.success,
                    auth_activity_logs.ip_address,
                    auth_activity_logs.user_agent
                    ,auth_activity_logs.office_id
                    ,COALESCE(auth_activity_logs.office_name_snapshot, o.name, '') AS office_name
                FROM auth_activity_logs
                LEFT JOIN branches b ON b.id = auth_activity_logs.branch_id
                LEFT JOIN offices o ON o.id = auth_activity_logs.office_id
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
        await pool.query(
            `DELETE FROM auth_activity_logs WHERE ($1::int IS NULL OR office_id = $1)`,
            [isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );
        return res.json({ success: true, message: "Activity logs cleared successfully." });
    } catch (error) {
        console.error("CLEAR AUTH ACTIVITY ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to clear activity logs." });
    }
}

async function getAuthActivityDetails(req, res) {
    try {
        const result = await pool.query(
            `
                SELECT
                    l.id,
                    l.user_id,
                    l.user_name,
                    l.user_email,
                    l.user_role,
                    l.activity_type,
                    l.occurred_at,
                    l.branch_id,
                    COALESCE(l.branch_name, b.name) AS branch_name,
                    COALESCE(l.office_name_snapshot, o.name, '') AS office_name,
                    l.record_id,
                    l.affected_user_id,
                    l.affected_user_name,
                    l.details,
                    l.previous_value,
                    l.new_value,
                    l.record_snapshot,
                    l.change_set,
                    l.success,
                    r.id AS current_record_id,
                    r.name AS current_name,
                    r.phone_number AS current_phone_number,
                    r.category AS current_category,
                    r.date_of_birth AS current_date_of_birth,
                    r.date_of_death AS current_date_of_death,
                    r.registration_date AS current_registration_date,
                    r.registrar AS current_registrar,
                    r.status AS current_status,
                    r.sms_sent AS current_sms_sent,
                    r.sms_status AS current_sms_status,
                    r.sms_date AS current_sms_date,
                    r.sms_error AS current_sms_error,
                    r.sms_error_at AS current_sms_error_at,
                    r.sms_last_response AS current_sms_last_response,
                    r.sms_last_attempt_at AS current_sms_last_attempt_at,
                    r.sms_last_attempt_by AS current_sms_last_attempt_by,
                    r.notes AS current_notes,
                    r.branch_id AS current_branch_id
                FROM auth_activity_logs l
                LEFT JOIN branches b ON b.id = l.branch_id
                LEFT JOIN offices o ON o.id = l.office_id
                LEFT JOIN records r ON r.id = l.record_id
                WHERE l.id = $1
                  AND ($2::int IS NULL OR l.office_id = $2)
                LIMIT 1
            `,
            [req.params.id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: "Activity log not found."
            });
        }

        const row = result.rows[0];
        const currentRecord = row.current_record_id
            ? {
                id: row.current_record_id,
                name: row.current_name,
                phone_number: row.current_phone_number,
                category: row.current_category,
                date_of_birth: row.current_date_of_birth,
                date_of_death: row.current_date_of_death,
                registration_date: row.current_registration_date,
                registrar: row.current_registrar,
                status: row.current_status,
                sms_sent: row.current_sms_sent,
                sms_status: row.current_sms_status,
                sms_date: row.current_sms_date,
                sms_error: row.current_sms_error,
                sms_error_at: row.current_sms_error_at,
                sms_last_response: row.current_sms_last_response,
                sms_last_attempt_at: row.current_sms_last_attempt_at,
                sms_last_attempt_by: row.current_sms_last_attempt_by,
                notes: row.current_notes,
                branch_id: row.current_branch_id
            }
            : null;

        return res.json({
            success: true,
            activity: {
                id: row.id,
                user_id: row.user_id,
                user_name: row.user_name,
                user_email: row.user_email,
                user_role: row.user_role,
                activity_type: row.activity_type,
                occurred_at: row.occurred_at,
                branch_id: row.branch_id,
                branch_name: row.branch_name,
                record_id: row.record_id,
                affected_user_id: row.affected_user_id,
                affected_user_name: row.affected_user_name,
                details: row.details,
                previous_value: row.previous_value,
                new_value: row.new_value,
                record_snapshot: row.record_snapshot,
                change_set: row.change_set,
                success: row.success,
                current_record: currentRecord
            }
        });
    } catch (error) {
        console.error("GET AUTH ACTIVITY DETAILS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to load activity details."
        });
    }
}

async function restoreDeletedCase(req, res) {
    const client = await pool.connect();

    try {
        const deletedLog = await client.query(
            `
                SELECT id, record_id, branch_id, branch_name, office_id, record_snapshot
                FROM auth_activity_logs
                WHERE id = $1
                  AND activity_type = $2
                  AND ($3::int IS NULL OR office_id = $3)
                LIMIT 1
            `,
            [req.params.id, ACTIVITY_TYPES.RECORD_DELETED, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );

        const log = deletedLog.rows[0];
        const snapshot = log?.record_snapshot;

        if (!log || !snapshot || !snapshot.id || !snapshot.name) {
            return res.status(404).json({
                success: false,
                message: "Deleted case snapshot not found."
            });
        }

        await client.query("BEGIN");

        const existing = await client.query(
            "SELECT id FROM records WHERE id = $1 AND ($2::int IS NULL OR office_id = $2) LIMIT 1",
            [snapshot.id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );

        if (existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "This case has already been restored."
            });
        }

        const restored = await client.query(
            `
                INSERT INTO records (
                    id, name, phone_number, category, date_of_birth, date_of_death,
                    registration_date, registrar, branch_id, office_id, status, sms_sent,
                    sms_status, sms_date, sms_error, notes, created_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *
            `,
            [
                snapshot.id,
                snapshot.name,
                snapshot.phone_number || null,
                snapshot.category || null,
                snapshot.date_of_birth || null,
                snapshot.date_of_death || null,
                snapshot.registration_date || null,
                snapshot.registrar || null,
                snapshot.branch_id ?? log.branch_id ?? null,
                snapshot.office_id ?? log.office_id ?? req.user.office_id,
                snapshot.status || "Pending",
                snapshot.sms_sent || null,
                snapshot.sms_status || null,
                snapshot.sms_date || null,
                snapshot.sms_error || null,
                snapshot.notes || null,
                snapshot.created_by || null
            ]
        );

        await client.query(
            `
                SELECT setval(
                    pg_get_serial_sequence('records', 'id'),
                    GREATEST(COALESCE((SELECT MAX(id) FROM records), 1), 1),
                    true
                )
            `
        );
        await client.query("COMMIT");

        await logAdminActivity(req, ACTIVITY_TYPES.RECORD_RESTORED, {
            recordId: restored.rows[0].id,
            branchId: restored.rows[0].branch_id,
            branchName: log.branch_name,
            officeId: restored.rows[0].office_id,
            details: "Deleted case restored.",
            recordSnapshot: makeRecordSnapshot(restored.rows[0])
        });

        try {
            const restoredBranch = String(log.branch_name || req.user?.branch || "the assigned branch").trim();
            await notifyAdmins({
                type: NOTIFICATION_TYPES.RECORD_RESTORED,
                title: "Record Restored",
                message: `Case #${restored.rows[0].id} was restored by ${req.user?.name || "Admin"}.`,
                recordId: restored.rows[0].id,
                branchId: restored.rows[0].branch_id,
                eventId: `record-restored:${restored.rows[0].id}:${Date.now()}`,
                metadata: {
                    record_id: restored.rows[0].id,
                    branch_id: restored.rows[0].branch_id,
                    branch_name: restoredBranch
                }
            });
        } catch (notificationError) {
            console.error("RESTORE ADMIN NOTIFICATION ERROR:", notificationError.message);
        }

        return res.json({
            success: true,
            message: "Case restored successfully."
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("RESTORE CASE ROLLBACK ERROR:", rollbackError);
        }

        console.error("RESTORE DELETED CASE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to restore deleted case."
        });
    } finally {
        client.release();
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
                    u.office_id,
                    u.branch_id,
                    UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                    COALESCE(u.is_active, TRUE) AS is_active,
                    COALESCE(b.name, '') AS branch,
                    u.created_at
                FROM users u
                LEFT JOIN branches b
                    ON b.id = u.branch_id
                WHERE UPPER(COALESCE(u.account_status, 'APPROVED')) = 'PENDING'
                  AND ($1::int IS NULL OR u.office_id = $1)
                  AND (
                      $2::boolean = TRUE
                      OR LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '-', '_'), ' ', '_'))
                         NOT IN ('system_super_admin', 'super_admin')
                  )
                ORDER BY u.created_at ASC, u.id ASC
            `,
            [
                isSystemSuperAdmin(req.user) ? null : req.user.office_id,
                isOfficeSystemSuperAdmin(req.user)
            ]
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

        if (normalizeRole(existing.role) === "system_super_admin" && !isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only the System Super Admin can change this account." });
        }

        if (!isSystemSuperAdmin(req.user) && String(existing.office_id) !== String(req.user.office_id)) {
            return res.status(404).json({ success: false, message: "User not found." });
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
    let client = null;
    try {
        const {
            name,
            email,
            password,
            role,
            office_id: requestedOfficeId,
            branch_id,
            is_active,
            status,
            max_devices
        } = req.body;

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

        if (!canAssignRole(req.user, cleanRole)) {
            return res.status(403).json({ success: false, message: "Only a system administrator can assign this role." });
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

        const parsedOfficeId = Number.parseInt(String(requestedOfficeId || ""), 10);
        const officeId = isSystemSuperAdmin(req.user) && Number.isInteger(parsedOfficeId)
            ? parsedOfficeId
            : req.user?.office_id;

        if (!Number.isInteger(Number(officeId))) {
            return res.status(400).json({
                success: false,
                message: "Select a valid office."
            });
        }

        const office = await pool.query(
            "SELECT id FROM offices WHERE id = $1 AND status = 'ACTIVE' LIMIT 1",
            [officeId]
        );

        if (!office.rowCount) {
            return res.status(400).json({
                success: false,
                message: "Selected office does not exist or is inactive."
            });
        }

        let resolvedBranchId = branch_id;

        if (
            resolvedBranchId === undefined ||
            resolvedBranchId === null ||
            resolvedBranchId === ""
        ) {
            resolvedBranchId = null;
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

        let branch = null;
        if (resolvedBranchId !== null) {
            branch = await fetchBranchById(resolvedBranchId);

            if (!branch) {
                return res.status(404).json({
                    success: false,
                    message: "Branch not found."
                });
            }

            if (String(branch.office_id) !== String(officeId)) {
                return res.status(400).json({
                    success: false,
                    message: "Selected branch does not belong to the selected office."
                });
            }
        }

        const hashedPassword = await hashPassword(password);

        const nextMaxDevices = max_devices === undefined
            ? 2
            : Number.parseInt(String(max_devices), 10);

        if (!Number.isInteger(nextMaxDevices) || nextMaxDevices < 1 || nextMaxDevices > 50) {
            return res.status(400).json({
                success: false,
                message: "Maximum devices must be a whole number between 1 and 50."
            });
        }

        client = await pool.connect();
        await client.query("BEGIN");
        await lockStaffAccountQuota(client, officeId, cleanRole);

        const created = await client.query(
            `
                INSERT INTO users
                (name, email, password, role, office_id, branch_id, is_active, account_status, max_devices)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
            `,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                cleanRole,
                officeId,
                resolvedBranchId,
                cleanIsActive,
                "APPROVED",
                nextMaxDevices
            ]
        );
        await client.query("COMMIT");
        client.release();
        client = null;

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
        if (client) {
            try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("CREATE USER ROLLBACK ERROR:", rollbackError); }
            client.release();
        }
        if (error.code === "STAFF_QUOTA_EXCEEDED") {
            try { await recordQuotaRejection(req, error.officeId, error); } catch (activityError) { console.error("CREATE USER QUOTA AUDIT ERROR:", activityError); }
            return res.status(409).json({ success: false, message: error.message });
        }
        console.error("CREATE USER ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create user."
        });
    }
}

async function updateUser(req, res) {
    let client = null;
    try {
        const { id } = req.params;
        const { name, email, password, role, office_id: requestedOfficeId, branch_id, is_active, status, max_devices } = req.body;

        const existing = await fetchUserById(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (normalizeRole(existing.role) === "system_super_admin" && !isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                message: "Only the System Super Admin can edit a System Super Admin account."
            });
        }

        if (!isSystemSuperAdmin(req.user) && String(existing.office_id) !== String(req.user.office_id)) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        let nextOfficeId = existing.office_id;
        if (requestedOfficeId !== undefined) {
            if (!isSystemSuperAdmin(req.user)) {
                return res.status(403).json({ success: false, message: "Only the System Super Admin can transfer users between offices." });
            }
            nextOfficeId = Number.parseInt(String(requestedOfficeId), 10);
            if (!Number.isInteger(nextOfficeId)) {
                return res.status(400).json({ success: false, message: "Invalid office." });
            }
            const officeResult = await pool.query(
                "SELECT id FROM offices WHERE id = $1 AND status = 'ACTIVE' LIMIT 1",
                [nextOfficeId]
            );
            if (!officeResult.rowCount) {
                return res.status(400).json({ success: false, message: "Selected office does not exist or is inactive." });
            }
        }

        const nextName = name !== undefined ? String(name).trim() : existing.name;
        const nextEmail = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
        const nextRole = role !== undefined ? normalizeRole(role) : normalizeRole(existing.role);
        let nextBranchId = branch_id !== undefined ? branch_id : existing.branch_id;
        const nextIsActive = parseActiveValue(
            is_active !== undefined ? is_active : status,
            existing.is_active !== false
        );
        const nextMaxDevices = max_devices === undefined
            ? Math.max(1, Number(existing.max_devices || 1))
            : Number.parseInt(String(max_devices), 10);

        if (!Number.isInteger(nextMaxDevices) || nextMaxDevices < 1 || nextMaxDevices > 50) {
            return res.status(400).json({
                success: false,
                message: "Maximum devices must be a whole number between 1 and 50."
            });
        }

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

        if (!canAssignRole(req.user, nextRole)) {
            return res.status(403).json({ success: false, message: "Only a system administrator can assign this role." });
        }

        if (
            String(req.user.id) === String(id) &&
            nextRole !== normalizeRole(existing.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot change your own role. Ask a System Super Admin to do this."
            });
        }

        if (nextBranchId !== null && ["admin", "office_admin", "system_super_admin"].includes(nextRole)) {
            return res.status(403).json({
                success: false,
                message: "Privileged office roles cannot be assigned to a branch user."
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
            if (branch_id === null || String(branch_id).trim() === "") {
                nextBranchId = null;
            } else {
                nextBranchId = Number.parseInt(branch_id, 10);

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

                if (String(branch.office_id) !== String(nextOfficeId)) {
                    return res.status(403).json({ success: false, message: "Selected branch does not belong to the user's office." });
                }

                nextBranchId = branch.id;
            }
        } else if (String(nextOfficeId) !== String(existing.office_id) && existing.branch_id !== null) {
            return res.status(400).json({
                success: false,
                message: "Clear the existing branch or select a branch in the target office before transferring this user."
            });
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

            const passwordIndex = updateValues.length + 1;
            query += `,
                password = $${passwordIndex}`;
        }

        const maxDevicesIndex = updateValues.length + 1;
        updateValues.push(nextMaxDevices);

        query += `,
                max_devices = $${maxDevicesIndex}`;

        const isActiveIndex = updateValues.length + 1;

        updateValues.push(nextIsActive);

        query += `,
                is_active = $${isActiveIndex},
                auth_token_version = COALESCE(auth_token_version, 0) + 1`;

        const officeIndex = updateValues.length + 1;
        updateValues.push(nextOfficeId);

        const branchIndex = updateValues.length + 1;

        updateValues.push(nextBranchId);

        query += `,
                office_id = $${officeIndex},
                branch_id = $${branchIndex}
                WHERE id = $${branchIndex + 1}
                  AND office_id = $${branchIndex + 2}
                RETURNING id
        `;

        updateValues.push(id);
        updateValues.push(isSystemSuperAdmin(req.user) ? existing.office_id : req.user.office_id);

        client = await pool.connect();
        await client.query("BEGIN");
        await lockStaffAccountQuota(
            client,
            nextOfficeId,
            nextRole,
            {
                existingCountsInOffice:
                    String(nextOfficeId) === String(existing.office_id) &&
                    countsTowardStaffLimit(existing.role) &&
                    countsTowardStaffLimit(nextRole)
            }
        );
        const result = await client.query(query, updateValues);
        await client.query("COMMIT");
        client.release();
        client = null;

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = await fetchUserById(id);

        // The existing token-version update invalidates all JWTs for this account.
        // Revoke the matching DB sessions too so invalidated devices do not consume slots.
        await pool.query(
            `
                UPDATE user_sessions
                SET is_active = FALSE,
                    revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                    revoked_by = $1,
                    revocation_reason = COALESCE(revocation_reason, 'Account updated by administrator')
                WHERE user_id = $2
                  AND is_active = TRUE
            `,
            [req.user.id, id]
        );

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

        if (Number(existing.max_devices || 1) !== Number(user.max_devices || 1)) {
            await logAdminActivity(req, ACTIVITY_TYPES.DEVICE_LIMIT_CHANGED, {
                affectedUserId: user.id,
                affectedUserName: user.name,
                branchId: user.branch_id,
                branchName: user.branch,
                previousValue: existing.max_devices || 1,
                newValue: user.max_devices || 1,
                details: "Maximum active devices changed."
            });
        }

        return res.json({
            success: true,
            message: "User updated successfully.",
            user
        });
    } catch (error) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch (rollbackError) { console.error("UPDATE USER ROLLBACK ERROR:", rollbackError); }
            client.release();
        }
        if (error.code === "STAFF_QUOTA_EXCEEDED") {
            try { await recordQuotaRejection(req, error.officeId, error); } catch (activityError) { console.error("UPDATE USER QUOTA AUDIT ERROR:", activityError); }
            return res.status(409).json({ success: false, message: error.message });
        }
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

        const existing = await fetchUserById(id);
        if (existing && normalizeRole(existing.role) === "system_super_admin" && !isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only the System Super Admin can delete this account." });
        }

        const result = await pool.query(
            `
                DELETE FROM users
                WHERE id = $1
                  AND ($2::int IS NULL OR office_id = $2)
                RETURNING id
            `,
            [id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        await logAdminActivity(req, ACTIVITY_TYPES.USER_DELETED, {
            affectedUserId: existing?.id,
            affectedUserName: existing?.name,
            branchId: existing?.branch_id,
            branchName: existing?.branch,
            details: "User account permanently deleted; quota slot released."
        });

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
// OFFICES
// =========================================

async function listOffices(req, res) {
    try {
        if (!isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only the System Super Admin can manage offices." });
        }
        const result = await pool.query(`
            SELECT o.id, o.name, o.code, o.description, o.address, o.phone, o.email,
                   o.logo_url, o.primary_color, o.secondary_color, o.dashboard_title,
                   o.n8n_webhook_url, o.n8n_timeout_ms, COALESCE(sc.sender_id, o.sms_sender_id) AS sms_sender_id,
                   COALESCE(sc.status, 'NOT_CONFIGURED') AS sms_config_status,
                   sc.last_tested_at AS sms_last_tested_at,
                   sc.last_error_message AS sms_last_error_message,
                   o.staff_account_limit,
                   (o.n8n_webhook_url IS NOT NULL AND o.n8n_webhook_secret IS NOT NULL) AS n8n_configured,
                   o.status, o.created_at, o.updated_at,
                   (SELECT COUNT(*)::int FROM users u
                    WHERE u.office_id = o.id
                      AND LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '-', '_'), ' ', '_'))
                          NOT IN ('system_super_admin', 'super_admin')) AS staff_account_count,
                   (SELECT COUNT(*)::int FROM users u WHERE u.office_id = o.id) AS user_count,
                   (SELECT COUNT(*)::int FROM branches b WHERE b.office_id = o.id) AS branch_count,
                   (SELECT COUNT(*)::int FROM records r WHERE r.office_id = o.id) AS record_count
            FROM offices o
            LEFT JOIN office_sms_configurations sc ON sc.office_id = o.id
            ORDER BY o.name ASC
        `);
        return res.json({ success: true, offices: result.rows });
    } catch (error) {
        console.error("LIST OFFICES ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load offices." });
    }
}

async function createOffice(req, res) {
    try {
        if (!isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only the System Super Admin can create offices." });
        }
        const name = String(req.body?.name || "").trim();
        const code = String(req.body?.code || "").trim().toUpperCase();
        if (!name || !code || boundedText(name, 150) === null || boundedText(code, 50) === null) {
            return res.status(400).json({ success: false, message: "Office name and code are required." });
        }
        const webhookUrl = validateOfficeWebhookUrl(req.body?.n8n_webhook_url);
        const webhookSecret = encryptOfficeSecret(req.body?.n8n_webhook_secret);
        const timeoutMs = Number.parseInt(String(req.body?.n8n_timeout_ms || "10000"), 10);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
            return res.status(400).json({ success: false, message: "SMS timeout must be between 1000 and 30000 milliseconds." });
        }
        const staffAccountLimit = Number.parseInt(String(req.body?.staff_account_limit || DEFAULT_STAFF_ACCOUNT_LIMIT), 10);
        if (!Number.isInteger(staffAccountLimit) || staffAccountLimit < 1 || staffAccountLimit > 100000) {
            return res.status(400).json({ success: false, message: "Staff account limit must be a positive whole number." });
        }
        const result = await pool.query(
            `INSERT INTO offices (name, code, description, address, phone, email, logo_url, primary_color, secondary_color, dashboard_title, n8n_webhook_url, n8n_webhook_secret, n8n_timeout_ms, sms_sender_id, staff_account_limit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             RETURNING id, name, code, description, address, phone, email, logo_url,
                       primary_color, secondary_color, dashboard_title, n8n_webhook_url,
                       n8n_timeout_ms, sms_sender_id, staff_account_limit, status,
                       created_at, updated_at`,
            [name, code, req.body.description || null, req.body.address || null, req.body.phone || null,
                req.body.email || null, req.body.logo_url || null, req.body.primary_color || null,
                req.body.secondary_color || null, req.body.dashboard_title || name, webhookUrl,
                webhookSecret, timeoutMs, String(req.body?.sms_sender_id || "").trim() || null, staffAccountLimit]
        );
        await logAdminActivity(req, ACTIVITY_TYPES.STAFF_QUOTA_CHANGED, {
            details: `Staff account limit configured for office ${result.rows[0].name}.`,
            newValue: String(staffAccountLimit),
            officeId: result.rows[0].id
        });
        return res.status(201).json({ success: true, office: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ success: false, message: "An office with that name or code already exists." });
        console.error("CREATE OFFICE ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to create office." });
    }
}

async function updateOffice(req, res) {
    try {
        if (!isOfficeSystemSuperAdmin(req.user)) {
            return res.status(403).json({ success: false, message: "Only the System Super Admin can update offices." });
        }
        const id = Number.parseInt(req.params.id, 10);
        const existingOfficeResult = await pool.query(
            "SELECT name, staff_account_limit FROM offices WHERE id = $1 LIMIT 1",
            [id]
        );
        const existingOffice = existingOfficeResult.rows[0];
        const fields = ["name", "description", "address", "phone", "email", "logo_url", "primary_color", "secondary_color", "dashboard_title", "status"];
        const updates = [];
        const values = [];
        for (const field of fields) {
            if (req.body?.[field] !== undefined) {
                values.push(field === "name" ? String(req.body[field]).trim() : req.body[field]);
                updates.push(`${field} = $${values.length}`);
            }
        }
        if (req.body?.n8n_webhook_url !== undefined) {
            values.push(validateOfficeWebhookUrl(req.body.n8n_webhook_url));
            updates.push(`n8n_webhook_url = $${values.length}`);
        }
        if (req.body?.n8n_webhook_secret) {
            values.push(encryptOfficeSecret(req.body.n8n_webhook_secret));
            updates.push(`n8n_webhook_secret = $${values.length}`);
        }
        if (req.body?.n8n_timeout_ms !== undefined) {
            const timeoutMs = Number.parseInt(String(req.body.n8n_timeout_ms), 10);
            if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
                return res.status(400).json({ success: false, message: "SMS timeout must be between 1000 and 30000 milliseconds." });
            }
            values.push(timeoutMs);
            updates.push(`n8n_timeout_ms = $${values.length}`);
        }
        if (req.body?.sms_sender_id !== undefined) {
            values.push(String(req.body.sms_sender_id || "").trim() || null);
            updates.push(`sms_sender_id = $${values.length}`);
        }
        if (req.body?.staff_account_limit !== undefined) {
            const staffAccountLimit = Number.parseInt(String(req.body.staff_account_limit), 10);
            if (!Number.isInteger(staffAccountLimit) || staffAccountLimit < 1 || staffAccountLimit > 100000) {
                return res.status(400).json({ success: false, message: "Staff account limit must be a positive whole number." });
            }
            values.push(staffAccountLimit);
            updates.push(`staff_account_limit = $${values.length}`);
        }
        if (!updates.length) return res.status(400).json({ success: false, message: "No office changes were provided." });
        values.push(id);
        const result = await pool.query(
            `UPDATE offices
             SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
             WHERE id = $${values.length}
             RETURNING id, name, code, description, address, phone, email, logo_url,
                       primary_color, secondary_color, dashboard_title, n8n_webhook_url,
                       n8n_timeout_ms, sms_sender_id, staff_account_limit, status,
                       created_at, updated_at`,
            values
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Office not found." });
        if (
            req.body?.staff_account_limit !== undefined &&
            Number(existingOffice?.staff_account_limit) !== Number(result.rows[0].staff_account_limit)
        ) {
            await logAdminActivity(req, ACTIVITY_TYPES.STAFF_QUOTA_CHANGED, {
                details: `Staff account limit changed for office ${result.rows[0].name}.`,
                previousValue: String(existingOffice?.staff_account_limit || ""),
                newValue: String(result.rows[0].staff_account_limit),
                officeId: result.rows[0].id
            });
        }
        return res.json({ success: true, office: result.rows[0] });
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ success: false, message: "An office with that name or code already exists." });
        console.error("UPDATE OFFICE ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to update office." });
    }
}

async function getOfficeOperationPreview(req, res) {
    if (!isOfficeSystemSuperAdmin(req.user)) {
        return res.status(403).json({ success: false, message: "Only the System Super Admin can manage office data." });
    }

    const officeId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(officeId)) {
        return res.status(400).json({ success: false, message: "Invalid office." });
    }

    try {
        const result = await pool.query(
            `
                SELECT o.id, o.name, o.code, o.status, o.staff_account_limit,
                       (SELECT COUNT(*)::int FROM users u WHERE u.office_id = o.id) AS users,
                       (SELECT COUNT(*)::int FROM branches b WHERE b.office_id = o.id) AS branches,
                       (SELECT COUNT(*)::int FROM records r WHERE r.office_id = o.id) AS records,
                       (SELECT COUNT(*)::int FROM notifications n WHERE n.office_id = o.id) AS notifications,
                       (SELECT COUNT(*)::int FROM auth_activity_logs l WHERE l.office_id = o.id) AS activity_logs,
                       (SELECT COUNT(*)::int FROM security_audit_logs s
                        JOIN users su ON su.id = s.user_id
                        WHERE su.office_id = o.id) AS security_audit_logs
                FROM offices o
                WHERE o.id = $1
                LIMIT 1
            `,
            [officeId]
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Office not found." });
        const office = result.rows[0];
        return res.json({
            success: true,
            backupVerified: process.env.OFFICE_DESTRUCTIVE_BACKUP_VERIFIED === "true",
            office,
            clearData: {
                removes: { records: office.records, notifications: office.notifications },
                retains: { office: 1, users: office.users, branches: office.branches, settings: 1, quota: office.staff_account_limit, audit_logs: office.activity_logs }
            },
            deleteOffice: {
                blockedBy: {
                    users: office.users,
                    branches: office.branches,
                    records: office.records,
                    notifications: office.notifications,
                    activity_logs: office.activity_logs
                },
                securityAuditLogsRetained: office.security_audit_logs
            }
        });
    } catch (error) {
        console.error("OFFICE OPERATION PREVIEW ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to preview office data." });
    }
}

function requireDestructiveOfficeConfirmation(req, office) {
    if (process.env.OFFICE_DESTRUCTIVE_BACKUP_VERIFIED !== "true") {
        return "A verified restorable backup is required before this operation. Set OFFICE_DESTRUCTIVE_BACKUP_VERIFIED=true after verification.";
    }
    if (req.body?.backup_verified !== true) {
        return "Backup verification is required before this operation.";
    }
    if (req.body?.final_confirm !== true) {
        return "Final confirmation is required before this operation.";
    }
    if (String(req.body?.office_name_confirmation || "").trim() !== String(office.name || "").trim()) {
        return "The office name confirmation does not match.";
    }
    return null;
}

async function clearOfficeData(req, res) {
    if (!isOfficeSystemSuperAdmin(req.user)) {
        return res.status(403).json({ success: false, message: "Only the System Super Admin can clear office data." });
    }

    const officeId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(officeId)) return res.status(400).json({ success: false, message: "Invalid office." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const officeResult = await client.query("SELECT id, name FROM offices WHERE id = $1 FOR UPDATE", [officeId]);
        if (!officeResult.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Office not found." });
        }
        const office = officeResult.rows[0];
        const confirmationError = requireDestructiveOfficeConfirmation(req, office);
        if (confirmationError) {
            await client.query("ROLLBACK");
            return res.status(428).json({ success: false, message: confirmationError });
        }

        const counts = await client.query(
            `SELECT
                (SELECT COUNT(*)::int FROM records WHERE office_id = $1) AS records,
                (SELECT COUNT(*)::int FROM notifications WHERE office_id = $1) AS notifications`,
            [officeId]
        );
        await client.query("DELETE FROM notifications WHERE office_id = $1", [officeId]);
        await client.query("DELETE FROM records WHERE office_id = $1", [officeId]);
        await client.query("COMMIT");

        try {
            await recordActivity({
                request: req,
                userId: req.user?.id,
                name: req.user?.name,
                email: req.user?.email,
                role: req.user?.role,
                activityType: ACTIVITY_TYPES.SETTINGS_CHANGED,
                officeId,
                details: `Operational data cleared for office ${office.name}.`,
                newValue: JSON.stringify({ records: counts.rows[0].records, notifications: counts.rows[0].notifications })
            });
        } catch (activityError) {
            console.error("CLEAR OFFICE DATA AUDIT ERROR:", activityError.message);
        }
        return res.json({ success: true, message: `Operational data cleared for ${office.name}.`, removed: counts.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("CLEAR OFFICE DATA ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to clear office data. No changes were committed." });
    } finally {
        client.release();
    }
}

async function deleteOffice(req, res) {
    if (!isOfficeSystemSuperAdmin(req.user)) {
        return res.status(403).json({ success: false, message: "Only the System Super Admin can delete offices." });
    }

    const officeId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(officeId)) {
        return res.status(400).json({ success: false, message: "Invalid office." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const office = await client.query("SELECT id, name FROM offices WHERE id = $1 FOR UPDATE", [officeId]);
        if (!office.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Office not found." });
        }

        const confirmationError = requireDestructiveOfficeConfirmation(req, office.rows[0]);
        if (confirmationError) {
            await client.query("ROLLBACK");
            return res.status(428).json({ success: false, message: confirmationError });
        }

        const dependencies = await client.query(
            `SELECT
                (SELECT COUNT(*)::int FROM users WHERE office_id = $1) AS users,
                (SELECT COUNT(*)::int FROM branches WHERE office_id = $1) AS branches,
                (SELECT COUNT(*)::int FROM records WHERE office_id = $1) AS records,
                (SELECT COUNT(*)::int FROM auth_activity_logs WHERE office_id = $1) AS activity_logs,
                (SELECT COUNT(*)::int FROM notifications WHERE office_id = $1) AS notifications`,
            [officeId]
        );
        const counts = dependencies.rows[0];
        // Keep the audit trail, but remove its live office foreign-key reference.
        // The snapshot lets System Super Admins identify the deleted office later.
        await client.query(
            `UPDATE auth_activity_logs
             SET office_name_snapshot = COALESCE(office_name_snapshot, $2), office_id = NULL
             WHERE office_id = $1`,
            [officeId, office.rows[0].name]
        );
        await client.query("DELETE FROM notifications WHERE office_id = $1", [officeId]);
        await client.query("DELETE FROM records WHERE office_id = $1", [officeId]);
        await client.query("DELETE FROM branches WHERE office_id = $1", [officeId]);
        await client.query("DELETE FROM users WHERE office_id = $1", [officeId]);
        await client.query("DELETE FROM offices WHERE id = $1", [officeId]);
        await client.query("COMMIT");
        return res.json({
            success: true,
            message: `${office.rows[0].name} and its office-owned dependencies were deleted successfully.`,
            deleted: counts
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (error.code === "23503") {
            return res.status(409).json({ success: false, message: "This office still has assigned data and cannot be deleted." });
        }
        console.error("DELETE OFFICE ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to delete office." });
    } finally {
        client.release();
    }
}

// =========================================
// BRANCHES
// =========================================

async function listBranches(req, res) {
    try {
        const requestedOfficeId = Number.parseInt(String(req.query?.office_id || ""), 10);
        const canViewAllOffices = isOfficeSystemSuperAdmin(req.user);
        const officeId = canViewAllOffices && Number.isInteger(requestedOfficeId)
            ? requestedOfficeId
            : (canViewAllOffices ? null : req.user.office_id);
        const result = await pool.query(
            `
                SELECT
                    b.id,
                    b.name,
                    b.office_id,
                    o.name AS office_name,
                    o.code AS office_code,
                    b.created_at,
                    COUNT(u.id)::int AS staff_count,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id', u.id,
                                'name', u.name,
                                'email', u.email,
                                'role', u.role,
                                'account_status', u.account_status,
                                'is_active', u.is_active,
                                'office_id', u.office_id,
                                'branch_id', u.branch_id
                            ) ORDER BY u.name ASC
                        ) FILTER (WHERE u.id IS NOT NULL),
                        '[]'::json
                    ) AS staff
                FROM branches b
                JOIN offices o ON o.id = b.office_id
                LEFT JOIN users u ON u.branch_id = b.id AND u.office_id = b.office_id
                WHERE ($1::int IS NULL OR b.office_id = $1)
                GROUP BY b.id, o.id
                ORDER BY o.name ASC, b.name ASC
            `,
            [officeId]
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
    const client = await pool.connect();
    try {
        const { name, create_staff: createStaff } = req.body;
        const requestedOfficeId = Number.parseInt(String(req.body?.office_id || ""), 10);
        const officeId = isOfficeSystemSuperAdmin(req.user) && Number.isInteger(requestedOfficeId)
            ? requestedOfficeId
            : req.user.office_id;

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

        const shouldCreateStaff = createStaff === true || String(createStaff).toLowerCase() === "true";
        const staffName = String(req.body?.staff_name || "").trim();
        const staffEmail = String(req.body?.staff_email || "").trim().toLowerCase();
        const staffPassword = String(req.body?.staff_password || "");

        if (shouldCreateStaff && (!staffName || !staffEmail || !staffPassword)) {
            return res.status(400).json({ success: false, message: "Staff name, email, and password are required when staff creation is enabled." });
        }
        if (shouldCreateStaff) {
            const passwordError = validatePassword(staffPassword);
            if (passwordError) return res.status(400).json({ success: false, message: passwordError });
            if (boundedText(staffName, 100) === null || boundedText(staffEmail, 150) === null) {
                return res.status(400).json({ success: false, message: "Staff name or email is too long." });
            }
        }

        await client.query("BEGIN");

        const office = await client.query(
            "SELECT id FROM offices WHERE id = $1 AND status = 'ACTIVE' LIMIT 1",
            [officeId]
        );
        if (!office.rowCount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "A valid active office is required." });
        }

        const duplicate = await client.query(
            "SELECT id FROM branches WHERE office_id = $2 AND LOWER(name) = LOWER($1) LIMIT 1",
            [cleanName, officeId]
        );

        if (duplicate.rowCount) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                success: false,
                message: "A branch with this name already exists."
            });
        }

        const result = await client.query(
            `
                INSERT INTO branches (name, office_id)
                VALUES ($1, $2)
                RETURNING id, name, office_id, created_at
            `,
            [cleanName, officeId]
        );

        let createdStaff = null;
        if (shouldCreateStaff) {
            const emailDuplicate = await client.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [staffEmail]);
            if (emailDuplicate.rowCount) {
                await client.query("ROLLBACK");
                return res.status(409).json({ success: false, message: "An account with this email already exists." });
            }

            const hashedPassword = await hashPassword(staffPassword);
            const staffResult = await client.query(
                `INSERT INTO users
                    (name, email, password, role, office_id, branch_id, account_status, is_active)
                 VALUES ($1, $2, $3, 'branch_staff', $4, $5, 'APPROVED', TRUE)
                 RETURNING id, name, email, role, office_id, branch_id, account_status, is_active`,
                [staffName, staffEmail, hashedPassword, officeId, result.rows[0].id]
            );
            createdStaff = staffResult.rows[0];
        }

        await client.query("COMMIT");

        try {
            await logAdminActivity(req, ACTIVITY_TYPES.BRANCH_CREATED, {
                branchId: result.rows[0].id,
                branchName: result.rows[0].name,
                officeId,
                details: shouldCreateStaff
                    ? `Branch created with branch staff account ${createdStaff.email}.`
                    : "Branch created."
            });
        } catch (activityError) {
            console.error("BRANCH ACTIVITY LOG ERROR:", activityError.message);
        }

        return res.status(201).json({
            success: true,
            message: shouldCreateStaff
                ? "Branch and branch staff account created successfully."
                : "Branch created successfully.",
            branch: result.rows[0],
            staff: createdStaff
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (error.code === "23505") {
            return res.status(409).json({ success: false, message: "The branch or staff email already exists." });
        }
        console.error("CREATE BRANCH ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create branch."
        });
    } finally {
        client.release();
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

        const existingBranch = await pool.query(
            "SELECT id, office_id FROM branches WHERE id = $1 LIMIT 1",
            [id]
        );
        if (!existingBranch.rowCount) {
            return res.status(404).json({ success: false, message: "Branch not found." });
        }
        const branchOfficeId = existingBranch.rows[0].office_id;
        if (!isSystemSuperAdmin(req.user) && String(branchOfficeId) !== String(req.user.office_id)) {
            return res.status(403).json({ success: false, message: "You can only edit branches in your office." });
        }

        const duplicate = await pool.query(
            `
                SELECT id
                FROM branches
                WHERE office_id = $3
                  AND LOWER(name) = LOWER($1)
                  AND id <> $2
                LIMIT 1
            `,
            [cleanName, id, branchOfficeId]
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
                  AND ($3::int IS NULL OR office_id = $3)
                RETURNING id, name, office_id, created_at
            `,
            [cleanName, id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
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
            "SELECT COUNT(*)::int AS count FROM users WHERE branch_id = $1 AND ($2::int IS NULL OR office_id = $2)",
            [id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
        );

        const recordCount = await pool.query(
            "SELECT COUNT(*)::int AS count FROM records WHERE branch_id = $1 AND ($2::int IS NULL OR office_id = $2)",
            [id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
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
                  AND ($2::int IS NULL OR office_id = $2)
                RETURNING id
            `,
            [id, isSystemSuperAdmin(req.user) ? null : req.user.office_id]
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
    getAuthActivityDetails,
    restoreDeletedCase,
    clearAuthActivity,
    listUsers,
    getStaffQuota,
    listPendingUsers,
    approveUser,
    declineUser,
    createUser,
    updateUser,
    deleteUser,
    canAssignRole,
    listBranches,
    createBranch,
    updateBranch,
    deleteBranch,
    listOffices,
    createOffice,
    updateOffice,
    deleteOffice
    ,getOfficeOperationPreview
    ,clearOfficeData
};
