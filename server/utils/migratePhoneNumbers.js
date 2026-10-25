/**
 * Legacy phone migration entry point intentionally disabled.
 *
 * The previous implementation updated every record immediately, changed
 * updated_at, and printed phone values. Use the reviewed root-level migration
 * instead, which is dry-run by default and updates only matched phone_number
 * values after explicit confirmation.
 */

if (require.main === module) {
    console.error(
        "This legacy migration is disabled. Run `npm run migrate:phones:dry` instead."
    );
    process.exitCode = 1;
}
