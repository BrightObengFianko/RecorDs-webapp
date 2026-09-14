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
                u.branch_id,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                COALESCE(u.auth_token_version, 0) AS auth_token_version,
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

        if (!decoded || !decoded.id) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        loadUserById(decoded.id)
            .then(user => {
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

                req.user = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: normalizeRole(user.role),
                    branch_id: user.branch_id,
                    is_active: user.is_active,
                    account_status: user.account_status,
                    auth_token_version: user.auth_token_version,
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
