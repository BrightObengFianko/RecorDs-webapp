const pool = require("../config/database");

const DASHBOARD_REGISTRARS = [
    "ADMIN",
    "OFFICE",
    "NEW MARKET",
    "POLYCLINIC"
];
const { sendToN8N } = require("../services/n8nService");
const { getDefaultBranchId } = require("../utils/branchUtils");
const { formatPhoneNumber, isValidPhoneNumber } = require("../utils/phoneUtils");
const { boundedText, isIsoDate } = require("../utils/inputValidation");

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function isBranchStaff(user) {
    return normalizeRole(user?.role) === "branch_staff";
}

function canMutateRecords(user) {
    return ["admin", "staff"].includes(normalizeRole(user?.role));
}

function canCreateRecords(user) {
    return ["admin", "staff", "branch_staff"].includes(
        normalizeRole(user?.role)
    );
}

function getSmsWorkflowError(workflowResult) {
    if (!workflowResult || workflowResult.success === false) {
        return String(
            workflowResult?.error ||
            workflowResult?.message ||
            "SMS workflow failed."
        );
    }

    const status = String(workflowResult.status || "")
        .trim()
        .toLowerCase();

    return ["error", "failed", "failure"].includes(status)
        ? String(workflowResult.error || workflowResult.message || "SMS workflow failed.")
        : null;
}

function isSmsSentConfirmation(workflowResult) {
    if (!workflowResult || typeof workflowResult !== "object") {
        return false;
    }

    const explicitConfirmation = [
        workflowResult.sms_sent,
        workflowResult.sent,
        workflowResult.delivered,
        workflowResult.sms_sent_candidate
    ];

    if (explicitConfirmation.some(value => value === true || String(value).toLowerCase() === "true")) {
        return true;
    }

    return ["sent", "delivered"].includes(
        String(workflowResult.status || "").trim().toLowerCase()
    );
}

async function saveSmsWorkflowState(recordId, workflowResult) {
    const smsError = getSmsWorkflowError(workflowResult);
    const smsSent = !smsError && isSmsSentConfirmation(workflowResult);

    await pool.query(
        `
            UPDATE records
            SET
                sms_sent = $1,
                sms_status = $2,
                sms_error = $3,
                sms_date = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE sms_date END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
        `,
        [
            smsSent ? "true" : "false",
            smsError ? "Error" : smsSent ? "Sent" : "Queued",
            smsError,
            smsSent,
            recordId
        ]
    );

    if (smsError) {
        throw new Error(smsError);
    }

    return smsSent;
}

function normalizeStatusValue(value) {
    const status = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ");

    if (!status) {
        return "Pending";
    }

    return status
        .split(" ")
        .filter(Boolean)
        .map(
            word =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");
}

function normalizeClientUuid(value) {
    const clientUuid = String(value || "").trim();

    if (!clientUuid) {
        return null;
    }

    const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return uuidPattern.test(clientUuid)
        ? clientUuid
        : null;
}

/**
 * Normalizes a name for duplicate comparison
 * Removes extra spaces and converts to lowercase
 */
function normalizeName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

/**
 * Checks if a record is a duplicate
 * - Normal cases: same normalized Name + Date of Birth
 * - Death cases: same normalized Name + Date of Death
 */
async function checkDuplicateRecord(pool, category, name, dateOfBirth, dateOfDeath) {
    try {
        const isDeathCategory =
            category &&
            String(category).toLowerCase().trim() === "death";

        const normalizedName = normalizeName(name);

        if (!normalizedName || (!dateOfBirth && !dateOfDeath)) {
            return null;
        }

        let query;
        let params;

        if (isDeathCategory) {
            // Death cases: check name + date_of_death
            query = `
                SELECT id, name, category, date_of_death
                FROM records
                WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                  AND date_of_death = $2
                LIMIT 1
            `;
            params = [name, dateOfDeath];
        } else {
            // Normal cases: check name + date_of_birth
            query = `
                SELECT id, name, category, date_of_birth
                FROM records
                WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
                  AND date_of_birth = $2
                LIMIT 1
            `;
            params = [name, dateOfBirth];
        }

        const result = await pool.query(query, params);
        return result.rows[0] || null;
    } catch (error) {
        console.error("DUPLICATE CHECK ERROR:", error);
        return null;
    }
}

function recordSelectSql() {
    return `
        SELECT
            r.*,
            COALESCE(b.name, '') AS branch_name
        FROM records r
        LEFT JOIN branches b
            ON b.id = r.branch_id
    `;
}

function dashboardBranchClause(user) {
    if (!isBranchStaff(user)) {
        return {
            clause: "",
            values: []
        };
    }

    return {
        clause: `
            WHERE r.branch_id = $1
              AND r.registration_date >= date_trunc(
                  'year',
                  (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
              )::date
              AND r.registration_date < (
                  date_trunc(
                      'year',
                      (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
                  ) + INTERVAL '1 year'
              )::date
        `,
        values: [user.branch_id]
    };
}

const RECENT_RECORDS_PAGE_SIZE = 10;

function normalizePage(value) {
    const page = Number.parseInt(String(value || "1"), 10);
    return Number.isInteger(page) && page > 0 ? page : 1;
}

function sqlDateText(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : value.toISOString().slice(0, 10);
    }

    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

async function queryRecentTodayRecords(user, requestedPage) {
    const {
        clause,
        values
    } = dashboardBranchClause(user);

    // registration_date is a PostgreSQL TIMESTAMP without time zone. The
    // application stores it as Ghana-local time, so compare against the
    // current Accra calendar day rather than the database server's timezone.
    const page = normalizePage(requestedPage);

    const selectedDateResult = await pool.query(
        `
            SELECT
                (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date AS today,
                COALESCE(
                    MAX(r.registration_date::date) FILTER (
                        WHERE r.registration_date::date =
                            (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
                    ),
                    MAX(r.registration_date::date) FILTER (
                        WHERE r.registration_date::date <
                            (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Accra')::date
                    )
                ) AS selected_date
            FROM records r
            ${clause}
        `,
        values
    );

    const selectedDate = selectedDateResult.rows[0]?.selected_date;
    const today = selectedDateResult.rows[0]?.today;
    const selectedDateText = sqlDateText(selectedDate);
    const todayText = sqlDateText(today);
    const isToday = Boolean(selectedDateText && selectedDateText === todayText);

    if (!selectedDateText) {
        return {
            records: [],
            selectedDate: null,
            isToday: false,
            pagination: {
                page: 1,
                limit: RECENT_RECORDS_PAGE_SIZE,
                total: 0,
                totalPages: 0
            }
        };
    }

    const dateParameter = values.length + 1;
    const limitParameter = values.length + 2;
    const offsetParameter = values.length + 3;
    const offset = (page - 1) * RECENT_RECORDS_PAGE_SIZE;
    const selectedDateClause = clause
        ? `${clause} AND r.registration_date >= $${dateParameter}::date AND r.registration_date < ($${dateParameter}::date + INTERVAL '1 day')`
        : `WHERE r.registration_date >= $${dateParameter}::date AND r.registration_date < ($${dateParameter}::date + INTERVAL '1 day')`;
    const dateValues = [
        ...values,
        selectedDateText
    ];

    const [countResult, recordsResult] = await Promise.all([
        pool.query(
            `
                SELECT COUNT(*)::int AS total
                FROM records r
                ${selectedDateClause}
            `,
            dateValues
        ),
        pool.query(
            `
                ${recordSelectSql()}
                ${selectedDateClause}
                ORDER BY r.registration_date DESC NULLS LAST, r.id DESC
                LIMIT $${limitParameter}
                OFFSET $${offsetParameter}
            `,
            [
                ...dateValues,
                RECENT_RECORDS_PAGE_SIZE,
                offset
            ]
        )
    ]);

    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / RECENT_RECORDS_PAGE_SIZE);

    return {
        records: recordsResult.rows || [],
        selectedDate: selectedDateText,
        isToday,
        pagination: {
            page,
            limit: RECENT_RECORDS_PAGE_SIZE,
            total,
            totalPages
        }
    };
}

const getRecentTodayRecords = async (req, res) => {
    try {
        const result = await queryRecentTodayRecords(
            req.user,
            req.query?.page
        );

        return res.json({
            success: true,
            records: result.records,
            selectedDate: result.selectedDate,
            isToday: result.isToday,
            pagination: result.pagination
        });
    } catch (error) {
        console.error("GET RECENT TODAY RECORDS ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load today's records."
        });
    }
};

function assertBranchAccess(user, record) {
    if (
        !isBranchStaff(user) ||
        !record
    ) {
        return true;
    }

    return String(record.branch_id) === String(user.branch_id);
}

// =========================================
// CREATE RECORD
// =========================================

const createRecord = async (req, res) => {
    try {
        if (!canCreateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action."
            });
        }

        const {
            category,
            name,
            date_of_birth,
            date_of_death,
            phone_number,
            registration_date,
            registrar,
            notes,
            client_uuid
        } = req.body;

        if (
            boundedText(category, 100) === null ||
            boundedText(name, 150) === null ||
            boundedText(registrar, 150) === null ||
            boundedText(notes, 5000) === null
        ) {
            return res.status(400).json({
                success: false,
                message: "One or more record fields exceed the allowed length."
            });
        }

        for (const dateValue of [date_of_birth, date_of_death, registration_date]) {
            if (dateValue && !isIsoDate(dateValue)) {
                return res.status(400).json({
                    success: false,
                    message: "Record dates must use YYYY-MM-DD format."
                });
            }
        }

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Customer name is required."
            });
        }

        if (
            category &&
            String(category).toLowerCase().trim() === "death" &&
            !date_of_death
        ) {
            return res.status(400).json({
                success: false,
                message: "Date of death is required for Death records."
            });
        }

        const branchId =
            req.user?.branch_id ||
            (await getDefaultBranchId());

        if (!branchId) {
            return res.status(500).json({
                success: false,
                message: "Unable to determine record branch."
            });
        }

        const requestedRegistrar =
            isBranchStaff(req.user)
                ? req.user?.name
                : registrar ?? req.user?.name;

        const nextRegistrar =
            String(
                requestedRegistrar ||
                "Unknown"
            )
                .trim() ||
            req.user?.name ||
                "Unknown";

        if (nextRegistrar.length > 150) {
            return res.status(400).json({
                success: false,
                message: "Registrar name is too long."
            });
        }

        const clientUuid =
            normalizeClientUuid(client_uuid);

        if (client_uuid && !clientUuid) {
            return res.status(400).json({
                success: false,
                message: "Invalid client UUID."
            });
        }

        if (clientUuid) {
            const existingRecordResult =
                await pool.query(
                    `
                        SELECT *
                        FROM records
                        WHERE client_uuid = $1
                        LIMIT 1
                    `,
                    [clientUuid]
                );

            if (existingRecordResult.rows[0]) {
                return res.status(200).json({
                    success: true,
                    message: "Record already exists.",
                    record: existingRecordResult.rows[0]
                });
            }
        }

        // Format phone number to Ghana format (233...)
        const formattedPhone = formatPhoneNumber(phone_number);

        // =========================================
        // DUPLICATE CASE PROTECTION
        // =========================================

        const duplicateRecord = await checkDuplicateRecord(
            pool,
            category,
            name,
            date_of_birth,
            date_of_death
        );

        if (duplicateRecord) {
            return res.status(409).json({
                success: false,
                message: "Case Already Recorded.",
                existingRecordId: duplicateRecord.id,
                existingRecord: {
                    id: duplicateRecord.id,
                    name: duplicateRecord.name,
                    category: duplicateRecord.category,
                    dateOfBirth: duplicateRecord.date_of_birth,
                    dateOfDeath: duplicateRecord.date_of_death
                }
            });
        }

        const initialStatus =
            isBranchStaff(req.user)
                ? "Processing"
                : "Pending";

        const result = await pool.query(
            `
                INSERT INTO records
                (
                    category,
                    name,
                    date_of_birth,
                    date_of_death,
                    phone_number,
                    registrar,
                    registration_date,
                    status,
                    notes,
                    branch_id,
                    client_uuid
                )
                VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                RETURNING *
            `,
            [
                category || null,
                name.trim(),
                date_of_birth || null,
                date_of_death || null,
                formattedPhone,
                nextRegistrar,
                registration_date || null,
                initialStatus,
                notes || null,
                branchId,
                clientUuid
            ]
        );

        return res.status(201).json({
            success: true,
            message: "Record created successfully.",
            record: result.rows[0]
        });
    } catch (error) {
        console.error("CREATE RECORD ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create record."
        });
    }
};

// =========================================
// GET ALL RECORDS
// =========================================

const getRecords = async (req, res) => {
    try {
        let query = recordSelectSql();
        const values = [];

        if (isBranchStaff(req.user)) {
            query += `
                WHERE r.branch_id = $1
            `;
            values.push(req.user.branch_id);
        }

        query += `
            ORDER BY r.registration_date DESC NULLS LAST, r.id DESC
        `;

        const result = await pool.query(query, values);

        return res.json({
            success: true,
            records: result.rows
        });
    } catch (error) {
        console.error("GET RECORDS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load records."
        });
    }
};

// =========================================
// RECORDS WAITING FOR APPROVAL
// =========================================

const getProcessingRecords = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view approval cases."
            });
        }

        const {
            name,
            dateOfBirth,
            registrar
        } = req.query;

        for (const dateValue of [dateOfBirth]) {
            if (dateValue && !isIsoDate(dateValue)) {
                return res.status(400).json({
                    success: false,
                    message: "Search dates must use YYYY-MM-DD format."
                });
            }
        }

        let query = `
            ${recordSelectSql()}
            WHERE LOWER(REPLACE(REPLACE(COALESCE(r.status, ''), '_', ' '), '-', ' ')) = 'processing'
        `;

        const values = [];
        let parameter = 1;

        if (name) {
            query += ` AND r.name ILIKE $${parameter}`;
            values.push(`%${name}%`);
            parameter++;
        }

        if (dateOfBirth) {
            query += ` AND r.date_of_birth::date = $${parameter}::date`;
            values.push(dateOfBirth);
            parameter++;
        }

        if (registrar) {
            query += ` AND r.registrar ILIKE $${parameter}`;
            values.push(`%${registrar}%`);
        }

        query += " ORDER BY r.registration_date DESC NULLS LAST, r.id DESC";

        const result = await pool.query(query, values);

        return res.json({
            success: true,
            records: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        console.error("GET PROCESSING RECORDS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load approval cases."
        });
    }
};

// =========================================
// DASHBOARD SUMMARY
// =========================================

const getDashboardSummary = async (req, res) => {
    try {
        const role = normalizeRole(req.user?.role);
        const branchStaff = isBranchStaff(req.user);

        const {
            clause,
            values
        } = dashboardBranchClause(req.user);

        const requestedPeriod =
            String(req.query?.period || "daily")
                .trim()
                .toLowerCase();

        const period = [
            "daily",
            "monthly",
            "yearly"
        ].includes(requestedPeriod)
            ? requestedPeriod
            : "daily";

        const requestedRange =
            String(req.query?.range || "30d")
                .trim()
                .toLowerCase();

        const rangeDays = {
            "7d": 7,
            "30d": 30,
            "90d": 90,
            "1y": 365
        }[requestedRange] || 30;

        const rangeKey = [
            "7d",
            "30d",
            "90d",
            "1y"
        ].includes(requestedRange)
            ? requestedRange
            : "30d";

        const rangeMonths =
            Math.max(1, Math.ceil(rangeDays / 30));

        const rangeYears =
            Math.max(1, Math.ceil(rangeDays / 365));

        const periodConfig = {
            daily: {
                start: `(CURRENT_DATE - INTERVAL '${rangeDays - 1} days')`,
                step: "INTERVAL '1 day'",
                trunc: "day",
                previous: `(CURRENT_DATE - INTERVAL '${rangeDays * 2 - 1} days')`
            },
            monthly: {
                start: `(date_trunc('month', CURRENT_DATE) - INTERVAL '${rangeMonths - 1} months')`,
                step: "INTERVAL '1 month'",
                trunc: "month",
                previous: `(date_trunc('month', CURRENT_DATE) - INTERVAL '${rangeMonths * 2 - 1} months')`
            },
            yearly: {
                start: `(date_trunc('year', CURRENT_DATE) - INTERVAL '${rangeYears - 1} years')`,
                step: "INTERVAL '1 year'",
                trunc: "year",
                previous: `(date_trunc('year', CURRENT_DATE) - INTERVAL '${rangeYears * 2 - 1} years')`
            }
        }[period];

        const summaryValues = [
            ...values
        ];

        let summaryClause = clause;
        let parameter = summaryValues.length + 1;
        let yearParameter = null;

        const addSummaryFilter = (sql, value) => {
            summaryClause += summaryClause
                ? ` AND ${sql}`
                : ` WHERE ${sql}`;

            summaryValues.push(value);
            parameter++;
        };

        const requestedRegistrar =
            String(req.query?.registrar || "")
                .trim()
                .toUpperCase();

        const requestedYear = branchStaff
            ? new Date().getFullYear()
            : Number.parseInt(
                String(req.query?.year || ""),
                10
            );

        if (requestedRegistrar &&
            !DASHBOARD_REGISTRARS.includes(requestedRegistrar)) {
            summaryClause += summaryClause
                ? " AND FALSE"
                : " WHERE FALSE";
        } else if (requestedRegistrar) {
            addSummaryFilter(
                `LOWER(BTRIM(COALESCE(r.registrar, ''))) = LOWER(BTRIM($${parameter}))`,
                requestedRegistrar
            );
        }

        if (req.query?.category) {
            addSummaryFilter(
                `LOWER(BTRIM(COALESCE(r.category, ''))) = LOWER(BTRIM($${parameter}))`,
                req.query.category
            );
        }

        if (
            Number.isInteger(requestedYear) &&
            requestedYear >= 1900 &&
            requestedYear <= 2200
        ) {
            yearParameter = parameter;
            addSummaryFilter(
                `EXTRACT(YEAR FROM COALESCE(r.registration_date::date, r.created_at::date)) = $${parameter}`,
                requestedYear
            );
        }

        if (yearParameter && period !== "daily") {
            periodConfig.start = `make_date($${yearParameter}::int, 1, 1)`;
            periodConfig.end = `LEAST(CURRENT_DATE, make_date($${yearParameter}::int, 12, 31))`;
            periodConfig.previous = `(make_date($${yearParameter}::int, 1, 1) - INTERVAL '1 year')`;
        }

        const categoryOptionsClause = clause
            ? `${clause} AND NULLIF(BTRIM(r.category), '') IS NOT NULL`
            : "WHERE NULLIF(BTRIM(r.category), '') IS NOT NULL";

        const overviewDateCondition = `COALESCE(
            r.registration_date::date,
            r.created_at::date
        ) >= ${periodConfig.start}::date`;

        const overviewDateClause = summaryClause
            ? `${summaryClause} AND ${overviewDateCondition}`
            : `WHERE ${overviewDateCondition}`;

        const validRegistrarCondition = `LOWER(BTRIM(COALESCE(r.registrar, ''))) IN (
            'admin',
            'office',
            'new market',
            'polyclinic'
        )`;

        const registrarPerformanceClause =
            `${overviewDateClause} AND ${validRegistrarCondition}`;

        const recentToday = await queryRecentTodayRecords(
            req.user,
            req.query?.recentPage
        );

        const normalizeStatusSql =
            "LOWER(REPLACE(REPLACE(COALESCE(r.status, ''), '_', ' '), '-', ' '))";

        const [
            statsResult,
            dailyResult,
            categoryResult,
            branchResult,
            categoryOptionsResult,
            registrarPerformanceResult,
            statusSmsResult,
            yearOptionsResult,
            branchStaffMetricsResult,
            branchStaffMonthlyResult
        ] = await Promise.all([
            pool.query(
                `
                    SELECT
                        COUNT(*)::int AS total_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'ready'
                        )::int AS ready_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'pending'
                        )::int AS pending_records,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.sms_sent::text, '')) IN (
                                'true',
                                't',
                                'yes',
                                'y',
                                '1'
                            )
                        )::int AS sms_sent_records,
                        COUNT(*) FILTER (
                            WHERE COALESCE(
                                r.registration_date::date,
                                r.created_at::date
                            ) >= date_trunc('month', CURRENT_DATE)::date
                        )::int AS new_cases,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'ready'
                        )::int AS active_cases,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'not ready'
                        )::int AS closed_cases
                    FROM records r
                    ${clause}
                `,
                values
            ),

            pool.query(
                `
                    WITH period_series AS (
                        SELECT generate_series(
                            ${periodConfig.start}::date,
                            ${periodConfig.end || "CURRENT_DATE"},
                            ${periodConfig.step}
                        )::date AS period_start
                    ),
                    filtered AS (
                        SELECT date_trunc(
                            '${periodConfig.trunc}',
                            COALESCE(
                            r.registration_date::date,
                            r.created_at::date
                            )
                        )::date AS period_start
                        FROM records r
                        ${summaryClause}
                    )
                    SELECT
                        to_char(period_series.period_start, 'YYYY-MM-DD') AS day,
                        COUNT(filtered.period_start)::int AS count
                    FROM period_series
                    LEFT JOIN filtered
                        ON filtered.period_start = period_series.period_start
                    GROUP BY period_series.period_start
                    ORDER BY period_series.period_start ASC
                `,
                summaryValues
            ),

            pool.query(
                `
                    SELECT
                        COALESCE(
                            NULLIF(BTRIM(r.category), ''),
                            'Uncategorized'
                        ) AS label,
                        COUNT(*)::int AS count
                    FROM records r
                    ${overviewDateClause}
                    GROUP BY 1
                    ORDER BY count DESC, label ASC
                    LIMIT 6
                `,
                summaryValues
            ),

            pool.query(
                `
                    SELECT
                        COALESCE(
                            NULLIF(BTRIM(b.name), ''),
                            'Unknown'
                        ) AS label,
                        COUNT(*)::int AS count
                    FROM records r
                    LEFT JOIN branches b
                        ON b.id = r.branch_id
                    ${clause}
                    GROUP BY 1
                    ORDER BY count DESC, label ASC
                    LIMIT 5
                `,
                values
            ),

            pool.query(
                `
                    SELECT DISTINCT
                        BTRIM(r.category) AS label
                    FROM records r
                    ${categoryOptionsClause}
                    ORDER BY label ASC
                `,
                values
            ),

            pool.query(
                `
                    SELECT
                        CASE LOWER(BTRIM(r.registrar))
                            WHEN 'admin' THEN 'ADMIN'
                            WHEN 'office' THEN 'OFFICE'
                            WHEN 'new market' THEN 'NEW MARKET'
                            WHEN 'polyclinic' THEN 'POLYCLINIC'
                        END AS label,
                        COUNT(*)::int AS count
                    FROM records r
                    ${registrarPerformanceClause}
                    GROUP BY 1
                    ORDER BY count DESC, label ASC
                `,
                summaryValues
            ),

            pool.query(
                `
                    SELECT
                        COUNT(*)::int AS total_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'ready'
                        )::int AS ready_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'not ready'
                        )::int AS not_ready_records,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.sms_sent::text, '')) IN (
                                'true', 't', 'yes', 'y', '1', 'sent', 'success'
                            )
                        )::int AS sms_sent_records,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.sms_sent::text, '')) IN (
                                'failed', 'failure', 'error'
                            )
                        )::int AS sms_failed_records
                    FROM records r
                    ${overviewDateClause}
                `,
                summaryValues
            ),

            pool.query(
                `
                    SELECT DISTINCT
                        EXTRACT(
                            YEAR FROM COALESCE(
                                r.registration_date::date,
                                r.created_at::date
                            )
                        )::int AS year
                    FROM records r
                    ${clause}
                    ORDER BY year DESC
                `,
                values
            ),

            pool.query(
                `
                    SELECT
                        COUNT(*)::int AS total_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'ready'
                        )::int AS ready_records,
                        COUNT(*) FILTER (
                            WHERE ${normalizeStatusSql} = 'pending'
                        )::int AS pending_records,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.category, '')) LIKE '%birth%'
                        )::int AS birth_certificates,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.category, '')) LIKE '%death%'
                        )::int AS death_certificates,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.sms_sent::text, '')) IN (
                                'true', 't', 'yes', 'y', '1', 'sent', 'success'
                            )
                        )::int AS sms_sent,
                        COUNT(*) FILTER (
                            WHERE LOWER(COALESCE(r.sms_sent::text, '')) IN (
                                'failed', 'failure', 'error'
                            )
                        )::int AS sms_failed
                    FROM records r
                    ${branchStaff ? clause : "WHERE FALSE"}
                `,
                branchStaff ? values : []
            ),

            pool.query(
                `
                    SELECT
                        to_char(
                            date_trunc('month', r.registration_date),
                            'YYYY-MM'
                        ) AS month,
                        COUNT(*)::int AS count
                    FROM records r
                    ${branchStaff ? clause : "WHERE FALSE"}
                    GROUP BY date_trunc('month', r.registration_date)
                    ORDER BY date_trunc('month', r.registration_date) ASC
                `,
                branchStaff ? values : []
            )
        ]);

        const stats =
            statsResult.rows[0] || {};

        const previousPeriodStart =
            periodConfig.previous;

        const currentPeriodStart =
            periodConfig.start;

        const growthResult = await pool.query(
            `
                SELECT
                    COUNT(*) FILTER (
                        WHERE filtered.record_date >= ${currentPeriodStart}::date
                    )::int AS current_count,
                    COUNT(*) FILTER (
                        WHERE filtered.record_date >= ${previousPeriodStart}::date
                          AND filtered.record_date < ${currentPeriodStart}::date
                    )::int AS previous_count
                FROM (
                    SELECT COALESCE(
                        r.registration_date::date,
                        r.created_at::date
                    ) AS record_date
                    FROM records r
                    ${summaryClause}
                ) AS filtered
            `,
            summaryValues
        );

        const currentCount =
            Number(growthResult.rows[0]?.current_count || 0);
        const previousCount =
            Number(growthResult.rows[0]?.previous_count || 0);
        const overviewGrowth = previousCount === 0
            ? (currentCount > 0 ? 100 : 0)
            : ((currentCount - previousCount) / previousCount) * 100;

        const statusSms =
            statusSmsResult.rows[0] || {};

        const smsSentCount =
            Number(statusSms.sms_sent_records || 0);
        const smsFailedCount =
            Number(statusSms.sms_failed_records || 0);
        const smsAttemptedCount =
            smsSentCount + smsFailedCount;

        const statusSmsSummary = {
            totalRecords:
                Number(statusSms.total_records || 0),
            readyRecords:
                Number(statusSms.ready_records || 0),
            notReadyRecords:
                Number(statusSms.not_ready_records || 0),
            smsSent:
                smsSentCount,
            smsNotSent:
                Math.max(
                    0,
                    Number(statusSms.total_records || 0) -
                    smsAttemptedCount
                ),
            smsFailed:
                smsFailedCount,
            smsSuccessRate:
                smsAttemptedCount
                    ? (smsSentCount / smsAttemptedCount) * 100
                : 0
        };

        const branchStaffDashboard = branchStaff
            ? {
                ...(
                    branchStaffMetricsResult.rows[0] || {}
                ),
                monthlyProgress:
                    branchStaffMonthlyResult.rows || []
            }
            : null;

        let systemOverview = null;

        if (role === "admin") {
            const [
                usersResult,
                branchesResult
            ] = await Promise.all([
                pool.query(
                    "SELECT COUNT(*)::int AS count FROM users"
                ),
                pool.query(
                    "SELECT COUNT(*)::int AS count FROM branches"
                )
            ]);

            systemOverview = {
                users:
                    usersResult.rows[0]?.count || 0,
                branches:
                    branchesResult.rows[0]?.count || 0,
                recordsThisMonth:
                    stats.new_cases || 0,
                systemStatus: "Online"
            };
        }

        return res.json({
            success: true,
            summary: {
                totalRecords:
                    stats.total_records || 0,
                readyRecords:
                    stats.ready_records || 0,
                pendingRecords:
                    stats.pending_records || 0,
                smsSent:
                    stats.sms_sent_records || 0,
                newCases:
                    stats.new_cases || 0,
                activeCases:
                    stats.active_cases || 0,
                closedCases:
                    stats.closed_cases || 0,
                recentRecords:
                    recentToday.records,
                recentRecordsDate:
                    recentToday.selectedDate,
                recentRecordsIsToday:
                    recentToday.isToday,
                recentRecordsPagination:
                    recentToday.pagination,
                dailyRecords:
                    dailyResult.rows || [],
                categoryBreakdown:
                    categoryResult.rows || [],
                categoryOptions:
                    categoryOptionsResult.rows || [],
                registrarPerformance:
                    registrarPerformanceResult.rows || [],
                statusSms:
                    statusSmsSummary,
                branchStaffDashboard,
                yearOptions:
                    yearOptionsResult.rows || [],
                branchBreakdown:
                    branchResult.rows || [],
                systemOverview,
                overviewPeriod: period,
                overviewRange: rangeKey,
                overviewYear: branchStaff
                    ? new Date().getFullYear()
                    : null,
                overviewGrowth
            }
        });
    } catch (error) {
        console.error(
            "DASHBOARD SUMMARY ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to load dashboard summary."
        });
    }
};

// =========================================
// SEARCH RECORDS
// =========================================

const getRecordRegistrars = async (req, res) => {
    return res.json({
        success: true,
        registrars: DASHBOARD_REGISTRARS
    });
};

const getSmsStatus = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to view SMS errors."
            });
        }

        const result = await pool.query(
            `
                SELECT id, sms_status, sms_error, sms_sent, sms_date
                FROM records
                WHERE NULLIF(BTRIM(COALESCE(sms_error, '')), '') IS NOT NULL
                ORDER BY updated_at DESC NULLS LAST, id DESC
                LIMIT 1
            `
        );

        return res.json({
            success: true,
            error: result.rows[0] || null
        });
    } catch (error) {
        console.error("GET SMS STATUS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load SMS status."
        });
    }
};

const searchRecords = async (req, res) => {
    try {
        const {
            name,
            dateOfBirth,
            date_of_birth,
            status,
            category,
            registrar,
            fromDate,
            toDate
        } = req.query;

        let query = `
            ${recordSelectSql()}
            WHERE LOWER(REPLACE(REPLACE(COALESCE(r.status, ''), '_', ' '), '-', ' ')) <> 'processing'
        `;

        const values = [];
        let parameter = 1;

        if (isBranchStaff(req.user)) {
            query += `
                AND r.branch_id = $${parameter}
            `;

            values.push(req.user.branch_id);
            parameter++;
        }

        if (name) {
            query += `
                AND r.name ILIKE $${parameter}
            `;

            values.push(`%${name}%`);
            parameter++;
        }

        const dob =
            dateOfBirth ||
            date_of_birth;

        for (const textValue of [name, category, registrar, status]) {
            if (textValue !== undefined && boundedText(textValue, 150) === null) {
                return res.status(400).json({
                    success: false,
                    message: "A search filter is too long."
                });
            }
        }

        for (const dateValue of [dob, fromDate, toDate]) {
            if (dateValue && !isIsoDate(dateValue)) {
                return res.status(400).json({
                    success: false,
                    message: "Search dates must use YYYY-MM-DD format."
                });
            }
        }

        if (dob) {
            query += `
                AND r.date_of_birth::date = $${parameter}::date
            `;

            values.push(dob);
            parameter++;
        }

        if (status) {
            query += `
                AND LOWER(REPLACE(r.status, '_', ' ')) =
                    LOWER(REPLACE($${parameter}, '_', ' '))
            `;

            values.push(status);
            parameter++;
        }

        if (category) {
            query += `
                AND LOWER(r.category) =
                    LOWER($${parameter})
            `;

            values.push(category);
            parameter++;
        }

        if (registrar) {
            query += `
                AND LOWER(BTRIM(COALESCE(r.registrar, ''))) =
                    LOWER(BTRIM($${parameter}))
            `;

            values.push(registrar);
            parameter++;
        }

        if (
            fromDate &&
            toDate &&
            fromDate > toDate
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Registered From date cannot be later than Registered To date."
            });
        }

        if (
            fromDate &&
            toDate
        ) {
            query += `
                AND r.registration_date >= $${parameter}::date
                AND r.registration_date < ($${parameter + 1}::date + INTERVAL '1 day')
            `;

            values.push(
                fromDate,
                toDate
            );

            parameter += 2;
        } else if (fromDate) {
            query += `
                AND r.registration_date >= $${parameter}::date
            `;

            values.push(fromDate);
            parameter++;
        } else if (toDate) {
            query += `
                AND r.registration_date < ($${parameter}::date + INTERVAL '1 day')
            `;

            values.push(toDate);
            parameter++;
        }

        query += `
            ORDER BY r.registration_date DESC NULLS LAST, r.id DESC
        `;

        const result =
            await pool.query(
                query,
                values
            );

        return res.json({
            success: true,
            results:
                result.rows,
            count:
                result.rows.length
        });
    } catch (error) {
        console.error(
            "SEARCH RECORDS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to search records."
        });
    }
};

// =========================================
// GET SINGLE RECORD
// =========================================

const getRecordById = async (req, res) => {
    try {
        const { id } = req.params;

        const result =
            await pool.query(
                `
                    ${recordSelectSql()}
                    WHERE r.id = $1
                    LIMIT 1
                `,
                [id]
            );

        const record =
            result.rows[0];

        if (!record) {
            return res.status(404).json({
                success: false,
                message:
                    "Record not found."
            });
        }

        if (
            !assertBranchAccess(
                req.user,
                record
            )
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to view this record."
            });
        }

        return res.json({
            success: true,
            record
        });
    } catch (error) {
        console.error(
            "GET RECORD ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load record."
        });
    }
};

// =========================================
// UPDATE / EDIT RECORD
// =========================================

const updateRecord = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action."
            });
        }

        const { id } = req.params;

        const {
            category,
            name,
            date_of_birth,
            date_of_death,
            phone_number,
            registration_date,
            status,
            registrar,
            notes
        } = req.body;

        if (
            boundedText(category, 100) === null ||
            boundedText(name, 150) === null ||
            boundedText(registrar, 150) === null ||
            boundedText(notes, 5000) === null
        ) {
            return res.status(400).json({
                success: false,
                message: "One or more record fields exceed the allowed length."
            });
        }

        for (const dateValue of [date_of_birth, date_of_death, registration_date]) {
            if (dateValue && !isIsoDate(dateValue)) {
                return res.status(400).json({
                    success: false,
                    message: "Record dates must use YYYY-MM-DD format."
                });
            }
        }

        const existingResult =
            await pool.query(
                `
                    SELECT
                        id,
                        status,
                        registrar
                    FROM records
                    WHERE id = $1
                    LIMIT 1
                `,
                [id]
            );

        const existingRecord =
            existingResult.rows[0];

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message:
                    "Customer name is required."
            });
        }

        if (
            category &&
            String(category)
                .toLowerCase()
                .trim() === "death" &&
            !date_of_death
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Date of death is required for Death records."
            });
        }

        if (!existingRecord) {
            return res.status(404).json({
                success: false,
                message:
                    "Record not found."
            });
        }

        const existingStatus = normalizeStatusValue(
            existingRecord.status ||
            "Pending"
        );

        const nextStatus =
            existingStatus === "Processing"
                ? "Processing"
                : status !== undefined &&
                    status !== null &&
                    String(status).trim() !== ""
                    ? normalizeStatusValue(status)
                    : existingStatus;

        const nextRegistrar =
            registrar !== undefined &&
            registrar !== null &&
            String(registrar).trim() !== ""
                ? String(registrar).trim()
                : String(
                    existingRecord.registrar ||
                    req.user?.name ||
                    "Unknown"
                ).trim() || "Unknown";

        // Format phone number to Ghana format (233...)
        const formattedPhone = formatPhoneNumber(phone_number);

        const result =
            await pool.query(
                `
                    UPDATE records
                    SET
                        category = $1,
                        name = $2,
                        date_of_birth = $3,
                        date_of_death = $4,
                        phone_number = $5,
                        registration_date = $6,
                        status = $7,
                        registrar = $8,
                        notes = $9,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $10
                    RETURNING *
                `,
                [
                    category || null,
                    name.trim(),
                    date_of_birth || null,
                    date_of_death || null,
                    formattedPhone,
                    registration_date || null,
                    nextStatus,
                    nextRegistrar,
                    notes || null,
                    id
                ]
            );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Record not found."
            });
        }

        // =========================================
        // TRIGGER n8n WHEN STATUS CHANGES TO READY
        // =========================================

        if (
            nextStatus === "Ready" &&
            normalizeStatusValue(
                existingRecord.status
            ) !== "Ready"
        ) {
            try {
                const workflowResult = await sendToN8N({
                    recordId:
                        result.rows[0].id,
                    category:
                        result.rows[0].category,
                    name:
                        result.rows[0].name,
                    dateOfBirth:
                        result.rows[0].date_of_birth,
                    dateOfDeath:
                        result.rows[0].date_of_death,
                    phoneNumber:
                        result.rows[0].phone_number,
                    registrar:
                        result.rows[0].registrar,
                    registrationDate:
                        result.rows[0].registration_date,
                    status:
                        result.rows[0].status,
                    notes:
                        result.rows[0].notes
                });

                await saveSmsWorkflowState(
                    result.rows[0].id,
                    workflowResult
                );

                console.log(
                    `n8n workflow triggered for updated record ${result.rows[0].id}`
                );
            } catch (n8nError) {
                await pool.query(
                    `
                        UPDATE records
                        SET sms_sent = 'false',
                            sms_status = 'Error',
                            sms_error = $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `,
                    [n8nError.message, result.rows[0].id]
                );

                console.error(
                    "N8N WEBHOOK ERROR:",
                    n8nError.message
                );
            }
        }

        return res.json({
            success: true,
            message:
                "Record updated successfully.",
            record:
                result.rows[0]
        });
    } catch (error) {
        console.error(
            "UPDATE RECORD ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to update record."
        });
    }
};

// =========================================
// UPDATE SMS DETAILS / NOTE
// =========================================

const updateSmsDetails = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action."
            });
        }

        const { id } = req.params;
        const clearSms = req.body?.clearSms === true;
        const clearNote = req.body?.clearNote === true;

        if (!clearSms && !clearNote) {
            return res.status(400).json({
                success: false,
                message: "Select SMS details or note to clear."
            });
        }

        const result = await pool.query(
            `
                UPDATE records
                SET
                    sms_sent = CASE
                        WHEN $1 THEN 'false'
                        ELSE sms_sent
                    END,
                    sms_date = CASE
                        WHEN $1 THEN NULL
                        ELSE sms_date
                    END,
                    sms_status = CASE
                        WHEN $1 THEN 'Not Sent'
                        ELSE sms_status
                    END,
                    sms_error = CASE
                        WHEN $1 THEN NULL
                        ELSE sms_error
                    END,
                    notes = CASE
                        WHEN $2 THEN NULL
                        ELSE notes
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `,
            [clearSms, clearNote, id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: "Record not found."
            });
        }

        return res.json({
            success: true,
            message: clearSms && clearNote
                ? "SMS details and note cleared successfully."
                : clearSms
                    ? "SMS details cleared successfully."
                    : "Note cleared successfully.",
            record: result.rows[0]
        });
    } catch (error) {
        console.error("UPDATE SMS DETAILS ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to clear SMS details or note."
        });
    }
};

// =========================================
// APPROVE / SET READY
// =========================================

const approveRecord = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action."
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        const existingResult = await pool.query(
            "SELECT id, status FROM records WHERE id = $1 LIMIT 1",
            [id]
        );

        if (!existingResult.rows.length) {
            return res.status(404).json({
                success: false,
                message: "Record not found."
            });
        }

        if (
            normalizeStatusValue(existingResult.rows[0].status) ===
            "Processing"
        ) {
            return res.status(409).json({
                success: false,
                message: "Processing cases must be approved from the Account page."
            });
        }

        const newStatus =
            normalizeStatusValue(status);

        if (
            !["Ready", "Not Ready"].includes(
                newStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Status must be Ready or Not Ready."
            });
        }

        const result =
            await pool.query(
                `
                    UPDATE records
                    SET
                        status = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING *
                `,
                [
                    newStatus,
                    id
                ]
            );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Record not found."
            });
        }

        // =========================================
        // TRIGGER n8n WHEN RECORD BECOMES READY
        // =========================================

        if (newStatus === "Ready") {
            try {
                const workflowResult = await sendToN8N({
                    recordId:
                        result.rows[0].id,
                    category:
                        result.rows[0].category,
                    name:
                        result.rows[0].name,
                    dateOfBirth:
                        result.rows[0].date_of_birth,
                    dateOfDeath:
                        result.rows[0].date_of_death,
                    phoneNumber:
                        result.rows[0].phone_number,
                    registrar:
                        result.rows[0].registrar,
                    registrationDate:
                        result.rows[0].registration_date,
                    status:
                        result.rows[0].status,
                    notes:
                        result.rows[0].notes
                });

                await saveSmsWorkflowState(
                    result.rows[0].id,
                    workflowResult
                );

                console.log(
                    `n8n workflow triggered for record ${result.rows[0].id}`
                );
            } catch (n8nError) {
                await pool.query(
                    `
                        UPDATE records
                        SET sms_sent = 'false',
                            sms_status = 'Error',
                            sms_error = $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `,
                    [n8nError.message, result.rows[0].id]
                );

                console.error(
                    "N8N WEBHOOK ERROR:",
                    n8nError.message
                );
            }
        }

        return res.json({
            success: true,
            message:
                newStatus === "Ready"
                    ? "status is Ready"
                    : "status is not ready",
            record:
                result.rows[0]
        });
    } catch (error) {
        console.error(
            "APPROVE RECORD ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to update record status."
        });
    }
};

// =========================================
// APPROVE PROCESSING RECORD
// =========================================

const approveProcessingRecord = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to approve cases."
            });
        }

        const result = await pool.query(
            `
                UPDATE records
                SET
                    status = 'Pending',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                  AND LOWER(REPLACE(REPLACE(COALESCE(status, ''), '_', ' '), '-', ' ')) = 'processing'
                RETURNING *
            `,
            [req.params.id]
        );

        if (!result.rows.length) {
            const existing = await pool.query(
                "SELECT id, status FROM records WHERE id = $1 LIMIT 1",
                [req.params.id]
            );

            if (!existing.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found."
                });
            }

            return res.status(409).json({
                success: false,
                message: "Only Processing cases can be approved."
            });
        }

        return res.json({
            success: true,
            message: "Case approved and moved to Pending.",
            record: result.rows[0]
        });
    } catch (error) {
        console.error("APPROVE PROCESSING RECORD ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to approve case."
        });
    }
};

// =========================================
// DELETE RECORD
// =========================================

const deleteRecord = async (req, res) => {
    try {
        if (!canMutateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action."
            });
        }

        const { id } = req.params;

        const result =
            await pool.query(
                `
                    DELETE FROM records
                    WHERE id = $1
                    RETURNING *
                `,
                [id]
            );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message:
                    "Record not found."
            });
        }

        return res.json({
            success: true,
            message:
                "Record deleted successfully.",
            record:
                result.rows[0]
        });
    } catch (error) {
        console.error(
            "DELETE RECORD ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to delete record."
        });
    }
};

// =========================================
// SEND SMS
// =========================================

const sendSms = async (req, res) => {
    try {
        if (!canCreateRecords(req.user)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action."
            });
        }

        const { id } = req.params;
        const message = String(req.body?.message || "").trim();

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Message is required."
            });
        }

        if (message.length > 160) {
            return res.status(400).json({
                success: false,
                message: "Message must not exceed 160 characters."
            });
        }

        const recordResult = await pool.query(
            `
                SELECT
                    id,
                    name,
                    category,
                    date_of_birth,
                    date_of_death,
                    phone_number,
                    registrar,
                    registration_date,
                    status,
                    notes,
                    branch_id,
                    sms_sent,
                    sms_status
                FROM records
                WHERE id = $1
                LIMIT 1
            `,
            [id]
        );

        const record = recordResult.rows[0];

        if (!record) {
            return res.status(404).json({
                success: false,
                message: "Record not found."
            });
        }

        if (!assertBranchAccess(req.user, record)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to send SMS for this record."
            });
        }

        if (normalizeStatusValue(record.status) !== "Ready") {
            return res.status(400).json({
                success: false,
                message: "SMS can only be sent for Ready records."
            });
        }

        if (String(record.sms_sent).toLowerCase() === "true") {
            return res.status(409).json({
                success: false,
                message: "SMS has already been sent for this record."
            });
        }

        const phoneNumber = formatPhoneNumber(record.phone_number);

        if (!isValidPhoneNumber(phoneNumber)) {
            return res.status(400).json({
                success: false,
                message: "The record does not contain a valid phone number."
            });
        }

        const claimResult = await pool.query(
            `
                UPDATE records
                SET sms_status = 'Sending',
                    sms_error = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
                  AND status = 'Ready'
                  AND COALESCE(LOWER(sms_sent), 'false') <> 'true'
                  AND (
                      COALESCE(sms_status, '') <> 'Sending'
                      OR updated_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
                  )
                RETURNING id
            `,
            [id]
        );

        if (!claimResult.rowCount) {
            return res.status(409).json({
                success: false,
                message: "An SMS is already being processed for this record."
            });
        }

        try {
            const workflowResult = await sendToN8N({
                recordId: record.id,
                category: record.category,
                name: record.name,
                dateOfBirth: record.date_of_birth,
                dateOfDeath: record.date_of_death,
                phoneNumber,
                registrar: record.registrar,
                registrationDate: record.registration_date,
                status: record.status,
                notes: record.notes,
                message
            });

            const smsSent = await saveSmsWorkflowState(record.id, workflowResult);

            const updatedResult = await pool.query(
                `
                    SELECT id, phone_number, sms_sent, sms_status, sms_error, sms_date
                    FROM records
                    WHERE id = $1
                `,
                [id]
            );

            const updatedRecord = updatedResult.rows[0] || {};

            return res.json({
                success: true,
                message: smsSent
                    ? "SMS sent successfully!"
                    : "SMS request queued for processing.",
                details: {
                    phone_number: updatedRecord.phone_number || phoneNumber,
                    message,
                    record_id: id,
                    sent_at: updatedRecord.sms_date || new Date().toISOString()
                }
            });
        } catch (workflowError) {
            await pool.query(
                `
                    UPDATE records
                    SET sms_sent = 'false',
                        sms_status = 'Error',
                        sms_error = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `,
                [String(workflowError.message || "SMS workflow failed.").slice(0, 1000), id]
            );

            return res.status(502).json({
                success: false,
                message: "Unable to send SMS. Please try again."
            });
        }
    } catch (error) {
        console.error("SEND SMS ERROR:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to send SMS. Please try again."
        });
    }
};

module.exports = {
    createRecord,
    getRecords,
    getProcessingRecords,
    getDashboardSummary,
    getRecentTodayRecords,
    searchRecords,
    getRecordRegistrars,
    getSmsStatus,
    getRecordById,
    updateRecord,
    updateSmsDetails,
    approveRecord,
    approveProcessingRecord,
    deleteRecord,
    sendSms
};
