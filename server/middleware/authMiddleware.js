const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { getJwtSecret } = require("../utils/authSecurity");

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function normalizeAccountStatus(status) {
    const normalized = String(status || "")
        .trim()
        .toLowerCase();

    if (!normalized) {
        return "approved";
    }

    if (normalized === "pending") {
        return "pending";
    }

    if (normalized === "declined") {
        return "declined";
    }

    return "approved";
}

async function loadUserById(userId) {
    const result = await pool.query(
        `
            SELECT
                u.id,
                u.name,
                u.email,
                LOWER(u.role) AS role,
                u.office_id,
                u.branch_id,
                COALESCE(o.name, '') AS office_name,
                COALESCE(o.code, '') AS office_code,
                COALESCE(o.status, 'ACTIVE') AS office_status,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                COALESCE(u.auth_token_version, 0) AS auth_token_version,
                COALESCE(u.max_devices, 2) AS max_devices,
                COALESCE(b.name, '') AS branch,
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

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({
            success: false,
            message: "Invalid authentication token."
        });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret(), {
            algorithms: ["HS256"]
        });

        if (!decoded || !decoded.id || !decoded.sid) {
            return res.status(401).json({
                success: false,
                message: "Please log in again to continue."
            });
        }

        loadUserById(decoded.id)
            .then(async user => {
                if (!user) {
                    return res.status(401).json({
                        success: false,
                        message: "Authentication required."
                    });
                }

                if (
                    Number(decoded.token_version || 0) !==
                    Number(user.auth_token_version || 0)
                ) {
                    return res.status(401).json({
                        success: false,
                        message: "Authentication required."
                    });
                }

                let activeSession = null;
                await pool.query(
                    `
                        UPDATE user_sessions
                        SET is_active = FALSE,
                            revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                            revocation_reason = COALESCE(revocation_reason, 'Session expired')
                        WHERE user_id = $1
                          AND session_id = $2
                          AND is_active = TRUE
                          AND (
                              expires_at <= CURRENT_TIMESTAMP
                              OR last_active_at <= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
                          )
                    `,
                    [user.id, decoded.sid]
                );

                const sessionResult = await pool.query(
                    `
                        SELECT id, session_id, device_id, device_name, device_type,
                               browser, operating_system, expires_at
                        FROM user_sessions
                        WHERE user_id = $1
                          AND session_id = $2
                          AND is_active = TRUE
                          AND revoked_at IS NULL
                          AND expires_at > CURRENT_TIMESTAMP
                          AND last_active_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
                        LIMIT 1
                    `,
                    [user.id, decoded.sid]
                );

                activeSession = sessionResult.rows[0] || null;
                if (!activeSession) {
                    return res.status(401).json({
                        success: false,
                        message: "Your session has expired or been revoked. Please log in again."
                    });
                }

                await pool.query(
                    `
                        UPDATE user_sessions
                        SET last_active_at = CURRENT_TIMESTAMP,
                            last_seen_at = CURRENT_TIMESTAMP
                        WHERE id = $1
                    `,
                    [activeSession.id]
                );

                const accountStatus =
                    normalizeAccountStatus(
                        user.account_status
                    );

                if (accountStatus === "pending") {
                    return res.status(403).json({
                        success: false,
                        status: "PENDING",
                        message: "Your account is awaiting administrator approval. Please contact your administrator."
                    });
                }

                if (accountStatus === "declined") {
                    return res.status(403).json({
                        success: false,
                        status: "DECLINED",
                        message: "Your account has been declined by the administrator. Please contact your administrator."
                    });
                }

                if (user.is_active === false) {
                    return res.status(403).json({
                        success: false,
                        message: "Your account is inactive."
                    });
                }

                if (String(user.office_status).toUpperCase() !== "ACTIVE") {
                    return res.status(403).json({
                        success: false,
                        message: "This office is currently disabled."
                    });
                }

                // Subscription restrictions are enforced at the API boundary.
                // System Super Admin remains able to administer an office that
                // is overdue or manually restricted.
                if (normalizeRole(user.role) !== "system_super_admin") {
                    const subscriptionResult = await pool.query(
                        `
                            SELECT status, manual_access_override, expiry_date, grace_period_end
                            FROM office_subscriptions
                            WHERE office_id = $1
                            LIMIT 1
                        `,
                        [user.office_id]
                    );
                    const subscription = subscriptionResult.rows[0];
                    const restrictedByOverride = subscription?.manual_access_override === "RESTRICTED";
                    const restrictedByExpiry = subscription &&
                        subscription.status !== "GRANDFATHERED" &&
                        subscription.grace_period_end &&
                        new Date(`${String(subscription.grace_period_end).slice(0, 10)}T23:59:59Z`) < new Date();
                    if (restrictedByOverride || restrictedByExpiry || ["SUSPENDED", "CANCELLED"].includes(subscription?.status)) {
                        return res.status(402).json({
                            success: false,
                            status: "SUBSCRIPTION_RESTRICTED",
                            message: "This office subscription has expired or access has been restricted. Contact the System Super Admin."
                        });
                    }
                }

                req.user = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: normalizeRole(user.role),
                    office_id: user.office_id,
                    office: user.office_name,
                    office_code: user.office_code,
                    branch_id: user.branch_id,
                    is_active: user.is_active,
                    account_status: user.account_status,
                    auth_token_version: user.auth_token_version,
                    max_devices: user.max_devices,
                    session_id: activeSession.session_id,
                    device_id: activeSession.device_id,
                    branch: user.branch,
                    created_at: user.created_at
                };

                return next();
            })
            .catch(error => {
                console.error("AUTH LOAD ERROR:", error);

                return res.status(500).json({
                    success: false,
                    message: "Unable to verify authentication."
                });
            });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
}

function requireRole(...allowedRoles) {
    const normalizedAllowedRoles =
        allowedRoles.map(normalizeRole);

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const userRole = normalizeRole(req.user.role);

        if (!normalizedAllowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action."
            });
        }

        return next();
    };
}

function requireAnyAuthenticatedRole(...roles) {
    return requireRole(...roles);
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
module.exports.requireAnyAuthenticatedRole = requireAnyAuthenticatedRole;
module.exports.loadUserById = loadUserById;
module.exports.normalizeRole = normalizeRole;
