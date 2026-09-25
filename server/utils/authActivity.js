const pool = require("../config/database");

const ACTIVITY_TYPES = Object.freeze({
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILURE: "LOGIN_FAILURE",
    LOGOUT_SUCCESS: "LOGOUT_SUCCESS",
    RECORD_CREATED: "RECORD_CREATED",
    RECORD_EDITED: "RECORD_EDITED",
    RECORD_APPROVED: "RECORD_APPROVED",
    RECORD_DELETED: "RECORD_DELETED",
    RECORD_RESTORED: "RECORD_RESTORED",
    SMS_ACTIVITY: "SMS_ACTIVITY",
    USER_CREATED: "USER_CREATED",
    USER_DISABLED: "USER_DISABLED",
    USER_ENABLED: "USER_ENABLED",
    SETTINGS_CHANGED: "SETTINGS_CHANGED",
    BRANCH_ASSIGNMENT_CHANGED: "BRANCH_ASSIGNMENT_CHANGED",
    DATA_EXPORT: "DATA_EXPORT",
    UNAUTHORIZED_EXPORT_ATTEMPT: "UNAUTHORIZED_EXPORT_ATTEMPT",
    PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
    PASSWORD_RESET_VERIFIED: "PASSWORD_RESET_VERIFIED",
    PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",
    PASSWORD_RESET_FAILED: "PASSWORD_RESET_FAILED",
    PASSWORD_RESET_EMAIL_SENT: "PASSWORD_RESET_EMAIL_SENT",
    PASSWORD_RESET_EMAIL_FAILED: "PASSWORD_RESET_EMAIL_FAILED"
});

async function recordActivity({
    userId = null,
    name = null,
    email = null,
    role = null,
    activityType,
    request = null,
    recordId = null,
    affectedUserId = null,
    affectedUserName = null,
    branchId = null,
    branchName = null,
    details = null,
    previousValue = null,
    newValue = null,
    recordSnapshot = null,
    changeSet = null,
    success = true
}) {
    if (!activityType) {
        return;
    }

    try {
        await pool.query(
            `
                INSERT INTO auth_activity_logs (
                    user_id,
                    user_name,
                    user_email,
                    user_role,
                    activity_type,
                    record_id,
                    affected_user_id,
                    affected_user_name,
                    branch_id,
                    branch_name,
                    details,
                    previous_value,
                    new_value,
                    record_snapshot,
                    change_set,
                    success,
                    ip_address,
                    user_agent
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            `,
            [
                userId || null,
                name ? String(name).trim() : null,
                email ? String(email).trim().toLowerCase() : null,
                role ? String(role).trim().toLowerCase() : null,
                activityType,
                recordId || null,
                affectedUserId || null,
                affectedUserName ? String(affectedUserName).trim().slice(0, 100) : null,
                branchId || null,
                branchName ? String(branchName).trim().slice(0, 100) : null,
                details ? String(details).slice(0, 5000) : null,
                previousValue == null ? null : String(previousValue).slice(0, 2000),
                newValue == null ? null : String(newValue).slice(0, 2000),
                recordSnapshot || null,
                changeSet || null,
                success !== false,
                request ? (String(request.ip || "").slice(0, 64) || null) : null,
                request ? (String(request.get("user-agent") || "").slice(0, 500) || null) : null
            ]
        );
    } catch (error) {
        // Activity logging must not prevent authentication from completing.
        console.error("AUTH ACTIVITY LOG ERROR:", error.message);
    }
}

function makeRecordSnapshot(record) {
    if (!record) return null;

    const fields = [
        "id", "name", "phone_number", "category", "date_of_birth",
        "date_of_death", "registration_date", "registrar", "branch_id",
        "status", "sms_sent", "sms_status", "sms_date", "sms_error", "notes",
        "created_by", "client_uuid"
    ];

    return fields.reduce((snapshot, field) => {
        if (Object.prototype.hasOwnProperty.call(record, field)) {
            snapshot[field] = record[field];
        }
        return snapshot;
    }, {});
}

const recordAuthActivity = recordActivity;

module.exports = {
    ACTIVITY_TYPES,
    recordActivity,
    recordAuthActivity,
    makeRecordSnapshot
};
