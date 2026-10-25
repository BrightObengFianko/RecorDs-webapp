const crypto = require("crypto");
const pool = require("../config/database");
const { getJwtSecret } = require("./authSecurity");

const ENCRYPTED_PREFIX = "enc:v1:";
const SMS_ENCRYPTED_PREFIX = "sms:v1:";
const ARKESEL_SEND_URL = "https://sms.arkesel.com/api/v2/sms/send";
const ARKESEL_BALANCE_URL =
    process.env.ARKESEL_BALANCE_URL ||
    "https://sms.arkesel.com/api/v2/clients/balance-details";

function encryptionKey() {
    return crypto.createHash("sha256").update(getJwtSecret()).digest();
}

function encryptOfficeSecret(value) {
    const secret = String(value || "").trim();
    if (!secret) return null;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptOfficeSecret(value) {
    const stored = String(value || "");
    if (!stored) return "";

    // Do not treat unencrypted legacy values as usable office secrets.
    if (!stored.startsWith(ENCRYPTED_PREFIX)) return "";

    try {
        const [ivText, tagText, encryptedText] = stored.slice(ENCRYPTED_PREFIX.length).split(".");
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            encryptionKey(),
            Buffer.from(ivText, "base64url")
        );
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedText, "base64url")),
            decipher.final()
        ]).toString("utf8");
    } catch (error) {
        return "";
    }
}

function smsEncryptionKey() {
    const secret = String(process.env.OFFICE_SMS_ENCRYPTION_KEY || "").trim();
    if (secret.length < 32) {
        const error = new Error("OFFICE_SMS_ENCRYPTION_KEY must be configured with at least 32 characters.");
        error.code = "SMS_ENCRYPTION_KEY_MISSING";
        throw error;
    }
    return crypto.createHash("sha256").update(secret).digest();
}

function encryptArkeselApiKey(value) {
    const secret = String(value || "").trim();
    if (!secret) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", smsEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${SMS_ENCRYPTED_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptArkeselApiKey(value) {
    const stored = String(value || "");
    if (!stored.startsWith(SMS_ENCRYPTED_PREFIX)) return "";
    try {
        const [ivText, tagText, encryptedText] = stored.slice(SMS_ENCRYPTED_PREFIX.length).split(".");
        const decipher = crypto.createDecipheriv("aes-256-gcm", smsEncryptionKey(), Buffer.from(ivText, "base64url"));
        decipher.setAuthTag(Buffer.from(tagText, "base64url"));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedText, "base64url")),
            decipher.final()
        ]).toString("utf8");
    } catch (error) {
        return "";
    }
}

function sanitizeProviderError(error) {
    return String(error || "Arkesel rejected the request.")
        .replace(/api[-_ ]?key\s*[:=]\s*\S+/gi, "api key [redacted]")
        .replace(/authorization\s*[:=]\s*\S+/gi, "authorization [redacted]")
        .slice(0, 500);
}

function providerResponseMessage(payload) {
    if (!payload || typeof payload !== "object") return null;
    return payload.error || payload.message || payload.detail || payload.data?.message || null;
}

function providerSucceeded(response, payload) {
    if (!response.ok) return false;
    const status = String(payload?.status || payload?.data?.status || "").toLowerCase();
    return !["error", "failed", "failure", "invalid"].includes(status);
}

async function requestArkesel(url, apiKey, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "api-key": apiKey,
                ...(options.headers || {})
            },
            signal: AbortSignal.timeout(10000)
        });
    } catch (error) {
        const failure = new Error("Unable to connect to the Arkesel SMS service.");
        failure.code = "ARKESEL_UNAVAILABLE";
        throw failure;
    }

    const payload = await response.json().catch(() => ({}));
    if (!providerSucceeded(response, payload)) {
        const failure = new Error(sanitizeProviderError(providerResponseMessage(payload) || `Arkesel returned HTTP ${response.status}.`));
        failure.code = `ARKESEL_${response.status}`;
        throw failure;
    }
    return payload;
}

function readProviderValue(payload, keys) {
    const source = payload?.data && typeof payload.data === "object" ? { ...payload, ...payload.data } : payload;
    for (const key of keys) {
        if (source?.[key] !== undefined && source[key] !== null) return source[key];
    }
    return null;
}

function validateOfficeWebhookUrl(value) {
    const url = String(value || "").trim();
    if (!url) return null;

    let parsed;
    try {
        parsed = new URL(url);
    } catch (error) {
        throw new Error("The office n8n webhook URL is invalid.");
    }

    const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !localHost) {
        throw new Error("Office n8n webhook URLs must use HTTPS.");
    }
    if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && localHost) {
        throw new Error("Local n8n webhook URLs are not allowed in production.");
    }

    return url;
}

async function getOfficeSmsConfig(officeId) {
    const result = await pool.query(
        `SELECT o.id, o.code, o.n8n_webhook_url, o.n8n_webhook_secret, o.n8n_timeout_ms, o.sms_sender_id,
                c.provider AS sms_provider, c.api_key_encrypted, c.sender_id AS arkesel_sender_id,
                c.status AS sms_status, c.last_tested_at, c.last_error_code, c.last_error_message,
                c.last_balance
         FROM offices o
         LEFT JOIN office_sms_configurations c ON c.office_id = o.id
         WHERE o.id = $1
         LIMIT 1`,
        [officeId]
    );
    const office = result.rows[0];
    if (!office) {
        const error = new Error("Office not found.");
        error.code = "OFFICE_NOT_FOUND";
        throw error;
    }

    const apiKey = decryptArkeselApiKey(office.api_key_encrypted);
    const arkeselKeyConfigured = office.sms_provider === "ARKESEL" &&
        office.sms_status !== "DISCONNECTED" &&
        Boolean(apiKey);
    const arkeselConfigured = arkeselKeyConfigured &&
        office.sms_status === "ACTIVE" &&
        Boolean(office.arkesel_sender_id);

    let webhookUrl = String(office.n8n_webhook_url || "").trim();
    let webhookSecret = decryptOfficeSecret(office.n8n_webhook_secret);
    let source = "office";

    // Preserve the existing Kasoa deployment without allowing other offices
    // to silently inherit its workflow.
    if (!webhookUrl && !webhookSecret && String(office.code || "").toUpperCase() === "KASOA") {
        webhookUrl = String(process.env.N8N_WEBHOOK_URL || "").trim();
        webhookSecret = String(process.env.N8N_WEBHOOK_SECRET || "").trim();
        source = "legacy-environment";
    }

    return {
        officeId: office.id,
        provider: arkeselKeyConfigured ? "ARKESEL" : (webhookUrl && webhookSecret ? "N8N" : null),
        apiKey: arkeselKeyConfigured ? apiKey : "",
        webhookUrl,
        webhookSecret,
        timeoutMs: Math.min(Math.max(Number.parseInt(office.n8n_timeout_ms || "10000", 10), 1000), 30000),
        senderId: arkeselConfigured
            ? String(office.arkesel_sender_id || "").trim()
            : String(office.sms_sender_id || "").trim() || null,
        source,
        configured: arkeselConfigured || Boolean(webhookUrl && webhookSecret),
        smsStatus: office.sms_status || "NOT_CONFIGURED",
        lastTestedAt: office.last_tested_at,
        lastErrorCode: office.last_error_code,
        lastErrorMessage: office.last_error_message,
        lastBalance: office.last_balance
    };
}

async function getOfficeSmsSettings(officeId) {
    const result = await pool.query(
        `SELECT c.provider, c.sender_id, c.status, c.last_tested_at, c.last_error_code,
                c.last_error_message, c.last_balance, c.updated_at,
                (c.api_key_encrypted IS NOT NULL) AS api_key_configured
         FROM office_sms_configurations c
         WHERE c.office_id = $1
         LIMIT 1`,
        [officeId]
    );
    const row = result.rows[0];
    return row || {
        provider: "ARKESEL",
        sender_id: null,
        status: "NOT_CONFIGURED",
        last_tested_at: null,
        last_error_code: null,
        last_error_message: null,
        last_balance: null,
        updated_at: null,
        api_key_configured: false
    };
}

async function upsertOfficeSmsConfig({ officeId, apiKey, senderId }) {
    const cleanKey = String(apiKey || "").trim();
    const cleanSender = String(senderId || "").trim();
    if (!cleanKey && !cleanSender) {
        throw Object.assign(new Error("Enter an Arkesel API key or sender ID."), { code: "SMS_CONFIG_EMPTY" });
    }
    const encrypted = cleanKey ? encryptArkeselApiKey(cleanKey) : null;
    const result = await pool.query(
        `INSERT INTO office_sms_configurations (office_id, provider, api_key_encrypted, sender_id, status, last_error_code, last_error_message, updated_at)
         VALUES ($1, 'ARKESEL', $2, NULLIF($3, ''), CASE WHEN $2 IS NULL THEN 'NOT_CONFIGURED' ELSE 'PENDING_VERIFICATION' END, NULL, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT (office_id) DO UPDATE SET
             api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, office_sms_configurations.api_key_encrypted),
             sender_id = COALESCE(EXCLUDED.sender_id, office_sms_configurations.sender_id),
             status = CASE WHEN COALESCE(EXCLUDED.api_key_encrypted, office_sms_configurations.api_key_encrypted) IS NULL THEN 'NOT_CONFIGURED' ELSE 'PENDING_VERIFICATION' END,
             last_error_code = NULL,
             last_error_message = NULL,
             updated_at = CURRENT_TIMESTAMP
         RETURNING id, provider, sender_id, status, last_tested_at, last_error_code, last_error_message, last_balance, updated_at,
                   (api_key_encrypted IS NOT NULL) AS api_key_configured`,
        [officeId, encrypted, cleanSender]
    );
    return result.rows[0];
}

async function testOfficeSmsConfig(officeId) {
    const config = await getOfficeSmsConfig(officeId);
    if (!config.apiKey || !config.senderId) {
        const error = new Error("Configure an Arkesel API key and sender ID before testing the connection.");
        error.code = "SMS_NOT_CONFIGURED";
        throw error;
    }
    try {
        const payload = await requestArkesel(ARKESEL_BALANCE_URL, config.apiKey, { method: "GET" });
        const balance = readProviderValue(payload, ["sms_balance", "balance", "credits", "credit"]);
        await pool.query(
            `UPDATE office_sms_configurations
             SET status = 'ACTIVE', last_tested_at = CURRENT_TIMESTAMP, last_error_code = NULL,
                 last_error_message = NULL, last_balance = $2, updated_at = CURRENT_TIMESTAMP
             WHERE office_id = $1`,
            [officeId, balance === null ? null : String(balance)]
        );
        return { success: true, status: "ACTIVE", balance };
    } catch (error) {
        const message = sanitizeProviderError(error.message);
        await pool.query(
            `UPDATE office_sms_configurations
             SET status = 'ERROR', last_tested_at = CURRENT_TIMESTAMP, last_error_code = $2,
                 last_error_message = $3, updated_at = CURRENT_TIMESTAMP
             WHERE office_id = $1`,
            [officeId, String(error.code || "ARKESEL_ERROR").slice(0, 80), message]
        );
        throw error;
    }
}

async function getOfficeSmsBalance(officeId) {
    const config = await getOfficeSmsConfig(officeId);
    if (!config.apiKey || config.provider !== "ARKESEL") {
        const error = new Error("Arkesel SMS is not configured for this office.");
        error.code = "SMS_NOT_CONFIGURED";
        throw error;
    }
    const payload = await requestArkesel(ARKESEL_BALANCE_URL, config.apiKey, { method: "GET" });
    const balance = readProviderValue(payload, ["sms_balance", "balance", "credits", "credit"]);
    await pool.query(
        `UPDATE office_sms_configurations SET last_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE office_id = $1`,
        [officeId, balance === null ? null : String(balance)]
    );
    return { balance, payload: { balance } };
}

async function disconnectOfficeSmsConfig(officeId) {
    await pool.query(
        `INSERT INTO office_sms_configurations (office_id, provider, status, updated_at)
         VALUES ($1, 'ARKESEL', 'DISCONNECTED', CURRENT_TIMESTAMP)
         ON CONFLICT (office_id) DO UPDATE SET api_key_encrypted = NULL, sender_id = NULL,
             status = 'DISCONNECTED', last_error_code = NULL, last_error_message = NULL,
             last_balance = NULL, updated_at = CURRENT_TIMESTAMP`,
        [officeId]
    );
}

async function sendOfficeSms({ officeId, recordId, senderId, message, recipients }) {
    const config = await getOfficeSmsConfig(officeId);
    if (config.provider !== "ARKESEL" || config.smsStatus !== "ACTIVE" || !config.apiKey || !config.senderId) {
        const error = new Error("SMS service is not configured for this office. Please contact the administrator.");
        error.code = "SMS_NOT_CONFIGURED";
        throw error;
    }
    try {
        const payload = await requestArkesel(ARKESEL_SEND_URL, config.apiKey, {
            method: "POST",
            body: JSON.stringify({ sender: senderId || config.senderId, message, recipients })
        });
        const messageId = readProviderValue(payload, ["messageId", "message_id", "id"]);
        await pool.query(
            `INSERT INTO office_sms_usage (office_id, record_id, provider, provider_message_id, status, segments)
             VALUES ($1, $2, 'ARKESEL', $3, 'SENT', $4)`,
            [officeId, recordId || null, messageId ? String(messageId) : null, Number(readProviderValue(payload, ["segments", "sms_count"])) || null]
        );
        return { success: true, final: true, sent: true, status: "SENT", messageId, providerResponse: payload };
    } catch (error) {
        await pool.query(
            `INSERT INTO office_sms_usage (office_id, record_id, provider, status, error_code, error_message)
             VALUES ($1, $2, 'ARKESEL', 'ERROR', $3, $4)`,
            [officeId, recordId || null, String(error.code || "ARKESEL_ERROR").slice(0, 80), sanitizeProviderError(error.message)]
        ).catch(() => {});
        throw error;
    }
}

module.exports = {
    decryptOfficeSecret,
    encryptOfficeSecret,
    decryptArkeselApiKey,
    disconnectOfficeSmsConfig,
    getOfficeSmsBalance,
    getOfficeSmsConfig,
    getOfficeSmsSettings,
    sendOfficeSms,
    testOfficeSmsConfig,
    upsertOfficeSmsConfig,
    validateOfficeWebhookUrl
};
