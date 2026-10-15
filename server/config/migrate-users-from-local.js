const { Pool } = require("pg");
require("dotenv").config({
    path: process.env.ENV_FILE || ".env",
    override: false
});

const env = value => typeof value === "string" ? value.trim() : value;

/**
 * One-time migration: Copy users from local database to Railway Postgres
 * Run manually when needed, then remove/disable
 */

async function migrateUsersToRailway() {
    // Local database connection (your original database)
    const localPool = new Pool({
        user: env(process.env.DB_USER),
        host: env(process.env.DB_HOST),
        database: env(process.env.DB_NAME),
        password: env(process.env.DB_PASSWORD),
        port: Number(env(process.env.DB_PORT) || 5432),
        ssl: String(process.env.DB_SSL || "").toLowerCase() === "true"
            ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
            : false
    });

    // Railway database connection
    const railwayPool = new Pool({
        connectionString: env(process.env.DATABASE_URL)
    });

    try {
        console.log("Starting user migration...");

        // Fetch all users from local database
        const localUsers = await localPool.query(
            `SELECT name, email, password, role, account_status, is_active, created_at 
             FROM users ORDER BY id`
        );

        console.log(`Found ${localUsers.rows.length} users in local database`);

        if (localUsers.rows.length === 0) {
            console.log("No users to migrate.");
            return;
        }

        // Get the default branch ID from Railway
        const defaultBranch = await railwayPool.query(
            `SELECT id FROM branches WHERE name = 'Main Office' LIMIT 1`
        );

        if (defaultBranch.rows.length === 0) {
            throw new Error("Default branch 'Main Office' not found in Railway database");
        }

        const branchId = defaultBranch.rows[0].id;

        // Insert users into Railway database
        let insertedCount = 0;
        let skippedCount = 0;

        for (const user of localUsers.rows) {
            try {
                await railwayPool.query(
                    `INSERT INTO users (name, email, password, role, branch_id, account_status, is_active, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (email) DO NOTHING`,
                    [
                        user.name,
                        user.email,
                        user.password,
                        user.role ? user.role.toLowerCase() : 'staff',
                        branchId,
                        user.account_status || 'PENDING',
                        user.is_active !== false ? true : false,
                        user.created_at || new Date()
                    ]
                );
                insertedCount++;
            } catch (error) {
                console.error(`Failed to insert user ${user.email}:`, error.message);
                skippedCount++;
            }
        }

        console.log(`Migration complete: ${insertedCount} users inserted, ${skippedCount} skipped`);

    } catch (error) {
        console.error("Migration failed:", error);
        throw error;
    } finally {
        await localPool.end();
        await railwayPool.end();
    }
}

module.exports = { migrateUsersToRailway };

