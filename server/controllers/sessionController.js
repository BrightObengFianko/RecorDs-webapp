const pool = require("../config/database");
const { ACTIVITY_TYPES, recordActivity } = require("../utils/authActivity");

function sessionView(row) {
    return {
        id: row.id,
        session_id: row.session_id,
        device_id: row.device_id,
        device_name: row.device_name,
        device_type: row.device_type,
        browser: row.browser,
        operating_system: row.operating_system,
        created_at: row.created_at,
        last_active_at: row.last_active_at,
        expires_at: row.expires_at,
        is_current: row.session_id === row.current_session_id
    };
}

async function getUser(userId) {
    const result = await pool.query(
        `
            SELECT u.id, u.name, u.email, u.role, u.branch_id,
                   COALESCE(b.name, '') AS branch,
                   COALESCE(u.max_devices, 2) AS max_devices
            FROM users u
            LEFT JOIN branches b ON b.id = u.branch_id
            WHERE u.id = $1
            LIMIT 1
        `,
        [userId]
    );

    return result.rows[0] || null;
}

async function listSessionsForUser(userId, currentSessionId = null) {
    const result = await pool.query(
        `
            SELECT id, session_id, device_id, device_name, device_type,
                   browser, operating_system, created_at, last_active_at,
                   expires_at, $2::text AS current_session_id
            FROM user_sessions
            WHERE user_id = $1
              AND is_active = TRUE
              AND revoked_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
            ORDER BY last_active_at DESC, id DESC
        `,
        [userId, currentSessionId]
    );

    return result.rows.map(sessionView);
}

async function listMySessions(req, res) {
    try {
        const user = await getUser(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const sessions = await listSessionsForUser(req.user.id, req.user.session_id);
        return res.json({
            success: true,
            max_devices: Math.max(1, Number(user.max_devices || 2)),
            sessions
        });
    } catch (error) {
        console.error("LIST MY SESSIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load active sessions." });
    }
}

async function revokeSession(req, res, isAdmin = false) {
    const targetUserId = isAdmin ? req.params.id : req.user.id;
    const sessionId = String(req.params.sessionId || "").trim();

    if (!sessionId) return res.status(400).json({ success: false, message: "Session is required." });
    if (!isAdmin && sessionId === req.user.session_id) {
        return res.status(409).json({ success: false, message: "Use Logout to end the current session." });
    }

    try {
        const user = await getUser(targetUserId);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const result = await pool.query(
            `
                UPDATE user_sessions
                SET is_active = FALSE,
                    revoked_at = CURRENT_TIMESTAMP,
                    revoked_by = $1,
                    revocation_reason = $2
                WHERE user_id = $3
                  AND session_id = $4
                  AND is_active = TRUE
                RETURNING session_id, device_name, browser
            `,
            [req.user.id, isAdmin ? "Admin forced logout" : "User revoked session", targetUserId, sessionId]
        );

        if (!result.rowCount) {
            return res.status(404).json({ success: false, message: "Active session not found." });
        }

        await recordActivity({
            request: req,
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            activityType: isAdmin ? ACTIVITY_TYPES.ADMIN_FORCED_LOGOUT : ACTIVITY_TYPES.DEVICE_SESSION_REVOKED,
            affectedUserId: targetUserId,
            affectedUserName: user.name,
            branchId: user.branch_id,
            branchName: user.branch,
            details: `${isAdmin ? "Admin forced logout" : "User revoked session"}: ${result.rows[0].device_name} (${result.rows[0].browser}).`
        });

        return res.json({ success: true, message: isAdmin ? "Device logged out." : "Session revoked." });
    } catch (error) {
        console.error("REVOKE SESSION ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to revoke session." });
    }
}

async function revokeMySession(req, res) {
    return revokeSession(req, res, false);
}

async function forceLogoutSession(req, res) {
    return revokeSession(req, res, true);
}

async function revokeAllSessions(req, res, isAdmin = false) {
    const targetUserId = isAdmin ? req.params.id : req.user.id;

    try {
        const user = await getUser(targetUserId);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const result = await pool.query(
            `
                UPDATE user_sessions
                SET is_active = FALSE,
                    revoked_at = CURRENT_TIMESTAMP,
                    revoked_by = $1,
                    revocation_reason = $2
                WHERE user_id = $3
                  AND is_active = TRUE
                  AND revoked_at IS NULL
                RETURNING session_id
            `,
            [req.user.id, isAdmin ? "Admin logged out all devices" : "User logged out all devices", targetUserId]
        );

        await recordActivity({
            request: req,
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            activityType: ACTIVITY_TYPES.ALL_DEVICES_LOGGED_OUT,
            affectedUserId: targetUserId,
            affectedUserName: user.name,
            branchId: user.branch_id,
            branchName: user.branch,
            details: `${isAdmin ? "Admin" : "User"} revoked ${result.rowCount} active device session(s).`
        });

        return res.json({ success: true, revoked: result.rowCount });
    } catch (error) {
        console.error("REVOKE ALL SESSIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to log out devices." });
    }
}

async function revokeAllMySessions(req, res) {
    return revokeAllSessions(req, res, false);
}

async function forceLogoutAllSessions(req, res) {
    return revokeAllSessions(req, res, true);
}

async function listUserSessions(req, res) {
    try {
        const user = await getUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        return res.json({
            success: true,
            user: { id: user.id, name: user.name, role: user.role },
            max_devices: Math.max(1, Number(user.max_devices || 2)),
            sessions: await listSessionsForUser(user.id)
        });
    } catch (error) {
        console.error("LIST USER SESSIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load user sessions." });
    }
}

module.exports = {
    listMySessions,
    revokeMySession,
    revokeAllMySessions,
    listUserSessions,
    forceLogoutSession,
    forceLogoutAllSessions
};
