const pool = require("../server/config/database");

async function main() {
    const table = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'office_sms_configurations'`
    );
    if (!table.rowCount) throw new Error("Missing office_sms_configurations table.");

    const columns = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'office_sms_configurations'`
    );
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const required of ["office_id", "api_key_encrypted", "sender_id", "status", "last_tested_at"]) {
        if (!names.has(required)) throw new Error(`Missing ${required} in office_sms_configurations.`);
    }
    if (names.has("api_key")) throw new Error("Plaintext api_key column must not exist.");

    const unique = await pool.query(
        `SELECT 1 FROM pg_constraint
         WHERE conrelid = 'office_sms_configurations'::regclass
           AND contype = 'u'
           AND pg_get_constraintdef(oid) ILIKE '%office_id%'`
    );
    if (!unique.rowCount) throw new Error("office_sms_configurations.office_id must be unique.");

    console.log("OFFICE_SMS_SCHEMA_CHECK_OK");
}

main()
    .catch(error => {
        console.error("OFFICE_SMS_SCHEMA_CHECK_FAILED:", error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
