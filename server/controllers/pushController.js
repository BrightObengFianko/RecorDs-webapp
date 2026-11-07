const pool = require("../config/database");
const { getPublicKey, isConfigured } = require("../utils/pushNotifications");

function validateSubscription(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Push subscription is required.");
    }
    const endpoint = String(value.endpoint || "").trim();
    const p256dh = String(value.keys?.p256dh || "").trim();
    const auth = String(value.keys?.auth || "").trim();
    if (!/^https:\/\/[^\s]+$/i.test(endpoint) || endpoint.length > 2048) throw new Error("Push endpoint is invalid.");
    if (!p256dh || !auth || p256dh.length > 500 || auth.length > 500) throw new Error("Push subscription keys are invalid.");
    return { endpoint, p256dh, auth };
}

function getPushConfig(req, res) {
    return res.json({ success: true, supported: isConfigured(), publicKey: getPublicKey() });
}

async function subscribeToPush(req, res) {
    try {
        if (!isConfigured()) return res.status(503).json({ success: false, message: "Background notifications are not configured yet." });
        const subscription = validateSubscription(req.body?.subscription || req.body);
        await pool.query(
            `INSERT INTO push_subscriptions (user_id, office_id, endpoint, p256dh, auth, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (endpoint) DO UPDATE SET
                 user_id = EXCLUDED.user_id,
                 office_id = EXCLUDED.office_id,
                 p256dh = EXCLUDED.p256dh,
                 auth = EXCLUDED.auth,
                 user_agent = EXCLUDED.user_agent,
                 last_used_at = CURRENT_TIMESTAMP`,
            [req.user.id, req.user.office_id, subscription.endpoint, subscription.p256dh, subscription.auth, String(req.get("user-agent") || "").slice(0, 500)]
        );
        return res.json({ success: true, message: "Background notifications enabled." });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message || "Unable to save push subscription." });
    }
}

async function unsubscribeFromPush(req, res) {
    try {
        const endpoint = String(req.body?.endpoint || req.query?.endpoint || "").trim();
        if (!endpoint || endpoint.length > 2048) return res.status(400).json({ success: false, message: "Push endpoint is invalid." });
        await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [req.user.id, endpoint]);
        return res.json({ success: true, message: "Background notifications disabled." });
    } catch (error) {
        console.error("UNSUBSCRIBE PUSH ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to disable background notifications." });
    }
}

module.exports = { getPushConfig, subscribeToPush, unsubscribeFromPush };
