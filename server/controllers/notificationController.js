const pool = require("../config/database");
const {
    NOTIFICATION_PRIORITIES,
    notificationPrioritySet,
    notificationTypeSet
} = require("../utils/notifications");

function parsePage(value) {
    const page = Number.parseInt(String(value || "1"), 10);
    return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseLimit(value) {
    const limit = Number.parseInt(String(value || "20"), 10);
    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20;
}

function validateFilter(value, allowed, message) {
    if (!value) return null;
    const normalized = String(value).trim().toUpperCase();
    if (!allowed.has(normalized)) throw new Error(message);
    return normalized;
}

function isClientValidationError(error) {
    return String(error?.message || "").startsWith("Invalid notification");
}

async function listNotifications(req, res) {
    try {
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const values = [req.user.id];
        const conditions = ["n.user_id = $1"];
        const type = validateFilter(req.query.type, notificationTypeSet, "Invalid notification type filter.");
        const priorityValues = String(req.query.priority || "")
            .split(",")
            .map(value => value.trim().toUpperCase())
            .filter(Boolean);
        priorityValues.forEach(value => {
            if (!notificationPrioritySet.has(value)) throw new Error("Invalid notification priority filter.");
        });

        if (String(req.query.unread || "").toLowerCase() === "true") {
            conditions.push("n.is_read = FALSE");
        }
        if (type) {
            values.push(type);
            conditions.push(`n.type = $${values.length}`);
        }
        if (priorityValues.length) {
            values.push(priorityValues);
            conditions.push(`n.priority = ANY($${values.length}::text[])`);
        }

        const whereClause = conditions.join(" AND ");
        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM notifications n WHERE ${whereClause}`,
            values
        );
        const offset = (page - 1) * limit;
        const queryValues = [...values, limit, offset];
        const result = await pool.query(
            `
                SELECT n.*
                FROM notifications n
                WHERE ${whereClause}
                ORDER BY n.created_at DESC, n.id DESC
                LIMIT $${queryValues.length - 1}
                OFFSET $${queryValues.length}
            `,
            queryValues
        );
        const total = Number(countResult.rows[0]?.total || 0);

        return res.json({
            success: true,
            notifications: result.rows,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
        });
    } catch (error) {
        if (isClientValidationError(error)) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error("LIST NOTIFICATIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load notifications." });
    }
}

async function getUnreadCount(req, res) {
    try {
        const result = await pool.query(
            "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE",
            [req.user.id]
        );
        return res.json({ success: true, unreadCount: Number(result.rows[0]?.count || 0) });
    } catch (error) {
        console.error("GET NOTIFICATION COUNT ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to load notification count." });
    }
}

async function markNotificationRead(req, res) {
    try {
        const result = await pool.query(
            `
                UPDATE notifications
                SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                WHERE id = $1 AND user_id = $2
                RETURNING *
            `,
            [req.params.id, req.user.id]
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Notification not found." });
        return res.json({ success: true, notification: result.rows[0] });
    } catch (error) {
        console.error("MARK NOTIFICATION ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to mark notification as read." });
    }
}

async function markAllNotificationsRead(req, res) {
    try {
        const result = await pool.query(
            `
                UPDATE notifications
                SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                WHERE user_id = $1 AND is_read = FALSE
            `,
            [req.user.id]
        );
        return res.json({ success: true, updated: result.rowCount });
    } catch (error) {
        console.error("MARK ALL NOTIFICATIONS ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to mark notifications as read." });
    }
}

async function deleteNotification(req, res) {
    try {
        const result = await pool.query(
            "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
            [req.params.id, req.user.id]
        );
        if (!result.rowCount) return res.status(404).json({ success: false, message: "Notification not found." });
        return res.json({ success: true, message: "Notification cleared." });
    } catch (error) {
        console.error("DELETE NOTIFICATION ERROR:", error);
        return res.status(500).json({ success: false, message: "Unable to clear notification." });
    }
}

module.exports = {
    listNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification
};
