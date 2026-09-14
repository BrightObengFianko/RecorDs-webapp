/**
 * Google Sheets -> PostgreSQL Status Sync
 *
 * Syncs status from TWO Google Spreadsheets into PostgreSQL.
 *
 * Usage:
 *   node migrateGoogleSheets.js --status-only
 *
 * Requirements:
 * - .env with database credentials
 * - service-account.json
 * - Both Google Sheets shared with the service account email
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { Pool } = require("pg");

const { ensureDatabaseSchema } = require("./server/config/migrate");
const { getDefaultBranchId } = require("./server/utils/branchUtils");

// =====================================================
// GOOGLE SPREADSHEETS
// =====================================================

const GOOGLE_SHEET_IDS = [
    {
        name: "GOOGLE SHEET 1",
        id: "1MSug6yHkGEX-L6rvKs-Kmu_TvRu998--Tc9iq5YJWPk",
    },
    {
        name: "GOOGLE SHEET 2",
        id: "1T1C0jRiNCwEJff51qLSl3qE2wIaLNqkj1M3RlPParIU",
    },
];

// =====================================================
// CONFIGURATION
// =====================================================

const SERVICE_ACCOUNT_PATH =
    process.env.SERVICE_ACCOUNT_PATH || "./service-account.json";

const GOOGLE_APPLICATION_CREDENTIALS_PATH =
    process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : null;

const RESOLVED_SERVICE_ACCOUNT_PATH =
    path.resolve(SERVICE_ACCOUNT_PATH);

const STATUS_ONLY =
    process.argv.includes("--status-only");

// =====================================================
// COLUMN POSITIONS
// 0-based indexes
// =====================================================

const COLUMNS = {
    DATE: 0,          // A = Registration Date
    NAME: 1,          // B = Name
    DOB: 2,           // C = Date of Birth
    PHONE: 3,         // D = Phone
    STATUS: 4,        // E = STATUS  <-- YOUR NEW STATUS COLUMN
    REGISTRAR: 5,     // F = Registrar
    SMS_SENT: 7,      // H = SMS Sent
    SMS_DATE: 8,      // I = SMS Date
};

// =====================================================
// DEFAULT TABS
// =====================================================

const DEFAULT_SHEET_TABS = [
    "S-HOT",
    "EXPRESS",
    "STANDARD",
    "M-BIRTH",
    "SEARCH",
    "CORRECTION",
    "DEATH",
    "DELETION",
];

// =====================================================
// DATABASE
// =====================================================

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    connectionTimeoutMillis: 5000,
});

// =====================================================
// SERVICE ACCOUNT
// =====================================================

function resolveServiceAccountPath() {

    if (fs.existsSync(RESOLVED_SERVICE_ACCOUNT_PATH)) {
        return RESOLVED_SERVICE_ACCOUNT_PATH;
    }

    if (
        GOOGLE_APPLICATION_CREDENTIALS_PATH &&
        fs.existsSync(GOOGLE_APPLICATION_CREDENTIALS_PATH)
    ) {
        return GOOGLE_APPLICATION_CREDENTIALS_PATH;
    }

    return null;
}

// =====================================================
// DATE FUNCTIONS
// =====================================================

function googleSerialToIsoDate(serial) {

    if (
        serial === null ||
        serial === undefined ||
        serial === ""
    ) {
        return null;
    }

    const numericSerial =
        typeof serial === "number"
            ? serial
            : Number(serial);

    if (!Number.isFinite(numericSerial)) {
        return null;
    }

    const utcMilliseconds =
        Math.round(
            (numericSerial - 25569) *
            86400 *
            1000
        );

    const date =
        new Date(utcMilliseconds);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}

function buildIsoDate(year, month, day) {

    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);

    if (
        !Number.isInteger(yearNumber) ||
        !Number.isInteger(monthNumber) ||
        !Number.isInteger(dayNumber)
    ) {
        return null;
    }

    if (
        monthNumber < 1 ||
        monthNumber > 12 ||
        dayNumber < 1 ||
        dayNumber > 31
    ) {
        return null;
    }

    const date =
        new Date(
            Date.UTC(
                yearNumber,
                monthNumber - 1,
                dayNumber
            )
        );

    if (
        date.getUTCFullYear() !== yearNumber ||
        date.getUTCMonth() !== monthNumber - 1 ||
        date.getUTCDate() !== dayNumber
    ) {
        return null;
    }

    return [
        String(yearNumber).padStart(4, "0"),
        String(monthNumber).padStart(2, "0"),
        String(dayNumber).padStart(2, "0"),
    ].join("-");
}

function parseDate(dateValue) {

    if (
        dateValue === null ||
        dateValue === undefined ||
        dateValue === ""
    ) {
        return null;
    }

    if (dateValue instanceof Date) {

        if (Number.isNaN(dateValue.getTime())) {
            return null;
        }

        return dateValue
            .toISOString()
            .slice(0, 10);
    }

    if (typeof dateValue === "number") {
        return googleSerialToIsoDate(dateValue);
    }

    const input =
        String(dateValue).trim();

    if (!input) {
        return null;
    }

    // Google serial number
    if (/^\d+(\.\d+)?$/.test(input)) {

        const serialDate =
            googleSerialToIsoDate(input);

        if (serialDate) {
            return serialDate;
        }
    }

    // YYYY-MM-DD or YYYY/MM/DD
    const yearFirstMatch =
        input.match(
            /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
        );

    if (yearFirstMatch) {

        const [
            ,
            year,
            month,
            day,
        ] = yearFirstMatch;

        const direct =
            buildIsoDate(
                year,
                month,
                day
            );

        if (direct) {
            return direct;
        }

        const swapped =
            buildIsoDate(
                year,
                day,
                month
            );

        if (swapped) {
            return swapped;
        }
    }

    // DD-MM-YYYY or DD/MM/YYYY
    const slashMatch =
        input.match(
            /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
        );

    if (slashMatch) {

        const [
            ,
            day,
            month,
            year,
        ] = slashMatch;

        return buildIsoDate(
            year,
            month,
            day
        );
    }

    // 05TH JANUARY 2026
    // 5th January 2026
    const textMatch =
        input.match(
            /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)\s+(\d{4})$/i
        );

    if (textMatch) {

        const [
            ,
            day,
            month,
            year,
        ] = textMatch;

        const monthMap = {
            january: "01",
            february: "02",
            march: "03",
            april: "04",
            may: "05",
            june: "06",
            july: "07",
            august: "08",
            september: "09",
            october: "10",
            november: "11",
            december: "12",
        };

        const m =
            monthMap[
                month.toLowerCase()
            ];

        if (!m) {
            return null;
        }

        const d =
            String(day).padStart(2, "0");

        return `${year}-${m}-${d}`;
    }

    return null;
}

// =====================================================
// PHONE
// =====================================================

function cleanPhoneNumber(phone) {

    if (
        phone === null ||
        phone === undefined ||
        phone === ""
    ) {
        return null;
    }

    const rawPhone =
        String(phone).trim();

    if (!rawPhone) {
        return null;
    }

    let cleaned =
        rawPhone.replace(
            /[\s+\-()]/g,
            ""
        );

    if (cleaned.startsWith("0")) {
        cleaned =
            "233" +
            cleaned.substring(1);
    }

    if (/^\d+$/.test(cleaned)) {
        return cleaned;
    }

    return null;
}

// =====================================================
// STATUS
// =====================================================

function normalizeStatusValue(value) {

    const status =
        String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");

    if (!status) {
        return "Pending";
    }

    if (
        status.includes("not ready") ||
        status === "notready" ||
        status === "unready"
    ) {
        return "Not Ready";
    }

    if (
        status === "ready" ||
        status.includes("ready")
    ) {
        return "Ready";
    }

    if (status === "pending") {
        return "Pending";
    }

    if (
        [
            "approved",
            "active",
            "done",
            "completed",
            "complete",
        ].includes(status)
    ) {
        return "Ready";
    }

    if (
        [
            "declined",
            "rejected",
            "closed",
            "cancelled",
            "canceled",
        ].includes(status)
    ) {
        return "Not Ready";
    }

    return "Pending";
}

// =====================================================
// SMS
// =====================================================

function normalizeSmsSentValue(value) {

    return [
        true,
        "true",
        "TRUE",
        "t",
        "T",
        "yes",
        "YES",
        "y",
        "Y",
        1,
        "1",
    ].includes(value);
}

// =====================================================
// TIMESTAMP
// =====================================================

function parseTimestamp(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    if (value instanceof Date) {

        if (Number.isNaN(value.getTime())) {
            return null;
        }

        return value.toISOString();
    }

    if (typeof value === "number") {

        const isoDate =
            googleSerialToIsoDate(value);

        return isoDate
            ? `${isoDate}T00:00:00.000Z`
            : null;
    }

    const input =
        String(value).trim();

    if (!input) {
        return null;
    }

    if (/^\d+(\.\d+)?$/.test(input)) {

        const isoDate =
            googleSerialToIsoDate(input);

        return isoDate
            ? `${isoDate}T00:00:00.000Z`
            : null;
    }

    const date =
        new Date(input);

    if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
    }

    const parsedDate =
        parseDate(input);

    return parsedDate
        ? `${parsedDate}T00:00:00.000Z`
        : null;
}

// =====================================================
// VALID DATE
// =====================================================

function isValidDate(dateString) {

    if (
        !dateString ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ) {
        return false;
    }

    const [
        year,
        month,
        day,
    ] = dateString.split("-");

    return (
        buildIsoDate(
            year,
            month,
            day
        ) === dateString
    );
}

// =====================================================
// BRANCH
// =====================================================

async function resolveBranchId(client) {

    const envBranchId =
        Number.parseInt(
            process.env.DEFAULT_BRANCH_ID || "",
            10
        );

    if (
        Number.isInteger(envBranchId) &&
        envBranchId > 0
    ) {

        const result =
            await client.query(
                `
                SELECT id
                FROM branches
                WHERE id = $1
                LIMIT 1
                `,
                [envBranchId]
            );

        if (result.rowCount > 0) {
            return envBranchId;
        }
    }

    const defaultBranchId =
        await getDefaultBranchId();

    if (defaultBranchId) {
        return defaultBranchId;
    }

    throw new Error(
        "Unable to determine default branch."
    );
}

// =====================================================
// GET TABS FROM A GOOGLE SHEET
// =====================================================

async function getSpreadsheetTabs(
    sheets,
    spreadsheetId
) {

    const response =
        await sheets.spreadsheets.get({
            spreadsheetId,
        });

    const tabs =
        (response.data.sheets || [])
            .map(
                sheet =>
                    sheet.properties || {}
            )
            .filter(
                properties =>
                    properties.title &&
                    !properties.hidden
            )
            .map(
                properties =>
                    properties.title
            );

    return tabs.length > 0
        ? tabs
        : DEFAULT_SHEET_TABS;
}

// =====================================================
// FIND MATCHING RECORD
// =====================================================

async function findMatchingRecord(
    client,
    category,
    name,
    dateOfBirth,
    phoneNumber,
    registrationDate,
    branchId
) {

    const result =
        await client.query(
            `
            SELECT id
            FROM records
            WHERE category = $1
              AND name = $2
              AND date_of_birth IS NOT DISTINCT FROM $3
              AND phone_number IS NOT DISTINCT FROM $4
              AND registration_date IS NOT DISTINCT FROM $5
              AND branch_id = $6
            LIMIT 1
            `,
            [
                category,
                name,
                dateOfBirth,
                phoneNumber,
                registrationDate,
                branchId,
            ]
        );

    return result.rows[0] || null;
}

// =====================================================
// UPDATE STATUS
// =====================================================

async function updateRecordStatus(
    client,
    recordId,
    status
) {

    return client.query(
        `
        UPDATE records
        SET status = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id
        `,
        [
            normalizeStatusValue(status),
            recordId,
        ]
    );
}

// =====================================================
// PROCESS ONE TAB
// =====================================================

async function processSheet(
    client,
    sheets,
    spreadsheetId,
    spreadsheetName,
    sheetName,
    category,
    branchId
) {

    console.log("");
    console.log(
        `📋 ${spreadsheetName} -> ${sheetName}`
    );

    try {

        const response =
            await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:I`,
            });

        const rows =
            response.data.values || [];

        if (rows.length === 0) {

            console.log(
                "  ⚠️ Sheet is empty"
            );

            return {
                read: 0,
                updated: 0,
                skipped: 0,
                notFound: 0,
                errors: 0,
            };
        }

        let lastValidDate = null;

        const stats = {
            read: 0,
            updated: 0,
            skipped: 0,
            notFound: 0,
            errors: 0,
        };

        for (
            let i = 0;
            i < rows.length;
            i++
        ) {

            const row = rows[i];

            // ==========================================
            // REGISTRATION DATE
            // ==========================================

            if (
                row[COLUMNS.DATE] &&
                String(
                    row[COLUMNS.DATE]
                ).trim()
            ) {

                const parsed =
                    parseDate(
                        row[COLUMNS.DATE]
                    );

                if (
                    parsed &&
                    isValidDate(parsed)
                ) {
                    lastValidDate = parsed;
                }
            }

            // ==========================================
            // NAME
            // ==========================================

            if (
                !row[COLUMNS.NAME] ||
                !String(
                    row[COLUMNS.NAME]
                ).trim()
            ) {
                continue;
            }

            stats.read++;

            try {

                await client.query(
                    "SAVEPOINT row_import"
                );

                const name =
                    String(
                        row[COLUMNS.NAME]
                    ).trim();

                const dateOfBirth =
                    row[COLUMNS.DOB]
                        ? parseDate(
                              row[COLUMNS.DOB]
                          )
                        : null;

                const phoneNumber =
                    row[COLUMNS.PHONE]
                        ? cleanPhoneNumber(
                              row[COLUMNS.PHONE]
                          )
                        : null;

                const registrationDate =
                    lastValidDate;

                // ======================================
                // IMPORTANT:
                // STATUS IS NOW COLUMN E
                // ======================================

                const rawStatus =
                    row[COLUMNS.STATUS]
                        ? String(
                              row[COLUMNS.STATUS]
                          ).trim()
                        : "";

                const status =
                    rawStatus || "Pending";

                // ======================================
                // VALIDATION
                // ======================================

                if (!registrationDate) {

                    console.log(
                        `    ⚠️ Skipped: "${name}" - no registration date found`
                    );

                    stats.skipped++;

                    await client.query(
                        "RELEASE SAVEPOINT row_import"
                    );

                    continue;
                }

                // ======================================
                // STATUS ONLY MODE
                // ======================================

                if (STATUS_ONLY) {

                    if (!rawStatus) {

                        console.log(
                            `    ⚠️ Skipped: "${name}" - no status found`
                        );

                        stats.skipped++;

                        await client.query(
                            "RELEASE SAVEPOINT row_import"
                        );

                        continue;
                    }

                    const matchedRecord =
                        await findMatchingRecord(
                            client,
                            category,
                            name,
                            dateOfBirth,
                            phoneNumber,
                            registrationDate,
                            branchId
                        );

                    if (!matchedRecord) {

                        console.log(
                            `    ⚠️ Skipped: "${name}" - matching record not found`
                        );

                        stats.notFound++;

                        await client.query(
                            "RELEASE SAVEPOINT row_import"
                        );

                        continue;
                    }

                    await updateRecordStatus(
                        client,
                        matchedRecord.id,
                        status
                    );

                    await client.query(
                        "RELEASE SAVEPOINT row_import"
                    );

                    stats.updated++;

                    console.log(
                        `    ✅ Updated: "${name}" -> ${normalizeStatusValue(status)}`
                    );

                    continue;
                }

                await client.query(
                    "RELEASE SAVEPOINT row_import"
                );

            } catch (error) {

                try {
                    await client.query(
                        "ROLLBACK TO SAVEPOINT row_import"
                    );
                } catch (rollbackError) {
                    console.error(
                        "Rollback failed:",
                        rollbackError.message
                    );
                }

                try {
                    await client.query(
                        "RELEASE SAVEPOINT row_import"
                    );
                } catch (releaseError) {
                    // Ignore
                }

                console.error(
                    `    ❌ Error processing row ${i + 1}: ${error.message}`
                );

                stats.errors++;
            }
        }

        return stats;

    } catch (error) {

        console.error(
            `❌ Error processing ${sheetName}:`,
            error.message
        );

        return {
            read: 0,
            updated: 0,
            skipped: 0,
            notFound: 0,
            errors: 1,
        };
    }
}

// =====================================================
// PROCESS ONE GOOGLE SPREADSHEET
// =====================================================

async function processSpreadsheet(
    client,
    sheets,
    spreadsheet
) {

    console.log("");
    console.log(
        "============================================================"
    );

    console.log(
        `📗 PROCESSING ${spreadsheet.name}`
    );

    console.log(
        `ID: ${spreadsheet.id}`
    );

    console.log(
        "============================================================"
    );

    const tabs =
        await getSpreadsheetTabs(
            sheets,
            spreadsheet.id
        );

    console.log(
        `📑 Tabs found: ${tabs.join(", ")}`
    );

    const branchId =
        await resolveBranchId(client);

    const totals = {
        read: 0,
        updated: 0,
        skipped: 0,
        notFound: 0,
        errors: 0,
    };

    for (const sheetTab of tabs) {

        try {

            await client.query(
                "BEGIN"
            );

            const stats =
                await processSheet(
                    client,
                    sheets,
                    spreadsheet.id,
                    spreadsheet.name,
                    sheetTab,
                    sheetTab,
                    branchId
                );

            await client.query(
                "COMMIT"
            );

            totals.read += stats.read;
            totals.updated += stats.updated;
            totals.skipped += stats.skipped;
            totals.notFound += stats.notFound;
            totals.errors += stats.errors;

            console.log(
                `  📊 ${sheetTab}: Read ${stats.read} | Updated ${stats.updated} | Skipped ${stats.skipped} | Not Found ${stats.notFound} | Errors ${stats.errors}`
            );

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch (rollbackError) {
                // Ignore
            }

            console.error(
                `❌ Transaction failed for ${sheetTab}:`,
                error.message
            );

            totals.errors++;
        }
    }

    console.log("");
    console.log(
        `✅ ${spreadsheet.name} COMPLETE`
    );

    console.log(
        `   Read:       ${totals.read}`
    );

    console.log(
        `   Updated:    ${totals.updated}`
    );

    console.log(
        `   Skipped:    ${totals.skipped}`
    );

    console.log(
        `   Not Found:  ${totals.notFound}`
    );

    console.log(
        `   Errors:     ${totals.errors}`
    );

    return totals;
}

// =====================================================
// MAIN
// =====================================================

async function migrate() {

    console.log("");
    console.log(
        "🚀 STARTING GOOGLE SHEETS STATUS SYNC"
    );

    console.log(
        "============================================================"
    );

    console.log(
        `📚 Google Spreadsheets: ${GOOGLE_SHEET_IDS.length}`
    );

    console.log(
        `📌 STATUS COLUMN: E`
    );

    console.log(
        `📌 STATUS INDEX: ${COLUMNS.STATUS}`
    );

    console.log(
        "============================================================"
    );

    if (!STATUS_ONLY) {

        console.log("");
        console.log(
            "⚠️ IMPORTANT:"
        );

        console.log(
            "Run this script with --status-only to update statuses."
        );

        console.log(
            "Example: node migrateGoogleSheets.js --status-only"
        );

        return;
    }

    let client = null;

    try {

        // ==========================================
        // SERVICE ACCOUNT
        // ==========================================

        console.log(
            "🔐 Checking Google service account..."
        );

        const serviceAccountPath =
            resolveServiceAccountPath();

        if (!serviceAccountPath) {

            throw new Error(
                `Could not find service account file: ${SERVICE_ACCOUNT_PATH}`
            );
        }

        console.log(
            "✅ Google service account found."
        );

        // ==========================================
        // DATABASE
        // ==========================================

        console.log(
            "🗄️ Preparing database schema..."
        );

        await ensureDatabaseSchema();

        console.log(
            "✅ Database schema ready."
        );

        // ==========================================
        // GOOGLE AUTH
        // ==========================================

        const auth =
            new google.auth.GoogleAuth({
                keyFile:
                    serviceAccountPath,

                scopes: [
                    "https://www.googleapis.com/auth/spreadsheets.readonly",
                ],
            });

        const sheets =
            google.sheets({
                version: "v4",
                auth,
            });

        // ==========================================
        // CONNECT DATABASE
        // ==========================================

        client =
            await pool.connect();

        console.log(
            "✅ Connected to PostgreSQL."
        );

        // ==========================================
        // TOTALS
        // ==========================================

        const allStats = {
            read: 0,
            updated: 0,
            skipped: 0,
            notFound: 0,
            errors: 0,
        };

        // ==========================================
        // PROCESS BOTH GOOGLE SHEETS
        // ==========================================

        for (
            const spreadsheet
            of GOOGLE_SHEET_IDS
        ) {

            const stats =
                await processSpreadsheet(
                    client,
                    sheets,
                    spreadsheet
                );

            allStats.read +=
                stats.read;

            allStats.updated +=
                stats.updated;

            allStats.skipped +=
                stats.skipped;

            allStats.notFound +=
                stats.notFound;

            allStats.errors +=
                stats.errors;
        }

        // ==========================================
        // FINAL SUMMARY
        // ==========================================

        console.log("");
        console.log(
            "============================================================"
        );

        console.log(
            "📊 FINAL STATUS SYNC SUMMARY"
        );

        console.log(
            "============================================================"
        );

        console.log(
            `Google Sheets processed: ${GOOGLE_SHEET_IDS.length}`
        );

        console.log(
            `Total records read:      ${allStats.read}`
        );

        console.log(
            `Successfully updated:    ${allStats.updated} ✅`
        );

        console.log(
            `Skipped:                 ${allStats.skipped}`
        );

        console.log(
            `Not found:               ${allStats.notFound}`
        );

        console.log(
            `Errors:                  ${allStats.errors}`
        );

        console.log(
            "============================================================"
        );

        if (allStats.errors === 0) {

            console.log(
                "✅ STATUS SYNC COMPLETED SUCCESSFULLY!"
            );

        } else {

            console.log(
                `⚠️ STATUS SYNC COMPLETED WITH ${allStats.errors} ERROR(S).`
            );
        }

    } catch (error) {

        console.error("");
        console.error(
            "❌ STATUS SYNC FAILED:"
        );

        console.error(
            error.message
        );

    } finally {

        if (client) {
            client.release();
        }

        await pool.end();
    }
}

// =====================================================
// RUN
// =====================================================

migrate()
    .catch(error => {

        console.error(
            "❌ Unexpected error:",
            error
        );

        process.exit(1);
    });