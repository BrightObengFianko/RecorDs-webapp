const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
    path: process.env.ENV_FILE || ".env"
});

const pool = require("./server/config/database");
const { ensureDatabaseSchema } = require("./server/config/migrate");
const { getJwtSecret } = require("./server/utils/authSecurity");
const authenticateToken = require("./server/middleware/authMiddleware");

const authRoutes = require("./server/routes/authRoutes");
const recordRoutes = require("./server/routes/recordRoutes");
const adminRoutes = require("./server/routes/adminRoutes");
const smsRoutes = require("./server/routes/smsRoutes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);


// =========================================
// MIDDLEWARE
// =========================================

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");

    if (process.env.NODE_ENV === "production" && req.secure) {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
});

app.use(cors(
    process.env.CORS_ORIGIN
        ? { origin: process.env.CORS_ORIGIN }
        : { origin: false }
));

app.use(express.json({ limit: "100kb" }));


// =========================================
// API ROUTES
// =========================================

app.use(
    "/api/auth",
    authRoutes
);

app.use(
    "/api/records",
    recordRoutes
);

app.use(
    "/api/admin",
    adminRoutes
);

app.use(
    "/api/sms",
    smsRoutes
);

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        return res.status(200).json({
            success: true,
            status: "ok",
            database: "ok"
        });
    } catch (error) {
        console.error("HEALTH CHECK DATABASE ERROR:", error.message);
        return res.status(503).json({
            success: false,
            status: "degraded",
            database: "unavailable"
        });
    }
});

// =========================================
// FRONTEND PAGES
// =========================================

function serveFrontendPage(fileName) {
    app.get(
        `/${fileName}`,
        (req, res) => {
            res.sendFile(
                path.join(
                    __dirname,
                    "public",
                    fileName
                )
            );
        }
    );
}

serveFrontendPage("dashboard.html");
serveFrontendPage("search-cases.html");
serveFrontendPage("case-details.html");
serveFrontendPage("create-record.html");
serveFrontendPage("users.html");
serveFrontendPage("reports.html");
serveFrontendPage("settings.html");


// =========================================
// FRONTEND
// =========================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// =========================================
// TEST DATABASE
// =========================================

app.get(
    "/api/test-db",
    authenticateToken,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    "SELECT NOW()"
                );

            res.json({
                success: true,
                message:
                    "PostgreSQL connection is working!",
                time:
                    result.rows[0].now
            });

        } catch (error) {

            console.error(
                "DATABASE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Database connection failed."
            });
        }
    }
);

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});


// =========================================
// START SERVER
// =========================================

const PORT =
    process.env.PORT || 5000;

const HOST =
    process.env.HOST || "0.0.0.0";

async function startServer() {

    try {

        getJwtSecret();
        await ensureDatabaseSchema();

        app.listen(
            PORT,
            HOST,
            () => {

                console.log(
                    `RecorDs server running on http://${HOST}:${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "Unable to start server:",
            error
        );

        process.exit(1);

    }

}

// Keep internal database details out of API responses.
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    console.error("UNHANDLED SERVER ERROR:", error);

    return res.status(500).json({
        success: false,
        message: "An unexpected server error occurred."
    });
});


startServer();
