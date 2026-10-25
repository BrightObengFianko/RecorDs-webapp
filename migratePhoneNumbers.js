/**
 * Safe Google Sheets -> PostgreSQL phone-number-only migration.
 *
 * This script never inserts records and never changes fields other than
 * records.phone_number. It defaults to a dry run.
 *
 * Usage:
 *   node migratePhoneNumbers.js --dry-run
 *   node migratePhoneNumbers.js --apply --confirm-phone-only
 */

require("dotenv").config({
    path: process.env.ENV_FILE || ".env",
    override: false
});

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");
const pool = require("./server/config/database");

const SPREADSHEETS = [
    {
        name: "GOOGLE SHEET 1",
        id: "1MSug6yHkGEX-L6rvKs-Kmu_TvRu998--Tc9iq5YJWPk"
    },
    {
        name: "GOOGLE SHEET 2",
        id: "1T1C0jRiNCwEJff51qLSl3qE2wIaLNqkj1M3RlPParIU"
    }
];

const SUPPORTED_TABS = ["Express", "Standard", "M-Birth", "Search", "Correction"];
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes("--confirm-phone-only");
const DRY_RUN = !APPLY;
const SERVICE_ACCOUNT_PATH = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH || "./service-account.json"
);
const MAX_SAMPLE_COUNT = 10;

function normalizeText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function buildIsoDate(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value).trim())) {
        const serial = Number(value);
        if (Number.isFinite(serial)) {
            const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
            if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
        }
    }

    const text = String(value).trim();
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return buildIsoDate(iso[1], iso[2], iso[3]);
    const dayFirst = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dayFirst) return buildIsoDate(dayFirst[3], dayFirst[2], dayFirst[1]);
    return null;
}

function cleanPhone(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return { value: null, reason: "empty" };

    // The source may contain multiple numbers. Only use the first one.
    const first = raw.split("/")[0].trim();
    let digits = first.replace(/[\s+\-().]/g, "");
    if (!/^\d+$/.test(digits)) return { value: null, reason: "invalid" };

    const canonical = digits.startsWith("233") && digits.length === 12
        ? digits
        : digits.length === 10 && digits.startsWith("0")
            ? `233${digits.slice(1)}`
            : digits.length === 9 && !digits.startsWith("0")
                ? `233${digits}`
                : null;

    return canonical
        ? { value: digits, comparisonValue: canonical, reason: null, multiple: raw.includes("/") }
        : { value: null, comparisonValue: null, reason: "invalid", multiple: raw.includes("/") };
}

function columnLabel(index) {
    let value = Number(index) + 1;
    let label = "";
    while (value > 0) {
        const remainder = (value - 1) % 26;
        label = String.fromCharCode(65 + remainder) + label;
        value = Math.floor((value - 1) / 26);
    }
    return label;
}

function maskPhone(value) {
    const text = String(value || "");
    if (text.length <= 4) return "****";
    return `${text.slice(0, 3)}${"*".repeat(Math.max(2, text.length - 5))}${text.slice(-2)}`;
}

function findHeaderIndexes(row) {
    const indexes = {};
    row.forEach((value, index) => {
        const header = normalizeHeader(value);
        if (!header) return;
        if (indexes.name === undefined && /^(name|customer name|full name)$/.test(header)) indexes.name = index;
        if (indexes.phone === undefined && /phone|mobile|telephone|contact/.test(header)) indexes.phone = index;
        if (indexes.registrationDate === undefined && /registration|registered|record date/.test(header)) indexes.registrationDate = index;
        if (indexes.dateOfBirth === undefined && /date of birth|birth date|dob/.test(header)) indexes.dateOfBirth = index;
        if (indexes.id === undefined && /^(id|record id|case id|record number|case number)$/.test(header)) indexes.id = index;
    });
    return indexes.name !== undefined && indexes.phone !== undefined ? indexes : null;
}

function getColumnIndexes(rows) {
    const headerIndexes = findHeaderIndexes(rows[0] || []);
    if (headerIndexes) {
        return {
            indexes: {
                registrationDate: 0,
                name: 1,
                dateOfBirth: 2,
                phone: 3,
                ...headerIndexes
            },
            start: 1
        };
    }
    return {
        indexes: { registrationDate: 0, name: 1, dateOfBirth: 2, phone: 3 },
        start: 0
    };
}

function quoteSheetTitle(title) {
    return `'${String(title).replace(/'/g, "''")}'`;
}

function resolveServiceAccount() {
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        throw new Error(`Google service account file not found: ${SERVICE_ACCOUNT_PATH}`);
    }
    return SERVICE_ACCOUNT_PATH;
}

async function getSupportedTabs(sheets, spreadsheetId) {
    const response = await sheets.spreadsheets.get({ spreadsheetId });
    const available = new Map((response.data.sheets || [])
        .map(sheet => sheet.properties)
        .filter(properties => properties && properties.title)
        .map(properties => [normalizeText(properties.title), properties.title]));
    return SUPPORTED_TABS
        .map(tab => available.get(normalizeText(tab)))
        .filter(Boolean);
}

async function readTab(sheets, spreadsheetId, title) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${quoteSheetTitle(title)}!A:Z`,
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER"
    });
    return response.data.values || [];
}

function sourceCategory(tabName) {
    return normalizeText(tabName);
}

function createStats() {
    return {
        rowsExamined: 0,
        matched: 0,
        changed: 0,
        alreadyCorrect: 0,
        unmatched: 0,
        ambiguous: 0,
        invalidOrEmpty: 0,
        errors: 0,
        multipleNumberRows: 0,
        phoneColumns: new Set(),
        samples: []
    };
}

async function loadDatabaseRecords(client) {
    const result = await client.query(`
        SELECT id, category, name, date_of_birth, date_of_death,
               registration_date, phone_number
        FROM records
    `);
    return result.rows;
}

function datePart(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function getCandidates(records, source) {
    if (source.recordId) {
        const idMatches = records.filter(record =>
            String(record.id) === source.recordId &&
            normalizeText(record.category) === source.category &&
            normalizeText(record.name) === normalizeText(source.name)
        );
        return idMatches;
    }

    const sourceDate = source.category.includes("death") ? null : source.dateOfBirth;
    const sourceDeathDate = source.category.includes("death") ? source.dateOfBirth : null;
    return records.filter(record =>
        normalizeText(record.category) === source.category &&
        normalizeText(record.name) === normalizeText(source.name) &&
        datePart(record.date_of_birth) === sourceDate &&
        datePart(record.date_of_death) === sourceDeathDate &&
        datePart(record.registration_date) === source.registrationDate
    );
}

function buildSourceRows(rows, tabName, spreadsheetName) {
    const { indexes, start } = getColumnIndexes(rows);
    const records = [];
    let lastRegistrationDate = null;

    for (let rowIndex = start; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const name = String(row[indexes.name] ?? "").trim();
        if (!name) continue;

        const parsedRegistrationDate = parseDate(row[indexes.registrationDate]);
        if (parsedRegistrationDate) lastRegistrationDate = parsedRegistrationDate;

        const phone = cleanPhone(row[indexes.phone]);
        records.push({
            spreadsheetName,
            tabName,
            rowNumber: rowIndex + 1,
            name,
            recordId: indexes.id === undefined ? "" : String(row[indexes.id] ?? "").trim(),
            category: sourceCategory(tabName),
            dateOfBirth: parseDate(row[indexes.dateOfBirth]),
            registrationDate: lastRegistrationDate,
            phone: phone.value,
            phoneComparison: phone.comparisonValue,
            phoneReason: phone.reason,
            multiplePhoneNumbers: phone.multiple,
            phoneColumn: columnLabel(indexes.phone)
        });
    }
    return records;
}

async function collectSourceRows(sheets) {
    const allRows = [];
    for (const spreadsheet of SPREADSHEETS) {
        const tabs = await getSupportedTabs(sheets, spreadsheet.id);
        for (const tab of tabs) {
            const rows = await readTab(sheets, spreadsheet.id, tab);
            allRows.push(...buildSourceRows(rows, tab, spreadsheet.name));
        }
    }
    return allRows;
}

function createPlan(sourceRows, databaseRecords, stats) {
    const proposals = new Map();
    for (const source of sourceRows) {
        stats.rowsExamined += 1;
        if (source.multiplePhoneNumbers) stats.multipleNumberRows += 1;
        stats.phoneColumns.add(`${source.spreadsheetName}/${source.tabName}: ${source.phoneColumn}`);
        if (!source.phone) {
            stats.invalidOrEmpty += 1;
            continue;
        }
        const candidates = getCandidates(databaseRecords, source);
        if (candidates.length === 0) {
            stats.unmatched += 1;
            continue;
        }
        if (candidates.length !== 1) {
            stats.ambiguous += 1;
            continue;
        }

        const record = candidates[0];
        stats.matched += 1;
        const existingPhone = cleanPhone(record.phone_number);
        if (existingPhone.comparisonValue === source.phoneComparison) {
            stats.alreadyCorrect += 1;
            continue;
        }

        const existing = proposals.get(record.id) || [];
        existing.push({ record, source });
        proposals.set(record.id, existing);
    }

    const updates = [];
    for (const entries of proposals.values()) {
        const phoneValues = new Set(entries.map(entry => entry.source.phone));
        if (phoneValues.size !== 1) {
            stats.ambiguous += entries.length;
            continue;
        }

        const { record, source } = entries[0];
        stats.changed += 1;
        if (stats.samples.length < MAX_SAMPLE_COUNT) {
            stats.samples.push({
                recordId: record.id,
                source: `${source.spreadsheetName}/${source.tabName} row ${source.rowNumber}`,
                oldPhone: maskPhone(record.phone_number),
                newPhone: maskPhone(source.phone)
            });
        }
        updates.push({ id: record.id, phone: source.phoneComparison });
    }
    return updates;
}

function printReport(stats) {
    console.log("\nPHONE-ONLY MIGRATION REPORT");
    console.log(`Rows examined:          ${stats.rowsExamined}`);
    console.log(`Records matched:        ${stats.matched}`);
    console.log(`Phone numbers updated:  ${stats.changed}`);
    console.log(`Already correct:        ${stats.alreadyCorrect}`);
    console.log(`Unmatched rows:         ${stats.unmatched}`);
    console.log(`Ambiguous matches:      ${stats.ambiguous}`);
    console.log(`Invalid/empty phones:   ${stats.invalidOrEmpty}`);
    console.log(`Rows with multiple #:   ${stats.multipleNumberRows}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log("Phone columns detected:");
    [...stats.phoneColumns].sort().forEach(column => console.log(`- ${column}`));
    if (stats.samples.length) {
        console.log("\nMasked samples:");
        stats.samples.forEach(sample => {
            console.log(`- record ${sample.recordId} (${sample.source}): ${sample.oldPhone} -> ${sample.newPhone}`);
        });
    }
}

async function confirmApply() {
    if (!CONFIRMED) {
        throw new Error("Apply mode requires the explicit --confirm-phone-only flag.");
    }
    if (!process.stdin.isTTY) return;

    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => input.question("Type APPLY PHONE ONLY to continue: ", resolve));
    input.close();
    if (answer.trim() !== "APPLY PHONE ONLY") {
        throw new Error("Confirmation did not match. No database changes were made.");
    }
}

async function main() {
    if (process.argv.includes("--help")) {
        console.log("Usage: node migratePhoneNumbers.js --dry-run");
        console.log("       node migratePhoneNumbers.js --apply --confirm-phone-only");
        return;
    }

    if (DRY_RUN) console.log("Dry-run mode: no database changes will be committed.");

    const serviceAccount = resolveServiceAccount();
    const auth = new google.auth.GoogleAuth({
        keyFile: serviceAccount,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });
    const sheets = google.sheets({ version: "v4", auth });
    const client = await pool.connect();

    try {
        const sourceRows = await collectSourceRows(sheets);
        const databaseRecords = await loadDatabaseRecords(client);
        const stats = createStats();
        const updates = createPlan(sourceRows, databaseRecords, stats);
        printReport(stats);

        if (!APPLY || updates.length === 0) return;
        await confirmApply();

        await client.query("BEGIN");
        for (const update of updates) {
            await client.query(
                "UPDATE records SET phone_number = $1 WHERE id = $2",
                [update.phone, update.id]
            );
        }
        await client.query("COMMIT");
        console.log(`\nCommitted ${updates.length} phone-number-only updates.`);
    } catch (error) {
        if (APPLY) {
            try { await client.query("ROLLBACK"); } catch (_) {}
        }
        console.error(`Migration failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Migration failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    cleanPhone,
    getCandidates,
    maskPhone,
    parseDate
};
