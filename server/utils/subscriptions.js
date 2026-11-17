const pool = require("../config/database");

const SUBSCRIPTION_STATUSES = Object.freeze([
    "GRANDFATHERED", "TRIAL", "ACTIVE", "EXPIRING_SOON", "GRACE_PERIOD",
    "EXPIRED", "SUSPENDED", "CANCELLED"
]);

function parsePositiveInteger(value, field) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${field} must be a positive integer.`);
    }
    return parsed;
}

function parseMoneyToPesewas(value) {
    const normalized = String(value ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        throw new Error("Amount must be a valid GHS amount.");
    }
    const pesewas = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(pesewas) || pesewas <= 0) {
        throw new Error("Amount must be greater than zero.");
    }
    return pesewas;
}

function isoDate(value, field) {
    const text = String(value ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`${field} must use YYYY-MM-DD.`);
    }
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
        throw new Error(`${field} is not a valid date.`);
    }
    return text;
}

function moneyFromPesewas(value) {
    return Number(value || 0) / 100;
}

function deriveStatus(row, today = new Date()) {
    if (row.manual_access_override === "RESTRICTED") return "SUSPENDED";
    if (row.manual_access_override === "ALLOWED") return "ACTIVE";
    if (row.status === "GRANDFATHERED" || row.status === "CANCELLED") return row.status;
    if (!row.expiry_date) return row.status || "PENDING";

    const expiry = new Date(`${String(row.expiry_date).slice(0, 10)}T00:00:00Z`);
    const graceEnd = row.grace_period_end
        ? new Date(`${String(row.grace_period_end).slice(0, 10)}T00:00:00Z`)
        : expiry;
    const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (now <= expiry) {
        const daysLeft = Math.ceil((expiry - now) / 86400000);
        return daysLeft <= 7 ? "EXPIRING_SOON" : "ACTIVE";
    }
    return now <= graceEnd ? "GRACE_PERIOD" : "EXPIRED";
}

async function getGracePeriodDays(client = pool) {
    const result = await client.query("SELECT grace_period_days FROM subscription_settings WHERE id = 1");
    return Number(result.rows[0]?.grace_period_days ?? 7);
}

async function writeSubscriptionAudit(client, { officeId, subscriptionId, actorUserId, action, details = {} }) {
    await client.query(
        `INSERT INTO subscription_audit_logs (office_id, subscription_id, actor_user_id, action, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [officeId, subscriptionId || null, actorUserId || null, action, JSON.stringify(details)]
    );
}

module.exports = {
    SUBSCRIPTION_STATUSES,
    parsePositiveInteger,
    parseMoneyToPesewas,
    isoDate,
    moneyFromPesewas,
    deriveStatus,
    getGracePeriodDays,
    writeSubscriptionAudit
};
