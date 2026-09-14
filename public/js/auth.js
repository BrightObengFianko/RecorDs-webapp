// LOGIN

const loginForm = document.getElementById("loginForm");

const passwordToggle =
    document.getElementById("passwordToggle");

const passwordInput =
    document.getElementById("password");


if (passwordToggle && passwordInput) {

    passwordToggle.addEventListener(
        "click",
        () => {

            const isVisible =
                passwordInput.type === "text";

            passwordInput.type =
                isVisible
                    ? "password"
                    : "text";

            passwordToggle.setAttribute(
                "aria-label",
                isVisible
                    ? "Show password"
                    : "Hide password"
            );

            passwordToggle.setAttribute(
                "title",
                isVisible
                    ? "Show password"
                    : "Hide password"
            );

        }
    );

}

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {

            const response = await fetch("/api/auth/login", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                if (
                    data.status === "PENDING" ||
                    data.status === "DECLINED"
                ) {
                    Notification.error(
                        data.message ||
                        "Login failed."
                    );
                } else {
                    Notification.error(
                        data.message ||
                        "Login failed."
                    );
                }

                return;
            }

            // Save JWT token
            localStorage.setItem("token", data.token);

            if (data.user && typeof data.user === "object") {
                localStorage.setItem(
                    "user",
                    JSON.stringify(data.user)
                );
            }

            // Redirect to dashboard
            window.location.href = "dashboard.html";

        } catch (error) {

            console.error("LOGIN ERROR:", error);

            Notification.error("Unable to connect to the server.");
        }

    });

}


// SIGNUP

const signupForm = document.getElementById("signupForm");

if (signupForm) {

    signupForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name = document.getElementById("name").value;
        const email = document.getElementById("signupEmail").value;
        const password = document.getElementById("signupPassword").value;
        const confirmPassword =
            document.getElementById("confirmPassword").value;

        if (password !== confirmPassword) {
            Notification.warning("Passwords do not match!");
            return;
        }

        try {

            const response = await fetch("/api/auth/signup", {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    name,
                    email,
                    password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                Notification.error(data.message);
                return;
            }

            Notification.success(data.message);

            // Go back to login
            window.location.href = "index.html";

        } catch (error) {

            console.error(error);

            Notification.error("Unable to connect to the server.");
        }
    });
}
