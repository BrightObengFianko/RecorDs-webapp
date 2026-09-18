// =========================================
// RecorDs - SEARCH CASES
// =========================================


// =========================================
// ELEMENTS
// =========================================

const nameInput =
    document.getElementById("name");

const dateOfBirthInput =
    document.getElementById("dateOfBirth");

const statusSelect =
    document.getElementById("status");

const categorySelect =
    document.getElementById("category");

const registrarSelect =
    document.getElementById("registrar");

const fromDateInput =
    document.getElementById("fromDate");

const toDateInput =
    document.getElementById("toDate");

const searchButton =
    document.getElementById("searchButton");

const resetButton =
    document.getElementById("resetButton");

const exportButton =
    document.getElementById("exportButton");

const refreshResultsButton =
    document.getElementById("refreshResultsButton");

const resultsSyncStatus =
    document.getElementById("resultsSyncStatus");

const resultsBody =
    document.getElementById("resultsBody");

const resultCount =
    document.getElementById("resultCount");

const showingInfo =
    document.getElementById("showingInfo");

const previousPage =
    document.getElementById("previousPage");

const nextPage =
    document.getElementById("nextPage");

const pageInfo =
    document.getElementById("pageInfo");

const logoutButton =
    document.getElementById("logoutButton");

const menuToggle =
    document.getElementById("menuToggle");

const sidebar =
    document.querySelector(".sidebar");

const content =
    document.querySelector(".content");

const tableWrapper =
    document.querySelector(".table-wrapper");

const searchSmsBalance =
    document.getElementById("searchSmsBalance");

const searchSmsError =
    document.getElementById("searchSmsError");


// =========================================
// LOGIN CHECK
// =========================================

const token =
    localStorage.getItem("token");


if (!token) {

    window.location.href =
        "index.html";

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

    const storedUser =
        localStorage.getItem("user");


    if (!storedUser) {
        return;
    }


    try {

        const user =
            JSON.parse(storedUser);


        const name =
            user.name ||
            "Admin";


        const role =
            user.role ||
            "Staff";


        const firstLetter =
            name
                .charAt(0)
                .toUpperCase();


        // Sidebar name

        const sidebarUserName =
            document.getElementById(
                "sidebarUserName"
            );

        if (sidebarUserName) {

            sidebarUserName.textContent =
                name;

        }


        // Sidebar role

        const sidebarUserRole =
            document.getElementById(
                "sidebarUserRole"
            );

        if (sidebarUserRole) {

            sidebarUserRole.textContent =
                role;

        }


        // Sidebar avatar

        const sidebarAvatar =
            document.getElementById(
                "sidebarAvatar"
            );

        if (sidebarAvatar) {

            sidebarAvatar.textContent =
                firstLetter;

        }


        // Top name

        const topUserName =
            document.getElementById(
                "topUserName"
            );

        if (topUserName) {

            topUserName.textContent =
                name;

        }


        // Top role

        const topUserRole =
            document.getElementById(
                "topUserRole"
            );

        if (topUserRole) {

            topUserRole.textContent =
                role;

        }


        // Top avatar

        const topAvatar =
            document.getElementById(
                "topAvatar"
            );

        if (topAvatar) {

            topAvatar.textContent =
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
// CURRENT ROLE
// =========================================

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


function getCurrentUserRole() {

    return String(
        readStoredUser().role ||
        ""
    )
        .trim()
        .toLowerCase();

}

function isBranchStaffSearchUser() {
    return getCurrentUserRole()
        .replace(/[\s-]+/g, "_") === "branch_staff";
}


function canManageRecords() {

    return [
        "admin",
        "staff"
    ].includes(
        getCurrentUserRole()
    );

}


// =========================================
// SEARCH STATE
// =========================================

let currentPage = 1;

const rowsPerPage = 10;

let allResults = [];

let hasActiveSearch = false;

let refreshInFlight = false;

const SEARCH_REFRESH_INTERVAL_MS = 12000;

let activeActionMenu = null;

let actionMenuFrame = 0;

function formatDateWhileTyping(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 8);

    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function parseDateInput(value) {
    const match = String(value || "").trim().match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})$/);

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

if (dateOfBirthInput) {
    dateOfBirthInput.addEventListener("input", () => {
        dateOfBirthInput.value = formatDateWhileTyping(dateOfBirthInput.value);
        dateOfBirthInput.setCustomValidity("");
    });

    dateOfBirthInput.addEventListener("blur", () => {
        dateOfBirthInput.setCustomValidity(
            dateOfBirthInput.value && !parseDateInput(dateOfBirthInput.value)
                ? "Enter a valid date in DD-MM-YYYY format."
                : ""
        );
    });
}


// =========================================
// ACTION MENUS
// =========================================

function normalizeStatus(value) {

    return String(
        value || ""
    )
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

}


function formatStatusLabel(value) {

    const status =
        normalizeStatus(
            value
        );


    if (status === "pending") {
        return "Pending";
    }


    if (status === "ready") {
        return "Ready";
    }


    if (status === "not ready") {
        return "Not Ready";
    }


    return value ? String(value) : "-";

}

function hasNumberOrMoneyValue(value) {

    return /[\d$¢€£₵¥₹]/.test(
        String(value || "")
    );

}

function getNotePreview(value) {

    const note =
        String(value || "")
            .trim()
            .replace(/\s+/g, " ");


    if (!note) {
        return "";
    }


    // Keep the currency and amount visible instead of allowing CSS
    // ellipsis to hide the useful part of a long note.
    const moneyMatch =
        note.match(
            /(?:\b(?:GHS|USD|EUR|GBP|KES|NGN|ZAR)\s*[\d,]+(?:\.\d{1,2})?|\bGH\s*[\u20B5\u00A2]?\s*[\d,]+(?:\.\d{1,2})?|[\$\u20AC\u00A3\u00A5\u20B5\u00A2\u20B9]\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:GHS|USD|EUR|GBP|KES|NGN|ZAR|cedis?|dollars?|euros?|pounds?))/i
        );


    if (moneyMatch) {
        return `${moneyMatch[0].trim()}...`;
    }


    const amountMatch =
        note.match(
            /\b\d[\d,]*(?:\.\d{1,2})?\b/
        );


    const moneyContext =
        /\b(paid|pay|payment|amount|fee|cost|price|cash|money|cedis?)\b/i
            .test(note);


    if (amountMatch && moneyContext) {
        return `${amountMatch[0]}...`;
    }


    const firstWord =
        note.match(/^[^\s]+/);


    return firstWord
        ? `${firstWord[0]}...`
        : "...";

}

async function loadSearchSmsBalance() {
    if (
        !searchSmsBalance ||
        !searchSmsError
    ) {
        return;
    }

    if (isBranchStaffSearchUser()) {
        searchSmsBalance.remove();
        searchSmsError.remove();
        return;
    }

    searchSmsBalance.hidden = true;
    searchSmsError.hidden = true;

    try {
        const authResponse = await fetch("/api/auth/me", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const authData = await authResponse.json().catch(() => ({}));
        const authenticatedRole = String(authData.user?.role || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");

        if (authenticatedRole === "branch_staff") {
            searchSmsBalance.remove();
            searchSmsError.remove();
            return;
        }

        searchSmsBalance.hidden = false;

        const [balanceResponse, statusResponse] = await Promise.all([
            fetch("/api/sms/balance", {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }),
            fetch("/api/records/sms-status", {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            })
        ]);
        const data = await balanceResponse.json().catch(() => ({}));
        const statusData = await statusResponse.json().catch(() => ({}));

        if (!balanceResponse.ok) {
            if (balanceResponse.status === 401 || balanceResponse.status === 403) {
                searchSmsBalance.hidden = true;
                searchSmsError.hidden = true;
                return;
            }

            throw new Error(data.message || "Unable to load SMS balance.");
        }

        searchSmsBalance.querySelector("strong").textContent =
            data.balance ?? "Unavailable";

        searchSmsError.hidden = false;
        searchSmsError.querySelector("strong").textContent =
            statusResponse.ok && statusData.error?.sms_error
                ? statusData.error.sms_error
                : "No errors";
    } catch (error) {
        searchSmsBalance.querySelector("strong").textContent = "Unavailable";
        searchSmsError.hidden = false;
        searchSmsError.querySelector("strong").textContent = "Unavailable";
        console.error("Unable to load Search page SMS balance:", error.message);
    }
}

loadSearchSmsBalance();
window.setInterval(loadSearchSmsBalance, 15000);

function isSmsSentValue(value) {

    return (
        value === true ||
        value === "true" ||
        value === "TRUE" ||
        value === "Yes" ||
        value === "YES" ||
        value === 1 ||
        value === "1"
    );

}

function formatSmsTimestamp(value) {

    if (!value) {
        return null;
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }


    const day =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                weekday: "long"
            }
        ).format(date);


    const dateText =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                day: "2-digit",
                month: "long",
                year: "numeric"
            }
        ).format(date);


    const timeText =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            }
        )
            .format(date)
            .toUpperCase();


    const hourText =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                hour: "2-digit",
                hour12: false
            }
        ).format(date);


    return {
        day,
        dateText,
        timeText,
        hourText
    };

}

function findRecordById(recordId) {

    return (
        allResults.find(
            record =>
                String(record.id) ===
                String(recordId)
        ) ||
        null
    );

}


function getActionDropdown(menu) {

    if (!menu) {
        return null;
    }


    return menu.querySelector(
        ".action-dropdown"
    );

}


function positionActionMenu(menu) {

    const trigger =
        menu.querySelector(
            ".action-toggle"
        );


    const dropdown =
        getActionDropdown(menu);


    if (
        !trigger ||
        !dropdown
    ) {
        return;
    }


    const rect =
        trigger.getBoundingClientRect();


    if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
    ) {

        closeActionMenus();

        return;

    }


    const gap = 8;
    const viewportPadding = 8;


    const menuWidth =
        dropdown.offsetWidth ||
        166;


    const menuHeight =
        dropdown.offsetHeight ||
        0;


    let top =
        rect.bottom + gap;


    if (
        top + menuHeight >
        window.innerHeight - viewportPadding &&
        rect.top - gap - menuHeight >=
        viewportPadding
    ) {

        top =
            rect.top -
            gap -
            menuHeight;

    }


    let left =
        rect.right -
        menuWidth;


    left =
        Math.max(
            viewportPadding,
            Math.min(
                left,
                window.innerWidth -
                viewportPadding -
                menuWidth
            )
        );


    dropdown.style.top =
        `${Math.round(top)}px`;

    dropdown.style.left =
        `${Math.round(left)}px`;

    dropdown.style.visibility =
        "visible";

}


function scheduleActionMenuPosition() {

    if (
        !activeActionMenu ||
        !activeActionMenu.classList.contains(
            "is-open"
        )
    ) {
        return;
    }


    if (actionMenuFrame) {
        return;
    }


    actionMenuFrame =
        window.requestAnimationFrame(
            () => {

                actionMenuFrame = 0;


                if (
                    activeActionMenu &&
                    activeActionMenu.classList.contains(
                        "is-open"
                    )
                ) {

                    positionActionMenu(
                        activeActionMenu
                    );

                }

            }
        );

}


function closeActionMenus() {

    document
        .querySelectorAll(
            ".action-menu.is-open"
        )
        .forEach(
            menu => {

                menu.classList.remove(
                    "is-open"
                );


                const trigger =
                    menu.querySelector(
                        ".action-toggle"
                    );


                const dropdown =
                    getActionDropdown(
                        menu
                    );


                if (trigger) {

                    trigger.setAttribute(
                        "aria-expanded",
                        "false"
                    );

                }


                if (dropdown) {

                    dropdown.style.top =
                        "";

                    dropdown.style.left =
                        "";

                    dropdown.style.visibility =
                        "";

                }

            }
        );


    activeActionMenu = null;


    if (actionMenuFrame) {

        window.cancelAnimationFrame(
            actionMenuFrame
        );

        actionMenuFrame = 0;

    }

}


function openActionMenu(menu) {

    closeActionMenus();


    menu.classList.add(
        "is-open"
    );


    activeActionMenu =
        menu;


    const trigger =
        menu.querySelector(
            ".action-toggle"
        );


    const dropdown =
        getActionDropdown(
            menu
        );


    if (trigger) {

        trigger.setAttribute(
            "aria-expanded",
            "true"
        );

    }


    if (dropdown) {

        dropdown.style.visibility =
            "hidden";

    }


    scheduleActionMenuPosition();

}


function updateLocalRecordStatus(id, status) {

    const activeStatusFilter =
        normalizeStatus(
            statusSelect &&
            statusSelect.value
        );


    let found =
        false;


    allResults =
        allResults.reduce(
            (records, record) => {

                if (
                    String(
                        record.id
                    ) !==
                    String(id)
                ) {

                    records.push(
                        record
                    );

                    return records;

                }


                found = true;


                if (
                    activeStatusFilter &&
                    activeStatusFilter !==
                    normalizeStatus(
                        status
                    )
                ) {

                    return records;

                }


                records.push({
                    ...record,
                    status
                });


                return records;

            },
            []
        );


    return found;

}


function removeLocalRecord(id) {

    const before =
        allResults.length;


    allResults =
        allResults.filter(
            record =>
                String(
                    record.id
                ) !==
                String(id)
        );


    return before !==
        allResults.length;

}


async function sendRecordRequest(
    url,
    options
) {

    const response =
        await fetch(
            url,
            {
                ...options,
                headers: {
                    ...(options &&
                        options.headers
                        ? options.headers
                        : {}),
                    Authorization:
                        `Bearer ${token}`
                }
            }
        );


    if (response.status === 401) {

        localStorage.removeItem(
            "token"
        );

        localStorage.removeItem(
            "user"
        );

        window.location.href =
            "index.html";

        return null;

    }


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            data.message ||
            "Unable to complete the request."
        );

    }


    return data;

}


// =========================================
// SEARCH CASES
// =========================================

async function loadRegistrars() {

    if (!registrarSelect) {
        return;
    }


    try {

        const data =
            await sendRecordRequest(
                "/api/records/registrars",
                {
                    method: "GET"
                }
            );


        const registrars =
            Array.isArray(data?.registrars)
                ? data.registrars
                : [];


        registrarSelect.innerHTML =
            `<option value="">All Registrars</option>`;


        registrars.forEach(
            registrar => {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value = registrar;
                option.textContent = registrar;
                registrarSelect.appendChild(
                    option
                );
            }
        );

    } catch (error) {

        console.error(
            "LOAD REGISTRARS ERROR:",
            error
        );

    }

}

function setResultsSyncStatus(message, state = "") {
    if (!resultsSyncStatus) {
        return;
    }

    resultsSyncStatus.textContent = message;
    resultsSyncStatus.dataset.state = state;
}

function recordsHaveChanged(previousRecords, nextRecords) {
    return JSON.stringify(previousRecords) !== JSON.stringify(nextRecords);
}

async function searchCases({ silent = false } = {}) {

    const name =
        nameInput.value
            .trim()
            .toUpperCase();


    const dateOfBirthInputValue =
        dateOfBirthInput.value.trim();

    const dateOfBirth =
        parseDateInput(dateOfBirthInputValue);


    const status =
        statusSelect.value;


    const category =
        categorySelect.value;


    const registrar =
        registrarSelect
            ? registrarSelect.value
            : "";


    const fromDate =
        fromDateInput.value;


    const toDate =
        toDateInput.value;


    // =====================================
    // DATE RANGE VALIDATION
    // =====================================

    if (
        fromDate &&
        toDate &&
        fromDate > toDate
    ) {

        Notification.warning(
            "Registered From date cannot be later than Registered To date."
        );

        return;

    }

    if (dateOfBirthInputValue && !dateOfBirth) {
        Notification.warning(
                "Enter a valid Date of Birth / Death in DD-MM-YYYY format."
        );

        dateOfBirthInput.focus();
        return;
    }


    closeActionMenus();


    // =====================================
    // SHOW LOADING
    // =====================================

    if (!silent) {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="11" class="loading">
                    Searching records...
                </td>
            </tr>
        `;
    }


    try {

        // =================================
        // CREATE QUERY PARAMETERS
        // =================================

        const params =
            new URLSearchParams();


        // NAME

        if (name) {

            params.append(
                "name",
                name
            );

        }


        // DATE OF BIRTH

        if (dateOfBirth) {

            params.append(
                "dateOfBirth",
                dateOfBirth
            );

        }


        // STATUS

        if (status) {

            params.append(
                "status",
                status
            );

        }


        // CATEGORY

        if (category) {

            params.append(
                "category",
                category
            );

        }


        // REGISTRAR

        if (registrar) {

            params.append(
                "registrar",
                registrar
            );

        }


        // FROM REGISTRATION DATE

        if (fromDate) {

            params.append(
                "fromDate",
                fromDate
            );

        }


        // TO REGISTRATION DATE

        if (toDate) {

            params.append(
                "toDate",
                toDate
            );

        }


        // =================================
        // SEND REQUEST TO SERVER
        // =================================

        const response =
            await fetch(
                `/api/records/search?${params.toString()}`,
                {

                    method: "GET",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"

                    }

                }
            );


        // =================================
        // CHECK AUTHENTICATION
        // =================================

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


        // =================================
        // READ RESPONSE
        // =================================

        const data =
            await response.json();


        // =================================
        // SERVER ERROR
        // =================================

        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to search records."
            );

        }


        // =================================
        // GET RECORDS
        // =================================

        let nextResults;

        if (
            Array.isArray(data)
        ) {
            nextResults = data;

        }

        else if (
            Array.isArray(
                data.records
            )
        ) {

            nextResults = data.records;

        }

        else if (
            Array.isArray(
                data.results
            )
        ) {

            nextResults = data.results;

        }

        else {

            nextResults = [];

        }

        const changed = recordsHaveChanged(allResults, nextResults);
        allResults = nextResults;
        hasActiveSearch = true;

        if (!silent || changed) {
            if (!silent) {
                currentPage = 1;
            }

            displayResults();
        }

        setResultsSyncStatus(
            `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            "updated"
        );

    } catch (error) {

        console.error(
            "SEARCH ERROR:",
            error
        );


        if (silent) {
            setResultsSyncStatus("Offline - showing last updated data", "offline");
            return;
        }

        resultsBody.innerHTML = `
            <tr>
                <td colspan="11" class="empty">
                    Unable to load records.
                </td>
            </tr>
        `;

        resultCount.textContent = "0 records found";
        showingInfo.textContent = "Showing 0 results";
        pageInfo.textContent = "1";
        previousPage.disabled = true;
        nextPage.disabled = true;
        setResultsSyncStatus("Unable to update", "offline");

    }

}

async function refreshSearchResults() {
    if (
        !hasActiveSearch ||
        refreshInFlight ||
        document.visibilityState !== "visible" ||
        navigator.onLine === false
    ) {
        return;
    }

    refreshInFlight = true;

    refreshResultsButton?.classList.add("is-refreshing");
    refreshResultsButton?.setAttribute("aria-busy", "true");

    try {
        await searchCases({ silent: true });
    } finally {
        refreshInFlight = false;
        refreshResultsButton?.classList.remove("is-refreshing");
        refreshResultsButton?.setAttribute("aria-busy", "false");
    }
}


// =========================================
// DISPLAY RESULTS
// =========================================

function displayResults() {

    closeActionMenus();

    // =====================================
    // NO RESULTS
    // =====================================

    if (!allResults.length) {

        resultsBody.innerHTML = `
            <tr>
                <td colspan="11" class="empty">
                    No records found.
                </td>
            </tr>
        `;


        resultCount.textContent =
            "0 records found";


        showingInfo.textContent =
            "Showing 0 results";


        pageInfo.textContent =
            "1";


        previousPage.disabled =
            true;


        nextPage.disabled =
            true;


        return;

    }


    // =====================================
    // RESULT COUNT
    // =====================================

    resultCount.textContent =
        `${allResults.length} records found`;


    // =====================================
    // TOTAL PAGES
    // =====================================

    const totalPages =
        Math.ceil(
            allResults.length /
            rowsPerPage
        );


    if (
        currentPage >
        totalPages
    ) {

        currentPage =
            totalPages;

    }


    // =====================================
    // PAGE START / END
    // =====================================

    const startIndex =
        (currentPage - 1) *
        rowsPerPage;


    const endIndex =
        Math.min(
            startIndex +
            rowsPerPage,
            allResults.length
        );


    // =====================================
    // CURRENT PAGE RECORDS
    // =====================================

    const pageResults =
        allResults.slice(
            startIndex,
            endIndex
        );


    resultsBody.innerHTML =
        "";


    // =====================================
    // CREATE TABLE ROWS
    // =====================================

    pageResults.forEach(
        (record, index) => {

            const row =
                document.createElement(
                    "tr"
                );


            const number =
                startIndex +
                index +
                1;


            // =================================
            // RECORD VALUES
            // =================================

            const category =
                record.category ||
                "-";


            const name =
                record.name ||
                "-";


            const phone =
                record.phone_number ||
                "-";


            const status =
                record.status ||
                "Pending";


            const registrationDate =
                record.registration_date ||
                null;


            const registrar =
                record.registrar ||
                "-";


            // =================================
            // DATE OF BIRTH / DEATH
            // =================================

            const isDeath =
                String(category)
                    .toLowerCase()
                    .trim() ===
                "death";


            const dateValue =
                isDeath
                    ? record.date_of_death
                    : record.date_of_birth;


            // =================================
            // SMS
            // =================================

            const smsSent =
                record.sms_sent === true ||
                record.sms_sent === "true" ||
                record.sms_sent === "YES" ||
                record.sms_sent === "Yes";

            const smsHasError = Boolean(
                String(record.sms_error || "").trim()
            ) || String(record.sms_status || "").toLowerCase() === "error";


            // =================================
            // STATUS CLASS
            // =================================

            let statusClass =
                "status-pending";


            if (
                normalizeStatus(
                    status
                ) ===
                "ready"
            ) {

                statusClass =
                    "status-ready";

            }


            if (
                normalizeStatus(
                    status
                ) ===
                "not ready"
            ) {

                statusClass =
                    "status-not-ready";

            }


            // =================================
            // SMS HTML
            // =================================

            const smsHtml =
                smsHasError
                    ? `
                        <span class="sms-error" title="${escapeHtml(record.sms_error || "SMS error")}">
                            Error
                        </span>
                    `
                    : smsSent

                    ? `
                        <span class="sms-yes">
                            Sent
                        </span>
                    `

                    : `
                        <span class="sms-no">
                            Not Sent
                        </span>
                    `;


            const rawNote =
                record.notes;

            const noteText =
                rawNote === null ||
                rawNote === undefined
                    ? ""
                    : String(rawNote).trim();

            const hasNote =
                noteText !== "";

            const noteClass =
                hasNote &&
                hasNumberOrMoneyValue(noteText)
                    ? "record-note is-highlighted"
                    : "record-note";

            const noteHtml =
                hasNote
                    ? escapeHtml(
                          getNotePreview(
                              noteText
                          )
                      )
                    : "-";

            const noteTitle =
                hasNote
                    ? noteText
                    : "";


            const canManage =
                canManageRecords();


            const actionMenuHtml = canManage
                ? `
                    <div
                        class="action-menu"
                        data-id="${escapeHtml(
                            record.id || ""
                        )}"
                    >

                        <button
                            type="button"
                            class="action-toggle"
                            title="Case Actions"
                            aria-label="Open case actions"
                            aria-haspopup="true"
                            aria-expanded="false"
                        >
                            <svg
                                class="ui-icon action-icon"
                                aria-hidden="true"
                            >
                                <use href="#icon-more-vertical"></use>
                            </svg>
                        </button>


                        <div
                            class="action-dropdown"
                            role="menu"
                        >

                            <button
                                type="button"
                                class="action-item is-primary"
                                data-action="edit"
                                data-id="${escapeHtml(
                                    record.id || ""
                                )}"
                            >
                                <svg
                                    class="ui-icon action-item-icon"
                                    aria-hidden="true"
                                >
                                    <use href="#icon-edit"></use>
                                </svg>
                                <span>Edit</span>
                            </button>

                            <button
                                type="button"
                                class="action-item is-success"
                                data-action="ready"
                                data-id="${escapeHtml(
                                    record.id || ""
                                )}"
                            >
                                <svg
                                    class="ui-icon action-item-icon"
                                    aria-hidden="true"
                                >
                                    <use href="#icon-check"></use>
                                </svg>
                                <span>Ready</span>
                            </button>

                            <button
                                type="button"
                                class="action-item is-warning"
                                data-action="not-ready"
                                data-id="${escapeHtml(
                                    record.id || ""
                                )}"
                            >
                                <svg
                                    class="ui-icon action-item-icon"
                                    aria-hidden="true"
                                >
                                    <use href="#icon-x"></use>
                                </svg>
                                <span>Not Ready</span>
                            </button>

                            <button
                                type="button"
                                class="action-item is-danger"
                                data-action="delete"
                                data-id="${escapeHtml(
                                    record.id || ""
                                )}"
                            >
                                <svg
                                    class="ui-icon action-item-icon"
                                    aria-hidden="true"
                                >
                                    <use href="#icon-trash"></use>
                                </svg>
                                <span>Delete</span>
                            </button>

                            <button
                                type="button"
                            class="action-item is-info"
                                data-action="sms-details"
                                data-id="${escapeHtml(
                                    record.id || ""
                                )}"
                            >
                                <svg
                                    class="ui-icon action-item-icon"
                                    aria-hidden="true"
                                >
                                    <use href="#icon-calendar"></use>
                                </svg>
                                <span>SMS Details / Note</span>
                            </button>

                        </div>

                    </div>
                `
                : "";


            // =================================
            // TABLE ROW
            // =================================

            row.innerHTML = `

                <td>
                    ${number}
                </td>


                <td>

                    <span class="category-badge" style="--category-color:${window.RecordCategoryColors ? window.RecordCategoryColors.getColor(category) : "#6b5bff"}">

                        ${escapeHtml(
                            category
                        )}

                    </span>

                </td>


                <td>

                    <strong>

                        ${escapeHtml(
                            name
                        )}

                    </strong>

                </td>


                <td>

                    ${escapeHtml(
                        formatDateOnly(
                            dateValue
                        )
                    )}

                </td>


                <td>

                    ${escapeHtml(
                        phone
                    )}

                </td>


                <td>

                    ${escapeHtml(
                        formatDateOnly(
                            registrationDate
                        )
                    )}

                </td>


                <td>

                    <span
                        class="status ${statusClass}"
                    >

                        ${escapeHtml(
                            formatStatusLabel(
                                status
                            )
                        )}

                    </span>

                </td>


                <td>

                    ${escapeHtml(
                        registrar
                    )}

                </td>


                <td class="note-cell">

                    <span
                        class="${noteClass}"
                        title="${escapeHtml(
                            noteTitle
                        )}"
                    >

                        ${noteHtml}

                    </span>

                </td>


                <td>

                    ${smsHtml}

                </td>


                <td class="action-cell">
                    ${actionMenuHtml}
                </td>

            `;


            resultsBody.appendChild(
                row
            );

        }
    );


    // =====================================
    // PAGINATION INFORMATION
    // =====================================

    showingInfo.textContent =
        `Showing ${startIndex + 1} to ${endIndex} of ${allResults.length} results`;


    pageInfo.textContent =
        currentPage;


    previousPage.disabled =
        currentPage === 1;


    nextPage.disabled =
        currentPage === totalPages;

}


// =========================================
// FORMAT DATE
// =========================================

function formatDateOnly(value) {

    if (
        !value ||
        value === "-"
    ) {

        return "-";

    }


    // PostgreSQL DATE

    if (
        /^\d{4}-\d{2}-\d{2}$/
            .test(
                String(value)
            )
    ) {

        const [
            year,
            month,
            day
        ] =
            String(value)
                .split("-");


        return `${day}/${month}/${year}`;

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return String(value);

    }


    return date.toLocaleDateString(
        "en-GB"
    );

}


// =========================================
// ESCAPE HTML
// =========================================

function escapeHtml(value) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


// =========================================
// SEARCH BUTTON
// =========================================

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchCases
    );

}


// =========================================
// ENTER KEY SEARCH
// =========================================

if (nameInput) {

    nameInput.addEventListener(
        "input",
        () => {

            const start =
                nameInput.selectionStart;

            const end =
                nameInput.selectionEnd;


            nameInput.value =
                nameInput.value.toUpperCase();


            if (
                typeof start === "number" &&
                typeof end === "number"
            ) {

                nameInput.setSelectionRange(
                    start,
                    end
                );

            }

        }
    );

    nameInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                searchCases();

            }

        }
    );

}


// =========================================
// FILTERS
// =========================================

if (statusSelect) {

    statusSelect.addEventListener(
        "change",
        searchCases
    );

}


if (categorySelect) {

    categorySelect.addEventListener(
        "change",
        searchCases
    );

}

if (refreshResultsButton) {
    refreshResultsButton.addEventListener("click", () => {
        if (hasActiveSearch) {
            refreshSearchResults();
        } else {
            refreshResultsButton.classList.add("is-refreshing");
            refreshResultsButton.setAttribute("aria-busy", "true");

            searchCases().finally(() => {
                refreshResultsButton.classList.remove("is-refreshing");
                refreshResultsButton.setAttribute("aria-busy", "false");
            });
        }
    });
}

window.setInterval(refreshSearchResults, SEARCH_REFRESH_INTERVAL_MS);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshSearchResults();
    }
});

window.addEventListener("online", refreshSearchResults);


if (registrarSelect) {

    registrarSelect.addEventListener(
        "change",
        searchCases
    );

}


if (fromDateInput) {

    fromDateInput.addEventListener(
        "change",
        searchCases
    );

}


if (toDateInput) {

    toDateInput.addEventListener(
        "change",
        searchCases
    );

}


// =========================================
// RESET
// =========================================

if (resetButton) {

    resetButton.addEventListener(
        "click",
        () => {

            nameInput.value =
                "";

            dateOfBirthInput.value =
                "";

            statusSelect.value =
                "";

            categorySelect.value =
                "";

            if (registrarSelect) {
                registrarSelect.value =
                    "";
            }

            fromDateInput.value =
                "";

            toDateInput.value =
                "";


            allResults =
                [];

            hasActiveSearch = false;
            setResultsSyncStatus("Not searched");


            currentPage =
                1;


            resultsBody.innerHTML = `
                <tr>
                    <td
                        colspan="11"
                        class="empty"
                    >
                        Search for a case to see results.
                    </td>
                </tr>
            `;


            resultCount.textContent =
                "0 records found";


            showingInfo.textContent =
                "Showing 0 results";


            pageInfo.textContent =
                "1";


            previousPage.disabled =
                true;


            nextPage.disabled =
                true;

        }
    );

}


loadRegistrars();


// =========================================
// PREVIOUS PAGE
// =========================================

if (previousPage) {

    previousPage.addEventListener(
        "click",
        () => {

            if (
                currentPage > 1
            ) {

                currentPage--;

                displayResults();

            }

        }
    );

}


// =========================================
// NEXT PAGE
// =========================================

if (nextPage) {

    nextPage.addEventListener(
        "click",
        () => {

            const totalPages =
                Math.ceil(
                    allResults.length /
                    rowsPerPage
                );


            if (
                currentPage <
                totalPages
            ) {

                currentPage++;

                displayResults();

            }

        }
    );

}


// =========================================
// ACTION MENU
// =========================================

if (resultsBody) {

    resultsBody.addEventListener(
        "click",
        async event => {

            const viewButton =
                event.target.closest(
                    ".view-button"
                );


            if (viewButton) {

                event.preventDefault();
                event.stopPropagation();


                const id =
                    viewButton.dataset.id;


                if (!id) {

                    Notification.error(
                        "Case ID is not available."
                    );

                    return;

                }


                window.location.href =
                    `case-details.html?id=${encodeURIComponent(id)}`;

                return;

            }

            const toggle =
                event.target.closest(
                    ".action-toggle"
                );


            if (toggle) {

                event.preventDefault();
                event.stopPropagation();


                const menu =
                    toggle.closest(
                        ".action-menu"
                    );


                if (!menu) {
                    return;
                }


                const isOpen =
                    menu.classList.contains(
                        "is-open"
                    );


                if (isOpen) {

                    closeActionMenus();

                    return;

                }


                openActionMenu(
                    menu
                );

                return;

            }


            const actionItem =
                event.target.closest(
                    ".action-item"
                );


            if (!actionItem) {
                return;
            }


            event.preventDefault();
            event.stopPropagation();


            const action =
                actionItem.dataset.action;


            const id =
                actionItem.dataset.id;


            closeActionMenus();


            if (!id) {

                Notification.error(
                    "Case ID is not available."
                );

                return;

            }


            try {

                if (
                    action === "edit"
                ) {

                    window.location.href =
                        `create-record.html?id=${encodeURIComponent(id)}`;

                    return;

                }


                if (
                    action === "delete"
                ) {

                    const confirmDelete =
                        await ConfirmDialog.show(
                            "Delete this case? This action cannot be undone.",
                            "Delete Case",
                            "Delete"
                        );


                    if (!confirmDelete) {
                        return;
                    }


                    const data =
                        await sendRecordRequest(
                            `/api/records/${encodeURIComponent(id)}`,
                            {
                                method: "DELETE"
                            }
                        );


                    if (!data) {
                        return;
                    }


                    removeLocalRecord(
                        id
                    );


                    displayResults();


                    Notification.error(
                        data.message ||
                        "Record deleted successfully."
                    );


                    return;

                }


                if (action === "sms-details") {

                    const record =
                        findRecordById(id);


                    if (!record) {

                        Notification.error(
                            "Unable to load SMS details."
                        );

                        return;

                    }


                    openSmsDetailsModal(
                        record
                    );

                    return;

                }


                const newStatus =
                    action === "ready"
                        ? "Ready"
                        : action === "not-ready"
                            ? "Not Ready"
                            : null;


                if (!newStatus) {
                    return;
                }


                const data =
                    await sendRecordRequest(
                        `/api/records/${encodeURIComponent(id)}/status`,
                        {
                            method: "PATCH",
                            headers: {
                                "Content-Type":
                                    "application/json"
                            },
                            body: JSON.stringify({
                                status: newStatus
                            })
                        }
                    );


                if (!data) {
                    return;
                }


                updateLocalRecordStatus(
                    id,
                    data.record &&
                        data.record.status
                        ? data.record.status
                        : newStatus
                );


                displayResults();


                Notification.success(
                    data.message ||
                    (
                        newStatus === "Ready"
                            ? "status is Ready"
                            : "status is not ready"
                    )
                );

            } catch (error) {

                console.error(
                    "RECORD ACTION ERROR:",
                    error
                );

                Notification.error(
                    error.message ||
                    "Unable to complete the action."
                );

            }

        }
    );

}


document.addEventListener(
    "click",
    event => {

        if (
            !event.target.closest(
                ".action-menu"
            )
        ) {

            closeActionMenus();

        }

    }
);


if (content) {

    content.addEventListener(
        "scroll",
        scheduleActionMenuPosition,
        {
            passive: true
        }
    );

}


if (tableWrapper) {

    tableWrapper.addEventListener(
        "scroll",
        scheduleActionMenuPosition,
        {
            passive: true
        }
    );

}


// =====================================
// SMS DETAILS
// =====================================

let smsModal =
    document.getElementById("smsModal");

let smsTitle =
    document.getElementById("smsModalTitle");

let smsPhoneValue =
    document.getElementById("smsPhone");

let smsStatusValue =
    document.getElementById("smsStatus");

let smsErrorValue =
    document.getElementById("smsError");

let smsDateValue =
    document.getElementById("smsDate");

let smsDayValue =
    document.getElementById("smsDay");

let smsTimeValue =
    document.getElementById("smsTime");

let smsHourValue =
    document.getElementById("smsHour");

let smsNoteValue =
    document.getElementById("smsNote");

let clearSmsBtn =
    document.getElementById("clearSmsBtn");

let clearNoteBtn =
    document.getElementById("clearNoteBtn");

let activeSmsRecordId =
    null;

let smsCancelBtn =
    document.getElementById("smsCancelBtn");

let smsFormCancelBtn =
    document.getElementById("smsFormCancelBtn");

function renderSmsDetailsModal() {

    if (!smsModal) {
        return;
    }


    const alreadyRendered =
        smsModal.querySelector(
            "#smsStatus"
        ) &&
        smsModal.querySelector(
            "#smsDate"
        ) &&
        smsModal.querySelector(
            "#smsNote"
        ) &&
        smsModal.querySelector(
            "#smsError"
        );


    if (alreadyRendered) {
        return;
    }


    smsModal.innerHTML = `
        <div class="modal-content" style="width: 90%; max-width: 540px; background: var(--app-surface); border-radius: 12px; box-shadow: var(--app-shadow-soft); padding: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px;">
                <div>
                    <h2 id="smsModalTitle" style="margin: 0; font-size: 20px; font-weight: 600; color: var(--app-text);">SMS Details / Note</h2>
                    <p style="margin: 6px 0 0; font-size: 13px; color: var(--app-muted);">Review the SMS and note details for this record.</p>
                </div>
                <button id="smsCancelBtn" type="button" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--app-muted);" aria-label="Close SMS details modal">&times;</button>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                <div style="padding: 12px 14px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-input-bg);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--app-muted); margin-bottom: 6px;">Phone Number</div>
                    <div id="smsPhone" style="font-size: 14px; font-weight: 600; color: var(--app-text);">-</div>
                </div>

                <div style="padding: 12px 14px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-input-bg);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--app-muted); margin-bottom: 6px;">SMS Status</div>
                    <div id="smsStatus" style="font-size: 14px; font-weight: 600; color: var(--app-text);">-</div>
                </div>

                <div style="padding: 12px 14px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-input-bg);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--app-muted); margin-bottom: 6px;">SMS Error</div>
                    <div id="smsError" style="font-size: 14px; font-weight: 600; color: #dc2626; white-space: pre-wrap; overflow-wrap: anywhere;">-</div>
                </div>

                <div style="padding: 12px 14px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-input-bg);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--app-muted); margin-bottom: 6px;">Date &amp; Time</div>
                    <div id="smsDate" style="font-size: 14px; font-weight: 600; color: var(--app-text);">-</div>
                </div>

                <div style="grid-column: 1 / -1; padding: 12px 14px; border: 1px solid var(--app-border); border-radius: 10px; background: var(--app-input-bg);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--app-muted); margin-bottom: 6px;">Note</div>
                    <div id="smsNote" style="font-size: 14px; font-weight: 600; color: var(--app-text); white-space: pre-wrap; overflow-wrap: anywhere;">-</div>
                </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; margin-top: 18px;">
                <button type="button" id="clearSmsBtn" class="cancel-button" style="padding: 10px 14px; border: 1px solid var(--app-border); background: transparent; color: var(--app-text); border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;">Clear SMS</button>
                <button type="button" id="clearNoteBtn" class="cancel-button" style="padding: 10px 14px; border: 1px solid var(--app-border); background: transparent; color: var(--app-text); border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;">Clear Note</button>
                <button type="button" id="smsFormCancelBtn" class="cancel-button" style="padding: 10px 20px; border: 1px solid var(--app-border); background: transparent; color: var(--app-text); border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;">Close</button>
            </div>
        </div>
    `;


    smsTitle =
        document.getElementById("smsModalTitle");

    smsPhoneValue =
        document.getElementById("smsPhone");

    smsStatusValue =
        document.getElementById("smsStatus");

    smsErrorValue =
        document.getElementById("smsError");

    smsDateValue =
        document.getElementById("smsDate");

    smsNoteValue =
        document.getElementById("smsNote");

    smsCancelBtn =
        document.getElementById("smsCancelBtn");

    smsFormCancelBtn =
        document.getElementById("smsFormCancelBtn");

    clearSmsBtn =
        document.getElementById("clearSmsBtn");

    clearNoteBtn =
        document.getElementById("clearNoteBtn");

}

renderSmsDetailsModal();

function setSmsField(element, value) {

    if (!element) {
        return;
    }

    element.textContent =
        value || "-";

}

function openSmsDetailsModal(record) {

    if (!smsModal) {
        return;
    }


    activeSmsRecordId =
        record.id;


    const smsSent =
        isSmsSentValue(
            record.sms_sent
        );

    const smsError =
        String(record.sms_error || "").trim();

    const smsStatus =
        String(record.sms_status || "").trim().toLowerCase();


    const smsTimestamp =
        formatSmsTimestamp(
            record.sms_date
        );


    if (smsTitle) {
        smsTitle.textContent =
            "SMS Details / Note";
    }


    setSmsField(
        smsPhoneValue,
        record.phone_number || "-"
    );

    setSmsField(
        smsStatusValue,
        smsError || smsStatus === "error"
            ? "Error"
            : smsSent || smsStatus === "sent"
                ? "Sent"
                : "Not Sent"
    );

    setSmsField(
        smsErrorValue,
        smsError || "No error"
    );

    setSmsField(
        smsDateValue,
        smsSent
            ? (smsTimestamp
                ? `${smsTimestamp.dateText} ${smsTimestamp.timeText}`
                : "Not recorded")
            : "-"
    );

    setSmsField(
        smsNoteValue,
        record.notes || record.note || "No note"
    );


    smsModal.style.display =
        "flex";

}


async function clearSmsOrNote(kind) {

    if (!activeSmsRecordId) {
        return;
    }


    const clearSms =
        kind === "sms";


    const confirmed =
        await ConfirmDialog.show(
            clearSms
                ? "Clear the SMS status and date/time for this record?"
                : "Clear the note for this record?",
            clearSms
                ? "Clear SMS Details"
                : "Clear Note",
            "Clear"
        );


    if (!confirmed) {
        return;
    }


    try {

        const data =
            await sendRecordRequest(
                `/api/records/${encodeURIComponent(activeSmsRecordId)}/sms-details`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify(
                        clearSms
                            ? { clearSms: true }
                            : { clearNote: true }
                    )
                }
            );


        if (!data) {
            return;
        }


        const recordIndex =
            allResults.findIndex(
                record =>
                    String(record.id) ===
                    String(activeSmsRecordId)
            );


        if (recordIndex !== -1 && data.record) {
            allResults[recordIndex] = {
                ...allResults[recordIndex],
                ...data.record
            };
        }


        displayResults();


        if (data.record) {
            openSmsDetailsModal(data.record);
        }


        Notification.success(
            data.message ||
            (clearSms
                ? "SMS details cleared successfully."
                : "Note cleared successfully.")
        );

    } catch (error) {

        console.error(
            "CLEAR SMS/NOTE ERROR:",
            error
        );


        Notification.error(
            "Unable to clear the selected details."
        );

    }

}

function closeSmsModal() {

    if (smsModal) {
        smsModal.style.display =
            "none";
    }

}

if (smsCancelBtn) {
    smsCancelBtn.addEventListener(
        "click",
        closeSmsModal
    );
}

if (smsFormCancelBtn) {
    smsFormCancelBtn.addEventListener(
        "click",
        closeSmsModal
    );
}

if (clearSmsBtn) {
    clearSmsBtn.addEventListener(
        "click",
        () => clearSmsOrNote("sms")
    );
}

if (clearNoteBtn) {
    clearNoteBtn.addEventListener(
        "click",
        () => clearSmsOrNote("note")
    );
}

if (smsModal) {
    smsModal.addEventListener(
        "click",
        event => {

            if (
                event.target === smsModal
            ) {

                closeSmsModal();

            }

        }
    );
}


window.addEventListener(
    "resize",
    scheduleActionMenuPosition
);


window.addEventListener(
    "scroll",
    scheduleActionMenuPosition,
    {
        passive: true
    }
);


document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape"
        ) {

            closeActionMenus();

        }

    }
);


// =========================================
// EXPORT CSV
// =========================================

if (exportButton) {

    exportButton.addEventListener(
        "click",
        () => {

            if (
                !allResults.length
            ) {

                Notification.warning(
                    "There are no records to export."
                );

                return;

            }


            const headers = [

                "No",

                "Category",

                "Name",

                "Date of Birth/Death",

                "Phone",

                "Registration Date",

                "Registrar",

                "Status",

                "SMS Sent"

            ];


            const rows =
                allResults.map(
                    (record, index) => {

                        const category =
                            record.category ||
                            "";


                        const isDeath =
                            String(category)
                                .toLowerCase()
                                .trim() ===
                            "death";


                        const date =
                            isDeath
                                ? record.date_of_death
                                : record.date_of_birth;


                        return [

                            index + 1,

                            category,

                            record.name ||
                                "",

                            date ||
                                "",

                            record.phone_number ||
                                "",

                            record.registration_date ||
                                "",

                            record.registrar ||
                                "",

                            record.status ||
                                "",

                            record.sms_sent
                                ? "Yes"
                                : "No"

                        ];

                    }
                );


            const csv = [

                headers,

                ...rows

            ]

            .map(
                row =>

                    row
                        .map(
                            value =>

                                `"${String(value)
                                    .replace(
                                        /"/g,
                                        '""'
                                    )}"`
                        )

                        .join(",")

            )

            .join("\n");


            const blob =
                new Blob(
                    [csv],
                    {
                        type:
                            "text/csv;charset=utf-8;"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            link.download =
                "RecorDs-cases.csv";


            document.body.appendChild(
                link
            );


            link.click();


            document.body.removeChild(
                link
            );


            URL.revokeObjectURL(
                url
            );

        }
    );

}


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


// =========================================
// MOBILE MENU
// =========================================

if (
    menuToggle &&
    sidebar
) {

    menuToggle.addEventListener(
        "click",
        () => {

            sidebar.classList.toggle(
                "open"
            );

        }
    );

}
