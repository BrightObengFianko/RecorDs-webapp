const ARKESEL_BALANCE_URL =
    process.env.ARKESEL_BALANCE_URL ||
    "https://sms.arkesel.com/api/v2/clients/balance-details";

const { getN8NConfigStatus } = require("../services/n8nService");
const {
    disconnectOfficeSmsConfig,
    getOfficeSmsBalance,
    getOfficeSmsConfig,
    getOfficeSmsSettings,
    testOfficeSmsConfig,
    upsertOfficeSmsConfig
} = require("../utils/officeIntegration");
const { recordActivity, ACTIVITY_TYPES } = require("../utils/authActivity");

function normalizeRole(role) {
    return String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isSystemSuperAdmin(user) {
    return normalizeRole(user?.role) === "system_super_admin";
}

function canManageOfficeSms(user) {
    return ["admin", "office_admin", "system_super_admin"].includes(normalizeRole(user?.role));
}

function resolveOfficeId(req) {
    const requested = Number.parseInt(String(req.query?.office_id || req.body?.office_id || ""), 10);
    if (isSystemSuperAdmin(req.user) && Number.isInteger(requested)) return requested;
    return Number.parseInt(String(req.user?.office_id || ""), 10);
}

function requireOfficeScope(req, res) {
    if (!canManageOfficeSms(req.user)) {
        res.status(403).json({ success: false, message: "Only an authorized office administrator can manage SMS settings." });
        return null;
    }
    const officeId = resolveOfficeId(req);
    if (!Number.isInteger(officeId)) {
        res.status(400).json({ success: false, message: "A valid office is required." });
        return null;
    }
    if (!isSystemSuperAdmin(req.user) && String(officeId) !== String(req.user.office_id)) {
        res.status(403).json({ success: false, message: "You can only manage SMS settings for your own office." });
        return null;
    }
    return officeId;
}

async function getN8NStatus(req, res) {
    try {
        return res.json({
            success: true,
            ...await getN8NConfigStatus(req.user?.office_id)
        });
    } catch (error) {
        console.error("N8N STATUS ERROR:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load this office's SMS configuration." });
    }
}

function readFirstValue(source, keys) {
    for (const key of keys) {
        if (source && source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
    }

    return null;
}

async function getSmsBalance(req, res) {
    try {
        const officeId = Number.parseInt(String(req.user?.office_id || ""), 10);
        if (!Number.isInteger(officeId)) return res.status(400).json({ success: false, message: "No office is assigned to this account." });
        const config = await getOfficeSmsConfig(officeId);
        if (config.provider === "ARKESEL") {
            const result = await getOfficeSmsBalance(officeId);
            return res.json({ success: true, balance: result.balance, bundle: result.balance === null ? null : `${result.balance} SMS credits available`, buyUrl: process.env.ARKESEL_BUNDLE_URL || null });
        }
        if (config.source !== "legacy-environment" || !process.env.ARKESEL_API_KEY) {
            return res.status(503).json({ success: false, message: "Arkesel SMS is not configured for this office." });
        }
        const response = await fetch(ARKESEL_BALANCE_URL, { method: "GET", headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": process.env.ARKESEL_API_KEY }, signal: AbortSignal.timeout(8000) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return res.status(502).json({ success: false, message: "Unable to load the Arkesel SMS balance." });
        const source = payload?.data && typeof payload.data === "object" ? { ...payload, ...payload.data } : payload;
        const smsBalance = readFirstValue(source, ["sms_balance", "balance", "credits", "credit"]);
        return res.json({ success: true, balance: smsBalance, bundle: smsBalance === null ? null : `${smsBalance} SMS credits available`, buyUrl: process.env.ARKESEL_BUNDLE_URL || null });
    } catch (error) {
        console.error("ARKESEL BALANCE ERROR:", error.message);

        return res.status(502).json({
            success: false,
            message: "Unable to connect to the Arkesel SMS service."
        });
    }
}

async function getOfficeSmsSettingsHandler(req, res) {
    const officeId = requireOfficeScope(req, res);
    if (!officeId) return;
    try {
        return res.json({ success: true, officeId, configuration: await getOfficeSmsSettings(officeId) });
    } catch (error) {
        console.error("GET OFFICE SMS SETTINGS ERROR:", error.message);
        return res.status(500).json({ success: false, message: "Unable to load SMS settings." });
    }
}

async function saveOfficeSmsSettings(req, res) {
    const officeId = requireOfficeScope(req, res);
    if (!officeId) return;
    try {
        const configuration = await upsertOfficeSmsConfig({ officeId, apiKey: req.body?.api_key, senderId: req.body?.sender_id });
        await recordActivity({ request: req, userId: req.user?.id, name: req.user?.name, email: req.user?.email, role: req.user?.role, activityType: ACTIVITY_TYPES.SETTINGS_CHANGED, officeId, details: "Office Arkesel SMS configuration saved. API key value was not recorded." });
        return res.json({ success: true, configuration });
    } catch (error) {
        if (error.code === "SMS_ENCRYPTION_KEY_MISSING") return res.status(503).json({ success: false, message: "SMS encryption is not configured on the server." });
        return res.status(400).json({ success: false, message: error.message || "Unable to save SMS settings." });
    }
}

async function testOfficeSmsSettings(req, res) {
    const officeId = requireOfficeScope(req, res);
    if (!officeId) return;
    try {
        const result = await testOfficeSmsConfig(officeId);
        await recordActivity({ request: req, userId: req.user?.id, name: req.user?.name, email: req.user?.email, role: req.user?.role, activityType: ACTIVITY_TYPES.SETTINGS_CHANGED, officeId, details: "Office Arkesel SMS connection tested successfully." });
        return res.json(result);
    } catch (error) {
        return res.status(502).json({ success: false, status: "ERROR", code: error.code || "ARKESEL_ERROR", message: error.message || "Unable to test the Arkesel connection." });
    }
}

async function getOfficeSmsBalanceHandler(req, res) {
    const officeId = requireOfficeScope(req, res);
    if (!officeId) return;
    try {
        return res.json({ success: true, ...(await getOfficeSmsBalance(officeId)) });
    } catch (error) {
        return res.status(502).json({ success: false, message: error.message || "Unable to load the Arkesel balance." });
    }
}

async function disconnectOfficeSmsSettings(req, res) {
    const officeId = requireOfficeScope(req, res);
    if (!officeId) return;
    try {
        await disconnectOfficeSmsConfig(officeId);
        await recordActivity({ request: req, userId: req.user?.id, name: req.user?.name, email: req.user?.email, role: req.user?.role, activityType: ACTIVITY_TYPES.SETTINGS_CHANGED, officeId, details: "Office Arkesel SMS configuration disconnected." });
        return res.json({ success: true, message: "Office SMS account disconnected." });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Unable to disconnect the office SMS account." });
    }
}

module.exports = {
    getN8NStatus,
    getSmsBalance,
    getOfficeSmsSettingsHandler,
    saveOfficeSmsSettings,
    testOfficeSmsSettings,
    getOfficeSmsBalanceHandler,
    disconnectOfficeSmsSettings
};
