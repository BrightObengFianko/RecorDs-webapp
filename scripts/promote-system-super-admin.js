const readline = require("readline");

const pool = require("../server/config/database");

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
            reject(new Error("Promotion cancelled."));
        });
    });
}

async function promoteSystemSuperAdmin() {
    const email = (await ask("Existing admin email: ")).toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 150) {
        throw new Error("Enter a valid account email.");
    }

    const confirmation = await ask(
        'Type "PROMOTE SYSTEM SUPER ADMIN" to continue: '
    );

    if (confirmation !== "PROMOTE SYSTEM SUPER ADMIN") {
        throw new Error("Confirmation did not match. No account was changed.");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `
                SELECT id, name, email, role, is_active, account_status
                FROM users
                WHERE LOWER(email) = $1
                FOR UPDATE
            `,
            [email]
        );

        if (!result.rowCount) {
            throw new Error("No account was found for that email.");
        }

        const user = result.rows[0];
        const role = String(user.role || "").trim().toLowerCase();

        if (role === "system_super_admin") {
            await client.query("ROLLBACK");
            console.log("That account is already a system super admin. No changes made.");
            return;
        }

        if (role !== "admin") {
            throw new Error("Only an existing admin account can be promoted by this command.");
        }

        if (user.is_active === false || String(user.account_status || "").toUpperCase() !== "APPROVED") {
            throw new Error("The account must be active and approved before promotion.");
        }

        await client.query(
            `
                UPDATE users
                SET role = 'system_super_admin'
                WHERE id = $1
            `,
            [user.id]
        );

        await client.query("COMMIT");
        console.log(`Promoted ${user.email} to system_super_admin.`);
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {
            // Preserve the original error.
        }
        throw error;
    } finally {
        client.release();
    }
}

promoteSystemSuperAdmin()
    .catch(error => {
        console.error(`Unable to promote account: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
