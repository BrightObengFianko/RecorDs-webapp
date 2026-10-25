const assert = require("node:assert/strict");
const pool = require("../server/config/database");
const { lockStaffAccountQuota } = require("../server/utils/staffQuota");

async function main() {
    const officeResult = await pool.query(`
        SELECT o.id,
               COUNT(u.id)::int AS used
        FROM offices o
        LEFT JOIN users u
          ON u.office_id = o.id
         AND LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '-', '_'), ' ', '_'))
             NOT IN ('system_super_admin', 'super_admin')
        GROUP BY o.id
        HAVING COUNT(u.id) > 0
        ORDER BY o.id
        LIMIT 1
    `);

    if (!officeResult.rowCount) {
        console.log("STAFF_QUOTA_CHECK_SKIPPED_NO_COUNTED_ACCOUNTS");
        return;
    }

    const { id: officeId, used } = officeResult.rows[0];
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("UPDATE offices SET staff_account_limit = $1 WHERE id = $2", [used, officeId]);
        await assert.rejects(
            () => lockStaffAccountQuota(client, officeId, "staff"),
            error => error.code === "STAFF_QUOTA_EXCEEDED"
        );
        await client.query("ROLLBACK");

        await client.query("BEGIN");
        await client.query("UPDATE offices SET staff_account_limit = $1 WHERE id = $2", [used + 1, officeId]);
        const quota = await lockStaffAccountQuota(client, officeId, "staff");
        assert.equal(quota.used, used);
        await client.query("ROLLBACK");
        console.log("STAFF_QUOTA_CHECK_OK");
    } finally {
        client.release();
    }
}

main()
    .catch(error => {
        console.error("STAFF_QUOTA_CHECK_FAILED:", error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
