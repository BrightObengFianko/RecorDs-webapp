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
        const networkError = new Error("Unable to reach the SMS service. Please try again.");
        networkError.code = "N8N_NETWORK_ERROR";
        networkError.cause = error;
        throw networkError;
    }

    if (!response.ok) {
        await response.text().catch(() => "");
        const error = new Error("The SMS service rejected the request. Please try again.");
        error.code = "N8N_HTTP_ERROR";
        error.status = response.status;
        throw error;
    }

    const responseText = await response.text();

    if (!responseText.trim()) {
        return { success: true };
    }

    try {
        return JSON.parse(responseText);
    } catch (error) {
        return {
            success: true,
            message: responseText
        };
    }
};

module.exports = {
    getN8NConfigStatus,
    sendToN8N
};
