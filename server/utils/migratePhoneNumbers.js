/**
 * Database Migration: Format all phone numbers to Ghana format (233...)
 * 
 * This script updates all existing phone numbers in the records table to start with 233.
 * Examples:
 * - 0501234567 → 233501234567
 * - +233501234567 → 233501234567
 * - Already 233501234567 → 233501234567 (no change)
 * 
 * Usage: node server/utils/migratePhoneNumbers.js
 */

require("dotenv").config();
const { Pool } = require("pg");

// Database connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
});

/**
 * Formats a phone number to Ghana format (233...)
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Convert to string and remove all non-digits
    let cleaned = String(phone).replace(/\D/g, "");

    // If empty after cleaning, return null
    if (!cleaned) return null;

    // Remove leading zeros (Ghana phone format)
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    }

    // If already has country code, return as is
    if (cleaned.startsWith("233")) {
        return cleaned;
    }

    // Add country code
    return "233" + cleaned;
}

async function migratePhoneNumbers() {
    try {
        console.log("🚀 Starting phone number migration...\n");

        // Get all records with phone numbers
        const result = await pool.query(
            "SELECT id, phone_number FROM records WHERE phone_number IS NOT NULL"
        );

        const records = result.rows;
        console.log(`📋 Found ${records.length} records with phone numbers\n`);

        if (records.length === 0) {
            console.log("✅ No records to update\n");
            await pool.end();
            return;
        }

        let updated = 0;
        let unchanged = 0;
        let errors = 0;

        // Process each record
        for (const record of records) {
            try {
                const formatted = formatPhoneNumber(record.phone_number);

                // If phone number is the same, skip
                if (formatted === record.phone_number) {
                    unchanged++;
                    continue;
                }

                // Update the database
                await pool.query(
                    "UPDATE records SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
                    [formatted, record.id]
                );

                updated++;
                console.log(
                    `  ✅ ID ${record.id}: ${record.phone_number} → ${formatted}`
                );
            } catch (error) {
                errors++;
                console.error(
                    `  ❌ ID ${record.id}: Error - ${error.message}`
                );
            }
        }

        // Print summary
        console.log("\n" + "=".repeat(60));
        console.log("📊 MIGRATION SUMMARY");
        console.log("=".repeat(60));
        console.log(`Total records:    ${records.length}`);
        console.log(`Updated:          ${updated} ✅`);
        console.log(`Unchanged:        ${unchanged}`);
        console.log(`Errors:           ${errors}`);
        console.log("=".repeat(60));

        if (errors === 0) {
            console.log("✅ Migration completed successfully!\n");
        } else {
            console.log(`⚠️  Migration completed with ${errors} error(s)\n`);
        }

        await pool.end();
    } catch (error) {
        console.error("❌ Migration failed:", error);
        await pool.end();
        process.exit(1);
    }
}

// Run the migration
migratePhoneNumbers();
