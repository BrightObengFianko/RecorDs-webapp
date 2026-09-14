/**
 * Phone Number Utility Functions
 * Formats phone numbers to Ghana format (starting with 233)
 */

/**
 * Formats a phone number to Ghana format (233...)
 * 
 * Examples:
 * - 0501234567 → 233501234567
 * - 233501234567 → 233501234567 (no change)
 * - +233501234567 → 233501234567
 * - 501234567 → 233501234567
 * 
 * @param {string} phone - Raw phone number from user input
 * @returns {string} - Formatted phone number starting with 233
 */
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Convert to string and remove all non-digits
    let cleaned = String(phone).replace(/\D/g, "");

    // If empty after cleaning, return null
    if (!cleaned) return null;

    // Remove leading zeros (Ghana phone format)
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    }

    // Remove country code if already present
    if (cleaned.startsWith("233")) {
        return cleaned;
    }

    // Add country code
    return "233" + cleaned;
}

/**
 * Validates a formatted phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid Ghana phone number
 */
function isValidPhoneNumber(phone) {
    if (!phone) return false;

    const cleaned = String(phone).replace(/\D/g, "");

    // Should be 12 digits: 233 + 9-digit number
    if (cleaned.length !== 12) return false;

    // Should start with 233
    if (!cleaned.startsWith("233")) return false;

    return true;
}

module.exports = {
    formatPhoneNumber,
    isValidPhoneNumber,
};
