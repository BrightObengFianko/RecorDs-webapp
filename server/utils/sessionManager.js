const crypto = require("crypto");

const DEFAULT_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function parseDuration(value) {
    const raw = String(value || "").trim().toLowerCase();
    const match = raw.match(/^(\d+)\s*(ms|s|m|h|d)?$/);

    if (!match) return DEFAULT_SESSION_DURATION_MS;

    const amount = Number(match[1]);
    const unit = match[2] || "ms";
    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return amount * (multipliers[unit] || 1);
}

function sessionExpiresAt() {
    return new Date(Date.now() + parseDuration(process.env.JWT_EXPIRES_IN || "8h"));
}

function normalizeDeviceId(value) {
    const deviceId = String(value || "").trim();

    return /^[A-Za-z0-9_-]{16,128}$/.test(deviceId)
        ? deviceId
        : crypto.randomUUID();
}

function getDeviceMetadata(request, requestedDeviceId) {
    const userAgent = String(request?.get?.("user-agent") || "").slice(0, 500);
    const lowerAgent = userAgent.toLowerCase();
    const deviceType = /mobile|android|iphone|ipad|ipod/i.test(userAgent)
        ? "Mobile"
        : "Desktop";
    const operatingSystem = lowerAgent.includes("windows")
        ? "Windows"
        : lowerAgent.includes("android")
            ? "Android"
            : lowerAgent.includes("iphone") || lowerAgent.includes("ipad") || lowerAgent.includes("ios")
                ? "iOS"
                : lowerAgent.includes("mac os")
                    ? "macOS"
                    : lowerAgent.includes("linux")
                        ? "Linux"
                        : "Unknown";
    const browser = lowerAgent.includes("edg/")
        ? "Microsoft Edge"
        : lowerAgent.includes("chrome/")
            ? "Google Chrome"
            : lowerAgent.includes("firefox/")
                ? "Mozilla Firefox"
                : lowerAgent.includes("safari/")
                    ? "Safari"
                    : "Unknown browser";

    return {
        deviceId: normalizeDeviceId(requestedDeviceId),
        deviceName: `${operatingSystem} ${deviceType}`.slice(0, 100),
        deviceType,
        browser,
        operatingSystem,
        userAgent
    };
}

module.exports = {
    getDeviceMetadata,
    sessionExpiresAt
};
