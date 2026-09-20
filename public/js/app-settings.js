(function () {
    const STORAGE_KEY = "recordSettings";
    const USER_KEY = "user";
    const STORAGE_PREFIX = `${STORAGE_KEY}:`;

    function normalizeRegistrar(value) {
        const raw = String(value || "").trim().replace(/\s+/g, " ");
        const normalized = raw.toUpperCase();

        return {
            BOSCO: "NEW MARKET",
            POLY: "POLYCLINIC",
            SAMMY: "POLYCLINIC",
            ADMIN: "ADMIN",
            OFFICE: "OFFICE",
            "NEW OFFICE": "NEW OFFICE",
            "NEW MARKET": "NEW MARKET",
            POLYCLINIC: "POLYCLINIC"
        }[normalized] || raw;
    }

    window.RecordRegistrar = Object.freeze({ normalize: normalizeRegistrar });

    const DEFAULT_SETTINGS = {
        profile: {
            fullName: "",
            emailAddress: "",
            phoneNumber: "",
            username: "",
            bio: "",
            avatar: ""
        },
        appearance: {
            theme: "light",
            accent: "#5b4df5",
            compactMode: false,
            showAvatars: true,
            showStatusColors: true,
            enableAnimations: true
        }
    };

    const DEFAULT_PROFILE = {
        id: "",
        name: "Admin",
        email: "",
        role: "Staff",
        avatar: "",
        phoneNumber: "",
        username: "",
        bio: "",
        branch: "",
        branch_id: ""
    };

    function registerOfflineSupport() {
        if (!document.querySelector('link[href="css/offline.css"]')) {
            const stylesheet = document.createElement("link");
            stylesheet.rel = "stylesheet";
            stylesheet.href = "css/offline.css";
            document.head.appendChild(stylesheet);
        }

        if (!document.querySelector('link[rel="manifest"]')) {
            const manifest = document.createElement("link");
            manifest.rel = "manifest";
            manifest.href = "/manifest.webmanifest";
            document.head.appendChild(manifest);
        }

        if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/service-worker.js?v=10", {
                updateViaCache: "none"
            }).then(registration => {
                registration.update();
            }).catch(error => {
                console.warn("Offline shell registration failed:", error.message);
            });
        }
    }

    function normalizeHex(value) {
        const raw = String(value || "").trim();

        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) {
            return DEFAULT_SETTINGS.appearance.accent;
        }

        if (raw.length === 4) {
            const [, r, g, b] = raw;
            return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
        }

        return raw.toLowerCase();
    }

    function hexToRgb(hex) {
        const normalized = normalizeHex(hex).slice(1);
        const value = parseInt(normalized, 16);

        return [
            (value >> 16) & 255,
            (value >> 8) & 255,
            value & 255
        ];
    }

    function toRgba(hex, alpha) {
        const [red, green, blue] = hexToRgb(hex);
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function darken(hex, factor) {
        const [red, green, blue] = hexToRgb(hex);

        const nextRed = Math.max(0, Math.min(255, Math.round(red * factor)));
        const nextGreen = Math.max(0, Math.min(255, Math.round(green * factor)));
        const nextBlue = Math.max(0, Math.min(255, Math.round(blue * factor)));

        return `rgb(${nextRed}, ${nextGreen}, ${nextBlue})`;
    }

    function cloneDefaults() {
        return {
            profile: { ...DEFAULT_SETTINGS.profile },
            appearance: { ...DEFAULT_SETTINGS.appearance }
        };
    }

    function getStoredUserIdentity() {
        const storedUser = readStoredUser();
        const identifier = String(
            storedUser?.id || storedUser?.email || ""
        )
            .trim()
            .toLowerCase();

        return identifier;
    }

    function getSettingsStorageKey() {
        const identity = getStoredUserIdentity();

        return identity
            ? `${STORAGE_PREFIX}${identity}`
            : STORAGE_KEY;
    }

    function readSettings() {
        try {
            const userKey =
                getSettingsStorageKey();

            const userRaw =
                userKey === STORAGE_KEY
                    ? localStorage.getItem(STORAGE_KEY)
                    : localStorage.getItem(userKey);

            const legacyRaw =
                userKey === STORAGE_KEY
                    ? null
                    : localStorage.getItem(STORAGE_KEY);

            const raw =
                userRaw ||
                legacyRaw;

            if (!raw) {
                return cloneDefaults();
            }

            const parsed = JSON.parse(raw);
            const settings = cloneDefaults();

            if (parsed && typeof parsed === "object" && parsed.appearance && typeof parsed.appearance === "object") {
                settings.appearance = {
                    ...settings.appearance,
                    ...parsed.appearance
                };
            }

            if (
                userRaw &&
                parsed &&
                typeof parsed === "object" &&
                parsed.profile &&
                typeof parsed.profile === "object"
            ) {
                settings.profile = {
                    ...settings.profile,
                    ...parsed.profile
                };
            }

            settings.appearance.theme = ["light", "dark", "system"].includes(settings.appearance.theme)
                ? settings.appearance.theme
                : DEFAULT_SETTINGS.appearance.theme;
            settings.appearance.accent = normalizeHex(settings.appearance.accent);
            settings.appearance.compactMode = Boolean(settings.appearance.compactMode);
            settings.appearance.showAvatars = settings.appearance.showAvatars !== false;
            settings.appearance.showStatusColors = settings.appearance.showStatusColors !== false;
            settings.appearance.enableAnimations = settings.appearance.enableAnimations !== false;

            return settings;
        } catch (error) {
            console.error("Unable to read app settings:", error);
            return cloneDefaults();
        }
    }

    function mergeSettings(base, serverSettings) {
        if (!serverSettings || typeof serverSettings !== "object") {
            return base;
        }

        if (serverSettings.profile && typeof serverSettings.profile === "object") {
            base.profile = {
                ...base.profile,
                ...serverSettings.profile
            };
        }

        if (serverSettings.appearance && typeof serverSettings.appearance === "object") {
            base.appearance = {
                ...base.appearance,
                ...serverSettings.appearance
            };
        }

        return base;
    }

    function cacheSettings(settings) {
        try {
            localStorage.setItem(getSettingsStorageKey(), JSON.stringify(settings));
        } catch (error) {
            console.error("Unable to cache account settings:", error);
        }
    }

    function readStoredUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.error("Unable to read stored user:", error);
            return null;
        }
    }

    function readProfile() {
        const settings = readSettings();
        const storedUser = readStoredUser();

        return {
            id: storedUser?.id || DEFAULT_PROFILE.id,
            name: settings.profile.fullName || storedUser?.name || DEFAULT_PROFILE.name,
            email: settings.profile.emailAddress || storedUser?.email || DEFAULT_PROFILE.email,
            role: storedUser?.role || DEFAULT_PROFILE.role,
            avatar: settings.profile.avatar || storedUser?.avatar || DEFAULT_PROFILE.avatar,
            phoneNumber: settings.profile.phoneNumber || storedUser?.phoneNumber || DEFAULT_PROFILE.phoneNumber,
            username: settings.profile.username || storedUser?.username || DEFAULT_PROFILE.username,
            bio: settings.profile.bio || storedUser?.bio || DEFAULT_PROFILE.bio,
            branch: storedUser?.branch || DEFAULT_PROFILE.branch,
            branch_id: storedUser?.branch_id || DEFAULT_PROFILE.branch_id
        };
    }

    function normalizeRole(role) {
        return String(role || "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_")
            .replace(/_+/g, "_");
    }

    function formatRoleLabel(role) {
        const normalized = normalizeRole(role);

        if (normalized === "admin") {
            return "Administrator";
        }

        if (normalized === "branch_staff") {
            return "Branch Staff";
        }

        if (normalized === "staff") {
            return "Staff";
        }

        return role ? String(role) : "Staff";
    }

    function getCurrentPageName() {
        const path = window.location.pathname || "";
        const file = path.split("/").pop() || "index.html";
        return file.toLowerCase();
    }

    function getAllowedPages(role) {
        const normalized = normalizeRole(role);

        if (normalized === "admin") {
            return new Set([
                "dashboard.html",
                "create-record.html",
                "search-cases.html",
                "pending-sync.html",
                "account.html",
                "users.html",
                "reports.html",
                "settings.html",
                "case-details.html"
            ]);
        }

        if (normalized === "branch_staff") {
            return new Set([
                "dashboard.html",
                "create-record.html",
                "search-cases.html",
                "pending-sync.html",
                "settings.html",
                "case-details.html"
            ]);
        }

        return new Set([
            "dashboard.html",
            "create-record.html",
            "search-cases.html",
            "pending-sync.html",
            "account.html",
            "settings.html",
            "case-details.html"
        ]);
    }

    function shouldHideNavigationLink(href, allowedPages) {
        if (!href) {
            return false;
        }

        if (href.startsWith("#")) {
            return true;
        }

        if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) {
            return false;
        }

        const cleanHref = href.split("?")[0].split("#")[0].toLowerCase();
        const fileName = cleanHref.split("/").pop();

        if (!fileName) {
            return false;
        }

        return !allowedPages.has(fileName);
    }

    const NAVIGATION_ICON_BY_PAGE = Object.freeze({
        "dashboard.html": "icon-home",
        "create-record.html": "icon-plus",
        "search-cases.html": "icon-search",
        "reports.html": "icon-chart",
        "users.html": "icon-users",
        "account.html": "icon-user",
        "settings.html": "icon-gear"
    });

    function applyNavigationIcons() {
        document.querySelectorAll(
            ".navigation .nav-item[href], .menu a[href]"
        ).forEach(item => {
            const href = item.getAttribute("href") || "";
            const fileName = href
                .split("?")[0]
                .split("#")[0]
                .split("/")
                .pop()
                .toLowerCase();
            const iconId = NAVIGATION_ICON_BY_PAGE[fileName];

            if (!iconId) {
                return;
            }

            let icon = item.querySelector(".nav-icon, .menu-icon");

            if (!icon) {
                icon = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "svg"
                );
                icon.classList.add("ui-icon", "nav-icon");
                item.insertBefore(icon, item.firstChild);
            }

            icon.setAttribute("aria-hidden", "true");
            icon.classList.add("ui-icon", "nav-icon");
            icon.replaceChildren();

            const use = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "use"
            );
            use.setAttribute(
                "href",
                `/assets/navigation-icons.svg#${iconId}`
            );
            icon.appendChild(use);
        });
    }

    function applySharedSidebarLogo() {
        const sidebar = document.querySelector(".sidebar");
        const logoContainer = sidebar?.querySelector(".logo, .brand");

        if (!logoContainer) {
            return;
        }

        logoContainer.classList.add("shared-sidebar-logo");
        logoContainer.replaceChildren();

        const logo = document.createElement("img");
        logo.src = "/assets/records-logo.jpeg";
        logo.alt = "RecorDs";
        logo.decoding = "async";

        logoContainer.appendChild(logo);
    }

    function addCopyrightFooter() {
        if (document.getElementById("recordCopyrightFooter")) {
            return;
        }

        const footer = document.createElement("footer");
        footer.id = "recordCopyrightFooter";
        footer.className = "record-copyright-footer";
        footer.innerHTML = "&copy; 2026 RecorDs. All Rights Reserved.<br>Designed and Developed by Bright Obeng Fianko";
        document.body.appendChild(footer);
    }

    function injectLoadingStyles() {
        if (document.getElementById("record-auth-loading-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "record-auth-loading-styles";
        style.textContent = `
            body.record-auth-loading {
                overflow: hidden;
            }

            body.record-auth-loading > *:not(#record-auth-loader) {
                display: none !important;
            }

            #record-auth-loader {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(15, 23, 42, 0.26);
                backdrop-filter: blur(4px);
            }

            #record-auth-loader .record-auth-loader-box {
                min-width: 180px;
                padding: 16px 22px;
                border-radius: 12px;
                background: rgba(255, 255, 255, 0.96);
                border: 1px solid rgba(148, 163, 184, 0.35);
                box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
                color: var(--app-text, #202124);
                font-size: 0.92rem;
                font-weight: 700;
                letter-spacing: 0.02em;
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    function showAuthLoadingState() {
        injectLoadingStyles();

        if (document.getElementById("record-auth-loader")) {
            return;
        }

        const loader = document.createElement("div");
        loader.id = "record-auth-loader";
        loader.setAttribute("aria-live", "polite");
        loader.setAttribute("aria-busy", "true");
        loader.innerHTML = '<div class="record-auth-loader-box">Loading...</div>';
        document.body.appendChild(loader);
        document.body.classList.add("record-auth-loading");
    }

    function hideAuthLoadingState() {
        const loader = document.getElementById("record-auth-loader");
        if (loader) {
            loader.remove();
        }

        const bootStyle = document.getElementById("record-auth-boot-style");
        if (bootStyle) {
            bootStyle.remove();
        }

        document.body.classList.remove("record-auth-loading");
        document.documentElement.style.visibility = "visible";
        document.documentElement.style.opacity = "1";
    }

    async function ensureAuthenticatedRole() {
        const token = localStorage.getItem("token");

        showAuthLoadingState();

        if (!token) {
            window.location.replace("index.html");
            return false;
        }

        try {
            const cachedUser = readStoredUser();
            if (navigator.onLine === false && cachedUser && cachedUser.role) {
                document.body.dataset.connectionState = "offline";
                return true;
            }

            const authController = typeof AbortController === "function"
                ? new AbortController()
                : null;
            const authTimeout = window.setTimeout(
                () => authController?.abort(),
                4000
            );
            let response;

            try {
                response = await fetch("/api/auth/me", {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    signal: authController?.signal
                });
            } finally {
                window.clearTimeout(authTimeout);
            }

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
                window.location.replace("index.html");
                return false;
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data || !data.user || !data.user.role) {
                if (response.status >= 500 && cachedUser && cachedUser.role) {
                    document.body.dataset.connectionState = "offline";
                    return true;
                }

                window.location.replace("index.html");
                return false;
            }

            const user = data.user;
            localStorage.setItem("user", JSON.stringify({
                id: user.id || "",
                name: user.name || "",
                email: user.email || "",
                role: user.role || "staff",
                avatar: user.avatar || "",
                phoneNumber: user.phoneNumber || "",
                username: user.username || "",
                bio: user.bio || "",
                branch: user.branch || "",
                branch_id: user.branch_id || ""
            }));

            if (user.accountSettings) {
                cacheSettings(mergeSettings(readSettings(), user.accountSettings));
            }

            const currentRole = normalizeRole(user.role);
            const allowedPages = getAllowedPages(currentRole);
            const currentPage = getCurrentPageName();

            if (
                currentPage !== "index.html" &&
                currentPage !== "signup.html" &&
                !allowedPages.has(currentPage)
            ) {
                window.location.replace("dashboard.html");
                return false;
            }

            return true;
        } catch (error) {
            console.error("Auth bootstrap failed:", error);
            const cachedUser = readStoredUser();

            if (cachedUser && cachedUser.role) {
                document.body.dataset.connectionState = "offline";
                return true;
            }

            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.replace("index.html");
            return false;
        } finally {
            hideAuthLoadingState();
        }
    }

    function applyRoleNavigation(profile) {
        applyNavigationIcons();

        const currentRole = normalizeRole(profile?.role || readStoredUser()?.role || DEFAULT_PROFILE.role);
        const allowedPages = getAllowedPages(currentRole);
        const currentPage = getCurrentPageName();
        const fallbackPage = currentRole === "branch_staff"
            ? "dashboard.html"
            : "dashboard.html";

        if (
            currentPage !== "index.html" &&
            currentPage !== "signup.html" &&
            !allowedPages.has(currentPage)
        ) {
            window.location.replace(fallbackPage);
            return;
        }

        document.querySelectorAll("a[href]").forEach(anchor => {
            const href = anchor.getAttribute("href") || "";

            if (shouldHideNavigationLink(href, allowedPages)) {
                anchor.hidden = true;
                anchor.setAttribute("aria-hidden", "true");
                anchor.setAttribute("tabindex", "-1");
                return;
            }

            anchor.hidden = false;
            anchor.removeAttribute("aria-hidden");
            anchor.removeAttribute("tabindex");
        });

        document.querySelectorAll(".nav-item-static").forEach(item => {
            if (currentRole === "branch_staff") {
                item.hidden = true;
                item.setAttribute("aria-hidden", "true");
                return;
            }

            item.hidden = false;
            item.removeAttribute("aria-hidden");
        });

        document.querySelectorAll(".nav-item-staff-admin-only").forEach(item => {
            if (currentRole === "branch_staff") {
                item.remove();
                return;
            }

            item.hidden = false;
            item.removeAttribute("aria-hidden");
            item.removeAttribute("tabindex");
        });

        document.querySelectorAll(".nav-item-admin-only").forEach(item => {
            if (currentRole !== "admin") {
                item.remove();
                return;
            }

            item.hidden = false;
            item.removeAttribute("aria-hidden");
            item.removeAttribute("tabindex");
        });
    }

    function resolveTheme(themePreference) {
        if (themePreference === "dark") {
            return "dark";
        }

        if (themePreference === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        }

        return "light";
    }

    function applyThemeTokens(theme) {
        const isDark = theme === "dark";
        const root = document.documentElement;

        const tokens = isDark
            ? {
                "--app-bg": "#0f1426",
                "--app-surface": "rgba(14, 19, 34, 0.88)",
                "--app-surface-2": "rgba(17, 23, 42, 0.82)",
                "--app-surface-3": "rgba(17, 23, 42, 0.72)",
                "--app-border": "rgba(148, 163, 184, 0.16)",
                "--app-text": "#eef2ff",
                "--app-muted": "#a7b0c7",
                "--app-muted-strong": "#8b95ae",
                "--app-shadow": "0 30px 70px rgba(0, 0, 0, 0.34)",
                "--app-shadow-soft": "0 14px 28px rgba(0, 0, 0, 0.22)",
                "--app-sidebar-bg": "#0b1021",
                "--app-sidebar-text": "#e2e8f0",
                "--app-sidebar-muted": "#94a3b8",
                "--app-sidebar-hover-bg": "rgba(91, 77, 245, 0.14)",
                "--app-sidebar-active-bg": "var(--accent)",
                "--app-sidebar-border": "rgba(148, 163, 184, 0.16)",
                "--app-input-bg": "rgba(13, 18, 32, 0.9)",
                "--app-input-border": "rgba(148, 163, 184, 0.22)",
                "--app-table-head": "rgba(255, 255, 255, 0.03)",
                "--app-table-row": "rgba(17, 23, 42, 0.72)",
                "--app-table-row-alt": "rgba(17, 23, 42, 0.84)",
                "--app-dropdown-bg": "rgba(14, 19, 34, 0.98)",
                "--app-dropdown-border": "rgba(148, 163, 184, 0.16)",
                "--app-dropdown-hover": "rgba(255, 255, 255, 0.04)"
            }
            : {
                "--app-bg": "#f6f7fb",
                "--app-surface": "#ffffff",
                "--app-surface-2": "#fafafd",
                "--app-surface-3": "#f3f4f8",
                "--app-border": "#e5e7eb",
                "--app-text": "#202124",
                "--app-muted": "#6b7280",
                "--app-muted-strong": "#969bad",
                "--app-shadow": "0 4px 12px rgba(0, 0, 0, 0.04)",
                "--app-shadow-soft": "0 10px 26px rgba(20, 26, 60, 0.08)",
                "--app-sidebar-bg": "#10162f",
                "--app-sidebar-text": "#d7d9e4",
                "--app-sidebar-muted": "#aab0c5",
                "--app-sidebar-hover-bg": "#202746",
                "--app-sidebar-active-bg": "var(--accent)",
                "--app-sidebar-border": "rgba(255, 255, 255, 0.08)",
                "--app-input-bg": "#ffffff",
                "--app-input-border": "#d1d5db",
                "--app-table-head": "#fafafd",
                "--app-table-row": "#ffffff",
                "--app-table-row-alt": "#f7f8fa",
                "--app-dropdown-bg": "#ffffff",
                "--app-dropdown-border": "#e5e7eb",
                "--app-dropdown-hover": "#f3f4f6"
            };

        Object.entries(tokens).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });
    }

    function applySettings(settings) {
        const nextSettings = settings || readSettings();
        const accent = normalizeHex(nextSettings.appearance.accent);
        const root = document.documentElement;
        const body = document.body;
        const theme = resolveTheme(nextSettings.appearance.theme);
        const [red, green, blue] = hexToRgb(accent);
        const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
        const isLightAccent = luminance >= 190;
        const isVeryLightAccent = (red + green + blue) / 3 >= 245;
        const accentSoft = isVeryLightAccent
            ? (theme === "dark"
                ? "rgba(255, 255, 255, 0.12)"
                : "rgba(15, 23, 42, 0.06)")
            : toRgba(accent, 0.14);
        const accentForeground = isLightAccent ? "#0f172a" : "#ffffff";
        const accentInk = isLightAccent ? "#0f172a" : accent;

        root.style.setProperty("--accent", accent);
        root.style.setProperty("--accent-soft", accentSoft);
        root.style.setProperty("--accent-strong", darken(accent, 0.82));
        root.style.setProperty("--accent-foreground", accentForeground);
        root.style.setProperty("--accent-ink", accentInk);
        root.dataset.theme = theme;
        applyThemeTokens(theme);

        if (body) {
            body.classList.toggle("compact-mode", Boolean(nextSettings.appearance.compactMode));
            body.classList.toggle("reduced-motion", !Boolean(nextSettings.appearance.enableAnimations));
        }

        return nextSettings;
    }

    function getInitial(value) {
        const text = String(value || "").trim();

        if (!text) {
            return "A";
        }

        return text.charAt(0).toUpperCase();
    }

    function applyAvatar(element, profile) {
        if (!element) {
            return;
        }

        const safeAvatar = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(
            String(profile.avatar || "")
        )
            ? profile.avatar
            : "";

        if (safeAvatar) {
            element.classList.remove("logo-avatar");
            element.classList.add("has-photo");
            element.style.backgroundImage = `url("${safeAvatar}")`;
            element.style.backgroundSize = "cover";
            element.style.backgroundPosition = "center";
            element.style.backgroundRepeat = "no-repeat";
            element.style.backgroundColor = "transparent";
            element.textContent = "";
            return;
        }

        element.classList.add("logo-avatar");
        element.classList.remove("has-photo");
        element.style.backgroundImage = 'url("/assets/records-logo.jpeg")';
        element.style.backgroundSize = "135% auto";
        element.style.backgroundPosition = "center 18%";
        element.style.backgroundRepeat = "no-repeat";
        element.style.backgroundColor = "#ffffff";
        element.textContent = getInitial(profile.name);
    }

    function applyProfile(profile) {
        const currentProfile = profile || readProfile();
        const displayName = currentProfile.name || DEFAULT_PROFILE.name;
        const displayRole = currentProfile.role || DEFAULT_PROFILE.role;
        const storedUser = readStoredUser();

        const nameTargets = [
            "sidebarUserName",
            "topUserName",
            "welcomeName"
        ];

        const roleTargets = [
            "sidebarUserRole",
            "topUserRole"
        ];

        nameTargets.forEach(id => {
            const element = document.getElementById(id);

            if (element) {
                element.textContent = displayName;
            }
        });

        roleTargets.forEach(id => {
            const element = document.getElementById(id);

            if (element) {
                element.textContent = formatRoleLabel(displayRole);
            }
        });

        applyAvatar(document.getElementById("sidebarAvatar"), currentProfile);
        applyAvatar(document.getElementById("topAvatar"), currentProfile);
        applyAvatar(document.getElementById("profileAvatar"), currentProfile);

        try {
            localStorage.setItem(
                USER_KEY,
                JSON.stringify({
                    id: currentProfile.id || storedUser?.id || "",
                    name: currentProfile.name || DEFAULT_PROFILE.name,
                    email: currentProfile.email || DEFAULT_PROFILE.email,
                    role: currentProfile.role || DEFAULT_PROFILE.role,
                    // The avatar is stored in the per-user settings object.
                    avatar: "",
                    phoneNumber: currentProfile.phoneNumber || "",
                    username: currentProfile.username || "",
                    bio: currentProfile.bio || "",
                    branch: currentProfile.branch || "",
                    branch_id: currentProfile.branch_id || ""
                })
            );
        } catch (error) {
            console.error("Unable to persist profile:", error);
        }

        applyRoleNavigation(currentProfile);

        return currentProfile;
    }

    (async function initializeAppShell() {
        registerOfflineSupport();
        const ready = await ensureAuthenticatedRole();

        if (!ready) {
            return;
        }

        applySharedSidebarLogo();
        addCopyrightFooter();

        const state = applySettings(readSettings());
        const profileState = applyProfile(readProfile());
        initAdminHeaderLogout();

        window.RecordSettings = {
            storageKey: getSettingsStorageKey(),
            defaultSettings: DEFAULT_SETTINGS,
            readSettings,
            applySettings,
            current: state
        };

        window.RecordProfile = {
            defaultProfile: DEFAULT_PROFILE,
            readProfile,
            applyProfile,
            current: profileState
        };
    })();

    if (typeof window.matchMedia === "function") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => {
            const settings = readSettings();

            if (settings.appearance.theme === "system") {
                applySettings(settings);
            }
        };

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", onChange);
        } else if (typeof mediaQuery.addListener === "function") {
            mediaQuery.addListener(onChange);
        }
    }

    window.addEventListener("storage", event => {
        if (
            event.key === STORAGE_KEY ||
            String(event.key || "").startsWith(STORAGE_PREFIX)
        ) {
            applySettings(readSettings());
        }

        if (event.key === USER_KEY) {
            applyProfile(readProfile());
        }
    });

    // =====================================
    // SIDEBAR TOGGLE
    // =====================================

    function initAdminHeaderLogout() {
        const logoutButton = document.getElementById("logoutButton");
        const sidebarBottom = logoutButton?.closest(".sidebar-bottom");

        // Dashboard already owns a purpose-built header logout control.
        if (!logoutButton || !sidebarBottom || logoutButton.classList.contains("logout-button")) {
            return;
        }

        const originalNextSibling = logoutButton.nextSibling;
        const mobileQuery = window.matchMedia("(max-width: 1100px)");
        const desktopParent = document.querySelector(
            ".users-topbar-profile, .page-top-right, .reports-topbar, " +
            ".account-heading, .pending-sync-heading, .page-heading, .settings-main .hero"
        );

        if (!desktopParent) {
            return;
        }

        const isFloatingHeader = desktopParent.matches(
            ".page-heading, .settings-main .hero"
        );

        const placeLogout = () => {
            if (mobileQuery.matches) {
                logoutButton.classList.remove("header-logout-floating");
                logoutButton.classList.remove("logout-button");
                logoutButton.classList.add("logout");

                if (originalNextSibling && originalNextSibling.parentNode === sidebarBottom) {
                    sidebarBottom.insertBefore(logoutButton, originalNextSibling);
                } else {
                    sidebarBottom.appendChild(logoutButton);
                }
                return;
            }

            logoutButton.classList.remove("logout");
            logoutButton.classList.add("logout-button");
            logoutButton.classList.toggle("header-logout-floating", isFloatingHeader);
            desktopParent.appendChild(logoutButton);
        };

        placeLogout();

        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", placeLogout);
        } else {
            mobileQuery.addListener(placeLogout);
        }
    }

    const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

    function initSidebarToggle() {
        const toggleButton = document.getElementById("sidebarToggle");
        const sidebar = document.querySelector(".sidebar");

        if (!toggleButton || !sidebar) {
            return;
        }

        const mobileQuery =
            window.matchMedia("(max-width: 1100px)");

        let overlay =
            document.querySelector(".sidebar-overlay");

        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "sidebar-overlay";
            overlay.setAttribute("aria-hidden", "true");
            document.body.appendChild(overlay);
        }

        const isMobileSidebar = () =>
            mobileQuery.matches;

        const closeMobileSidebar = () => {
            sidebar.classList.remove("mobile-open");
            overlay.classList.remove("is-visible");
            document.body.classList.remove("sidebar-mobile-open");
            toggleButton.setAttribute("aria-expanded", "false");
            toggleButton.title = "Open menu";
        };

        const openMobileSidebar = () => {
            sidebar.classList.add("mobile-open");
            overlay.classList.add("is-visible");
            document.body.classList.add("sidebar-mobile-open");
            toggleButton.setAttribute("aria-expanded", "true");
            toggleButton.title = "Close menu";
        };

        const syncSidebarMode = () => {
            if (isMobileSidebar()) {
                document.body.classList.remove("sidebar-collapsed");
                closeMobileSidebar();
                return;
            }

            overlay.classList.remove("is-visible");
            sidebar.classList.remove("mobile-open");
            document.body.classList.remove("sidebar-mobile-open");

            const isCollapsed =
                localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";

            document.body.classList.toggle(
                "sidebar-collapsed",
                isCollapsed
            );

            updateToggleButtonState(
                toggleButton,
                isCollapsed
            );
        };

        toggleButton.setAttribute("aria-expanded", "false");
        toggleButton.setAttribute("aria-controls", "appSidebar");
        sidebar.id = sidebar.id || "appSidebar";

        syncSidebarMode();

        toggleButton.addEventListener("click", () => {
            if (isMobileSidebar()) {
                if (sidebar.classList.contains("mobile-open")) {
                    closeMobileSidebar();
                } else {
                    openMobileSidebar();
                }

                return;
            }

            const collapsed =
                document.body.classList.toggle("sidebar-collapsed");

            localStorage.setItem(
                SIDEBAR_COLLAPSED_KEY,
                collapsed
            );

            updateToggleButtonState(
                toggleButton,
                collapsed
            );
        });

        overlay.addEventListener(
            "click",
            closeMobileSidebar
        );

        document.addEventListener("keydown", event => {
            if (
                event.key === "Escape" &&
                sidebar.classList.contains("mobile-open")
            ) {
                closeMobileSidebar();
            }
        });

        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener(
                "change",
                syncSidebarMode
            );
        } else {
            mobileQuery.addListener(syncSidebarMode);
        }

    }

    function updateToggleButtonState(button, isCollapsed) {
        const icon = button.querySelector(".toggle-icon use");
        const span = button.querySelector("span");

        if (!icon) {
            return;
        }

        if (isCollapsed) {
            icon.setAttribute("href", "#icon-chevron-right");
            button.title = "Expand sidebar";
            if (span) {
                span.textContent = "Show";
            }
        } else {
            icon.setAttribute("href", "#icon-chevron-left");
            button.title = "Collapse sidebar";
            if (span) {
                span.textContent = "Hide";
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initSidebarToggle);
    } else {
        initSidebarToggle();
    }

    // =====================================
    // PAGE TRANSITIONS
    // =====================================

    function initPageTransitions() {
        const transitionTarget = document.querySelector(".main, .settings-app");

        const playEnterTransition = () => {
            if (!transitionTarget) {
                return;
            }

            document.body.classList.remove("page-transition-exit");
            document.body.classList.add("page-transition-enter");

            const clearEnterTransition = event => {
                if (event.animationName === "record-page-enter") {
                    document.body.classList.remove("page-transition-enter");
                    transitionTarget.removeEventListener("animationend", clearEnterTransition);
                }
            };

            transitionTarget.addEventListener("animationend", clearEnterTransition);
        };

        playEnterTransition();

        if (transitionTarget) {
            window.addEventListener("pageshow", event => {
                if (event.persisted) {
                    playEnterTransition();
                }
            });
        }

        let isLeaving = false;

        document.addEventListener("click", event => {
            const anchor = event.target.closest("a");

            if (
                !anchor ||
                isLeaving ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                anchor.target === "_blank" ||
                anchor.hasAttribute("download")
            ) {
                return;
            }

            const destination = new URL(anchor.href, window.location.href);

            if (
                destination.origin !== window.location.origin ||
                !["http:", "https:"].includes(destination.protocol) ||
                destination.href === window.location.href
            ) {
                return;
            }

            event.preventDefault();
            isLeaving = true;
            document.body.classList.remove("page-transition-enter");
            document.body.classList.add("page-transition-exit");

            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
                document.body.classList.contains("reduced-motion");
            const transitionDuration = reducedMotion ? 0 : 160;

            window.setTimeout(() => {
                window.location.assign(destination.href);
            }, transitionDuration);
        });
    }

    async function performLogout() {
        const token = localStorage.getItem("token");

        try {
            if (token) {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    keepalive: true
                });
            }
        } catch (error) {
            console.warn("Unable to record logout activity:", error);
        } finally {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.replace("index.html");
        }
    }

    // Capture the shared sidebar logout before page-specific handlers redirect.
    document.addEventListener("click", event => {
        const logoutButton = event.target.closest("#logoutButton");

        if (!logoutButton) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        performLogout();
    }, true);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initPageTransitions);
    } else {
        initPageTransitions();
    }
})();
