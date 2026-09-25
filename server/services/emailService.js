const { Resend } = require("resend");

let resendClient;

function getResendClient() {
    if (resendClient) return resendClient;

    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    if (!apiKey) throw new Error("Resend password reset delivery is not configured.");

    resendClient = new Resend(apiKey);
    return resendClient;
}

function getSender() {
    // Resend permits this sender for initial account testing. Replace it with
    // EMAIL_FROM after a domain is verified for production delivery.
    const address = String(process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
    const name = String(process.env.EMAIL_FROM_NAME || "RecorDs").trim();
    if (!address) throw new Error("EMAIL_FROM must be configured for password reset delivery.");
    return `${name} <${address}>`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[character]));
}

async function sendPasswordResetEmail({ to, code, resetUrl }) {
    const safeCode = escapeHtml(code);
    const safeResetUrl = escapeHtml(resetUrl);
    const result = await getResendClient().emails.send({
        from: getSender(),
        to,
        subject: "RecorDs Password Reset Code",
        text: [
            "Hello,",
            "",
            "A password reset was requested for your RecorDs account.",
            "",
            `Reset code: ${code}`,
            `This code expires in 10 minutes. You can also open: ${resetUrl}`,
            "",
            "If you did not request a password reset, you can safely ignore this email.",
            "For your security, never share this code with anyone.",
            "",
            "Regards,",
            "RecorDs Records Management System"
        ].join("\n"),
        html: `
            <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Arial,sans-serif;color:#172033;background:#f6f8fc">
                <div style="padding:28px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff">
                    <p style="margin:0 0 20px;color:#5735e8;font-size:20px;font-weight:700">RecorDs</p>
                    <h1 style="margin:0 0 14px;font-size:24px">Password Reset</h1>
                    <p>A password reset was requested for your RecorDs account.</p>
                    <p style="margin:24px 0 8px">Your verification code is:</p>
                    <p style="margin:0 0 20px;padding:16px;border-radius:10px;background:#f1efff;color:#5735e8;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center">${safeCode}</p>
                    <p>This code expires in 10 minutes. You can also <a href="${safeResetUrl}">open the reset page</a>.</p>
                    <p style="color:#667085;font-size:13px">If you did not request a password reset, you can safely ignore this email. Never share this code with anyone.</p>
                </div>
            </div>
        `
    });

    if (result?.error) throw new Error("Resend rejected the password reset email.");
    return result?.data || result;
}

async function sendPasswordResetConfirmationEmail({ to }) {
    const result = await getResendClient().emails.send({
        from: getSender(),
        to,
        subject: "RecorDs Password Changed",
        text: "Your RecorDs password was changed successfully. If you did not make this change, contact an administrator immediately.",
        html: "<p>Your RecorDs password was changed successfully.</p><p>If you did not make this change, contact an administrator immediately.</p>"
    });

    if (result?.error) throw new Error("Resend rejected the password confirmation email.");
    return result?.data || result;
}

module.exports = { sendPasswordResetConfirmationEmail, sendPasswordResetEmail };
