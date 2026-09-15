# Local RecorDs

The local installation uses the same Express application and the same PostgreSQL schema as the hosted system. No UI or API redesign is required: the browser calls the local server when it is opened at the local address.

## 1. Install PostgreSQL locally

Install PostgreSQL on the computer and make sure the PostgreSQL `bin` directory is available to PowerShell. Create an empty local database and user, for example:

```powershell
createdb -U postgres record_db_local
psql -U postgres -c "CREATE USER records_local WITH PASSWORD 'use-a-long-local-password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE record_db_local TO records_local;"
```

Do not use the hosted database password for the local database.

## 2. Copy the hosted data safely

The local system needs the existing `users`, `branches`, and `records` data so users can log in offline. Run these commands from a trusted machine that can access the hosted PostgreSQL database. Replace the placeholders with environment variables or your provider's connection details; do not commit them.

```powershell
pg_dump --format=custom --no-owner --no-acl --dbname="$env:ONLINE_DATABASE_URL" --file=record-backup.dump
pg_restore --clean --if-exists --no-owner --no-acl --dbname="postgresql://records_local:use-a-long-local-password@localhost:5432/record_db_local" record-backup.dump
```

If the hosted provider does not allow `pg_dump`, export the database using its supported backup tool and restore that backup into `record_db_local`.

## 3. Create `.env.local`

Copy `.env.example` to `.env.local`, then set the local database and local port. Keep the same `JWT_SECRET` as the hosted system only if users must use the same tokens; otherwise use a separate strong local secret.

Add the hosted connection for the sync command. These values are used only by `syncLocalToOnline.js`, never by browser code:

```dotenv
ENV_FILE=.env.local
DB_USER=records_local
DB_HOST=127.0.0.1
DB_NAME=record_db_local
DB_PASSWORD=use-a-long-local-password
DB_PORT=5432
PORT=5001
JWT_SECRET=replace-with-a-long-local-secret-at-least-32-characters

ONLINE_DATABASE_URL=postgresql://online_sync_user:password@host:5432/online_database
ONLINE_DB_SSL=true
ONLINE_DB_SSL_REJECT_UNAUTHORIZED=true
SYNC_BATCH_SIZE=100
```

Use a restricted online database user for synchronization. It needs access only to the `branches` and `records` tables required by the sync process. Never put `ONLINE_DATABASE_URL` in frontend files or commit `.env.local`.

## 4. Start the local app offline

```powershell
$env:ENV_FILE = ".env.local"
node server.js
```

Open `http://127.0.0.1:5001`. The existing login, dashboard, record, search, account, SMS, and reports pages use the same UI and routes, but connect to the local PostgreSQL database.

## 5. Synchronize local records when internet returns

First run a safe preview. It does not insert, update, or mark records as synced:

```powershell
$env:ENV_FILE = ".env.local"
node syncLocalToOnline.js --dry-run
```

If the preview shows the expected branch and record counts, run the actual sync:

```powershell
$env:ENV_FILE = ".env.local"
node syncLocalToOnline.js
```

## 6. Copy local login accounts to Railway

The record sync does not copy users. To migrate existing local accounts, set
`ONLINE_DATABASE_URL` to the Railway PostgreSQL connection string in the local
environment file, then run a preview:

```powershell
$env:ENV_FILE = ".env.local"
node scripts/sync-users-to-online.js --dry-run
```

If the preview is correct, run:

```powershell
$env:ENV_FILE = ".env.local"
node scripts/sync-users-to-online.js
```

This copies bcrypt password hashes and account metadata, never plaintext
passwords. Existing Railway users are not overwritten; matching emails are
skipped.

Run it again after a connection interruption. UUID matching makes retries idempotent. Existing records with no UUID are matched by category, name, dates, registration date, and branch. A mismatch is recorded as a conflict and is not overwritten automatically.

## Sync behavior and permissions

- New records use a UUID and are inserted once into the online database.
- The existing backend `client_uuid` unique index prevents duplicate inserts.
- Local edits update an online record only when the local `updated_at` is newer.
- If both copies changed, the sync marks a conflict and leaves the online copy unchanged.
- A missing online branch is a conflict; the sync never moves a record to another branch.
- Local authentication and role checks remain the existing ADMIN, STAFF, and BRANCH_STAFF checks.
- Branch staff records retain their branch and existing `Processing` behavior.
- SMS sending remains disabled by loss of internet; it can run through the existing workflow after the online system is available.

## Optional browser offline queue

The existing IndexedDB queue remains available for a browser that loses connectivity while the local server is unavailable. New record submissions now receive a UUID and are queued only on network failure. When the page's existing sync hook runs after reconnection, it posts the record to the current server and removes it only after a successful response.
