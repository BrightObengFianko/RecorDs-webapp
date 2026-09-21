
(function () {
    let dialogContainer = null;
    let activeDialog = null;
    let previouslyFocused = null;

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
    function show(message, title = "Confirm", confirmText = "Yes", cancelText = "Cancel") {
        return new Promise((resolve) => {
            initializeContainer();
            previouslyFocused = document.activeElement;

            const dialog = document.createElement("div");
            dialog.className = "confirm-dialog-modal";
            dialog.setAttribute("role", "alertdialog");
            dialog.setAttribute("aria-modal", "true");
            const titleId = `confirm-dialog-title-${Date.now()}`;
            dialog.setAttribute("aria-labelledby", titleId);

            dialog.innerHTML = `
                <div class="confirm-dialog-content">
                    <div class="confirm-dialog-header">
                        <h2 id="${titleId}" class="confirm-dialog-title">${escapeHtml(title)}</h2>
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
            activeDialog = dialog;
            dialogContainer.classList.add("confirm-dialog-overlay-active");

            window.requestAnimationFrame(() => {
                dialog.classList.add("confirm-dialog-enter");
            });

            // Handle button clicks
            let settled = false;
            const handleAction = (action) => {
                if (settled) return;
                settled = true;
                removeDialog(dialog);
                activeDialog = null;
                previouslyFocused?.focus?.();
                resolve(action === "confirm");
            };

            const confirmBtn = dialog.querySelector("[data-action='confirm']");
            const cancelBtn = dialog.querySelector("[data-action='cancel']");
            const closeBtn = dialog.querySelector(".confirm-dialog-close");

            if (confirmBtn) {
                confirmBtn.addEventListener("click", () => handleAction("confirm"));
                confirmBtn.focus();
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
                } else if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
                    event.preventDefault();
                    handleAction("confirm");
                } else if (event.key === "Tab") {
                    const focusable = [...dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
                    if (!focusable.length) return;
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    } else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first.focus();
                    }
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

            dialog.addEventListener("transitionend", () => {
                dialog.removeEventListener("keydown", handleKeyDown);
                dialogContainer.removeEventListener("click", handleOverlayClick);
            }, { once: true });
        });
    }

    /**
     * Remove a dialog with animation
     */
    function removeDialog(dialog) {
        dialog.classList.remove("confirm-dialog-enter");
        dialog.classList.add("confirm-dialog-exit");

        const cleanup = () => {
            dialog.remove();
            
            // Check if there are any more dialogs
            if (dialogContainer && !dialogContainer.querySelector(".confirm-dialog-modal")) {
                dialogContainer.classList.remove("confirm-dialog-overlay-active");
            }
        };

        dialog.addEventListener("animationend", cleanup, { once: true });
        window.setTimeout(cleanup, 240);
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
    window.ConfirmDialog = { show };
})();
