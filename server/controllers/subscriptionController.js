const pool = require("../config/database");
const { recordActivity, ACTIVITY_TYPES } = require("../utils/authActivity");
const {
    parsePositiveInteger, parseMoneyToPesewas, isoDate, moneyFromPesewas,
    deriveStatus, getGracePeriodDays, writeSubscriptionAudit
} = require("../utils/subscriptions");

function isSystemSuperAdmin(req) {
    return String(req.user?.role || "").toLowerCase() === "system_super_admin";
}

function denyUnlessSystemAdmin(req, res) {
    if (!isSystemSuperAdmin(req)) {
        res.status(403).json({ success: false, message: "Only the System Super Admin can manage subscriptions." });
        return true;
    }
    return false;
}

function mapSubscription(row) {
    return {
        id: row.subscription_id,
        office_id: row.office_id,
        office_name: row.office_name,
        office_code: row.office_code,
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        status: deriveStatus(row),
        payment_status: row.payment_status,
        start_date: row.start_date,
        expiry_date: row.expiry_date,
        grace_period_end: row.grace_period_end,
        amount: moneyFromPesewas(row.amount_pesewas),
        currency: row.currency,
        payment_frequency: row.payment_frequency,
        manual_access_override: row.manual_access_override,
        override_reason: row.override_reason
    };
}

async function listPlans(req, res) {
    try {
        const result = await pool.query(`SELECT id, name, description, amount_pesewas, currency, duration_days, is_active FROM subscription_plans ORDER BY is_active DESC, name`);
        return res.json({ success: true, plans: result.rows.map(plan => ({ ...plan, amount: moneyFromPesewas(plan.amount_pesewas) })) });
    } catch (error) {
        console.error("LIST SUBSCRIPTION PLANS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load subscription plans." });
    }
}

async function createPlan(req, res) {
    if (denyUnlessSystemAdmin(req, res)) return;
    const name = String(req.body?.name || "").trim().slice(0, 100);
    const description = String(req.body?.description || "").trim().slice(0, 1000) || null;
    if (!name) return res.status(400).json({ success: false, message: "Plan name is required." });
    try {
        const amount = parseMoneyToPesewas(req.body.amount);
        const durationDays = parsePositiveInteger(req.body.duration_days, "Duration");
        const result = await pool.query(
            `INSERT INTO subscription_plans (name, description, amount_pesewas, duration_days) VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, description, amount, durationDays]
        );
        return res.status(201).json({ success: true, plan: { ...result.rows[0], amount: moneyFromPesewas(result.rows[0].amount_pesewas) } });
    } catch (error) {
        console.error("CREATE SUBSCRIPTION PLAN ERROR:", error);
        return res.status(400).json({ success: false, message: error.message || "Unable to create subscription plan." });
    }
}

async function listSubscriptions(req, res) {
    try {
        const values = [];
        const conditions = [];
        const search = String(req.query.search || "").trim();
        const status = String(req.query.status || "").trim().toUpperCase();
        if (search) {
            values.push(`%${search}%`);
            conditions.push(`(o.name ILIKE $${values.length} OR o.code ILIKE $${values.length})`);
        }
        if (status) {
            values.push(status);
            conditions.push(`s.status = $${values.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query(
            `SELECT s.id AS subscription_id, s.office_id, o.name AS office_name, o.code AS office_code,
                    s.plan_id, p.name AS plan_name, s.status, s.payment_status, s.start_date,
                    s.expiry_date, s.grace_period_end, s.amount_pesewas, s.currency,
                    s.payment_frequency, s.manual_access_override, s.override_reason
             FROM office_subscriptions s
             JOIN offices o ON o.id = s.office_id
             LEFT JOIN subscription_plans p ON p.id = s.plan_id
             ${where} ORDER BY o.name`, values
        );
        return res.json({ success: true, subscriptions: result.rows.map(mapSubscription) });
    } catch (error) {
        console.error("LIST SUBSCRIPTIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load subscriptions." });
    }
}

async function getOverview(req, res) {
    try {
        const result = await pool.query(`
            SELECT s.id AS subscription_id, s.office_id, s.plan_id, s.status, s.payment_status,
                   s.start_date, s.expiry_date, s.grace_period_end, s.amount_pesewas,
                   s.currency, s.payment_frequency, s.manual_access_override, s.override_reason,
                   o.name AS office_name, o.code AS office_code, p.name AS plan_name
            FROM office_subscriptions s JOIN offices o ON o.id = s.office_id
            LEFT JOIN subscription_plans p ON p.id = s.plan_id
        `);
        const subscriptions = result.rows.map(mapSubscription);
        const revenue = await pool.query(`SELECT COALESCE(SUM(amount_pesewas), 0) AS total FROM subscription_payments WHERE status = 'CONFIRMED'`);
        const counts = subscriptions.reduce((acc, item) => {
            acc.total += 1;
            if (["ACTIVE", "EXPIRING_SOON", "GRANDFATHERED", "TRIAL"].includes(item.status)) acc.active += 1;
            if (item.payment_status === "PENDING") acc.pending += 1;
            if (["SUSPENDED", "EXPIRED", "CANCELLED"].includes(item.status)) acc.restricted += 1;
            return acc;
        }, { total: 0, active: 0, pending: 0, restricted: 0 });
        return res.json({ success: true, summary: { ...counts, revenue: moneyFromPesewas(revenue.rows[0].total) }, subscriptions });
    } catch (error) {
        console.error("SUBSCRIPTION OVERVIEW ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load subscription overview." });
    }
}

async function recordPayment(req, res) {
    if (denyUnlessSystemAdmin(req, res)) return;
    const officeId = Number.parseInt(req.params.officeId, 10);
    if (!Number.isInteger(officeId) || officeId <= 0) return res.status(400).json({ success: false, message: "Invalid office." });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const subscriptionResult = await client.query(`SELECT s.*, o.name AS office_name FROM office_subscriptions s JOIN offices o ON o.id = s.office_id WHERE s.office_id = $1 FOR UPDATE`, [officeId]);
        if (!subscriptionResult.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Office subscription not found." });
        }
        const subscription = subscriptionResult.rows[0];
        const amount = parseMoneyToPesewas(req.body.amount);
        const paymentDate = isoDate(req.body.payment_date, "Payment date");
        const method = String(req.body.method || "").trim().slice(0, 40);
        const reference = String(req.body.reference || "").trim().slice(0, 120);
        if (!method || !reference) throw new Error("Payment method and unique reference are required.");
        await client.query(
            `INSERT INTO subscription_payments (office_subscription_id, amount_pesewas, payment_date, method, reference, note, confirmed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [subscription.id, amount, paymentDate, method, reference, String(req.body.note || "").trim().slice(0, 2000) || null, req.user.id]
        );
        const plan = req.body.plan_id ? await client.query("SELECT duration_days FROM subscription_plans WHERE id = $1 AND is_active = TRUE", [req.body.plan_id]) : { rowCount: 0 };
        const durationDays = Number(plan.rows?.[0]?.duration_days || req.body.duration_days || 30);
        const startDate = paymentDate;
        const expiry = new Date(`${startDate}T00:00:00Z`);
        expiry.setUTCDate(expiry.getUTCDate() + durationDays);
        const graceDays = await getGracePeriodDays(client);
        const graceEnd = new Date(expiry);
        graceEnd.setUTCDate(graceEnd.getUTCDate() + graceDays);
        await client.query(
            `UPDATE office_subscriptions SET plan_id = COALESCE($2, plan_id), status = 'ACTIVE', payment_status = 'CONFIRMED', start_date = $3, expiry_date = $4, grace_period_end = $5, amount_pesewas = $6, manual_access_override = NULL, override_reason = NULL, override_changed_by = NULL, override_changed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [subscription.id, req.body.plan_id ? Number(req.body.plan_id) : null, startDate, expiry.toISOString().slice(0, 10), graceEnd.toISOString().slice(0, 10), amount]
        );
        await writeSubscriptionAudit(client, { officeId, subscriptionId: subscription.id, actorUserId: req.user.id, action: "PAYMENT_RECORDED", details: { amount, paymentDate, method, reference, durationDays } });
        await client.query("COMMIT");
        await recordActivity({ request: req, userId: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, activityType: ACTIVITY_TYPES.SETTINGS_CHANGED, officeId, details: `Subscription payment recorded for ${subscription.office_name}.` });
        return res.status(201).json({ success: true, message: "Payment recorded and subscription activated." });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("RECORD SUBSCRIPTION PAYMENT ERROR:", error);
        return res.status(400).json({ success: false, message: error.code === "23505" ? "Payment reference already exists." : error.message || "Unable to record payment." });
    } finally { client.release(); }
}

async function updateAccess(req, res) {
    if (denyUnlessSystemAdmin(req, res)) return;
    const officeId = Number.parseInt(req.params.officeId, 10);
    const access = String(req.body?.access || "").trim().toUpperCase();
    if (!Number.isInteger(officeId) || !["ALLOWED", "RESTRICTED"].includes(access)) return res.status(400).json({ success: false, message: "Invalid access override." });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`UPDATE office_subscriptions SET manual_access_override = $2, override_reason = $3, override_changed_by = $4, override_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE office_id = $1 RETURNING id`, [officeId, access, String(req.body.reason || "").trim().slice(0, 500) || null, req.user.id]);
        if (!result.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Office subscription not found." }); }
        await writeSubscriptionAudit(client, { officeId, subscriptionId: result.rows[0].id, actorUserId: req.user.id, action: "ACCESS_OVERRIDE_CHANGED", details: { access, reason: req.body.reason || null } });
        await client.query("COMMIT");
        return res.json({ success: true, message: `Office access ${access.toLowerCase()}.` });
    } catch (error) { await client.query("ROLLBACK"); return res.status(500).json({ success: false, message: "Unable to change office access." }); }
    finally { client.release(); }
}

async function extendSubscription(req, res) {
    if (denyUnlessSystemAdmin(req, res)) return;
    const officeId = Number.parseInt(req.params.officeId, 10);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(`SELECT id, expiry_date FROM office_subscriptions WHERE office_id = $1 FOR UPDATE`, [officeId]);
        if (!current.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Office subscription not found." }); }
        const durationDays = Number.parseInt(String(req.body?.duration_days || ""), 10);
        if (!Number.isInteger(durationDays) || durationDays <= 0 || durationDays > 3650) throw new Error("Duration must be between 1 and 3650 days.");
        const base = req.body?.expiry_date ? isoDate(req.body.expiry_date, "Expiry date") : (current.rows[0].expiry_date || new Date().toISOString().slice(0, 10));
        const expiry = new Date(`${base}T00:00:00Z`);
        expiry.setUTCDate(expiry.getUTCDate() + durationDays);
        const graceDays = await getGracePeriodDays(client);
        const grace = new Date(expiry);
        grace.setUTCDate(grace.getUTCDate() + graceDays);
        await client.query(`UPDATE office_subscriptions SET expiry_date = $2, grace_period_end = $3, status = 'ACTIVE', payment_status = 'PENDING', updated_at = CURRENT_TIMESTAMP WHERE office_id = $1`, [officeId, expiry.toISOString().slice(0, 10), grace.toISOString().slice(0, 10)]);
        await writeSubscriptionAudit(client, { officeId, subscriptionId: current.rows[0].id, actorUserId: req.user.id, action: "SUBSCRIPTION_EXTENDED", details: { durationDays, expiryDate: expiry.toISOString().slice(0, 10), note: String(req.body.note || "").slice(0, 1000) } });
        await client.query("COMMIT");
        return res.json({ success: true, message: "Subscription extended. Record the payment when it is confirmed." });
    } catch (error) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: error.message || "Unable to extend subscription." }); }
    finally { client.release(); }
}

async function listPayments(req, res) {
    try {
        const officeId = Number.parseInt(req.params.officeId, 10);
        const result = await pool.query(`SELECT p.id, p.amount_pesewas, p.currency, p.payment_date, p.method, p.reference, p.note, p.status, p.transaction_timestamp, u.name AS confirmed_by FROM subscription_payments p JOIN office_subscriptions s ON s.id = p.office_subscription_id LEFT JOIN users u ON u.id = p.confirmed_by WHERE s.office_id = $1 ORDER BY p.transaction_timestamp DESC`, [officeId]);
        return res.json({ success: true, payments: result.rows.map(row => ({ ...row, amount: moneyFromPesewas(row.amount_pesewas) })) });
    } catch (error) { return res.status(500).json({ success: false, message: "Unable to load payment history." }); }
}

module.exports = { listPlans, createPlan, listSubscriptions, getOverview, recordPayment, updateAccess, extendSubscription, listPayments };
