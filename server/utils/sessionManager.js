const crypto = require("crypto");

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function sessionExpiresAt(startedAt = Date.now()) {
    return new Date(new Date(startedAt).getTime() + MAX_SESSION_DURATION_MS);
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
    ACCESS_TOKEN_EXPIRES_IN,
    INACTIVITY_TIMEOUT_MS,
    MAX_SESSION_DURATION_MS,
    getDeviceMetadata,
    sessionExpiresAt
};
