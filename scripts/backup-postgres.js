const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

require("dotenv").config({
    path: process.env.ENV_FILE || ".env"
});

function clean(value) {
    return typeof value === "string" ? value.trim() : value;
}

function databaseEnvironment() {
    const output = { ...process.env };
    const databaseUrl = clean(process.env.DATABASE_URL);

    if (databaseUrl) {
        const parsed = new URL(databaseUrl);
        output.PGHOST = parsed.hostname;
        output.PGPORT = parsed.port || "5432";
        output.PGUSER = decodeURIComponent(parsed.username);
        output.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
        output.PGPASSWORD = decodeURIComponent(parsed.password);
    } else {
        output.PGHOST = clean(process.env.DB_HOST);
        output.PGPORT = clean(process.env.DB_PORT) || "5432";
        output.PGUSER = clean(process.env.DB_USER);
        output.PGDATABASE = clean(process.env.DB_NAME);
        output.PGPASSWORD = clean(process.env.DB_PASSWORD);
    }

    if (String(process.env.DB_SSL || "").toLowerCase() === "true") {
        output.PGSSLMODE = "require";
    }

    return output;
}

function timestamp() {
    return new Date().toISOString().replace(/[.:]/g, "-");
}

const backupDirectory = path.resolve(
    clean(process.env.BACKUP_DIR) || path.join(process.cwd(), "backups")
);
const outputFile = path.join(
    backupDirectory,
    `records-${timestamp()}.dump`
);

fs.mkdirSync(backupDirectory, { recursive: true });

const child = spawn(
    process.env.PG_DUMP_BIN || "pg_dump",
    ["--format=custom", "--no-owner", "--file", outputFile],
    {
        env: databaseEnvironment(),
        stdio: ["ignore", "pipe", "pipe"]
    }
);

let stderr = "";
child.stderr.on("data", chunk => {
    stderr += String(chunk);
});

child.stdout.resume();

child.on("error", error => {
    console.error(`Backup failed: ${error.message}`);
    process.exitCode = 1;
});

child.on("close", code => {
    if (code !== 0) {
        try {
            fs.rmSync(outputFile, { force: true });
        } catch (error) {
            // Preserve the original backup failure without logging credentials.
        }

        console.error(`Backup failed with exit code ${code}.`);
        if (stderr.trim()) {
            console.error(stderr.trim().slice(0, 1000));
        }
        process.exitCode = 1;
        return;
    }

    console.log(`Backup created: ${outputFile}`);
});
