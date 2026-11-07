const webpush = require("web-push");
const pool = require("../config/database");

const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const subject = String(process.env.VAPID_SUBJECT || process.env.APP_BASE_URL || "mailto:admin@example.com").trim();
const configured = Boolean(publicKey && privateKey && subject);

if (configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
}

function isConfigured() {
    return configured;
}

function getPublicKey() {
    return configured ? publicKey : "";
}

async function sendPushToUser(userId, payload) {
    if (!configured) return { sent: 0, removed: 0, configured: false };

    const result = await pool.query(
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE user_id = $1`,
        [userId]
    );

    let sent = 0;
    let removed = 0;
    for (const subscription of result.rows) {
        try {
            await webpush.sendNotification(
                {
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
                },
                JSON.stringify(payload),
                { TTL: 86400 }
            );
            sent += 1;
            await pool.query("UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1", [subscription.id]);
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [subscription.id]);
                removed += 1;
            } else {
                console.warn("PUSH DELIVERY FAILED:", error.statusCode || error.message);
            }
        }
    }

    return { sent, removed, configured: true };
}

module.exports = { isConfigured, getPublicKey, sendPushToUser };
