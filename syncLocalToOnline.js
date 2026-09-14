/**
 * Uploads records created or edited in the local PostgreSQL database to the
 * hosted PostgreSQL database. This is intentionally a CLI operation so the
 * online database credentials never reach the browser or the local API.
 *
 * Usage:
 *   ENV_FILE=.env.local node syncLocalToOnline.js --dry-run
 *   ENV_FILE=.env.local node syncLocalToOnline.js
 */

const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({
    path: process.env.ENV_FILE || ".env"
});

const { ensureDatabaseSchema } = require("./server/config/migrate");
const localPool = require("./server/config/database");

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = Math.max(
    1,
    Number.parseInt(
        process.env.SYNC_BATCH_SIZE || "100",
        10
    ) || 100
);

const RECORD_FIELDS = [
    "category",
    "name",
    "date_of_birth",
    "date_of_death",
    "phone_number",
    "registrar",
    "registration_date",
    "status",
    "sms_sent",
    "sms_date",
    "sms_status",
    "sms_error",
    "notes",
    "branch_id"
];

function env(value) {
    return typeof value === "string"
        ? value.trim()
        : value;
}

function createPool(prefix) {
    const connectionString = env(
        process.env[`${prefix}_DATABASE_URL`]
    );

    const sslEnabled =
        process.env[`${prefix}_DB_SSL`] === "true" ||
        Boolean(connectionString && process.env[`${prefix}_DB_SSL`]);

    const config = connectionString
        ? { connectionString }
        : {
            user: env(process.env[`${prefix}_DB_USER`]),
            host: env(process.env[`${prefix}_DB_HOST`]),
            database: env(process.env[`${prefix}_DB_NAME`]),
            password: env(process.env[`${prefix}_DB_PASSWORD`]),
            port: Number(env(process.env[`${prefix}_DB_PORT`] || "5432"))
        };

    return new Pool({
        ...config,
        max: 5,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        ssl: sslEnabled
            ? {
                rejectUnauthorized:
                    process.env[`${prefix}_DB_SSL_REJECT_UNAUTHORIZED`] !== "false"
            }
            : undefined
    });
}

const onlinePool = createPool("ONLINE");

function valueKey(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }

    return value === null || value === undefined
        ? null
        : String(value);
}

function recordsMatch(left, right) {
    return RECORD_FIELDS.every(
        field => valueKey(left[field]) === valueKey(right[field])
    );
}

function localRecordIsNewer(localRecord, onlineRecord) {
    const localTime = new Date(localRecord.updated_at || 0).getTime();
    const onlineTime = new Date(onlineRecord.updated_at || 0).getTime();

    return Number.isFinite(localTime) && localTime > onlineTime;
}

async function ensureSyncStateTable() {
    await localPool.query(
        `
            CREATE TABLE IF NOT EXISTS local_record_sync_state (
                client_uuid UUID PRIMARY KEY,
                local_record_id INTEGER NOT NULL,
                online_record_id INTEGER,
                state VARCHAR(20) NOT NULL,
                last_error TEXT,
                synced_at TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `
    );

    await localPool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_local_record_sync_state_state
            ON local_record_sync_state(state)
        `
    );
}

async function saveSyncState(record, state, onlineRecordId, errorMessage) {
    if (DRY_RUN) {
        return;
    }

    await localPool.query(
        `
            INSERT INTO local_record_sync_state
                (client_uuid, local_record_id, online_record_id, state,
                 last_error, synced_at, updated_at)
            VALUES ($1, $2, $3, $4, $5,
                    CASE WHEN $4 = 'synced' THEN CURRENT_TIMESTAMP ELSE NULL END,
                    CURRENT_TIMESTAMP)
            ON CONFLICT (client_uuid)
            DO UPDATE SET
                local_record_id = EXCLUDED.local_record_id,
                online_record_id = EXCLUDED.online_record_id,
                state = EXCLUDED.state,
                last_error = EXCLUDED.last_error,
                synced_at = EXCLUDED.synced_at,
                updated_at = CURRENT_TIMESTAMP
        `,
        [
            record.client_uuid,
            record.id,
            onlineRecordId || null,
            state,
            errorMessage || null
        ]
    );
}

async function getPendingRecords() {
    const result = await localPool.query(
        `
            SELECT r.*
            FROM records r
            LEFT JOIN local_record_sync_state s
                ON s.client_uuid = r.client_uuid
            WHERE r.client_uuid IS NOT NULL
              AND (s.state IS NULL OR s.state = 'pending')
            ORDER BY r.updated_at ASC NULLS FIRST, r.id ASC
            LIMIT $1
        `,
        [LIMIT]
    );

    return result.rows;
}

async function findOnlineRecord(localRecord) {
    const byUuid = await onlinePool.query(
        `
            SELECT *
            FROM records
            WHERE client_uuid = $1
            LIMIT 1
        `,
        [localRecord.client_uuid]
    );

    if (byUuid.rows[0]) {
        return byUuid.rows[0];
    }

    const legacyMatch = await onlinePool.query(
        `
            SELECT *
            FROM records
            WHERE category = $1
              AND name = $2
              AND date_of_birth IS NOT DISTINCT FROM $3
              AND date_of_death IS NOT DISTINCT FROM $4
              AND registration_date IS NOT DISTINCT FROM $5
              AND branch_id = $6
            LIMIT 1
        `,
        [
            localRecord.category,
            localRecord.name,
            localRecord.date_of_birth,
            localRecord.date_of_death,
            localRecord.registration_date,
            localRecord.branch_id
        ]
    );

    return legacyMatch.rows[0] || null;
}

async function verifyBranch(localRecord) {
    const result = await onlinePool.query(
        `
            SELECT id
            FROM branches
            WHERE id = $1
            LIMIT 1
        `,
        [localRecord.branch_id]
    );

    return result.rowCount > 0;
}

async function insertOnlineRecord(record) {
    const columns = [
        ...RECORD_FIELDS,
        "client_uuid",
        "created_at",
        "updated_at"
    ];

    const values = columns.map(
        field => record[field] === undefined ? null : record[field]
    );

    const placeholders = columns.map(
        (_, index) => `$${index + 1}`
    );

    const result = await onlinePool.query(
        `
            INSERT INTO records (${columns.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING id
        `,
        values
    );

    return result.rows[0];
}

async function updateOnlineRecord(localRecord, onlineRecord) {
    const values = RECORD_FIELDS.map(
        field => localRecord[field] === undefined ? null : localRecord[field]
    );

    values.push(localRecord.updated_at || new Date());
    values.push(onlineRecord.id);

    const assignments = RECORD_FIELDS.map(
        (field, index) => `${field} = $${index + 1}`
    );

    assignments.push("updated_at = $15");

    const result = await onlinePool.query(
        `
            UPDATE records
            SET ${assignments.join(", ")}
            WHERE id = $16
            RETURNING id
        `,
        values
    );

    return result.rows[0];
}

async function processRecord(record, stats) {
    if (!(await verifyBranch(record))) {
        stats.conflicts++;
        await saveSyncState(
            record,
            "conflict",
            null,
            "The local branch does not exist in the online database."
        );
        return;
    }

    const onlineRecord = await findOnlineRecord(record);

    if (!onlineRecord) {
        if (!DRY_RUN) {
            const inserted = await insertOnlineRecord(record);
            await saveSyncState(record, "synced", inserted.id, null);
        }

        stats.created++;
        return;
    }

    if (recordsMatch(record, onlineRecord)) {
        await saveSyncState(record, "synced", onlineRecord.id, null);
        stats.alreadySynced++;
        return;
    }

    if (!localRecordIsNewer(record, onlineRecord)) {
        stats.conflicts++;
        await saveSyncState(
            record,
            "conflict",
            onlineRecord.id,
            "Both local and online records changed; no overwrite was performed."
        );
        return;
    }

    if (!DRY_RUN) {
        await updateOnlineRecord(record, onlineRecord);
        await saveSyncState(record, "synced", onlineRecord.id, null);
    }

    stats.updated++;
}

async function main() {
    const stats = {
        inspected: 0,
        created: 0,
        updated: 0,
        alreadySynced: 0,
        conflicts: 0,
        errors: 0
    };

    let lockAcquired = false;

    try {
        await ensureDatabaseSchema();
        await ensureSyncStateTable();

        await localPool.query(
            "SELECT pg_advisory_lock(81420301)"
        );
        lockAcquired = true;

        let records;

        do {
            records = await getPendingRecords();
            const beforeProcessed =
                stats.created +
                stats.updated +
                stats.alreadySynced +
                stats.conflicts;

            for (const record of records) {
                stats.inspected++;

                try {
                    await processRecord(record, stats);
                } catch (error) {
                    stats.errors++;
                    await saveSyncState(
                        record,
                        "pending",
                        null,
                        "Sync failed for this record. Retry after checking the connection."
                    );
                    console.error(`Record ${record.id} was not synced.`);
                }
            }
            const afterProcessed =
                stats.created +
                stats.updated +
                stats.alreadySynced +
                stats.conflicts;

            if (
                !DRY_RUN &&
                records.length === LIMIT &&
                afterProcessed === beforeProcessed
            ) {
                break;
            }
        } while (!DRY_RUN && records.length === LIMIT);

        console.log(JSON.stringify({
            dryRun: DRY_RUN,
            batchSize: LIMIT,
            ...stats
        }, null, 2));

        if (stats.conflicts > 0) {
            process.exitCode = 2;
        }
    } catch (error) {
        console.error("Local-to-online sync could not complete.");
        process.exitCode = 1;
    } finally {
        if (lockAcquired) {
            await localPool.query(
                "SELECT pg_advisory_unlock(81420301)"
            ).catch(() => {});
        }

        await onlinePool.end().catch(() => {});
        await localPool.end().catch(() => {});
    }
}

main();
