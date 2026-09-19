const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { getDefaultBranchId } = require("../utils/branchUtils");
const {
    JWT_EXPIRES_IN,
    getJwtSecret,
    hashPassword,
    isBcryptHash,
    validatePassword
} = require("../utils/authSecurity");
const { boundedText } = require("../utils/inputValidation");
const {
    clearLoginFailures,
    recordLoginFailure
} = require("../middleware/loginRateLimiter");
const {
    ACTIVITY_TYPES,
    recordAuthActivity
} = require("../utils/authActivity");

function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function normalizeAccountStatus(status) {
    const normalized = String(status || "")
        .trim()
        .toLowerCase();

    if (!normalized) {
        return "approved";
    }

    if (normalized === "pending") {
        return "pending";
    }

    if (normalized === "declined") {
        return "declined";
    }

    return "approved";
}

const DEFAULT_ACCOUNT_SETTINGS = {
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

function normalizeAccountSettings(rawSettings, user) {
    const raw = rawSettings && typeof rawSettings === "object"
        ? rawSettings
        : {};
    const rawProfile = raw.profile && typeof raw.profile === "object"
        ? raw.profile
        : {};
    const rawAppearance = raw.appearance && typeof raw.appearance === "object"
        ? raw.appearance
        : {};
    const cleanText = (value, fallback, maxLength) => {
        const text = String(value ?? fallback ?? "").trim();
        return text.length <= maxLength ? text : text.slice(0, maxLength);
    };
    const accent = String(rawAppearance.accent || "").trim();
    const avatar = String(rawProfile.avatar || "");

    return {
        profile: {
            fullName: cleanText(rawProfile.fullName, user?.name, 100),
            emailAddress: cleanText(rawProfile.emailAddress, user?.email, 150).toLowerCase(),
            phoneNumber: cleanText(rawProfile.phoneNumber, "", 30),
            username: cleanText(rawProfile.username, "", 100),
            bio: cleanText(rawProfile.bio, "", 500),
            avatar: /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(avatar)
                && avatar.length <= 750000
                ? avatar
                : ""
        },
        appearance: {
            theme: ["light", "dark", "system"].includes(rawAppearance.theme)
                ? rawAppearance.theme
                : DEFAULT_ACCOUNT_SETTINGS.appearance.theme,
            accent: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)
                ? accent.toLowerCase()
                : DEFAULT_ACCOUNT_SETTINGS.appearance.accent,
            compactMode: Boolean(rawAppearance.compactMode),
            showAvatars: rawAppearance.showAvatars !== false,
            showStatusColors: rawAppearance.showStatusColors !== false,
            enableAnimations: rawAppearance.enableAnimations !== false
        }
    };
}

function attachAccountSettings(user) {
    if (!user) {
        return user;
    }

    const accountSettings = normalizeAccountSettings(user.account_settings, user);
    delete user.account_settings;
    user.accountSettings = accountSettings;
    user.avatar = accountSettings.profile.avatar;
    user.phoneNumber = accountSettings.profile.phoneNumber;
    user.username = accountSettings.profile.username;
    user.bio = accountSettings.profile.bio;
    return user;
}

async function fetchUserByEmail(email) {
    const result = await pool.query(
        `
            SELECT
                u.id,
                u.name,
                u.email,
                u.password,
                LOWER(u.role) AS role,
                u.branch_id,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                COALESCE(u.auth_token_version, 0) AS auth_token_version,
                COALESCE(b.name, '') AS branch,
                u.created_at
            FROM users u
            LEFT JOIN branches b
                ON b.id = u.branch_id
            WHERE u.email = $1
            LIMIT 1
        `,
        [email]
    );

    return result.rows[0] || null;
}

async function fetchUserById(id) {
    const result = await pool.query(
        `
            SELECT
                u.id,
                u.name,
                u.email,
                LOWER(u.role) AS role,
                u.branch_id,
                COALESCE(u.is_active, TRUE) AS is_active,
                UPPER(COALESCE(u.account_status, 'APPROVED')) AS account_status,
                COALESCE(u.auth_token_version, 0) AS auth_token_version,
                COALESCE(b.name, '') AS branch,
                u.account_settings,
                u.created_at
            FROM users u
            LEFT JOIN branches b
                ON b.id = u.branch_id
            WHERE u.id = $1
            LIMIT 1
        `,
        [id]
    );

    return attachAccountSettings(result.rows[0] || null);
}

// =========================
// SIGNUP
// =========================

const signup = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in all required fields."
            });
        }

        const passwordError = validatePassword(password);

        if (passwordError) {
            return res.status(400).json({
                message: passwordError
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (
            boundedText(cleanName, 100) === null ||
            boundedText(cleanEmail, 150) === null
        ) {
            return res.status(400).json({
                message: "Name or email is too long."
            });
        }

        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const branchId = await getDefaultBranchId();

        if (!branchId) {
            return res.status(500).json({
                message: "Default branch is not available."
            });
        }

        const hashedPassword = await hashPassword(password);

        const result = await pool.query(
            `
                INSERT INTO users (
                    name,
                    email,
                    password,
                    role,
                    branch_id,
                    account_status
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                "staff",
                branchId,
                "PENDING"
            ]
        );

        const user = await fetchUserById(result.rows[0].id);

        return res.status(201).json({
            success: true,
            message: "Registration successful. Your account is awaiting administrator approval.",
            user
        });
    } catch (error) {
        console.error("Signup error:", error);

        return res.status(500).json({
            message: "Something went wrong while creating the account."
        });
    }
};

// =========================
// CREATE STAFF ACCOUNT (ADMIN ONLY)
// =========================

const createStaffAccount = async (req, res) => {
    try {
        // Check if user is admin (middleware should have done this, but double-check)
        if (normalizeRole(req.user?.role) !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Only administrators can create staff accounts."
            });
        }

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, email, and temporary password."
            });
        }

        const passwordError = validatePassword(password);

        if (passwordError) {
            return res.status(400).json({
                success: false,
                message: passwordError
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();

        if (
            boundedText(cleanName, 100) === null ||
            boundedText(cleanEmail, 150) === null
        ) {
            return res.status(400).json({
                success: false,
                message: "Name or email is too long."
            });
        }

        // Check if email already exists
        const existingUser = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            [cleanEmail]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            });
        }

        const branchId = await getDefaultBranchId();

        if (!branchId) {
            return res.status(500).json({
                success: false,
                message: "Default branch is not available."
            });
        }

        const hashedPassword = await hashPassword(password);

        // Create staff account with APPROVED status (admin created it)
        const result = await pool.query(
            `
                INSERT INTO users (
                    name,
                    email,
                    password,
                    role,
                    branch_id,
                    account_status,
                    is_active
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id
            `,
            [
                cleanName,
                cleanEmail,
                hashedPassword,
                "branch_staff",
                branchId,
                "APPROVED",
                true
            ]
        );

        const user = await fetchUserById(result.rows[0].id);

        return res.status(201).json({
            success: true,
            message: "Staff account created successfully. Share these credentials with the staff member.",
            user: {
                ...user
            }
        });
    } catch (error) {
        console.error("Create staff account error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while creating the staff account."
        });
    }
};

// =========================
// LOGIN
// =========================

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const cleanEmail = String(email || "").trim().toLowerCase();

        if (!email || !password) {
            recordLoginFailure(req);
            await recordAuthActivity({
                email: cleanEmail,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(400).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = await fetchUserByEmail(cleanEmail);

        if (!user) {
            recordLoginFailure(req);
            await recordAuthActivity({
                email: cleanEmail,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const passwordMatch = isBcryptHash(user.password) && await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            recordLoginFailure(req);
            await recordAuthActivity({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const accountStatus = normalizeAccountStatus(user.account_status);

        if (accountStatus === "pending") {
            recordLoginFailure(req);
            await recordAuthActivity({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (accountStatus === "declined") {
            recordLoginFailure(req);
            await recordAuthActivity({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (user.is_active === false) {
            recordLoginFailure(req);
            await recordAuthActivity({
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                request: req,
                activityType: ACTIVITY_TYPES.LOGIN_FAILURE
            });

            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const userPayload = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: normalizeRole(user.role),
            branch_id: user.branch_id,
            is_active: user.is_active,
            account_status: accountStatus.toUpperCase(),
            token_version: user.auth_token_version
        };

        const token = jwt.sign(
            userPayload,
            getJwtSecret(),
            {
                expiresIn: JWT_EXPIRES_IN,
                algorithm: "HS256"
            }
        );

        clearLoginFailures(req);

        await recordAuthActivity({
            userId: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            request: req,
            activityType: ACTIVITY_TYPES.LOGIN_SUCCESS
        });

        return res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: normalizeRole(user.role),
                branch_id: user.branch_id,
                is_active: user.is_active,
                account_status: accountStatus.toUpperCase(),
                branch: user.branch,
                created_at: user.created_at
            }
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Something went wrong while logging in."
        });
    }
};

const logout = async (req, res) => {
    await pool.query(
        `
            UPDATE users
            SET auth_token_version = COALESCE(auth_token_version, 0) + 1
            WHERE id = $1
        `,
        [req.user.id]
    );

    await recordAuthActivity({
        userId: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        request: req,
        activityType: ACTIVITY_TYPES.LOGOUT_SUCCESS
    });

    return res.json({
        success: true,
        message: "Logout recorded successfully."
    });
};

// =========================
// GET CURRENT USER
// =========================

const getMe = async (req, res) => {
    try {
        const user = await fetchUserById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error("Get user error:", error);

        return res.status(500).json({
            message: "Unable to get user information."
        });
    }
};

const getAccountSettings = async (req, res) => {
    try {
        const user = await fetchUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        return res.json({ success: true, settings: user.accountSettings });
    } catch (error) {
        console.error("Get account settings error:", error);
        return res.status(500).json({ message: "Unable to load account settings." });
    }
};

const updateAccountSettings = async (req, res) => {
    const client = await pool.connect();

    try {
        const existing = await fetchUserById(req.user.id);

        if (!existing) {
            return res.status(404).json({ message: "User not found." });
        }

        const requested = req.body && typeof req.body === "object"
            ? req.body
            : {};
        const requestedProfile = requested.profile && typeof requested.profile === "object"
            ? requested.profile
            : {};
        const fullName = String(requestedProfile.fullName ?? existing.name).trim();
        const email = String(requestedProfile.emailAddress ?? existing.email).trim().toLowerCase();

        if (!fullName || boundedText(fullName, 100) === null) {
            return res.status(400).json({ message: "Full name is required and must be 100 characters or fewer." });
        }

        if (!email || boundedText(email, 150) === null || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: "A valid email address is required." });
        }

        const merged = {
            ...existing.accountSettings,
            ...requested,
            profile: {
                ...existing.accountSettings.profile,
                ...requestedProfile,
                fullName,
                emailAddress: email
            }
        };
        const settings = normalizeAccountSettings(merged, {
            ...existing,
            name: fullName,
            email
        });

        await client.query("BEGIN");
        const result = await client.query(
            `
                UPDATE users
                SET name = $1,
                    email = $2,
                    account_settings = $3::jsonb
                WHERE id = $4
                RETURNING id, name, email
            `,
            [fullName, email, JSON.stringify(settings), req.user.id]
        );
        await client.query("COMMIT");

        return res.json({ success: true, settings });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Account settings rollback error:", rollbackError);
        }

        if (error.code === "23505") {
            return res.status(409).json({ message: "That email address is already in use." });
        }

        console.error("Update account settings error:", error);
        return res.status(500).json({ message: "Unable to save account settings." });
    } finally {
        client.release();
    }
};

module.exports = {
    signup,
    login,
    logout,
    getMe,
    getAccountSettings,
    updateAccountSettings,
    createStaffAccount
};
