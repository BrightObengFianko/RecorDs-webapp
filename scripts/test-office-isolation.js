const pool = require("../server/config/database");

async function assertZero(label, sql) {
    const result = await pool.query(sql);
    const count = Number(result.rows[0]?.count || 0);
    if (count !== 0) throw new Error(`${label}: expected 0, received ${count}`);
}

async function main() {
    const officeResult = await pool.query("SELECT COUNT(*)::int AS count FROM offices");
    if (Number(officeResult.rows[0]?.count || 0) < 1) throw new Error("No office exists.");

    await assertZero("branches without an office", "SELECT COUNT(*)::int AS count FROM branches WHERE office_id IS NULL");
    await assertZero("users without an office", "SELECT COUNT(*)::int AS count FROM users WHERE office_id IS NULL");
    await assertZero("records without an office", "SELECT COUNT(*)::int AS count FROM records WHERE office_id IS NULL");
    await assertZero(
        "activity logs without an office snapshot",
        "SELECT COUNT(*)::int AS count FROM auth_activity_logs WHERE office_id IS NULL AND NULLIF(TRIM(COALESCE(office_name_snapshot, '')), '') IS NULL"
    );
    await assertZero("notifications without an office", "SELECT COUNT(*)::int AS count FROM notifications WHERE office_id IS NULL");
    await assertZero(
        "records crossing branch offices",
        "SELECT COUNT(*)::int AS count FROM records r JOIN branches b ON b.id = r.branch_id WHERE r.office_id <> b.office_id"
    );
    await assertZero(
        "users crossing branch offices",
        "SELECT COUNT(*)::int AS count FROM users u JOIN branches b ON b.id = u.branch_id WHERE u.office_id <> b.office_id"
    );

    const constraints = await pool.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conname IN ('users_branch_office_fkey', 'records_branch_office_fkey')
    `);
    const names = new Set(constraints.rows.map(row => row.conname));
    for (const name of ["users_branch_office_fkey", "records_branch_office_fkey"]) {
        if (!names.has(name)) throw new Error(`Missing ${name}.`);
    }

    console.log("OFFICE_ISOLATION_CHECK_OK");
}

main()
    .catch(error => {
        console.error("OFFICE_ISOLATION_CHECK_FAILED:", error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
