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
                u.created_at
            FROM users u
            LEFT JOIN branches b
                ON b.id = u.branch_id
            WHERE u.id = $1
            LIMIT 1
        `,
        [id]
    );

    return result.rows[0] || null;
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

module.exports = {
    signup,
    login,
    logout,
    getMe,
    createStaffAccount
};
