const DEFAULT_STAFF_ACCOUNT_LIMIT = 50;

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function countsTowardStaffLimit(role) {
    return !["system_super_admin", "super_admin"].includes(normalizeRole(role));
}

async function lockStaffAccountQuota(client, officeId, role, { existingCountsInOffice = false } = {}) {
    const officeResult = await client.query(
        `SELECT id, COALESCE(staff_account_limit, $2)::int AS staff_account_limit
         FROM offices
         WHERE id = $1
         FOR UPDATE`,
        [officeId, DEFAULT_STAFF_ACCOUNT_LIMIT]
    );

    if (!officeResult.rowCount) {
        const error = new Error("Office not found.");
        error.code = "OFFICE_NOT_FOUND";
        throw error;
    }

    const limit = Number(officeResult.rows[0].staff_account_limit);
    const usageResult = await client.query(
        `
            SELECT COUNT(*)::int AS used
            FROM users
            WHERE office_id = $1
              AND LOWER(REPLACE(REPLACE(COALESCE(role, ''), '-', '_'), ' ', '_'))
                  NOT IN ('system_super_admin', 'super_admin')
        `,
        [officeId]
    );
    const used = Number(usageResult.rows[0]?.used || 0);
    const additionalAccount = countsTowardStaffLimit(role) && !existingCountsInOffice ? 1 : 0;

    if (additionalAccount > 0 && used + additionalAccount > limit) {
        const error = new Error(`This office has reached its staff account limit of ${limit}.`);
        error.code = "STAFF_QUOTA_EXCEEDED";
        error.officeId = officeId;
        error.limit = limit;
        error.used = used;
        throw error;
    }

    return { limit, used, remaining: Math.max(0, limit - used - additionalAccount) };
}

module.exports = {
    DEFAULT_STAFF_ACCOUNT_LIMIT,
    countsTowardStaffLimit,
    lockStaffAccountQuota
};
