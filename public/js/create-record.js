const recordForm =
    document.getElementById("recordForm");

const token =
    localStorage.getItem("token");

const logoutButton =
    document.getElementById("logoutButton");

const sidebarUserName =
    document.getElementById("sidebarUserName");

const sidebarUserRole =
    document.getElementById("sidebarUserRole");

const sidebarAvatar =
    document.getElementById("sidebarAvatar");

const createRecordButton =
    document.getElementById("createRecordButton");

const pageHeadingTitle =
    document.querySelector(".page-heading h1");

const pageHeadingDescription =
    document.querySelector(".page-heading p");

const cancelButton =
    document.querySelector(".cancel-button");

const statusInput =
    document.getElementById("status");

const statusDisplay =
    document.getElementById("statusDisplay");

const searchParams =
    new URLSearchParams(
        window.location.search
    );

const recordId =
    searchParams.get("id");

const offlineRecordUuid =
    searchParams.get("offlineUuid");

let offlineEditMode = Boolean(offlineRecordUuid);

const isEditMode =
    Boolean(recordId);

const returnToAccount =
    searchParams.get("returnTo") ===
    "account.html";

const editReturnPage =
    returnToAccount
        ? "account.html"
        : "search-cases.html";

let isSubmitting = false;
let editBaseUpdatedAt = null;

function createClientUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        character => {
            const random = Math.random() * 16 | 0;
            const value = character === "x"
                ? random
                : (random & 0x3 | 0x8);

            return value.toString(16);
        }
    );
}


function readStoredUser() {

    try {

        return JSON.parse(
            localStorage.getItem("user") ||
            "null"
        ) || {};

    } catch (error) {

        console.error(
            "Unable to read stored user:",
            error
        );

        return {};

    }

}

function normalizeRole(role) {

    return String(
        role || ""
    )
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");

}


function getCurrentRole() {

    return normalizeRole(
        readStoredUser().role ||
        ""
    );

}

function getTodayInAccra() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Accra",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== "literal") result[part.type] = part.value;
        return result;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
}

// =========================================
// PHONE NUMBER FORMATTING
// =========================================

/**
 * Formats phone number to Ghana format (233...)
 * Examples:
 * - 0501234567 → 233501234567
 * - +233501234567 → 233501234567
 */
function formatPhoneNumber(phone) {
    if (!phone) return "";

    // Remove all non-digits
    let cleaned = String(phone).replace(/\D/g, "");

    if (!cleaned) return "";

    // Remove leading zero (Ghana format)
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    }

    // If already starts with 233, return as is
    if (cleaned.startsWith("233")) {
        return cleaned;
    }

    // Add country code
    return "233" + cleaned;
}


// =========================================
// CHECK LOGIN
// =========================================

if (!token) {

    window.location.href =
        "index.html";

}


if (
    getCurrentRole() ===
    "branch_staff" &&
    isEditMode
) {

    window.location.href =
        "search-cases.html";

}


// =========================================
// USER INFORMATION
// =========================================

function loadUser() {

    if (
        window.RecordProfile &&
        typeof window.RecordProfile.applyProfile === "function"
    ) {

        window.RecordProfile.applyProfile();

        return;

    }

    try {

        const storedUser =
            readStoredUser();


        const name =
            storedUser.name ||
            "Admin";


        const role =
            storedUser.role ||
            "Staff";


        const firstLetter =
            name
                .charAt(0)
                .toUpperCase();


        if (sidebarUserName) {

            sidebarUserName.textContent =
                name;

        }


        if (sidebarUserRole) {

            sidebarUserRole.textContent =
                role;

        }


        if (sidebarAvatar) {

            sidebarAvatar.textContent =
                firstLetter;

        }

    } catch (error) {

        console.error(
            "Unable to load user:",
            error
        );

    }

}


loadUser();


// =========================================
// EDIT MODE HELPERS
// =========================================

function formatDateForInput(value) {

    if (!value) {
        return "";
    }


    const text =
        String(value).trim();


    if (
        /^\d{4}-\d{2}-\d{2}$/.test(
            text
        )
    ) {

        const [, year, month, day] = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return `${day}-${month}-${year}`;

    }


    const date =
        new Date(text);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const year =
        date.getUTCFullYear();

    const month =
        String(
            date.getUTCMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getUTCDate()
        ).padStart(2, "0");


    return `${day}-${month}-${year}`;

}

function formatDateWhileTyping(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function parseDateInput(value) {
    const match = String(value || "").trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);

    if (!match) return null;

    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    if (
        date.getUTCFullYear() !== Number(year) ||
        date.getUTCMonth() !== Number(month) - 1 ||
        date.getUTCDate() !== Number(day)
    ) {
        return null;
    }

    return `${year}-${month}-${day}`;
}


function normalizeStatusValue(value) {

    const status =
        String(
            value || ""
        )
            .trim()
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ");


    if (!status) {
        return "Pending";
    }


    return status
        .split(" ")
        .filter(Boolean)
        .map(
            word =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");

}


function isDeathCategory(value) {

    return String(value || "")
        .trim()
        .toLowerCase() ===
        "death";

}


function setStatusValue(value) {

    const nextValue =
        normalizeStatusValue(
            value
        );


    if (statusInput) {

        statusInput.value =
            nextValue;

    }


    if (statusDisplay) {

        statusDisplay.value =
            nextValue;

    }

}


function normalizeCategoryValue(value) {

    const category =
        String(
            value || ""
        )
            .trim()
            .toLowerCase();


    if (category === "s-hot") {
        return "S-HOT";
    }


    if (category === "express") {
        return "EXPRESS";
    }


    if (category === "standard") {
        return "STANDARD";
    }


    if (
        category === "m-birth" ||
        category === "m-birth"
    ) {
        return "M-BIRTH";
    }


    if (
        category === "search" ||
        category === "searches"
    ) {
        return "SEARCH";
    }


    if (
        category === "correction" ||
        category === "corrections"
    ) {
        return "CORRECTION";
    }


    if (category === "death") {
        return "DEATH";
    }


    if (category === "deletion") {
        return "DELETION";
    }


    return value || "";

}


function updateDateLabel() {

    if (!dateLabel || !dateInput) {
        return;
    }


    if (
        categoryInput &&
        String(categoryInput.value)
            .trim()
            .toLowerCase() ===
        "death"
    ) {

        dateLabel.textContent =
            "Date of Death";

        dateInput.setAttribute(
            "aria-label",
            "Date of Death"
        );

        // Add required indicator
        dateLabel.setAttribute(
            "data-required",
            "true"
        );

        return;

    }


    dateLabel.textContent =
        "Date of Birth";

    dateInput.setAttribute(
        "aria-label",
        "Date of Birth"
    );

    // Remove required indicator for non-death records
    dateLabel.removeAttribute(
        "data-required"
    );

}


function setEditMode() {

    if (!isEditMode) {
        return;
    }


    if (pageHeadingTitle) {

        pageHeadingTitle.textContent =
            "EDIT CASE";

    }


    if (pageHeadingDescription) {

        pageHeadingDescription.textContent =
            "Update an existing customer record.";

    }


    if (createRecordButton) {

        createRecordButton.textContent =
            "Update Record";

    }


    if (cancelButton) {

        cancelButton.setAttribute(
            "href",
            "search-cases.html"
        );

    }


    document.title =
        "Edit Case | record";

}

function resetFormForNextRecord() {
    const preservedValues = {
        category: categoryInput?.value || "",
        registrar: registrarInput?.value || "",
        status: statusInput?.value || "Pending",
        registrationDate: registrationDate?.value || ""
    };

    recordForm.reset();

    if (categoryInput) {
        categoryInput.value = preservedValues.category;
    }

    setRegistrarValue(preservedValues.registrar);
    setStatusValue(preservedValues.status);

    if (registrationDate) {
        registrationDate.value = preservedValues.registrationDate;
    }

    updateDateLabel();
}


async function loadRecordForEdit() {

    if (!isEditMode) {
        return;
    }


    try {

        const response =
            await fetch(
                `/api/records/${encodeURIComponent(recordId)}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );


        if (
            response.status === 401 ||
            response.status === 403
        ) {

            localStorage.removeItem(
                "token"
            );

            localStorage.removeItem(
                "user"
            );

            window.location.href =
                "index.html";

            return;

        }


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load record."
            );

        }


        const record =
            data.record;


        if (!record) {

            throw new Error(
                "Record not found."
            );

        }

        editBaseUpdatedAt = record.updated_at || record.updatedAt || null;


        if (categoryInput) {

            categoryInput.value =
                normalizeCategoryValue(
                    record.category
                );

        }


        if (customerNameInput) {

            customerNameInput.value =
                record.name || "";

        }


        if (phoneNumberInput) {

            phoneNumberInput.value =
                record.phone_number || "";

        }


        if (notesInput) {

            notesInput.value =
                record.notes || "";

        }


        setRegistrarValue(
            record.registrar ||
            readStoredUser().name ||
            "Unknown"
        );


        setStatusValue(
            record.status
        );


        if (registrationDate) {

            registrationDate.value =
                formatDateForInput(
                    record.registration_date
                );

        }


        const dateValue =
            String(
                record.category || ""
            )
                .trim()
                .toLowerCase() ===
            "death"
                ? record.date_of_death
                : record.date_of_birth;


        if (dateInput) {

            dateInput.value =
                formatDateForInput(
                    dateValue
                );

        }


        updateDateLabel();

        setEditMode();

    } catch (error) {

        console.error(
            "LOAD RECORD ERROR:",
            error
        );


        Notification.error(
            error.message ||
            "Unable to load record."
        );


        window.location.href =
            editReturnPage;

    }

}

async function loadOfflineRecordForEdit() {
    if (!offlineRecordUuid || !window.RecordOfflineQueue?.getRecord) return;

    const entry = await window.RecordOfflineQueue.getRecord(offlineRecordUuid);
    const record = entry?.payload;
    if (!record) {
        Notification.error("Offline case is no longer available.");
        window.location.href = "pending-sync.html";
        return;
    }

    if (pageHeadingTitle) pageHeadingTitle.textContent = "EDIT OFFLINE CASE";
    if (pageHeadingDescription) pageHeadingDescription.textContent = "Update a case saved on this device.";
    if (cancelButton) cancelButton.href = "pending-sync.html";
    if (categoryInput) categoryInput.value = normalizeCategoryValue(record.category);
    if (customerNameInput) customerNameInput.value = record.name || "";
    if (phoneNumberInput) phoneNumberInput.value = record.phone_number || "";
    if (notesInput) notesInput.value = record.notes || "";
    setRegistrarValue(record.registrar || readStoredUser().name || "Unknown");
    setStatusValue(record.status || "Processing");
    if (registrationDate) registrationDate.value = formatDateForInput(record.registration_date);

    const dateValue = String(record.category || "").trim().toLowerCase() === "death"
        ? record.date_of_death
        : record.date_of_birth;
    if (dateInput) dateInput.value = formatDateForInput(dateValue);
    updateDateLabel();
}


// =========================================
// GET FORM ELEMENTS
// =========================================

const categoryInput =
    document.getElementById("category");

const dateInput =
    document.getElementById("dateOfBirth");

const dateLabel =
    document.getElementById("dateLabel");

const registrationDate =
    document.getElementById("registrationDate");

const registrarInput =
    document.getElementById("registrar");

const customerNameInput =
    document.getElementById("customerName");

const phoneNumberInput =
    document.getElementById("phoneNumber");

const notesInput =
    document.getElementById("notes");


setStatusValue(
    getCurrentRole() === "branch_staff"
        ? "Processing"
        : "Pending"
);


// =========================================
// FORCE UPPERCASE FOR TEXT ENTRY
// =========================================

function forceUppercaseInput(field) {

    if (!field) {
        return;
    }


    field.addEventListener(
        "input",
        () => {

            const start =
                field.selectionStart;

            const end =
                field.selectionEnd;


            field.value =
                field.value.toUpperCase();


            if (
                typeof start === "number" &&
                typeof end === "number"
            ) {

                field.setSelectionRange(
                    start,
                    end
                );

            }

        }
    );

}


forceUppercaseInput(customerNameInput);
forceUppercaseInput(registrarInput);
forceUppercaseInput(notesInput);

if (dateInput) {
    dateInput.addEventListener("input", () => {
        dateInput.value = formatDateWhileTyping(dateInput.value);
        dateInput.setCustomValidity("");
    });

    dateInput.addEventListener("blur", () => {
        dateInput.setCustomValidity(
            dateInput.value && !parseDateInput(dateInput.value)
                ? "Enter a valid date in DD-MM-YYYY format."
                : ""
        );
    });
}


// =========================================
// AUTO-FORMAT PHONE NUMBER
// =========================================

const MIN_PHONE_DIGITS = 10;
let phoneLengthNoticeTimer = null;
let phoneLengthNoticeShown = false;

function getPhoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function validatePhoneNumberLength({ notify = false } = {}) {
    if (!phoneNumberInput) return true;

    const digits = getPhoneDigits(phoneNumberInput.value);
    const isValid = digits.length >= MIN_PHONE_DIGITS;

    phoneNumberInput.setCustomValidity(
        digits && !isValid
            ? "Phone number must contain at least 10 digits."
            : ""
    );

    if (notify && digits && !isValid && !phoneLengthNoticeShown) {
        phoneLengthNoticeShown = true;
        Notification.warning("Phone number has to be 10 digits.");
    }

    if (isValid) {
        phoneLengthNoticeShown = false;
    }

    return isValid;
}

if (phoneNumberInput) {
    phoneNumberInput.addEventListener("input", () => {
        window.clearTimeout(phoneLengthNoticeTimer);
        phoneLengthNoticeTimer = window.setTimeout(() => {
            validatePhoneNumberLength({ notify: true });
        }, 400);
    });

    phoneNumberInput.addEventListener(
        "blur",
        () => {
            const formatted = formatPhoneNumber(
                phoneNumberInput.value
            );
            if (formatted) {
                phoneNumberInput.value = formatted;
            }

            validatePhoneNumberLength({ notify: true });
        }
    );
}


function setRegistrarValue(value) {

    if (!registrarInput) {
        return;
    }


    registrarInput.value = window.RecordRegistrar?.normalize(value) ||
        String(value || "").trim().toUpperCase();

}


setRegistrarValue(
    readStoredUser().name || "Unknown"
);


function applyRegistrarPermissions() {

    if (!registrarInput) {
        return;
    }

    const isBranchStaff =
        getCurrentRole() === "branch_staff";

    registrarInput.readOnly =
        isBranchStaff;

    registrarInput.setAttribute(
        "aria-readonly",
        String(isBranchStaff)
    );

    if (isBranchStaff) {
        setRegistrarValue(
            readStoredUser().name || "Unknown"
        );
    }
}


applyRegistrarPermissions();


// =========================================
// SET REGISTRATION DATE AUTOMATICALLY
// =========================================

if (registrationDate) {
    const isBranchStaff = getCurrentRole() === "branch_staff";
    registrationDate.readOnly = isBranchStaff;
    registrationDate.toggleAttribute("readonly", isBranchStaff);
    registrationDate.setAttribute("aria-readonly", String(isBranchStaff));
    registrationDate.classList.toggle("branch-staff-locked", isBranchStaff);

    if (!isEditMode || isBranchStaff) {
        registrationDate.value = getTodayInAccra();
    }

}


// =========================================
// CHANGE DATE LABEL
// =========================================

if (categoryInput) {

    categoryInput.addEventListener(
        "change",
        updateDateLabel
    );

    updateDateLabel();

}


setEditMode();


if (isEditMode) {

    if (
        getCurrentRole() !==
        "branch_staff"
    ) {

        loadRecordForEdit();

    }

}

if (offlineEditMode && !isEditMode) {
    loadOfflineRecordForEdit().catch(error => {
        console.error("LOAD OFFLINE RECORD ERROR:", error);
        Notification.error("Unable to load the offline case.");
    });
}


// =========================================
// SUBMIT FORM
// =========================================

recordForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        if (isSubmitting) {
            return;
        }


        // =====================================
        // GET VALUES
        // =====================================

        const name =
            customerNameInput
                .value
                .trim()
                .toUpperCase();


        const category =
            categoryInput
                .value
                .trim();


        const selectedDateInput =
            dateInput.value.trim();

        const selectedDate =
            parseDateInput(selectedDateInput);


        const phoneNumber =
            phoneNumberInput
                .value
                .trim();


        const status =
            statusInput &&
            statusInput.value
                ? statusInput.value
                : "Pending";


        const notes =
            notesInput
                .value
                .trim()
                .toUpperCase();


        const registrar =
            registrarInput &&
            registrarInput.value
                ? (window.RecordRegistrar?.normalize(registrarInput.value) ||
                    registrarInput.value.trim().toUpperCase())
                : "";


        // =====================================
        // VALIDATION
        // =====================================

        if (!name) {

            Notification.warning(
                "Customer name is required."
            );

            return;

        }


        if (!category) {

            Notification.warning(
                "Category is required."
            );

            return;

        }


        if (!selectedDateInput) {

            if (
                isDeathCategory(
                    category
                )
            ) {

                Notification.warning(
                    "Date of death is required."
                );

            } else {

                Notification.warning(
                    "Date of birth is required."
                );

            }

            return;

        }

        if (!selectedDate) {
            Notification.warning(
                "Enter a valid date in DD-MM-YYYY format."
            );

            dateInput.focus();
            return;
        }


        if (!phoneNumber) {

            Notification.warning(
                "Phone number is required."
            );

            return;

        }

        if (getPhoneDigits(phoneNumber).length < MIN_PHONE_DIGITS) {
            Notification.warning(
                "Phone number has to be 10 digits."
            );

            phoneNumberInput.setCustomValidity(
                "Phone number must contain at least 10 digits."
            );
            phoneNumberInput.focus();
            return;
        }

        phoneNumberInput.setCustomValidity("");


        // =====================================
        // CREATE RECORD DATA
        // =====================================

        const recordData = {

            name: name,

            category: category,

            phone_number:
                formatPhoneNumber(phoneNumber),

            registration_date:
                registrationDate.value,

            status: status,

            registrar: registrar,

            notes: notes,

            ...(isEditMode && editBaseUpdatedAt
                ? { expected_updated_at: editBaseUpdatedAt }
                : {}),

            client_uuid:
                isEditMode
                    ? undefined
                    : offlineEditMode
                        ? offlineRecordUuid
                        : createClientUuid()

        };


        // =====================================
        // ADD CORRECT DATE
        // =====================================

        if (
            isDeathCategory(
                category
            )
        ) {

            recordData.date_of_death =
                selectedDate;

        } else {

            recordData.date_of_birth =
                selectedDate;

        }


        // =====================================
        // SEND TO SERVER
        // =====================================

        isSubmitting = true;

        if (createRecordButton) {
            createRecordButton.disabled = true;
            createRecordButton.textContent = isEditMode
                ? "Updating..."
                : "Creating...";
        }

        try {

            if (
                (!isEditMode || offlineEditMode) &&
                typeof navigator !== "undefined" &&
                navigator.onLine === false
            ) {
                throw new Error("offline");
            }

            const endpoint =
                isEditMode
                    ? `/api/records/${encodeURIComponent(recordId)}`
                    : "/api/records";


            const method =
                isEditMode
                    ? "PATCH"
                    : "POST";

            const response =
                await fetch(
                    endpoint,
                    {

                        method: method,

                        headers: {

                            "Content-Type":
                                "application/json",

                            "Authorization":
                                `Bearer ${token}`

                        },

                        body:
                            JSON.stringify(
                                recordData
                            )

                    }
                );


            const data =
                await response.json();


            // =================================
            // SERVER ERROR
            // =================================

            if (!response.ok) {

                console.error(
                    "Server response:",
                    data
                );

                // Check for duplicate error (409 Conflict)
                if (response.status === 409) {
                    Notification.warning(
                        data.message || "Case Already Recorded."
                    );

                    if (data.existingRecordId) {
                        console.log(
                            "Existing record ID: " + data.existingRecordId
                        );
                    }
                } else {
                    Notification.error(
                        data.message ||
                        "Unable to create record."
                    );
                }

                return;

            }


            // =================================
            // SUCCESS
            // =================================

            Notification.success(
                isEditMode
                    ? "Record updated successfully!"
                    : "Record created successfully!"
            );


            if (isEditMode) {
                window.location.href = editReturnPage;
            } else {
                resetFormForNextRecord();
            }


        } catch (error) {

            console.error(
                "CREATE RECORD ERROR:",
                error
            );


            if (
                !isEditMode &&
                window.RecordOfflineQueue &&
                typeof window.RecordOfflineQueue.queueRecord === "function"
            ) {
                try {
                    await window.RecordOfflineQueue.queueRecord(recordData, {
                        operationType: "CREATE",
                        recordId: null
                    });

                    Notification.warning(
                        "You are Offline - Record saved and will sync when internet returns."
                    );

                    const offlineStatusBanner = document.getElementById("offlineStatusBanner");
                    if (offlineStatusBanner) {
                        offlineStatusBanner.innerHTML = `
                            <span>Record saved offline. It will automatically sync when internet returns.</span>
                            <a href="pending-sync.html">View Pending Records</a>
                        `;
                        offlineStatusBanner.hidden = false;
                    }

                    resetFormForNextRecord();
                    return;
                } catch (offlineError) {
                    console.error("OFFLINE RECORD ERROR:", offlineError);
                }
            }

            Notification.error("Unable to connect to the server.");

        } finally {
            isSubmitting = false;

            if (createRecordButton) {
                createRecordButton.disabled = false;
                createRecordButton.textContent = isEditMode
                    ? "Update Record"
                    : "Create Record";
            }

        }

    }
);


// =========================================
// LOGOUT
// =========================================

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        () => {

            localStorage.removeItem(
                "token"
            );

            localStorage.removeItem(
                "user"
            );


            window.location.href =
                "index.html";

        }
    );

}
