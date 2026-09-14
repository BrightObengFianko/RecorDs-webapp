const { Pool } = require("pg");
require("dotenv").config();

const env =
    value =>
        typeof value === "string"
            ? value.trim()
            : value;

const sslEnabled = String(process.env.DB_SSL || "").toLowerCase() === "true";

const poolOptions = process.env.DATABASE_URL
    ? {
        connectionString: env(process.env.DATABASE_URL)
    }
    : {
        user: env(process.env.DB_USER),
        host: env(process.env.DB_HOST),
        database: env(process.env.DB_NAME),
        password: env(process.env.DB_PASSWORD),
        port: Number(env(process.env.DB_PORT) || 5432)
    };

const pool = new Pool({
    ...poolOptions,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: sslEnabled
        ? {
            rejectUnauthorized:
                process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
        }
        : undefined
});

pool.on("error", error => {
    console.error("POSTGRESQL POOL ERROR:", error.message);
});

module.exports = pool;
