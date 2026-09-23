const pool = require("../config/database");

const NOTIFICATION_TYPES = Object.freeze({
    RECORD_CREATED: "RECORD_CREATED",
    RECORD_UPDATED: "RECORD_UPDATED",
    RECORD_DELETED: "RECORD_DELETED",
    RECORD_RESTORED: "RECORD_RESTORED",
    PENDING_APPROVAL: "PENDING_APPROVAL",
    SMS_FAILED: "SMS_FAILED",
    SMS_SERVICE_UNAVAILABLE: "SMS_SERVICE_UNAVAILABLE",
    SYNC_FAILED: "SYNC_FAILED",
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

module.exports = {
    NOTIFICATION_TYPES,
    NOTIFICATION_PRIORITIES,
    createNotification,
    notificationTypeSet,
    notificationPrioritySet
};
