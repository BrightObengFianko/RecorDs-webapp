const pool = require("../config/database");

function normalizeKey(value) {
    return String(value || "").slice(0, 300);
}

async function isBlocked(key) {
    const result = await pool.query(
        `SELECT locked_until > CURRENT_TIMESTAMP AS blocked
         FROM auth_rate_limits
         WHERE rate_key = $1
         LIMIT 1`,
        [normalizeKey(key)]
    );
    return Boolean(result.rows[0]?.blocked);
}

async function recordFailures(keys, { windowMs, maxFailures, lockMs }) {
    const client = await pool.connect();
    const now = Date.now();
    const windowSeconds = Math.max(1, Math.ceil(Number(windowMs || 900000) / 1000));
    const lockSeconds = Math.max(1, Math.ceil(Number(lockMs || 30000) / 1000));
    let highestCount = 0;

    try {
        await client.query("BEGIN");
        for (const rawKey of keys) {
            const key = normalizeKey(rawKey);
            if (!key) continue;

            const result = await client.query(
                `INSERT INTO auth_rate_limits (rate_key, window_started_at, attempt_count, locked_until)
                 VALUES ($1, CURRENT_TIMESTAMP, 1, NULL)
                 ON CONFLICT (rate_key) DO UPDATE SET
                    window_started_at = CASE
                        WHEN auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
                        THEN CURRENT_TIMESTAMP
                        ELSE auth_rate_limits.window_started_at
                    END,
                    attempt_count = CASE
                        WHEN auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
                        THEN 1
                        ELSE auth_rate_limits.attempt_count + 1
                    END,
                    locked_until = CASE
                        WHEN auth_rate_limits.window_started_at <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second')
                        THEN NULL
                        WHEN auth_rate_limits.attempt_count + 1 >= $3
                        THEN CURRENT_TIMESTAMP + ($4 * INTERVAL '1 second')
                        ELSE auth_rate_limits.locked_until
                    END
                 RETURNING attempt_count, locked_until > CURRENT_TIMESTAMP AS blocked`,
                [key, windowSeconds, Number(maxFailures || 8), lockSeconds]
            );
            highestCount = Math.max(highestCount, Number(result.rows[0]?.attempt_count || 0));
        }
        await client.query("COMMIT");
        return { count: highestCount, thresholdReached: highestCount >= Number(maxFailures || 8) };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

async function clearKeys(keys) {
    const normalized = [...new Set(keys.map(normalizeKey).filter(Boolean))];
    if (!normalized.length) return;
    await pool.query("DELETE FROM auth_rate_limits WHERE rate_key = ANY($1::text[])", [normalized]);
}

async function consumeRateLimit(key, { windowMs, maxAttempts }) {
    const result = await recordFailures([key], {
        windowMs,
        maxFailures: maxAttempts,
        lockMs: windowMs
    });
    return {
        allowed: result.count <= Number(maxAttempts || 5),
        count: result.count
    };
}

module.exports = {
    clearKeys,
    consumeRateLimit,
    isBlocked,
    recordFailures
};
