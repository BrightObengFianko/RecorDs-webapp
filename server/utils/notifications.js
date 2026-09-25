const pool = require("../config/database");

const NOTIFICATION_TYPES = Object.freeze({
    RECORD_CREATED: "RECORD_CREATED",
    RECORD_UPDATED: "RECORD_UPDATED",
    RECORD_DELETED: "RECORD_DELETED",
    RECORD_RESTORED: "RECORD_RESTORED",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    SMS_ACTIVITY: "SMS_ACTIVITY",
    SMS_FAILED: "SMS_FAILED",
    SMS_SERVICE_UNAVAILABLE: "SMS_SERVICE_UNAVAILABLE",
    SYNC_FAILED: "SYNC_FAILED",
    SYNC_SUCCEEDED: "SYNC_SUCCEEDED",
    OFFLINE_RECORDS_PENDING: "OFFLINE_RECORDS_PENDING",
    DUPLICATE_DETECTED: "DUPLICATE_DETECTED",
    USER_CREATED: "USER_CREATED",
    USER_DISABLED: "USER_DISABLED",
    USER_ENABLED: "USER_ENABLED",
    BRANCH_ASSIGNMENT_CHANGED: "BRANCH_ASSIGNMENT_CHANGED",
    FAILED_LOGIN_ALERT: "FAILED_LOGIN_ALERT",
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
    SYSTEM_ALERT: "SYSTEM_ALERT"
});

const NOTIFICATION_PRIORITIES = Object.freeze({
    CRITICAL: "CRITICAL",
    IMPORTANT: "IMPORTANT",
    INFO: "INFO"
});

const notificationTypeSet = new Set(Object.values(NOTIFICATION_TYPES));
const notificationPrioritySet = new Set(Object.values(NOTIFICATION_PRIORITIES));
function isNotificationEnabled(user, type) {
    const normalizedType = String(type || "").trim().toUpperCase();
    const preferenceKey = normalizedType === NOTIFICATION_TYPES.SMS_SERVICE_UNAVAILABLE
        ? NOTIFICATION_TYPES.SMS_FAILED
        : normalizedType;
    const preferences = user?.account_settings;
    return !preferences || preferences.notificationPreferences?.[preferenceKey] !== false;
}

function validateNotificationText(value, field, maxLength, required = true) {
    const text = String(value ?? "").trim();

    if (required && !text) {
        throw new Error(`${field} is required.`);
    }

    if (text.length > maxLength) {
        throw new Error(`${field} is too long.`);
    }

    return text;
}

function normalizeId(value, field, nullable = true) {
    if (value === undefined || value === null || value === "") {
        if (nullable) return null;
        throw new Error(`${field} is required.`);
    }

    const id = Number.parseInt(String(value), 10);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`${field} is invalid.`);
    }

    return id;
}

function normalizeMetadata(metadata) {
    if (metadata === undefined || metadata === null) {
        return {};
    }

    if (typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new Error("Notification metadata must be an object.");
    }

    const serialized = JSON.stringify(metadata);
    if (serialized.length > 10000) {
        throw new Error("Notification metadata is too large.");
    }

    return metadata;
}

async function createNotification({
    type,
    title,
    message,
    priority = NOTIFICATION_PRIORITIES.INFO,
    userId,
    recordId = null,
    branchId = null,
    metadata = {}
}) {
    const normalizedType = String(type || "").trim().toUpperCase();
    const normalizedPriority = String(priority || "").trim().toUpperCase();

    if (!notificationTypeSet.has(normalizedType)) {
        throw new Error("Invalid notification type.");
    }

    if (!notificationPrioritySet.has(normalizedPriority)) {
        throw new Error("Invalid notification priority.");
    }

    const normalizedUserId = normalizeId(userId, "User ID", false);
    const normalizedRecordId = normalizeId(recordId, "Record ID");
    const normalizedBranchId = normalizeId(branchId, "Branch ID");
    const normalizedMetadata = normalizeMetadata(metadata);
    const cleanTitle = validateNotificationText(title, "Notification title", 200);
    const cleanMessage = validateNotificationText(message, "Notification message", 2000);

    const userResult = await pool.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [normalizedUserId]);
    if (!userResult.rowCount) throw new Error("User not found.");

    if (normalizedRecordId !== null) {
        const result = await pool.query("SELECT id FROM records WHERE id = $1 LIMIT 1", [normalizedRecordId]);
        if (!result.rowCount) throw new Error("Record not found.");
    }

    if (normalizedBranchId !== null) {
        const result = await pool.query("SELECT id FROM branches WHERE id = $1 LIMIT 1", [normalizedBranchId]);
        if (!result.rowCount) throw new Error("Branch not found.");
    }

    const result = await pool.query(
        `
            INSERT INTO notifications (
                type, title, message, priority, user_id, record_id, branch_id, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            ON CONFLICT DO NOTHING
            RETURNING *
        `,
        [
            normalizedType,
            cleanTitle,
            cleanMessage,
            normalizedPriority,
            normalizedUserId,
            normalizedRecordId,
            normalizedBranchId,
            JSON.stringify(normalizedMetadata)
        ]
    );

    if (result.rows[0]) return result.rows[0];

    const eventId = normalizedMetadata.event_id;
    if (eventId) {
        const existing = await pool.query(
            `
                SELECT *
                FROM notifications
                WHERE user_id = $1
                  AND type = $2
                  AND metadata->>'event_id' = $3
                ORDER BY id DESC
                LIMIT 1
            `,
            [normalizedUserId, normalizedType, String(eventId)]
        );
        if (existing.rows[0]) return existing.rows[0];
    }

    throw new Error("Unable to create notification.");
}

async function notifyAdmins({
    type,
    title,
    message,
    priority = NOTIFICATION_PRIORITIES.INFO,
    recordId = null,
    branchId = null,
    metadata = {}
}) {
    const adminResult = await pool.query(
        `
            SELECT id, account_settings
            FROM users
            WHERE LOWER(REPLACE(REPLACE(TRIM(COALESCE(role, '')), '_', ' '), '-', ' ')) = 'admin'
              AND COALESCE(is_active, TRUE) = TRUE
              AND UPPER(COALESCE(account_status, 'APPROVED')) = 'APPROVED'
        `
    );

    const notifications = [];
    for (const admin of adminResult.rows) {
        if (!isNotificationEnabled(admin, type)) continue;
        try {
            notifications.push(await createNotification({
                type,
                title,
                message,
                priority,
                userId: admin.id,
                recordId,
                branchId,
                metadata
            }));
        } catch (error) {
            console.error("CREATE ADMIN NOTIFICATION ERROR:", error.message);
        }
    }

    return notifications;
}

function mergeGroupedMetadata(existingMetadata, incomingMetadata, eventId) {
    const existing = existingMetadata && typeof existingMetadata === "object"
        ? existingMetadata
        : {};
    const incoming = incomingMetadata && typeof incomingMetadata === "object"
        ? incomingMetadata
        : {};
    const merged = { ...existing, ...incoming };

    const eventIds = Array.from(new Set([
        ...(Array.isArray(existing.event_ids) ? existing.event_ids : []),
        ...(Array.isArray(incoming.event_ids) ? incoming.event_ids : []),
        ...(eventId ? [String(eventId)] : [])
    ])).slice(-50);

    if (eventIds.length) {
        merged.event_ids = eventIds;
    }

    for (const field of ["record_ids", "branch_ids", "branch_names"]) {
        const values = Array.from(new Set([
            ...(Array.isArray(existing[field]) ? existing[field] : []),
            ...(Array.isArray(incoming[field]) ? incoming[field] : [])
        ])).slice(-50);
        if (values.length) merged[field] = values;
    }

    return merged;
}

async function notifyAdminsGrouped({
    type,
    title,
    message,
    priority = NOTIFICATION_PRIORITIES.INFO,
    groupingKey,
    eventId,
    recordId = null,
    branchId = null,
    metadata = {},
    render,
    groupingWindowMinutes = 15
}) {
    if (!groupingKey || typeof render !== "function") {
        throw new Error("Grouped notification requires a grouping key and renderer.");
    }

    const adminResult = await pool.query(
        `
            SELECT id, account_settings
            FROM users
            WHERE LOWER(REPLACE(REPLACE(TRIM(COALESCE(role, '')), '_', ' '), '-', ' ')) = 'admin'
              AND COALESCE(is_active, TRUE) = TRUE
              AND UPPER(COALESCE(account_status, 'APPROVED')) = 'APPROVED'
        `
    );
    const results = [];

    for (const admin of adminResult.rows) {
        if (!isNotificationEnabled(admin, type)) continue;
        const client = await pool.connect();
        const lockKey = `${admin.id}:${type}:${priority}:${groupingKey}`;

        try {
            await client.query("BEGIN");
            await client.query(
                "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
                [lockKey]
            );

            const currentResult = await client.query(
            `
                SELECT *
                FROM notifications
                WHERE user_id = $1
                  AND type = $2
                  AND priority = $3
                  AND grouping_key = $4
                LIMIT 1
            `,
            [admin.id, type, priority, groupingKey]
            );
            const current = currentResult.rows[0];
            const currentMetadata = current?.metadata || {};
            const existingEventIds = Array.isArray(currentMetadata.event_ids)
                ? currentMetadata.event_ids.map(String)
                : [];

            if (current && eventId && existingEventIds.includes(String(eventId))) {
                await client.query("COMMIT");
                results.push(current);
                continue;
            }

            const nextMetadata = mergeGroupedMetadata(currentMetadata, metadata, eventId);
            const nextCount = Number(current?.group_count || 0) + 1;
            const content = render({
                count: nextCount,
                metadata: nextMetadata,
                current
            });

            if (current) {
                const updated = await client.query(
                `
                    UPDATE notifications
                    SET title = $1,
                        message = $2,
                        record_id = $3,
                        branch_id = $4,
                        is_read = FALSE,
                        read_at = NULL,
                        group_count = $5,
                        last_event_at = CURRENT_TIMESTAMP,
                        is_active = TRUE,
                        resolved_at = NULL,
                        group_window_minutes = $8,
                        metadata = $6::jsonb
                    WHERE id = $7
                    RETURNING *
                `,
                [
                    content.title,
                    content.message,
                    recordId,
                    branchId,
                    nextCount,
                    JSON.stringify(nextMetadata),
                    current.id,
                    Number(groupingWindowMinutes) || 15
                ]
                );
                await client.query("COMMIT");
                results.push(updated.rows[0]);
                continue;
            }

            const inserted = await client.query(
            `
                INSERT INTO notifications (
                    type, title, message, priority, user_id, record_id,
                    branch_id, grouping_key, group_count, last_event_at,
                    is_active, group_window_minutes, metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, TRUE, $11, $10::jsonb)
                ON CONFLICT (user_id, type, priority, grouping_key)
                WHERE grouping_key IS NOT NULL
                DO NOTHING
                RETURNING *
            `,
            [
                type,
                content.title,
                content.message,
                priority,
                admin.id,
                recordId,
                branchId,
                groupingKey,
                nextCount,
                JSON.stringify(nextMetadata),
                Number(groupingWindowMinutes) || 15
            ]
            );
            await client.query("COMMIT");
            if (inserted.rows[0]) results.push(inserted.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("GROUPED NOTIFICATION ERROR:", error.message);
        } finally {
            client.release();
        }
    }

    return results;
}

async function refreshPendingApprovalNotifications({ markNewAsUnread = false } = {}) {
    const countResult = await pool.query(
        `
            SELECT COUNT(*)::int AS count,
                   ARRAY_AGG(id ORDER BY registration_date DESC, id DESC) FILTER (WHERE id IS NOT NULL) AS record_ids
            FROM records
            WHERE LOWER(REPLACE(REPLACE(COALESCE(status, ''), '_', ' '), '-', ' ')) = 'processing'
        `
    );
    const count = Number(countResult.rows[0]?.count || 0);
    const recordIds = (countResult.rows[0]?.record_ids || []).slice(0, 50);
    const adminResult = await pool.query(
        `
            SELECT id, account_settings
            FROM users
            WHERE LOWER(REPLACE(REPLACE(TRIM(COALESCE(role, '')), '_', ' '), '-', ' ')) = 'admin'
              AND COALESCE(is_active, TRUE) = TRUE
              AND UPPER(COALESCE(account_status, 'APPROVED')) = 'APPROVED'
        `
    );

    for (const admin of adminResult.rows) {
        if (!isNotificationEnabled(admin, NOTIFICATION_TYPES.PENDING_APPROVAL)) continue;
        const currentResult = await pool.query(
            `
                SELECT * FROM notifications
                WHERE user_id = $1
                  AND type = $2
                  AND priority = $3
                  AND grouping_key = $4
                LIMIT 1
            `,
            [admin.id, NOTIFICATION_TYPES.PENDING_APPROVAL, NOTIFICATION_PRIORITIES.IMPORTANT, "ALL_BRANCHES"]
        );
        const current = currentResult.rows[0];
        if (!current && count === 0) continue;

        const metadata = {
            ...(current?.metadata || {}),
            record_ids: recordIds,
            current_state: true
        };

        if (!current) {
            await pool.query(
                `
                    INSERT INTO notifications (
                        type, title, message, priority, user_id, grouping_key,
                        group_count, last_event_at, is_active, group_window_minutes, metadata
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, TRUE, 15, $8::jsonb)
                    ON CONFLICT (user_id, type, priority, grouping_key) DO NOTHING
                `,
                [
                    NOTIFICATION_TYPES.PENDING_APPROVAL,
                    `${count} Records Awaiting Approval`,
                    `${count} records are waiting for approval.`,
                    NOTIFICATION_PRIORITIES.IMPORTANT,
                    admin.id,
                    "ALL_BRANCHES",
                    count,
                    JSON.stringify(metadata)
                ]
            );
            continue;
        }

        const becameUnread = markNewAsUnread && count > Number(current.group_count || 0);
        await pool.query(
            `
                UPDATE notifications
                SET title = $1,
                    message = $2,
                    group_count = $3,
                    metadata = $4::jsonb,
                    last_event_at = CURRENT_TIMESTAMP,
                    is_active = $8,
                    resolved_at = CASE WHEN $8 THEN NULL ELSE CURRENT_TIMESTAMP END,
                    group_window_minutes = 15,
                    is_read = CASE WHEN $5 THEN TRUE WHEN $6 THEN FALSE ELSE is_read END,
                    read_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP WHEN $6 THEN NULL ELSE read_at END
                WHERE id = $7
            `,
            [
                count ? `${count} Records Awaiting Approval` : "Approval Queue Clear",
                count ? `${count} records are waiting for approval.` : "No records are currently waiting for approval.",
                count,
                JSON.stringify(metadata),
                count === 0,
                becameUnread,
                current.id,
                count > 0
            ]
        );
    }
}

module.exports = {
    NOTIFICATION_TYPES,
    NOTIFICATION_PRIORITIES,
    createNotification,
    notifyAdmins,
    notifyAdminsGrouped,
    refreshPendingApprovalNotifications,
    notificationTypeSet,
    notificationPrioritySet
};
