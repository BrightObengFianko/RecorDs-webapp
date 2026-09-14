const ARKESEL_BALANCE_URL =
    process.env.ARKESEL_BALANCE_URL ||
    "https://sms.arkesel.com/api/v2/sms/balance";

const { getN8NConfigStatus } = require("../services/n8nService");

function getN8NStatus(req, res) {
    return res.json({
        success: true,
        ...getN8NConfigStatus()
    });
}

function readFirstValue(source, keys) {
    for (const key of keys) {
        if (source && source[key] !== undefined && source[key] !== null) {
            return source[key];
        }
    }

    return null;
}

async function getSmsBalance(req, res) {
    if (!process.env.ARKESEL_API_KEY) {
        return res.status(503).json({
            success: false,
            message: "Arkesel SMS API is not configured."
        });
    }

    try {
        const response = await fetch(ARKESEL_BALANCE_URL, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "api-key": process.env.ARKESEL_API_KEY
            },
            signal: AbortSignal.timeout(8000)
        });

        const payload = await response.json().catch(() => ({}));
        const source = payload?.data && typeof payload.data === "object"
            ? { ...payload, ...payload.data }
            : payload;

        if (!response.ok || (payload.status && payload.status !== "success")) {
            return res.status(502).json({
                success: false,
                message: "Unable to load the Arkesel SMS balance."
            });
        }

        const smsBalance = readFirstValue(source, [
            "sms_balance",
            "balance",
            "credits",
            "credit"
        ]);

        const configuredBundle = readFirstValue(source, [
            "bundle",
            "sms_bundle",
            "package",
            "plan"
        ]) || process.env.ARKESEL_SMS_BUNDLE || null;

        return res.json({
            success: true,
            balance: smsBalance,
            bundle: configuredBundle || (
                smsBalance === null
                    ? null
                    : `${smsBalance} SMS credits available`
            ),
            buyUrl: process.env.ARKESEL_BUNDLE_URL || null
        });
    } catch (error) {
        console.error("ARKESEL BALANCE ERROR:", error.message);

        return res.status(502).json({
            success: false,
            message: "Unable to connect to the Arkesel SMS service."
        });
    }
}

module.exports = {
    getN8NStatus,
    getSmsBalance
};
