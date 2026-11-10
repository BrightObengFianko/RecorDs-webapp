const WINDOW_MS = 15 * 60 * 1000;
const ALERT_THRESHOLD = 3;
const MAX_FAILURES = 8;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;

const { clearKeys, isBlocked, recordFailures } = require("../utils/rateLimitStore");

function getKeys(req) {
    const identity = String(req.body?.email || "")
        .trim()
        .toLowerCase();

    const ip = req.ip || "unknown";

    return [
        `ip:${ip}`,
        `identity:${ip}:${identity}`
    ];
}

async function loginRateLimiter(req, res, next) {
    try {
        const blocked = (await Promise.all(getKeys(req).map(key => isBlocked(key)))).some(Boolean);
        if (blocked) {
            res.set("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
            return res.status(429).json({ success: false, message: "Too many login attempts. Please try again later." });
        }
        return next();
    } catch (error) {
        console.error("LOGIN RATE LIMITER ERROR:", error.message);
        return res.status(503).json({ success: false, message: "Unable to process login safely. Please try again." });
    }
}

async function recordLoginFailure(req) {
    const result = await recordFailures(getKeys(req), {
        windowMs: WINDOW_MS,
        maxFailures: MAX_FAILURES,
        lockMs: MAX_LOCK_MS
    });
    return {
        count: result.count || 1,
        thresholdReached: (result.count || 1) >= ALERT_THRESHOLD,
        locked: result.thresholdReached
    };
}

async function clearLoginFailures(req) {
    await clearKeys(getKeys(req));
}

module.exports = {
    clearLoginFailures,
    loginRateLimiter,
    recordLoginFailure
};
