const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const {
    ACTIVITY_TYPES,
    recordAuthActivity
} = require("../utils/authActivity");
const {
    hashPassword,
    validatePassword
} = require("../utils/authSecurity");
const {
    sendPasswordResetConfirmationEmail,
    sendPasswordResetEmail
} = require("../services/emailService");

const RESET_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 5;
const MAX_REQUESTS_PER_IDENTITY = 3;
const MAX_VERIFY_REQUESTS_PER_IP = 20;
const requestAttempts = new Map();
const verificationAttempts = new Map();

function normalizeIdentity(value) {
    return String(value || "").trim().toLowerCase();
}

function hashSecret(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function createResetCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function createResetToken() {
    return crypto.randomBytes(32).toString("hex");
}

function getRequestKey(req, identity) {
    return `${req.ip || "unknown"}:${identity}`;
}

function isRateLimited(req, identity, now = Date.now()) {
    const keys = [`ip:${req.ip || "unknown"}`, `identity:${getRequestKey(req, identity)}`];
    return keys.some(key => {
        const entry = requestAttempts.get(key);
        if (!entry || now - entry.startedAt >= REQUEST_WINDOW_MS) return false;
        const max = key.startsWith("ip:") ? MAX_REQUESTS_PER_IP : MAX_REQUESTS_PER_IDENTITY;
        return entry.count >= max;
    });
}

function recordRequestAttempt(req, identity, now = Date.now()) {
    [`ip:${req.ip || "unknown"}`, `identity:${getRequestKey(req, identity)}`].forEach(key => {
        const entry = requestAttempts.get(key);
        if (!entry || now - entry.startedAt >= REQUEST_WINDOW_MS) {
            requestAttempts.set(key, { count: 1, startedAt: now });
        } else {
            entry.count += 1;
        }
    });
}

function pruneRequestAttempts(now = Date.now()) {
    for (const [key, entry] of requestAttempts) {
        if (now - entry.startedAt >= REQUEST_WINDOW_MS) requestAttempts.delete(key);
    }
    for (const [key, entry] of verificationAttempts) {
        if (now - entry.startedAt >= REQUEST_WINDOW_MS) verificationAttempts.delete(key);
    }
}

function isVerificationRateLimited(req, now = Date.now()) {
    const entry = verificationAttempts.get(req.ip || "unknown");
    return Boolean(entry && now - entry.startedAt < REQUEST_WINDOW_MS && entry.count >= MAX_VERIFY_REQUESTS_PER_IP);
}

function recordVerificationAttempt(req, now = Date.now()) {
    const key = req.ip || "unknown";
    const entry = verificationAttempts.get(key);
    if (!entry || now - entry.startedAt >= REQUEST_WINDOW_MS) {
        verificationAttempts.set(key, { count: 1, startedAt: now });
    } else {
        entry.count += 1;
    }
}

function getPublicResetUrl(req, token) {
    const configured = String(process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
    const base = configured || `${req.protocol}://${req.get("host")}`;
    return `${base}/reset-password.html?token=${encodeURIComponent(token)}`;
}

async function findRecoverableUser(identity) {
    const result = await pool.query(
        `
            SELECT id, name, email, password, role, branch_id, is_active, account_status
            FROM users
            WHERE LOWER(TRIM(email)) = $1
               OR LOWER(TRIM(COALESCE(account_settings #>> '{profile,username}', ''))) = $1
            LIMIT 1
        `,
        [identity]
    );

    const user = result.rows[0];
    if (!user || user.is_active === false || String(user.account_status || "APPROVED").toUpperCase() !== "APPROVED") {
        return null;
    }

    return user;
}

async function requestPasswordReset(req, res) {
    const identity = normalizeIdentity(req.body?.identity || req.body?.email || req.body?.username);
    const neutralResponse = {
        success: true,
        message: "If an account matches the information provided, a password reset code has been sent."
    };

    pruneRequestAttempts();
    if (!identity || identity.length > 150 || isRateLimited(req, identity)) {
        return res.status(200).json(neutralResponse);
    }

    recordRequestAttempt(req, identity);

    try {
        await pool.query("DELETE FROM password_reset_tokens WHERE expires_at <= CURRENT_TIMESTAMP OR used_at IS NOT NULL");
        const user = await findRecoverableUser(identity);
        if (!user) {
            await recordAuthActivity({
                request: req,
                activityType: ACTIVITY_TYPES.PASSWORD_RESET_REQUESTED,
                details: "Password reset requested for an unavailable account."
            });
            return res.status(200).json(neutralResponse);
        }

        const code = createResetCode();
        const expiresAt = new Date(Date.now() + RESET_TTL_MS);

        await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL", [user.id]);
        await pool.query(
            `
                INSERT INTO password_reset_tokens (user_id, code_hash, expires_at, request_ip)
                VALUES ($1, $2, $3, $4)
            `,
            [user.id, hashSecret(code), expiresAt, String(req.ip || "").slice(0, 64) || null]
        );

        try {
            await sendPasswordResetEmail({
                to: user.email,
                code,
                resetUrl: getPublicResetUrl(req, code)
            });
        } catch (mailError) {
            await pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND code_hash = $2", [user.id, hashSecret(code)]);
            await recordAuthActivity({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                request: req,
                activityType: ACTIVITY_TYPES.PASSWORD_RESET_EMAIL_FAILED,
                details: "Password reset email delivery failed."
            });
            throw mailError;
        }

        await recordAuthActivity({
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            request: req,
            activityType: ACTIVITY_TYPES.PASSWORD_RESET_REQUESTED,
            details: "Password reset instructions sent."
        });
        await recordAuthActivity({
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            request: req,
            activityType: ACTIVITY_TYPES.PASSWORD_RESET_EMAIL_SENT,
            details: "Password reset email accepted by the provider."
        });
    } catch (error) {
        console.error("PASSWORD RESET REQUEST ERROR:", error.message);
    }

    return res.status(200).json(neutralResponse);
}

async function verifyResetCode(req, res) {
    const code = String(req.body?.code || req.body?.token || "").trim();
    pruneRequestAttempts();
    if (!/^\d{6}$/.test(code) || isVerificationRateLimited(req)) {
        return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }
    recordVerificationAttempt(req);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `
                SELECT t.id, t.user_id, t.attempt_count, t.expires_at, u.name, u.email, u.role
                FROM password_reset_tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.code_hash = $1
                  AND t.used_at IS NULL
                  AND t.verified_at IS NULL
                FOR UPDATE
            `,
            [hashSecret(code)]
        );
        const token = result.rows[0];

        if (!token || token.attempt_count >= MAX_VERIFY_ATTEMPTS || new Date(token.expires_at).getTime() <= Date.now()) {
            if (token && token.attempt_count < MAX_VERIFY_ATTEMPTS) {
                await client.query("UPDATE password_reset_tokens SET attempt_count = attempt_count + 1 WHERE id = $1", [token.id]);
                await client.query("COMMIT");
            } else {
                await client.query("ROLLBACK");
            }
            await recordAuthActivity({ request: req, activityType: ACTIVITY_TYPES.PASSWORD_RESET_FAILED, details: "Invalid or expired reset code." });
            return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
        }

        const resetToken = createResetToken();
        await client.query(
            `
                UPDATE password_reset_tokens
                SET verified_at = CURRENT_TIMESTAMP, reset_token_hash = $2
                WHERE id = $1
            `,
            [token.id, hashSecret(resetToken)]
        );
        await client.query("COMMIT");

        await recordAuthActivity({
            userId: token.user_id,
            name: token.name,
            email: token.email,
            role: token.role,
            request: req,
            activityType: ACTIVITY_TYPES.PASSWORD_RESET_VERIFIED,
            details: "Password reset code verified."
        });

        return res.json({ success: true, resetToken });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("PASSWORD RESET VERIFY ERROR:", error.message);
        return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    } finally {
        client.release();
    }
}

async function resetPassword(req, res) {
    const resetToken = String(req.body?.resetToken || "").trim();
    const password = String(req.body?.password || "");
    const confirmation = String(req.body?.confirmation || "");
    const passwordError = validatePassword(password);

    if (!resetToken || passwordError || password !== confirmation) {
        return res.status(400).json({
            success: false,
            message: password !== confirmation ? "Passwords do not match." : (passwordError || "Reset authorization is invalid.")
        });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const tokenResult = await client.query(
            `
                SELECT t.id, t.user_id, u.name, u.email, u.role, u.password
                FROM password_reset_tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.reset_token_hash = $1
                  AND t.verified_at IS NOT NULL
                  AND t.used_at IS NULL
                  AND t.expires_at > CURRENT_TIMESTAMP
                FOR UPDATE
            `,
            [hashSecret(resetToken)]
        );
        const token = tokenResult.rows[0];
        if (!token) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Reset authorization is invalid or expired." });
        }

        if (await bcrypt.compare(password, token.password)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Choose a password different from your current password." });
        }

        const hashedPassword = await hashPassword(password);
        const updateResult = await client.query(
            `
                UPDATE users
                SET password = $2,
                    auth_token_version = COALESCE(auth_token_version, 0) + 1
                WHERE id = $1
                RETURNING id
            `,
            [token.user_id, hashedPassword]
        );
        await client.query("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1", [token.id]);
        await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2", [token.user_id, token.id]);
        await client.query("COMMIT");

        if (!updateResult.rowCount) {
            return res.status(400).json({ success: false, message: "Unable to change the password." });
        }

        await recordAuthActivity({
            userId: token.user_id,
            name: token.name,
            email: token.email,
            role: token.role,
            request: req,
            activityType: ACTIVITY_TYPES.PASSWORD_RESET_COMPLETED,
            details: "Password changed through self-service recovery."
        });

        sendPasswordResetConfirmationEmail({ to: token.email }).catch(error => {
            console.error("PASSWORD RESET CONFIRMATION EMAIL ERROR:", error.message);
        });

        return res.json({ success: true, message: "Your password has been changed successfully." });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("PASSWORD RESET COMPLETE ERROR:", error.message);
        return res.status(500).json({ success: false, message: "Unable to change the password." });
    } finally {
        client.release();
    }
}

module.exports = {
    requestPasswordReset,
    verifyResetCode,
    resetPassword
};
