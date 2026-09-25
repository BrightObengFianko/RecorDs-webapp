(function () {
    const api = path => `/api/auth/password-reset/${path}`;
    const notify = (type, message) => {
        if (window.Notification && typeof window.Notification[type] === "function") {
            window.Notification[type](message);
        } else {
            document.querySelector(".subtitle")?.replaceChildren(document.createTextNode(message));
        }
    };
    const setBusy = (button, busy, label) => {
        if (!button) return;
        button.disabled = busy;
        button.querySelector("span")?.replaceChildren(document.createTextNode(busy ? label : button.dataset.label));
    };
    const post = async (path, body) => {
        const response = await fetch(api(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Unable to complete the request.");
        return data;
    };

    document.querySelectorAll(".login-button").forEach(button => {
        const label = button.querySelector("span")?.textContent || "Continue";
        button.dataset.label = label;
    });

    const forgotForm = document.getElementById("forgotPasswordForm");
    if (forgotForm) {
        forgotForm.addEventListener("submit", async event => {
            event.preventDefault();
            const button = document.getElementById("sendResetButton");
            setBusy(button, true, "Sending...");
            try {
                const data = await post("request", { identity: document.getElementById("resetIdentity").value });
                sessionStorage.setItem("recordsResetIdentity", document.getElementById("resetIdentity").value.trim());
                notify("success", data.message);
                setTimeout(() => { window.location.href = "verify-reset-code.html"; }, 500);
            } catch (error) {
                notify("error", error.message);
                setBusy(button, false, "Send Reset Code");
            }
        });
    }

    const verifyForm = document.getElementById("verifyResetForm");
    if (verifyForm) {
        const codeInput = document.getElementById("resetCode");
        const queryToken = new URLSearchParams(window.location.search).get("token");
        if (queryToken && /^\d{6}$/.test(queryToken)) codeInput.value = queryToken;
        verifyForm.addEventListener("submit", async event => {
            event.preventDefault();
            const button = document.getElementById("verifyResetButton");
            setBusy(button, true, "Verifying...");
            try {
                const data = await post("verify", { code: codeInput.value });
                sessionStorage.setItem("recordsResetToken", data.resetToken);
                window.location.href = "reset-password.html";
            } catch (error) {
                notify("error", error.message);
                setBusy(button, false, "Verify Code");
            }
        });
        document.getElementById("resendResetButton")?.addEventListener("click", async () => {
            const identity = sessionStorage.getItem("recordsResetIdentity");
            if (!identity) {
                notify("info", "Return to Forgot Password to request a new code.");
                return;
            }
            try {
                const data = await post("request", { identity });
                notify("success", data.message);
            } catch (error) {
                notify("error", error.message);
            }
        });
    }

    document.querySelectorAll(".reset-password-toggle").forEach(button => {
        button.addEventListener("click", () => {
            const input = document.getElementById(button.dataset.target);
            const visible = input.type === "text";
            input.type = visible ? "password" : "text";
            button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
            button.title = visible ? "Show password" : "Hide password";
        });
    });

    const resetForm = document.getElementById("resetPasswordForm");
    if (resetForm) {
        resetForm.addEventListener("submit", async event => {
            event.preventDefault();
            const button = document.getElementById("resetPasswordButton");
            setBusy(button, true, "Changing...");
            try {
                await post("complete", {
                    resetToken: sessionStorage.getItem("recordsResetToken"),
                    password: document.getElementById("newPassword").value,
                    confirmation: document.getElementById("confirmPassword").value
                });
                sessionStorage.removeItem("recordsResetToken");
                sessionStorage.removeItem("recordsResetIdentity");
                notify("success", "Your password has been changed successfully.");
                setTimeout(() => { window.location.href = "index.html"; }, 700);
            } catch (error) {
                notify("error", error.message);
                setBusy(button, false, "Change Password");
            }
        });
    }
}());
