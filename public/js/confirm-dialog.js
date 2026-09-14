
(function () {
    let dialogContainer = null;

    /**
     * Initialize the dialog container
     */
    function initializeContainer() {
        if (dialogContainer) {
            return;
        }

        dialogContainer = document.createElement("div");
        dialogContainer.className = "confirm-dialog-overlay";
        dialogContainer.setAttribute("role", "presentation");
        document.body.appendChild(dialogContainer);
    }

    /**
     * Show a confirmation dialog
     * @param {string} message - The confirmation message
     * @param {string} title - Optional dialog title
     * @param {string} confirmText - Text for confirm button (default: "Yes")
     * @param {string} cancelText - Text for cancel button (default: "Cancel")
     * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
     */
    function confirm(message, title = "Confirm", confirmText = "Yes", cancelText = "Cancel") {
        return new Promise((resolve) => {
            initializeContainer();

            const dialog = document.createElement("div");
            dialog.className = "confirm-dialog-modal";
            dialog.setAttribute("role", "alertdialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.setAttribute("aria-labelledby", "confirm-dialog-title");

            dialog.innerHTML = `
                <div class="confirm-dialog-content">
                    <div class="confirm-dialog-header">
                        <h2 id="confirm-dialog-title" class="confirm-dialog-title">${escapeHtml(title)}</h2>
                        <button type="button" class="confirm-dialog-close" aria-label="Close" title="Close">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                                    <line x1="5" y1="5" x2="19" y2="19"></line>
                                    <line x1="19" y1="5" x2="5" y2="19"></line>
                                </g>
                            </svg>
                        </button>
                    </div>

                    <div class="confirm-dialog-body">
                        <p class="confirm-dialog-message">${escapeHtml(message)}</p>
                    </div>

                    <div class="confirm-dialog-footer">
                        <button type="button" class="confirm-dialog-cancel-btn" data-action="cancel">
                            ${escapeHtml(cancelText)}
                        </button>
                        <button type="button" class="confirm-dialog-confirm-btn" data-action="confirm">
                            ${escapeHtml(confirmText)}
                        </button>
                    </div>
                </div>
            `;

            // Add to container and trigger animation
            dialogContainer.appendChild(dialog);
            dialogContainer.classList.add("confirm-dialog-overlay-active");

            window.requestAnimationFrame(() => {
                dialog.classList.add("confirm-dialog-enter");
            });

            // Handle button clicks
            const handleAction = (action) => {
                removeDialog(dialog);
                resolve(action === "confirm");
            };

            const confirmBtn = dialog.querySelector("[data-action='confirm']");
            const cancelBtn = dialog.querySelector("[data-action='cancel']");
            const closeBtn = dialog.querySelector(".confirm-dialog-close");

            if (confirmBtn) {
                confirmBtn.addEventListener("click", () => handleAction("confirm"));
                confirmBtn.focus(); // Focus confirm button by default
            }

            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => handleAction("cancel"));
            }

            if (closeBtn) {
                closeBtn.addEventListener("click", () => handleAction("cancel"));
            }

            // Handle keyboard events
            const handleKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    handleAction("cancel");
                } else if (event.key === "Enter") {
                    event.preventDefault();
                    handleAction("confirm");
                }
            };

            dialog.addEventListener("keydown", handleKeyDown);

            // Handle overlay click
            const handleOverlayClick = (event) => {
                if (event.target === dialogContainer) {
                    handleAction("cancel");
                }
            };

            dialogContainer.addEventListener("click", handleOverlayClick);

            // Cleanup on resolve
            return Promise.resolve().then(() => {
                dialog.removeEventListener("keydown", handleKeyDown);
                dialogContainer.removeEventListener("click", handleOverlayClick);
            });
        });
    }

    /**
     * Remove a dialog with animation
     */
    function removeDialog(dialog) {
        dialog.classList.remove("confirm-dialog-enter");
        dialog.classList.add("confirm-dialog-exit");

        dialog.addEventListener("animationend", () => {
            dialog.remove();
            
            // Check if there are any more dialogs
            if (dialogContainer && !dialogContainer.querySelector(".confirm-dialog-modal")) {
                dialogContainer.classList.remove("confirm-dialog-overlay-active");
            }
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

    // Export to global scope
    window.ConfirmDialog = {
        show: confirm
    };
})();
