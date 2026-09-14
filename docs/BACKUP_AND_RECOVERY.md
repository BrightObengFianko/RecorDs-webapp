# RecorDs Backup And Recovery

Backups must be stored outside the public web directory and outside source control. The repository ignores the local `backups/` directory, but production backups should normally use encrypted object storage or a managed PostgreSQL backup service.

## Prerequisites

- PostgreSQL client tools installed, including `pg_dump` and `pg_restore`.
- The same database environment variables used by RecorDs, or `DATABASE_URL`.
- A private backup location. Set `BACKUP_DIR` to that location in the scheduler environment.

Supported variables:

```text
DATABASE_URL=postgresql://user:password@host:5432/database
DB_HOST=
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SSL=true
BACKUP_DIR=/private/path/records-backups
PG_DUMP_BIN=pg_dump
```

Do not put real values in Git, tickets, screenshots, or logs.

## Create A Backup

From the project root:

```text
node scripts/backup-postgres.js
```

Run this at least daily, retain multiple generations, and encrypt backups at rest. The script does not place database credentials in the `pg_dump` command line. Use the operating system scheduler, Railway cron, or a managed backup service rather than running a permanent backup loop inside the web process.

## Verify A Backup

Check that the file is non-empty, then list its contents without restoring:

```text
pg_restore --list records-YYYY-MM-DDTHH-MM-SS-sssZ.dump
```

At least monthly, restore a copy into a separate temporary database and run the application migrations and smoke tests against that copy. A backup is not considered verified until it has been restored successfully.

## Restore

Stop writes to the target database, take one final backup if possible, and restore into the intended database:

```text
createdb records_restore_test
pg_restore --clean --if-exists --no-owner --dbname records_restore_test records-backup.dump
```

For a production restore, use a maintenance window, verify the restored schema and record counts, then start RecorDs with the restored connection details. Never restore an untrusted dump over the only copy of the database.

## Failure Response

1. Stop application writes or put the application in maintenance mode.
2. Preserve the failed database and logs for investigation.
3. Restore the newest verified backup into a new database first.
4. Run schema migrations and smoke tests.
5. Point `DATABASE_URL` to the restored database and restart the service.
6. Check login, branch isolation, record search, record creation, approval, and SMS state before reopening access.

## Retention

Keep daily backups for at least 14 days, weekly backups for at least 8 weeks, and monthly backups according to the organization's retention policy. Restrict backup access to administrators and encrypt both transport and storage.
