const pool = require("./database");

const DEFAULT_BRANCH_NAME = "Main Office";

async function constraintExists(tableName, constraintName) {
    const result = await pool.query(
        `
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = $1
              AND c.conname = $2
            LIMIT 1
        `,
        [tableName, constraintName]
    );

    return result.rowCount > 0;
}

async function ensureDatabaseSchema() {
    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS branches (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `
    );

    await pool.query(
        `
            INSERT INTO branches (name)
            VALUES ($1)
            ON CONFLICT (name) DO NOTHING
        `,
        [DEFAULT_BRANCH_NAME]
    );

    // Bootstrap the legacy tables when deploying against a new empty database.
    // Existing tables and records are preserved by IF NOT EXISTS.
    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'staff',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                category VARCHAR(100),
                name VARCHAR(150) NOT NULL,
                date_of_birth DATE,
                date_of_death DATE,
                registration_date TIMESTAMP,
                phone_number VARCHAR(30),
                registrar VARCHAR(150),
                status VARCHAR(20) DEFAULT 'Pending',
                sms_sent VARCHAR(20),
                sms_date TIMESTAMP,
                sms_status VARCHAR(20),
                sms_error TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS branch_id INTEGER
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS account_status VARCHAR(20)
            DEFAULT 'PENDING'
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS auth_token_version INTEGER
            DEFAULT 0
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS account_settings JSONB NOT NULL
            DEFAULT '{}'::jsonb
        `
    );

    await pool.query(
        `
            UPDATE users
            SET auth_token_version = COALESCE(auth_token_version, 0)
            WHERE auth_token_version IS NULL
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN auth_token_version SET DEFAULT 0
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN auth_token_version SET NOT NULL
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS branch_id INTEGER
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS created_by INTEGER
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS sms_sent VARCHAR(20)
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS sms_date TIMESTAMP
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS sms_status VARCHAR(20)
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS sms_error TEXT
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ADD COLUMN IF NOT EXISTS client_uuid UUID
        `
    );

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS records_client_uuid_unique_idx
            ON records (client_uuid)
            WHERE client_uuid IS NOT NULL
        `
    );

    await pool.query(
        `
            UPDATE users
            SET role = LOWER(role)
            WHERE role IS NOT NULL
        `
    );

    await pool.query(
        `
            UPDATE users
            SET account_status = 'APPROVED'
            WHERE LOWER(role) = 'admin'
        `
    );

    const defaultBranch = await pool.query(
        `
            SELECT id
            FROM branches
            WHERE name = $1
            LIMIT 1
        `,
        [DEFAULT_BRANCH_NAME]
    );

    const defaultBranchId =
        defaultBranch.rows[0] &&
        defaultBranch.rows[0].id;

    if (!defaultBranchId) {
        throw new Error("Unable to create default branch.");
    }

    await pool.query(
        `
            UPDATE users
            SET branch_id = $1
            WHERE branch_id IS NULL
        `,
        [defaultBranchId]
    );

    await pool.query(
        `
            UPDATE users
            SET is_active = COALESCE(is_active, TRUE)
            WHERE is_active IS NULL
        `
    );

    await pool.query(
        `
            UPDATE records
            SET branch_id = $1
            WHERE branch_id IS NULL
        `,
        [defaultBranchId]
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN branch_id SET NOT NULL
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN is_active SET DEFAULT TRUE
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN account_status SET DEFAULT 'PENDING'
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN is_active SET NOT NULL
        `
    );

    await pool.query(
        `
            ALTER TABLE records
            ALTER COLUMN branch_id SET NOT NULL
        `
    );

    if (!(await constraintExists("users", "users_role_check"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_role_check
                CHECK (
                    LOWER(role) IN ('admin', 'staff', 'branch_staff')
                )
            `
        );
    }

    if (!(await constraintExists("users", "users_account_status_check"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_account_status_check
                CHECK (
                    account_status IS NULL
                    OR LOWER(account_status) IN ('pending', 'approved', 'declined')
                )
            `
        );
    }

    if (!(await constraintExists("users", "users_password_bcrypt_check"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_password_bcrypt_check
                CHECK (
                    password ~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$'
                )
                NOT VALID
            `
        );
    }

    if (!(await constraintExists("users", "users_branch_id_fkey"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_branch_id_fkey
                FOREIGN KEY (branch_id)
                REFERENCES branches(id)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
            `
        );
    }

    if (!(await constraintExists("records", "records_branch_id_fkey"))) {
        await pool.query(
            `
                ALTER TABLE records
                ADD CONSTRAINT records_branch_id_fkey
                FOREIGN KEY (branch_id)
                REFERENCES branches(id)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
            `
        );
    }

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS auth_activity_logs (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER,
                user_name VARCHAR(100),
                user_email VARCHAR(150),
                user_role VARCHAR(20),
                activity_type VARCHAR(30) NOT NULL,
                occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT auth_activity_logs_user_id_fkey
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON UPDATE CASCADE
                    ON DELETE SET NULL
            )
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS security_audit_logs (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER,
                user_role VARCHAR(20),
                method VARCHAR(10) NOT NULL,
                path VARCHAR(500) NOT NULL,
                status_code INTEGER NOT NULL,
                occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT security_audit_logs_user_id_fkey
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON UPDATE CASCADE
                    ON DELETE SET NULL
            )
        `
    );

    await pool.query(
        `
            ALTER TABLE auth_activity_logs
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
            ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500),
            ADD COLUMN IF NOT EXISTS branch_id INTEGER,
            ADD COLUMN IF NOT EXISTS branch_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS record_id INTEGER,
            ADD COLUMN IF NOT EXISTS affected_user_id INTEGER,
            ADD COLUMN IF NOT EXISTS affected_user_name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS details TEXT,
            ADD COLUMN IF NOT EXISTS previous_value TEXT,
            ADD COLUMN IF NOT EXISTS new_value TEXT,
            ADD COLUMN IF NOT EXISTS record_snapshot JSONB,
            ADD COLUMN IF NOT EXISTS change_set JSONB,
            ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT TRUE
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                code_hash VARCHAR(64) NOT NULL,
                reset_token_hash VARCHAR(64),
                expires_at TIMESTAMP NOT NULL,
                verified_at TIMESTAMP,
                used_at TIMESTAMP,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                request_ip VARCHAR(64),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT password_reset_tokens_user_id_fkey
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE
            )
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
            ON password_reset_tokens(user_id)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_code_hash
            ON password_reset_tokens(code_hash)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
            ON password_reset_tokens(expires_at)
        `
    );

    // Preserve creator ownership for existing records when the audit trail
    // identifies who originally created them. Never overwrite a known value.
    await pool.query(
        `
            UPDATE records r
            SET created_by = activity.user_id
            FROM (
                SELECT DISTINCT ON (record_id)
                    record_id,
                    user_id
                FROM auth_activity_logs
                WHERE activity_type = 'RECORD_CREATED'
                  AND record_id IS NOT NULL
                  AND user_id IS NOT NULL
                ORDER BY record_id, occurred_at ASC, id ASC
            ) AS activity
            WHERE r.id = activity.record_id
              AND r.created_by IS NULL
        `
    );

    await pool.query(
        `
            ALTER TABLE security_audit_logs
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
            ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500)
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS notifications (
                id BIGSERIAL PRIMARY KEY,
                type VARCHAR(60) NOT NULL,
                title VARCHAR(200) NOT NULL,
                message TEXT NOT NULL,
                priority VARCHAR(20) NOT NULL DEFAULT 'INFO',
                user_id INTEGER NOT NULL,
                record_id INTEGER,
                branch_id INTEGER,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP,
                metadata JSONB DEFAULT '{}'::jsonb,
                grouping_key VARCHAR(200),
                group_count INTEGER NOT NULL DEFAULT 1,
                last_event_at TIMESTAMP,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                resolved_at TIMESTAMP,
                group_window_minutes INTEGER,
                CONSTRAINT notifications_priority_check
                    CHECK (priority IN ('CRITICAL', 'IMPORTANT', 'INFO')),
                CONSTRAINT notifications_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON UPDATE CASCADE ON DELETE CASCADE,
                CONSTRAINT notifications_record_id_fkey
                    FOREIGN KEY (record_id) REFERENCES records(id)
                    ON UPDATE CASCADE ON DELETE SET NULL,
                CONSTRAINT notifications_branch_id_fkey
                    FOREIGN KEY (branch_id) REFERENCES branches(id)
                    ON UPDATE CASCADE ON DELETE SET NULL
            )
        `
    );

    await pool.query(
        `
            ALTER TABLE notifications
                ADD COLUMN IF NOT EXISTS grouping_key VARCHAR(200),
                ADD COLUMN IF NOT EXISTS group_count INTEGER NOT NULL DEFAULT 1,
                ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
                ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS group_window_minutes INTEGER
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id
            ON notifications(user_id)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_notifications_created_at
            ON notifications(created_at DESC)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_notifications_priority
            ON notifications(priority)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_notifications_type
            ON notifications(type)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_notifications_unread_user
            ON notifications(user_id, is_read, created_at DESC)
        `
    );

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_unique
            ON notifications(user_id, type, (metadata->>'event_id'))
            WHERE metadata ? 'event_id'
        `
    );

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_group_unique
            ON notifications(user_id, type, priority, grouping_key)
            WHERE grouping_key IS NOT NULL
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_security_audit_logs_occurred_at
            ON security_audit_logs(occurred_at DESC)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_occurred_at
            ON auth_activity_logs(occurred_at DESC)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_activity_type
            ON auth_activity_logs(activity_type)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_branch_id
            ON auth_activity_logs(branch_id)
        `
    );

    // Processing is the initial status for records submitted by branch staff.
    // Extend the existing constraint without changing any stored records.
    const recordsStatusConstraint = await pool.query(
        `
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'records'::regclass
              AND conname = 'records_status_check'
            LIMIT 1
        `
    );

    if (
        recordsStatusConstraint.rowCount > 0 &&
        !recordsStatusConstraint.rows[0].definition
            .toLowerCase()
            .includes("processing")
    ) {
        await pool.query(
            `
                ALTER TABLE records
                DROP CONSTRAINT records_status_check
            `
        );

        await pool.query(
            `
                ALTER TABLE records
                ADD CONSTRAINT records_status_check
                CHECK (
                    status IS NULL
                    OR status IN ('Pending', 'Ready', 'Not Ready', 'Processing')
                )
            `
        );
    }

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS idx_records_client_uuid
            ON records(client_uuid)
            WHERE client_uuid IS NOT NULL
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_users_branch_id
            ON users(branch_id)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_branch_id
            ON records(branch_id)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_created_by
            ON records(created_by)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_status
            ON records(status)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_registration_date
            ON records(registration_date)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_branch_registration_date
            ON records(branch_id, registration_date)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_registrar
            ON records(registrar)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_sms_pending
            ON records(status, sms_sent)
            WHERE sms_sent IS DISTINCT FROM 'true'
        `
    );
}

module.exports = {
    DEFAULT_BRANCH_NAME,
    ensureDatabaseSchema
};
