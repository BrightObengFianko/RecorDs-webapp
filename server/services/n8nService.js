function getN8NConfigStatus() {
    const webhookUrl = String(process.env.N8N_WEBHOOK_URL || "").trim();
    const webhookSecret = String(process.env.N8N_WEBHOOK_SECRET || "").trim();

    let hostname = null;
    try {
        hostname = webhookUrl ? new URL(webhookUrl).hostname : null;
    } catch (error) {
        hostname = null;
    }

    return {
        n8nConfigured: Boolean(webhookUrl && webhookSecret),
        webhookUrlConfigured: Boolean(webhookUrl),
        webhookSecretConfigured: Boolean(webhookSecret),
        webhookHost: hostname
    };
}

const sendToN8N = async (data) => {
    const webhookUrl = String(process.env.N8N_WEBHOOK_URL || "").trim();
    const webhookSecret = String(process.env.N8N_WEBHOOK_SECRET || "").trim();

    if (!webhookUrl || !webhookSecret) {
        const error = new Error("SMS service is not configured. Please contact the administrator.");
        error.code = "N8N_NOT_CONFIGURED";
        throw error;
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(webhookUrl);
    } catch (error) {
        throw new Error("n8n webhook URL is invalid.");
    }

    if (
        parsedUrl.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)
    ) {
        const error = new Error("SMS service is not configured. Please contact the administrator.");
        error.code = "N8N_INVALID_URL";
        throw error;
    }

    if (
        process.env.NODE_ENV === "production" &&
        ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)
    ) {
        const error = new Error("SMS service is not configured. Please contact the administrator.");
        error.code = "N8N_LOCAL_URL_IN_PRODUCTION";
        throw error;
    }

    const timeoutMs = Math.min(
        Math.max(Number.parseInt(process.env.N8N_WEBHOOK_TIMEOUT_MS || "10000", 10), 1000),
        30000
    );

    let response;
    try {
        response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-N8N-Webhook-Secret": webhookSecret
            },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (error) {
        return {
            success: false,
            accepted: true,
            status: "SENDING",
            message: "The SMS request may still be processing; its final status will be checked.",
            transportError: error.message
        };
    }

    if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        let responseBody = null;
        try {
            responseBody = responseText ? JSON.parse(responseText) : null;
        } catch (error) {
            responseBody = responseText || null;
        }
        const providerMessage = responseBody && typeof responseBody === "object"
            ? responseBody.error || responseBody.message
            : typeof responseBody === "string"
                ? responseBody
                : null;
        const error = new Error(
            providerMessage || "The SMS service rejected the request. Please try again."
        );
        error.code = "N8N_HTTP_ERROR";
        error.status = response.status;
        error.response = responseBody;

        if (response.status >= 500) {
            return {
                success: false,
                accepted: true,
                status: "SENDING",
                message: "The SMS request may still be processing; its final status will be checked.",
                httpStatus: response.status
            };
        }

        throw error;
    }

    const responseText = await response.text();

    if (!responseText.trim()) {
        return {
            success: false,
            accepted: true,
            status: "SENDING",
            httpStatus: response.status
        };
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        return {
            success: false,
            accepted: true,
            status: "SENDING",
            httpStatus: response.status,
            message: responseText
        };
    }
};

module.exports = {
    getN8NConfigStatus,
    sendToN8N
};
