const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;

const attempts = new Map();

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

function prune(now) {
    for (const [key, entry] of attempts) {
        if (now - entry.firstFailureAt > WINDOW_MS && entry.lockedUntil <= now) {
            attempts.delete(key);
        }
    }
}

function loginRateLimiter(req, res, next) {
    const now = Date.now();
    prune(now);

    const entry = getKeys(req)
        .map(key => attempts.get(key))
        .find(item => item && item.lockedUntil > now);

    if (entry) {
        const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
        res.set("Retry-After", String(retryAfter));

        return res.status(429).json({
            success: false,
            message: "Too many login attempts. Please try again later."
        });
    }

    return next();
}

function recordLoginFailure(req) {
    const now = Date.now();
    for (const key of getKeys(req)) {
        const current = attempts.get(key);

        if (!current || now - current.firstFailureAt > WINDOW_MS) {
            attempts.set(key, {
                count: 1,
                firstFailureAt: now,
                lockedUntil: 0
            });
            continue;
        }

        current.count += 1;

        if (current.count >= MAX_FAILURES) {
            const lockMultiplier = 2 ** Math.min(current.count - MAX_FAILURES, 4);
            current.lockedUntil = now + Math.min(
                BASE_LOCK_MS * lockMultiplier,
                MAX_LOCK_MS
            );
        }
    }
}

function clearLoginFailures(req) {
    for (const key of getKeys(req)) {
        attempts.delete(key);
    }
}

module.exports = {
    clearLoginFailures,
    loginRateLimiter,
    recordLoginFailure
};
