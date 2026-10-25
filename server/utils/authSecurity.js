const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = Math.max(
    12,
    Number.parseInt(process.env.BCRYPT_ROUNDS || "12", 10)
);

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

function getJwtSecret() {
    const secret = String(process.env.JWT_SECRET || "").trim();

    if (secret.length < 32) {
        throw new Error("JWT_SECRET must be configured with at least 32 characters.");
    }

    return secret;
}

function validatePassword(password) {
    const value = String(password || "");

    if (value.length < 12) {
        return "Password must be at least 12 characters long.";
    }

    if (!/[A-Z]/.test(value)) {
        return "Password must include at least one uppercase letter.";
    }

    if (!/[a-z]/.test(value)) {
        return "Password must include at least one lowercase letter.";
    }

    if (!/[0-9]/.test(value)) {
        return "Password must include at least one number.";
    }

    if (!/[^A-Za-z0-9]/.test(value)) {
        return "Password must include at least one special character.";
    }

    return null;
}

function isBcryptHash(value) {
    return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(
        String(value || "")
    );
}

async function hashPassword(password) {
    const validationError = validatePassword(password);

    if (validationError) {
        const error = new Error(validationError);
        error.code = "INVALID_PASSWORD";
        throw error;
    }

    return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

module.exports = {
    BCRYPT_ROUNDS,
    JWT_EXPIRES_IN,
    getJwtSecret,
    hashPassword,
    isBcryptHash,
    validatePassword
};
