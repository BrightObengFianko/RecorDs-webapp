/**
 * Modern Notification System
 * Provides a beautiful, animated notification system instead of native browser alerts.
 */
(function () {
    let notificationContainer = null;
    let notificationId = 0;

    /**
     * Initialize the notification container
     */
    function initializeContainer() {
        if (notificationContainer) {
            return;
        }

        notificationContainer = document.createElement("div");
        notificationContainer.className = "notification-container";
        document.body.appendChild(notificationContainer);
    }

    /**
     * Show a notification
     * @param {string} message - The notification message
     * @param {string} type - Type of notification: 'success', 'error', 'info', 'warning'
     * @param {number} duration - Duration in milliseconds (0 = manual close only)
     */
    function show(message, type = "info", duration = 4000) {
        initializeContainer();

        const id = ++notificationId;
        const notification = document.createElement("div");
        notification.className = `notification notification-${type}`;
        notification.setAttribute("role", "alert");
        notification.setAttribute("data-notification-id", id);

        // Determine icon based on type
        let iconSvg = "";
        switch (type) {
            case "success":
                iconSvg = `
                    <svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </g>
                    </svg>
                `;
                break;
            case "error":
                iconSvg = `
                    <svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </g>
                    </svg>
                `;
                break;
            case "warning":
                iconSvg = `
                    <svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </g>
                    </svg>
                `;
                break;
            case "info":
            default:
                iconSvg = `
                    <svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </g>
                    </svg>
                `;
                break;
        }

        notification.innerHTML = `
            <div class="notification-content">
                ${iconSvg}
                <div class="notification-text">
                    ${escapeHtml(message)}
                </div>
            </div>
            <button class="notification-close" type="button" aria-label="Close notification" data-notification-id="${id}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="5" y1="5" x2="19" y2="19"></line>
                        <line x1="19" y1="5" x2="5" y2="19"></line>
                    </g>
                </svg>
            </button>
            <div class="notification-progress"></div>
        `;

        notificationContainer.appendChild(notification);

        // Trigger animation
        window.requestAnimationFrame(() => {
            notification.classList.add("notification-enter");
        });

        // Close button handler
        const closeButton = notification.querySelector(".notification-close");
        if (closeButton) {
            closeButton.addEventListener("click", () => {
                removeNotification(notification);
            });
        }

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                removeNotification(notification);
            }, duration);
        }

        return id;
    }

    /**
     * Remove a notification with animation
     */
    function removeNotification(notification) {
        notification.classList.remove("notification-enter");
        notification.classList.add("notification-exit");

        notification.addEventListener("animationend", () => {
            notification.remove();
        }, { once: true });
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return String(text).replace(/[&<>"']/g, (m) => map[m]);
    }

    /**
     * Show success notification
     */
    function success(message, duration = 4000) {
        return show(message, "success", duration);
    }

    /**
     * Show error notification
     */
    function error(message, duration = 5000) {
        return show(message, "error", duration);
    }

    /**
     * Show warning notification
     */
    function warning(message, duration = 4000) {
        return show(message, "warning", duration);
    }

    /**
     * Show info notification
     */
    function info(message, duration = 4000) {
        return show(message, "info", duration);
    }

    // Export to global scope
    window.Notification = {
        show,
        success,
        error,
        warning,
        info
    };
})();
