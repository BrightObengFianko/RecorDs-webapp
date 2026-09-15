const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({
    path: process.env.ENV_FILE || ".env",
    override: false
});

const localPool = require("../server/config/database");
const { isBcryptHash } = require("../server/utils/authSecurity");

function clean(value) {
    return typeof value === "string" ? value.trim() : value;
}

function createOnlinePool() {
    const connectionString = clean(process.env.ONLINE_DATABASE_URL);

    if (!connectionString) {
        throw new Error("ONLINE_DATABASE_URL must be configured locally and must point to Railway PostgreSQL.");
    }

    return new Pool({
        connectionString,
        max: 3,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        ssl: {
            rejectUnauthorized:
                process.env.ONLINE_DB_SSL_REJECT_UNAUTHORIZED === "true"
        }
    });
}

async function syncUsers() {
    const onlinePool = createOnlinePool();
    const dryRun = process.argv.includes("--dry-run");
    const stats = {
        inspected: 0,
        created: 0,
        skippedExisting: 0,
        skippedInvalid: 0
    };

    try {
        const localUsers = await localPool.query(
            `
                SELECT
                    u.name,
                    LOWER(u.email) AS email,
                    u.password,
                    LOWER(u.role) AS role,
                    COALESCE(u.is_active, TRUE) AS is_active,
                    UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                    COALESCE(u.auth_token_version, 0) AS auth_token_version,
                    COALESCE(b.name, 'Main Office') AS branch_name
                FROM users u
                LEFT JOIN branches b ON b.id = u.branch_id
                ORDER BY u.id ASC
            `
        );

        const client = await onlinePool.connect();

        try {
            await client.query("BEGIN");
            await client.query("SELECT pg_advisory_xact_lock($1)", [73918422]);

            for (const user of localUsers.rows) {
                stats.inspected++;

                if (
                    !user.name ||
                    !user.email ||
                    !isBcryptHash(user.password) ||
                    !["admin", "staff", "branch_staff"].includes(user.role)
                ) {
                    stats.skippedInvalid++;
                    continue;
                }

                const branch = await client.query(
                    `
                        INSERT INTO branches (name)
                        VALUES ($1)
                        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                        RETURNING id
                    `,
                    [user.branch_name || "Main Office"]
                );

                if (!dryRun) {
                    const inserted = await client.query(
                        `
                            INSERT INTO users (
                                name,
                                email,
                                password,
                                role,
                                branch_id,
                                account_status,
                                is_active,
                                auth_token_version
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            ON CONFLICT (email) DO NOTHING
                            RETURNING id
                        `,
                        [
                            user.name,
                            user.email,
                            user.password,
                            user.role,
                            branch.rows[0].id,
                            user.account_status,
                            user.is_active,
                            user.auth_token_version
                        ]
                    );

                    if (inserted.rowCount > 0) {
                        stats.created++;
                    } else {
                        stats.skippedExisting++;
                    }
                } else {
                    stats.created++;
                }
            }

            if (dryRun) {
                await client.query("ROLLBACK");
            } else {
                await client.query("COMMIT");
            }
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }

        console.log(JSON.stringify({ dryRun, ...stats }, null, 2));
    } finally {
        await onlinePool.end();
        await localPool.end();
    }
}

syncUsers().catch(error => {
    console.error(`User sync could not complete: ${error.message}`);
    process.exitCode = 1;
});
