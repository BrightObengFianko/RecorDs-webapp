const pool = require("../config/database");

const ACTIVITY_TYPES = Object.freeze({
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILURE: "LOGIN_FAILURE",
    LOGOUT_SUCCESS: "LOGOUT_SUCCESS"
});

async function recordAuthActivity({
    userId = null,
    name = null,
    email = null,
    role = null,
    activityType,
    request = null
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
                    ip_address,
                    user_agent
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                userId || null,
                name ? String(name).trim() : null,
                email ? String(email).trim().toLowerCase() : null,
                role ? String(role).trim().toLowerCase() : null,
                activityType,
                request ? (String(request.ip || "").slice(0, 64) || null) : null,
                request ? (String(request.get("user-agent") || "").slice(0, 500) || null) : null
            ]
        );
    } catch (error) {
        // Activity logging must not prevent authentication from completing.
        console.error("AUTH ACTIVITY LOG ERROR:", error.message);
    }
}

module.exports = {
    ACTIVITY_TYPES,
    recordAuthActivity
};
