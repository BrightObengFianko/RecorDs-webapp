const pool = require("../config/database");

function auditMutatingRequest(req, res, next) {
    if (!req.user || !["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return next();
    }

    res.on("finish", () => {
        if (res.statusCode >= 500) {
            return;
        }

        pool.query(
            `
                INSERT INTO security_audit_logs
                    (user_id, user_role, method, path, status_code, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                req.user.id,
                req.user.role,
                req.method,
                String(req.originalUrl || req.path).slice(0, 500),
                res.statusCode,
                String(req.ip || "").slice(0, 64) || null,
                String(req.get("user-agent") || "").slice(0, 500) || null
            ]
        ).catch(error => {
            console.error("SECURITY AUDIT LOG ERROR:", error.message);
        });
    });

    return next();
}

module.exports = auditMutatingRequest;
