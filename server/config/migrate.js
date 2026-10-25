const pool = require("./database");

const DEFAULT_BRANCH_NAME = "Main Office";
// Existing offices receive this non-destructive default on first migration.
const DEFAULT_STAFF_ACCOUNT_LIMIT = 50;
const DEFAULT_OFFICE = {
    name: "Kasoa",
    code: "KASOA"
};

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
            CREATE TABLE IF NOT EXISTS offices (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                code VARCHAR(50) NOT NULL,
                description TEXT,
                address VARCHAR(255),
                phone VARCHAR(40),
                email VARCHAR(150),
                logo_url VARCHAR(500),
                primary_color VARCHAR(30),
                secondary_color VARCHAR(30),
                dashboard_title VARCHAR(150),
                n8n_webhook_url VARCHAR(500),
                n8n_webhook_secret TEXT,
                n8n_timeout_ms INTEGER DEFAULT 10000,
                sms_sender_id VARCHAR(50),
                status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT offices_status_check CHECK (status IN ('ACTIVE', 'DISABLED'))
            )
        `
    );

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS offices_code_unique_idx
            ON offices (LOWER(code))
        `
    );

    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS offices_name_unique_idx
            ON offices (LOWER(name))
        `
    );

    await pool.query(`
        ALTER TABLE offices
            ADD COLUMN IF NOT EXISTS n8n_webhook_url VARCHAR(500),
            ADD COLUMN IF NOT EXISTS n8n_webhook_secret TEXT,
            ADD COLUMN IF NOT EXISTS n8n_timeout_ms INTEGER DEFAULT 10000,
            ADD COLUMN IF NOT EXISTS sms_sender_id VARCHAR(50)
    `);

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS office_sms_configurations (
                id SERIAL PRIMARY KEY,
                office_id INTEGER NOT NULL UNIQUE,
                provider VARCHAR(30) NOT NULL DEFAULT 'ARKESEL',
                api_key_encrypted TEXT,
                sender_id VARCHAR(50),
                status VARCHAR(30) NOT NULL DEFAULT 'NOT_CONFIGURED',
                last_tested_at TIMESTAMP,
                last_error_code VARCHAR(80),
                last_error_message TEXT,
                last_balance TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT office_sms_configurations_provider_check CHECK (provider IN ('ARKESEL')),
                CONSTRAINT office_sms_configurations_status_check CHECK (status IN ('NOT_CONFIGURED', 'PENDING_VERIFICATION', 'ACTIVE', 'ERROR', 'DISCONNECTED')),
                CONSTRAINT office_sms_configurations_office_id_fkey FOREIGN KEY (office_id)
                    REFERENCES offices(id) ON UPDATE CASCADE ON DELETE CASCADE
            )
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS office_sms_usage (
                id BIGSERIAL PRIMARY KEY,
                office_id INTEGER NOT NULL,
                record_id INTEGER,
                provider VARCHAR(30) NOT NULL DEFAULT 'ARKESEL',
                provider_message_id VARCHAR(200),
                occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(40) NOT NULL,
                segments INTEGER,
                error_code VARCHAR(80),
                error_message TEXT,
                CONSTRAINT office_sms_usage_office_id_fkey FOREIGN KEY (office_id)
                    REFERENCES offices(id) ON UPDATE CASCADE ON DELETE CASCADE
            )
        `
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_office_sms_usage_office_time ON office_sms_usage(office_id, occurred_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_office_sms_usage_record ON office_sms_usage(record_id)`);

    await pool.query(
        `ALTER TABLE offices
         ADD COLUMN IF NOT EXISTS staff_account_limit INTEGER NOT NULL DEFAULT ${DEFAULT_STAFF_ACCOUNT_LIMIT}`
    );
    await pool.query(
        `ALTER TABLE offices
         ADD CONSTRAINT offices_staff_account_limit_check
         CHECK (staff_account_limit > 0)`
    ).catch(error => {
        if (error.code !== "42710") throw error;
    });

    await pool.query(
        `
            INSERT INTO offices (name, code, dashboard_title)
            VALUES ($1, $2, $1)
            ON CONFLICT DO NOTHING
        `,
        [DEFAULT_OFFICE.name, DEFAULT_OFFICE.code]
    );

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
            ALTER TABLE branches
            ADD COLUMN IF NOT EXISTS office_id INTEGER
        `
    );

    const defaultOffice = await pool.query(
        `SELECT id FROM offices WHERE LOWER(code) = LOWER($1) LIMIT 1`,
        [DEFAULT_OFFICE.code]
    );
    const defaultOfficeId = defaultOffice.rows[0]?.id;
    if (!defaultOfficeId) {
        throw new Error("Unable to create default office.");
    }

    await pool.query(
        `
            INSERT INTO branches (name, office_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `,
        [DEFAULT_BRANCH_NAME, defaultOfficeId]
    );

    await pool.query(
        `UPDATE branches SET office_id = $1 WHERE office_id IS NULL`,
        [defaultOfficeId]
    );
    await pool.query(`ALTER TABLE branches ALTER COLUMN office_id SET NOT NULL`);
    await pool.query(`ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_name_key`);
    await pool.query(
        `
            CREATE UNIQUE INDEX IF NOT EXISTS branches_office_name_unique_idx
            ON branches (office_id, LOWER(name))
        `
    );
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS branches_id_office_unique_idx ON branches(id, office_id)`);
    if (!(await constraintExists("branches", "branches_office_id_fkey"))) {
        await pool.query(
            `
                ALTER TABLE branches
                ADD CONSTRAINT branches_office_id_fkey
                FOREIGN KEY (office_id) REFERENCES offices(id)
                ON UPDATE CASCADE ON DELETE RESTRICT
            `
        );
    }

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
            ADD COLUMN IF NOT EXISTS office_id INTEGER
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
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS max_devices INTEGER
            DEFAULT 2
        `
    );

    await pool.query(
        `
            UPDATE users
            SET max_devices = 2
            WHERE max_devices IS NULL OR max_devices < 1
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN max_devices SET DEFAULT 2
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN max_devices SET NOT NULL
        `
    );

    await pool.query(
        `
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'users_max_devices_check'
                ) THEN
                    ALTER TABLE users
                    ADD CONSTRAINT users_max_devices_check CHECK (max_devices >= 1);
                END IF;
            END $$;
        `
    );

    await pool.query(
        `
            CREATE TABLE IF NOT EXISTS user_sessions (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                session_id VARCHAR(128) NOT NULL UNIQUE,
                device_id VARCHAR(128) NOT NULL,
                device_name VARCHAR(100) NOT NULL DEFAULT 'Unknown device',
                device_type VARCHAR(30) NOT NULL DEFAULT 'Desktop',
                browser VARCHAR(80) NOT NULL DEFAULT 'Unknown browser',
                operating_system VARCHAR(80) NOT NULL DEFAULT 'Unknown',
                ip_address VARCHAR(64),
                user_agent VARCHAR(500),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP,
                revoked_by INTEGER,
                revocation_reason VARCHAR(200),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                CONSTRAINT user_sessions_user_id_fkey
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE,
                CONSTRAINT user_sessions_revoked_by_fkey
                    FOREIGN KEY (revoked_by)
                    REFERENCES users(id)
                    ON UPDATE CASCADE
                    ON DELETE SET NULL
            )
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_user_sessions_active_user
            ON user_sessions(user_id, is_active, expires_at)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_user_sessions_device
            ON user_sessions(user_id, device_id, is_active)
        `
    );

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active
            ON user_sessions(last_active_at DESC)
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
            ADD COLUMN IF NOT EXISTS office_id INTEGER
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
            ADD COLUMN IF NOT EXISTS sms_error_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS sms_last_response JSONB,
            ADD COLUMN IF NOT EXISTS sms_last_attempt_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS sms_last_attempt_by INTEGER
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
            UPDATE users u
            SET branch_id = (
                SELECT b.id
                FROM branches b
                WHERE b.office_id = u.office_id
                ORDER BY b.id ASC
                LIMIT 1
            )
            WHERE u.branch_id IS NULL
              AND LOWER(REPLACE(REPLACE(COALESCE(u.role, ''), '_', ' '), '-', ' ')) = 'branch staff'
        `
    );

    await pool.query(
        `
            UPDATE users u
            SET office_id = b.office_id
            FROM branches b
            WHERE b.id = u.branch_id
              AND u.office_id IS NULL
        `
    );

    await pool.query(
        `
            UPDATE users
            SET office_id = $1
            WHERE office_id IS NULL
        `,
        [defaultOfficeId]
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
            UPDATE records r
            SET office_id = b.office_id
            FROM branches b
            WHERE b.id = r.branch_id
              AND r.office_id IS NULL
        `
    );

    await pool.query(
        `
            UPDATE records
            SET office_id = $1
            WHERE office_id IS NULL
        `,
        [defaultOfficeId]
    );

    // Repair legacy records using a branch from the record's own office.
    // The old global default could create invalid pairs such as branch 1
    // from Kasoa with an Ofankor office_id.
    await pool.query(
        `
            UPDATE records r
            SET branch_id = (
                SELECT b.id
                FROM branches b
                WHERE b.office_id = r.office_id
                ORDER BY b.id ASC
                LIMIT 1
            )
            WHERE r.branch_id IS NULL
               OR NOT EXISTS (
                    SELECT 1
                    FROM branches matching_branch
                    WHERE matching_branch.id = r.branch_id
                      AND matching_branch.office_id = r.office_id
               )
        `
    );

    await pool.query(
        `
            ALTER TABLE users
            ALTER COLUMN branch_id DROP NOT NULL
        `
    );

    await pool.query(`ALTER TABLE users ALTER COLUMN office_id SET NOT NULL`);

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

    // Office-level Staff/Admin accounts may create records without a branch.
    // Branch Staff records remain branch-scoped in the controller.
    await pool.query(
        `
            ALTER TABLE records
            ALTER COLUMN branch_id DROP NOT NULL
        `
    );

    await pool.query(`ALTER TABLE records ALTER COLUMN office_id SET NOT NULL`);

    if (!(await constraintExists("users", "users_role_check"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_role_check
                CHECK (
                    LOWER(role) IN ('admin', 'office_admin', 'system_super_admin', 'staff', 'branch_staff')
                )
            `
        );
    }

    const roleConstraint = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_role_check' LIMIT 1`
    );
    if (roleConstraint.rowCount && !roleConstraint.rows[0].definition.toLowerCase().includes("office_admin")) {
        await pool.query(`ALTER TABLE users DROP CONSTRAINT users_role_check`);
        await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (LOWER(role) IN ('admin', 'office_admin', 'system_super_admin', 'staff', 'branch_staff'))`);
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

    if (!(await constraintExists("users", "users_office_id_fkey"))) {
        await pool.query(
            `
                ALTER TABLE users
                ADD CONSTRAINT users_office_id_fkey
                FOREIGN KEY (office_id) REFERENCES offices(id)
                ON UPDATE CASCADE ON DELETE RESTRICT
            `
        );
    }

    if (!(await constraintExists("records", "records_office_id_fkey"))) {
        await pool.query(
            `
                ALTER TABLE records
                ADD CONSTRAINT records_office_id_fkey
                FOREIGN KEY (office_id) REFERENCES offices(id)
                ON UPDATE CASCADE ON DELETE RESTRICT
            `
        );
    }
    if (!(await constraintExists("users", "users_branch_office_fkey"))) {
        await pool.query(`ALTER TABLE users ADD CONSTRAINT users_branch_office_fkey FOREIGN KEY (branch_id, office_id) REFERENCES branches(id, office_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
    }
    if (!(await constraintExists("records", "records_branch_office_fkey"))) {
        await pool.query(`ALTER TABLE records ADD CONSTRAINT records_branch_office_fkey FOREIGN KEY (branch_id, office_id) REFERENCES branches(id, office_id) ON UPDATE CASCADE ON DELETE RESTRICT`);
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
            ,ADD COLUMN IF NOT EXISTS office_id INTEGER
        `
    );

    await pool.query(
        `
            UPDATE auth_activity_logs l
            SET office_id = COALESCE(
                (SELECT u.office_id FROM users u WHERE u.id = l.user_id),
                (SELECT b.office_id FROM branches b WHERE b.id = l.branch_id),
                $1
            )
            WHERE l.office_id IS NULL
        `,
        [defaultOfficeId]
    );
    await pool.query(
        `UPDATE auth_activity_logs SET office_id = $1 WHERE office_id IS NULL`,
        [defaultOfficeId]
    );
    await pool.query(`ALTER TABLE auth_activity_logs ALTER COLUMN office_id SET NOT NULL`);
    // Deleted offices retain their audit history without a live office FK.
    await pool.query(`ALTER TABLE auth_activity_logs ADD COLUMN IF NOT EXISTS office_name_snapshot VARCHAR(150)`);
    await pool.query(
        `UPDATE auth_activity_logs
         SET office_name_snapshot = 'Deleted office (legacy audit)'
         WHERE office_id IS NULL
           AND NULLIF(TRIM(COALESCE(office_name_snapshot, '')), '') IS NULL`
    );
    await pool.query(`ALTER TABLE auth_activity_logs ALTER COLUMN office_id DROP NOT NULL`);
    await pool.query(`ALTER TABLE auth_activity_logs DROP CONSTRAINT IF EXISTS auth_activity_logs_office_id_fkey`);
    await pool.query(`ALTER TABLE auth_activity_logs ADD CONSTRAINT auth_activity_logs_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON UPDATE CASCADE ON DELETE SET NULL`);

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
                office_id INTEGER NOT NULL,
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
                ,ADD COLUMN IF NOT EXISTS office_id INTEGER
        `
    );

    await pool.query(
        `
            UPDATE notifications n
            SET office_id = COALESCE(
                (SELECT u.office_id FROM users u WHERE u.id = n.user_id),
                (SELECT r.office_id FROM records r WHERE r.id = n.record_id),
                (SELECT b.office_id FROM branches b WHERE b.id = n.branch_id),
                $1
            )
            WHERE n.office_id IS NULL
        `,
        [defaultOfficeId]
    );
    await pool.query(`UPDATE notifications SET office_id = $1 WHERE office_id IS NULL`, [defaultOfficeId]);
    await pool.query(`ALTER TABLE notifications ALTER COLUMN office_id SET NOT NULL`);
    if (!(await constraintExists("auth_activity_logs", "auth_activity_logs_office_id_fkey"))) {
        await pool.query(`ALTER TABLE auth_activity_logs ADD CONSTRAINT auth_activity_logs_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT`);
    }
    if (!(await constraintExists("notifications", "notifications_office_id_fkey"))) {
        await pool.query(`ALTER TABLE notifications ADD CONSTRAINT notifications_office_id_fkey FOREIGN KEY (office_id) REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT`);
    }

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
            CREATE INDEX IF NOT EXISTS idx_notifications_active_attention
            ON notifications(user_id, is_active, type, created_at DESC)
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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_office_id ON users(office_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_branches_office_id ON branches(office_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_records_office_id ON records(office_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_records_office_branch ON records(office_id, branch_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_records_office_registration_date ON records(office_id, registration_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auth_activity_logs_office_id ON auth_activity_logs(office_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_office_id ON notifications(office_id)`);

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

    await pool.query(
        `
            CREATE INDEX IF NOT EXISTS idx_records_sms_last_attempt_by
            ON records(sms_last_attempt_by)
        `
    );
}

module.exports = {
    DEFAULT_BRANCH_NAME,
    ensureDatabaseSchema
};
