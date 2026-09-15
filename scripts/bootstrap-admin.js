const readline = require("readline");

const pool = require("../server/config/database");
const { ensureDatabaseSchema, DEFAULT_BRANCH_NAME } = require("../server/config/migrate");
const { hashPassword } = require("../server/utils/authSecurity");

function ask(question) {
    return new Promise((resolve, reject) => {
        const input = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        input.question(question, answer => {
            input.close();
            resolve(answer.trim());
        });

        input.on("SIGINT", () => {
            input.close();
            reject(new Error("Bootstrap cancelled."));
        });
    });
}

function askHidden(question) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        const output = process.stdout;
        let value = "";
        const previousRawMode = input.isRaw;

        output.write(question);

        if (typeof input.setRawMode !== "function") {
            reject(new Error("A TTY is required for the hidden password prompt."));
            return;
        }

        input.setRawMode(true);
        input.resume();

        const cleanup = () => {
            input.removeListener("data", onData);
            input.setRawMode(Boolean(previousRawMode));
            input.pause();
        };

        const onData = chunk => {
            for (const character of String(chunk)) {
                if (character === "\u0003") {
                    cleanup();
                    output.write("\n");
                    reject(new Error("Bootstrap cancelled."));
                    return;
                }

                if (character === "\r" || character === "\n") {
                    cleanup();
                    output.write("\n");
                    resolve(value);
                    return;
                }

                if (character === "\u007f" || character === "\b") {
                    value = value.slice(0, -1);
                    continue;
                }

                value += character;
            }
        };

        input.on("data", onData);
    });
}

async function bootstrapAdmin() {
    await ensureDatabaseSchema();

    const name = await ask("Admin name: ");
    const email = (await ask("Admin email: ")).toLowerCase();
    const password = await askHidden("Admin password: ");

    if (!name || name.length > 100) {
        throw new Error("Admin name is required and must not exceed 100 characters.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
        throw new Error("A valid admin email is required.");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Serialize bootstrap attempts so only one initial admin can be created.
        await client.query("SELECT pg_advisory_xact_lock($1)", [73918421]);

        const existingAdmin = await client.query(
            `
                SELECT id
                FROM users
                WHERE LOWER(role) = 'admin'
                LIMIT 1
            `
        );

        if (existingAdmin.rowCount > 0) {
            throw new Error("An administrator already exists. Use the admin user-management page.");
        }

        const existingEmail = await client.query(
            "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
            [email]
        );

        if (existingEmail.rowCount > 0) {
            throw new Error("That email already belongs to an account.");
        }

        const branch = await client.query(
            "SELECT id FROM branches WHERE name = $1 LIMIT 1",
            [DEFAULT_BRANCH_NAME]
        );

        if (branch.rowCount === 0) {
            throw new Error("The default branch is not available.");
        }

        const passwordHash = await hashPassword(password);

        await client.query(
            `
                INSERT INTO users (
                    name,
                    email,
                    password,
                    role,
                    branch_id,
                    account_status,
                    is_active
                )
                VALUES ($1, $2, $3, 'admin', $4, 'APPROVED', TRUE)
            `,
            [name, email, passwordHash, branch.rows[0].id]
        );

        await client.query("COMMIT");
        console.log("Initial administrator created successfully.");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

bootstrapAdmin()
    .catch(error => {
        console.error(`Unable to create initial administrator: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
