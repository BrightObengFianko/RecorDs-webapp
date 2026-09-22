const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "index.html";
}

const STORAGE_KEY = "recordSettings";
const STORAGE_PREFIX = `${STORAGE_KEY}:`;

const DEFAULT_SETTINGS = {
    profile: {
        id: "",
        fullName: "",
        emailAddress: "",
        phoneNumber: "",
        username: "",
        bio: "System administrator with full access to manage cases, users and system settings.",
        avatar: "",
        branch: "",
        branch_id: ""
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

const profileForm = document.getElementById("profileForm");
const photoInput = document.getElementById("photoInput");
const photoTrigger = document.getElementById("photoTrigger");
const photoButton = document.getElementById("photoButton");
const profileSaveButton = document.getElementById("profileSaveButton");
const appearanceSaveButton = document.getElementById("appearanceSaveButton");
const toast = document.getElementById("toast");
const logoutButton = document.getElementById("logoutButton");
const sidebarAvatar = document.getElementById("sidebarAvatar");
const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserRole = document.getElementById("sidebarUserRole");
const topAvatar = document.getElementById("topAvatar");
const profileAvatar = document.getElementById("profileAvatar");
const fullNameInput = document.getElementById("fullName");
const emailAddressInput = document.getElementById("emailAddress");
const phoneNumberInput = document.getElementById("phoneNumber");
const usernameInput = document.getElementById("username");
const bioInput = document.getElementById("bio");
const themeGrid = document.getElementById("themeGrid");
const accentSwatches = document.getElementById("accentSwatches");
const compactModeInput = document.getElementById("compactMode");
const showAvatarsInput = document.getElementById("showAvatars");
const showStatusColorsInput = document.getElementById("showStatusColors");
const enableAnimationsInput = document.getElementById("enableAnimations");

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
let toastTimer = null;
let currentUserRole = "";
let currentUserId = "";
let currentUserEmail = "";
let state = null;

try {
    const cachedUser = JSON.parse(localStorage.getItem("user") || "null");

    if (cachedUser && typeof cachedUser === "object" && cachedUser.role) {
        currentUserRole = cachedUser.role;
    }

    if (cachedUser && typeof cachedUser === "object") {
        currentUserId = cachedUser.id || "";
        currentUserEmail = cachedUser.email || "";
    }
} catch (error) {
    console.error("Unable to read cached user:", error);
}

function readStoredUser() {
    try {
        const raw = localStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error("Unable to read stored user:", error);
        return null;
    }
}

function getSettingsStorageKey() {
    const storedUser = readStoredUser();
    const identity = String(
        storedUser?.id ||
        currentUserId ||
        storedUser?.email ||
        currentUserEmail ||
        ""
    )
        .trim()
        .toLowerCase();

    return identity
        ? `${STORAGE_PREFIX}${identity}`
        : STORAGE_KEY;
}

function parseSettings(raw, includeProfile) {
    if (!raw) {
        return null;
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
        includeProfile &&
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
}

function cloneDefaults() {
    return {
        profile: { ...DEFAULT_SETTINGS.profile },
        appearance: { ...DEFAULT_SETTINGS.appearance }
    };
}

function mergeSettings(base, stored) {
    if (!stored || typeof stored !== "object") {
        return base;
    }

    if (stored.profile && typeof stored.profile === "object") {
        base.profile = {
            ...base.profile,
            ...stored.profile
        };
    }

    if (stored.appearance && typeof stored.appearance === "object") {
        base.appearance = {
            ...base.appearance,
            ...stored.appearance
        };
    }

    return base;
}

function loadSettings() {
    try {
        const userKey = getSettingsStorageKey();
        const userRaw = userKey === STORAGE_KEY
            ? localStorage.getItem(STORAGE_KEY)
            : localStorage.getItem(userKey);
        const legacyRaw = userKey === STORAGE_KEY
            ? null
            : localStorage.getItem(STORAGE_KEY);
        const raw = userRaw || legacyRaw;

        if (!raw) {
            return cloneDefaults();
        }

        return parseSettings(raw, Boolean(userRaw)) || cloneDefaults();
    } catch (error) {
        console.error("Unable to read settings:", error);
        return cloneDefaults();
    }
}

function toBoolean(value, fallback) {
    if (typeof value === "boolean") {
        return value;
    }

    return fallback;
}

function saveSettings() {
    localStorage.setItem(getSettingsStorageKey(), JSON.stringify(state));
}

function mergeServerSettings(serverSettings) {
    if (!serverSettings || typeof serverSettings !== "object") {
        return;
    }

    state = mergeSettings(cloneDefaults(), serverSettings);
    saveSettings();
}

async function persistSettingsToServer() {
    const response = await fetch("/api/auth/settings", {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(state)
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "index.html";
        throw new Error("Your session has expired.");
    }

    if (!response.ok || !data.settings) {
        throw new Error(data.message || "Unable to save account settings.");
    }

    mergeServerSettings(data.settings);
    return state;
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

function darkenHex(hex, factor) {
    const [red, green, blue] = hexToRgb(hex);

    const nextRed = Math.max(0, Math.min(255, Math.round(red * factor)));
    const nextGreen = Math.max(0, Math.min(255, Math.round(green * factor)));
    const nextBlue = Math.max(0, Math.min(255, Math.round(blue * factor)));

    return `rgb(${nextRed}, ${nextGreen}, ${nextBlue})`;
}

function toRgba(hex, alpha) {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getInitial(name) {
    const value = String(name || "").trim();
    if (!value) {
        return "R";
    }
    return value.charAt(0).toUpperCase();
}

function setAvatar(element, image, label) {
    if (!element) {
        return;
    }

    const safeImage = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(
        String(image || "")
    )
        ? image
        : "";

    if (safeImage) {
        element.classList.remove("logo-avatar");
        element.classList.add("has-photo");
        element.style.backgroundImage = `url("${safeImage}")`;
        element.style.backgroundSize = "cover";
        element.style.backgroundPosition = "center";
        element.style.backgroundRepeat = "no-repeat";
        element.style.backgroundColor = "transparent";
        element.textContent = "";
        return;
    }

    element.classList.add("logo-avatar");
    element.classList.remove("has-photo");
    element.style.backgroundImage = "";
    element.style.backgroundSize = "";
    element.style.backgroundPosition = "";
    element.style.backgroundRepeat = "";
    element.style.backgroundColor = "";
    element.textContent = label;
}

function showToast(message) {
    if (!toast) {
        return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2200);
}

function resolveTheme(preference) {
    if (preference === "dark") {
        return "dark";
    }

    if (preference === "system") {
        return systemThemeQuery.matches ? "dark" : "light";
    }

    return "light";
}

function applyAccent(accent) {
    const normalizedAccent = normalizeHex(accent);
    const [red, green, blue] = hexToRgb(normalizedAccent);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    const isLightAccent = luminance >= 190;
    const isVeryLightAccent = (red + green + blue) / 3 >= 245;
    const accentSoft = isVeryLightAccent
        ? "rgba(15, 23, 42, 0.06)"
        : toRgba(normalizedAccent, 0.14);

    document.documentElement.style.setProperty("--accent", normalizedAccent);
    document.documentElement.style.setProperty("--accent-soft", accentSoft);
    document.documentElement.style.setProperty("--accent-strong", darkenHex(normalizedAccent, 0.82));
    document.documentElement.style.setProperty(
        "--accent-foreground",
        isLightAccent ? "#0f172a" : "#ffffff"
    );
    document.documentElement.style.setProperty(
        "--accent-ink",
        isLightAccent ? "#0f172a" : normalizedAccent
    );
}

function applyTheme(preference) {
    const theme = resolveTheme(preference);
    document.documentElement.dataset.theme = theme;
}

function applyPageClasses() {
    document.body.classList.toggle("compact-mode", Boolean(state.appearance.compactMode));
    document.body.classList.toggle("reduced-motion", !Boolean(state.appearance.enableAnimations));
}

function syncThemeCards() {
    const cards = document.querySelectorAll(".theme-card");

    cards.forEach(card => {
        const input = card.querySelector('input[name="theme"]');
        card.classList.toggle("is-selected", Boolean(input && input.checked));
    });
}

function syncAccentSwatches() {
    const swatches = document.querySelectorAll(".accent-swatch");

    swatches.forEach(swatch => {
        const input = swatch.querySelector('input[name="accent"]');
        swatch.classList.toggle("is-selected", Boolean(input && input.checked));
    });
}

function fillMissingProfileData(user) {
    if (!user || typeof user !== "object") {
        return;
    }

    if (!state.profile.id) {
        state.profile.id = user.id || "";
    }

    if (!state.profile.fullName) {
        state.profile.fullName = user.name || "";
    }

    if (!state.profile.emailAddress) {
        state.profile.emailAddress = user.email || "";
    }

    if (!state.profile.phoneNumber) {
        state.profile.phoneNumber = user.phoneNumber || "";
    }

    if (!state.profile.username) {
        const baseName = user.username || user.name || user.email || "";
        state.profile.username = String(baseName)
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    if (!state.profile.bio && user.bio) {
        state.profile.bio = user.bio;
    }

    if (!state.profile.avatar) {
        state.profile.avatar = user.avatar || "";
    }

    if (!state.profile.branch && user.branch) {
        state.profile.branch = user.branch;
    }

    if (!state.profile.branch_id && user.branch_id) {
        state.profile.branch_id = user.branch_id;
    }

    if (!state.profile.bio && String(user.role || "").toLowerCase() === "admin") {
        state.profile.bio = DEFAULT_SETTINGS.profile.bio;
    }

    currentUserRole = user.role || currentUserRole;
}

function updateAvatarViews() {
    const displayName = state.profile.fullName || "";
    const avatarLabel = getInitial(displayName || "RecorDs");
    const photo = state.profile.avatar || "";

    setAvatar(profileAvatar, photo, avatarLabel);
    setAvatar(topAvatar, photo, avatarLabel);
    setAvatar(sidebarAvatar, photo, avatarLabel);
}

function updateFormFields() {
    fullNameInput.value = state.profile.fullName || "";
    emailAddressInput.value = state.profile.emailAddress || "";
    phoneNumberInput.value = state.profile.phoneNumber || "";
    usernameInput.value = state.profile.username || "";
    bioInput.value = state.profile.bio || "";

    const themeInputs = document.querySelectorAll('input[name="theme"]');
    themeInputs.forEach(input => {
        input.checked = input.value === state.appearance.theme;
    });

    const accentInputs = document.querySelectorAll('input[name="accent"]');
    accentInputs.forEach(input => {
        input.checked = normalizeHex(input.value) === normalizeHex(state.appearance.accent);
    });

    compactModeInput.checked = Boolean(state.appearance.compactMode);
    showAvatarsInput.checked = Boolean(state.appearance.showAvatars);
    showStatusColorsInput.checked = Boolean(state.appearance.showStatusColors);
    enableAnimationsInput.checked = Boolean(state.appearance.enableAnimations);

    syncThemeCards();
    syncAccentSwatches();
}

function renderSettings() {
    updateFormFields();
    updateAvatarViews();
    applyAccent(state.appearance.accent);
    applyTheme(state.appearance.theme);
    applyPageClasses();
}

function persistUserCache() {
    const user = {
        id: state.profile.id || currentUserId || "",
        name: state.profile.fullName || "Admin",
        email: state.profile.emailAddress || currentUserEmail || "",
        role: currentUserRole || "Staff",
        // Keep the image in the settings record instead of duplicating it in user cache.
        avatar: "",
        phoneNumber: state.profile.phoneNumber || "",
        username: state.profile.username || "",
        bio: state.profile.bio || "",
        branch: state.profile.branch || "",
        branch_id: state.profile.branch_id || ""
    };

    localStorage.setItem("user", JSON.stringify(user));

    if (window.RecordProfile && typeof window.RecordProfile.applyProfile === "function") {
        // The avatar is stored in per-user settings, but the shared shell
        // still needs the current image when it reapplies the profile.
        window.RecordProfile.applyProfile({
            ...user,
            avatar: state.profile.avatar || ""
        });
    }

    return user;
}

async function loadAuthenticatedUser() {
    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

    if (response.status === 401 || response.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "index.html";
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Unable to load account data.");
        }

        const user = data.user || data;

        if (user && typeof user === "object") {
            currentUserId = user.id || currentUserId;
            currentUserEmail = user.email || currentUserEmail;
            currentUserRole = user.role || currentUserRole;
            if (user.accountSettings) {
                mergeServerSettings(user.accountSettings);
            } else {
                fillMissingProfileData(user);
            }
            persistUserCache();
            updateAvatarViews();
            updateFormFields();
        }
    } catch (error) {
        console.error("Unable to load authenticated user:", error);
    }
}

async function saveProfileFromForm() {
    const previousState = JSON.parse(JSON.stringify(state));
    state.profile.fullName = fullNameInput.value.trim();
    state.profile.emailAddress = emailAddressInput.value.trim();
    state.profile.phoneNumber = phoneNumberInput.value.trim();
    state.profile.username = usernameInput.value.trim();
    state.profile.bio = bioInput.value.trim();

    if (!state.profile.username) {
        state.profile.username = String(state.profile.fullName || state.profile.emailAddress || "")
            .split("@")[0]
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    if (sidebarUserName) {
        sidebarUserName.textContent = state.profile.fullName || "Admin";
    }

    if (sidebarUserRole) {
        sidebarUserRole.textContent = currentUserRole || "Staff";
    }

    updateAvatarViews();
    persistUserCache();
    saveSettings();

    try {
        await persistSettingsToServer();
        showToast("Profile saved.");
    } catch (error) {
        state = previousState;
        renderSettings();
        persistUserCache();
        showToast(error.message || "Unable to save profile.");
    }
}

async function saveAppearanceFromForm() {
    const previousState = JSON.parse(JSON.stringify(state));
    const selectedTheme = document.querySelector('input[name="theme"]:checked');
    const selectedAccent = document.querySelector('input[name="accent"]:checked');

    state.appearance.theme = selectedTheme ? selectedTheme.value : "light";
    state.appearance.accent = selectedAccent ? normalizeHex(selectedAccent.value) : DEFAULT_SETTINGS.appearance.accent;
    state.appearance.compactMode = compactModeInput.checked;
    state.appearance.showAvatars = showAvatarsInput.checked;
    state.appearance.showStatusColors = showStatusColorsInput.checked;
    state.appearance.enableAnimations = enableAnimationsInput.checked;

    applyAccent(state.appearance.accent);
    applyTheme(state.appearance.theme);
    applyPageClasses();
    syncThemeCards();
    syncAccentSwatches();
    saveSettings();

    try {
        await persistSettingsToServer();
        showToast("Appearance saved.");
    } catch (error) {
        state = previousState;
        renderSettings();
        persistUserCache();
        showToast(error.message || "Unable to save appearance.");
    }
}

function optimizeProfilePhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const source = String(reader.result || "");
            const image = new Image();

            image.onload = () => {
                const maxSize = 512;
                const scale = Math.min(
                    1,
                    maxSize / Math.max(image.naturalWidth, image.naturalHeight)
                );
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const canvas = document.createElement("canvas");

                canvas.width = width;
                canvas.height = height;

                const context = canvas.getContext("2d");

                if (!context) {
                    resolve(source);
                    return;
                }

                context.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };

            image.onerror = () => reject(new Error("Unable to read the selected photo."));
            image.src = source;
        };

        reader.onerror = () => reject(new Error("Unable to read the selected photo."));
        reader.readAsDataURL(file);
    });
}

async function handlePhotoSelection(file) {
    if (!file) {
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showToast("Photo must be 2MB or smaller.");
        return;
    }

    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
        showToast("Please select a PNG, JPG, GIF, or WebP image.");
        return;
    }

    const previousState = JSON.parse(JSON.stringify(state));

    try {
        state.profile.avatar = await optimizeProfilePhoto(file);
        updateAvatarViews();
        persistUserCache();
        saveSettings();
        await persistSettingsToServer();
        showToast("Photo updated.");
    } catch (error) {
        state = previousState;
        renderSettings();
        persistUserCache();
        console.error("Unable to save profile photo:", error);
        showToast(error.message || "Unable to save the selected photo.");
    }
}

function bindEvents() {
    if (photoTrigger) {
        photoTrigger.addEventListener("click", () => photoInput.click());
    }

    if (photoButton) {
        photoButton.addEventListener("click", () => photoInput.click());
    }

    if (photoInput) {
        photoInput.addEventListener("change", () => {
            const file = photoInput.files && photoInput.files[0];
            handlePhotoSelection(file);
            photoInput.value = "";
        });
    }

    if (profileForm) {
        profileForm.addEventListener("submit", async event => {
            event.preventDefault();
            profileSaveButton.disabled = true;
            try {
                await saveProfileFromForm();
            } finally {
                profileSaveButton.disabled = false;
            }
        });
    }

    if (appearanceSaveButton) {
        appearanceSaveButton.addEventListener("click", async () => {
            appearanceSaveButton.disabled = true;
            try {
                await saveAppearanceFromForm();
            } finally {
                appearanceSaveButton.disabled = false;
            }
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }

    if (themeGrid) {
        themeGrid.addEventListener("change", event => {
            const input = event.target.closest('input[name="theme"]');
            if (!input) {
                return;
            }

            state.appearance.theme = input.value;
            syncThemeCards();
            applyTheme(state.appearance.theme);
        });
    }

    if (accentSwatches) {
        accentSwatches.addEventListener("change", event => {
            const input = event.target.closest('input[name="accent"]');
            if (!input) {
                return;
            }

            state.appearance.accent = normalizeHex(input.value);
            syncAccentSwatches();
            applyAccent(state.appearance.accent);
        });
    }

    [compactModeInput, showAvatarsInput, showStatusColorsInput, enableAnimationsInput].forEach(input => {
        if (!input) {
            return;
        }

        input.addEventListener("change", () => {
            state.appearance.compactMode = compactModeInput.checked;
            state.appearance.showAvatars = showAvatarsInput.checked;
            state.appearance.showStatusColors = showStatusColorsInput.checked;
            state.appearance.enableAnimations = enableAnimationsInput.checked;
            applyPageClasses();
        });
    });

    const handleSystemThemeChange = () => {
        if (state.appearance.theme === "system") {
            applyTheme("system");
        }
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
        systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === "function") {
        systemThemeQuery.addListener(handleSystemThemeChange);
    }
}

state = loadSettings();

state.appearance.theme = ["light", "dark", "system"].includes(state.appearance.theme)
    ? state.appearance.theme
    : DEFAULT_SETTINGS.appearance.theme;
state.appearance.accent = normalizeHex(state.appearance.accent);
state.appearance.compactMode = toBoolean(state.appearance.compactMode, DEFAULT_SETTINGS.appearance.compactMode);
state.appearance.showAvatars = toBoolean(state.appearance.showAvatars, DEFAULT_SETTINGS.appearance.showAvatars);
state.appearance.showStatusColors = toBoolean(state.appearance.showStatusColors, DEFAULT_SETTINGS.appearance.showStatusColors);
state.appearance.enableAnimations = toBoolean(state.appearance.enableAnimations, DEFAULT_SETTINGS.appearance.enableAnimations);

if (token) {
    document.title = "RecorDs - Settings";

    fillMissingProfileData({
        name: "",
        email: "",
        role: ""
    });

    renderSettings();
    bindEvents();

    loadAuthenticatedUser().then(() => {
        // Reload after authentication confirms the current per-user settings key.
        state = loadSettings();
        fillMissingProfileData(readStoredUser() || {});
        renderSettings();
    });
}
