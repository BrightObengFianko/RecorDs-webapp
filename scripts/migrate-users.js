#!/usr/bin/env node

/**
 * Run this script locally to migrate users from your local database to Railway
 * Usage: node scripts/migrate-users.js
 */

require("dotenv").config({
    path: process.env.ENV_FILE || ".env",
    override: false
});

const { migrateUsersToRailway } = require("../server/config/migrate-users-from-local");

migrateUsersToRailway()
    .then(() => {
        console.log("✅ Migration successful!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    });

