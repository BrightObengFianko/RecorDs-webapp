const { Pool } = require("pg");
require("dotenv").config({
    path: process.env.ENV_FILE || ".env",
    override: false
});

const env =
    value =>
        typeof value === "string"
            ? value.trim()
            : value;

const sslEnabled = String(process.env.DB_SSL || "").toLowerCase() === "true";
const databaseUrl = env(process.env.DATABASE_URL) || "";
const configuredHost = env(process.env.DB_HOST) || "";

if (
    String(process.env.NODE_ENV || "").toLowerCase() === "production" &&
    !databaseUrl &&
    (!configuredHost || ["localhost", "127.0.0.1", "::1"].includes(configuredHost))
) {
    throw new Error("DATABASE_URL must be configured for production PostgreSQL access.");
}

// Use DATABASE_URL if available, otherwise fall back to individual env vars
const poolOptions = databaseUrl
    ? {
        connectionString: databaseUrl
    }
    : {
        user: env(process.env.DB_USER),
        host: env(process.env.DB_HOST),
        database: env(process.env.DB_NAME),
        password: env(process.env.DB_PASSWORD),
        port: Number(env(process.env.DB_PORT) || 5432)
    };

// Apply SSL configuration
const sslConfig = sslEnabled
    ? {
        rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false"
    }
    : false;

const pool = new Pool({
    ...poolOptions,
    ...(sslConfig && { ssl: sslConfig }),
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
});

pool.on("error", error => {
    console.error("POSTGRESQL POOL ERROR:", error.message);
});

module.exports = pool;

