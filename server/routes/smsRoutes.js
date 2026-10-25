const express = require("express");

const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/authMiddleware");
const {
    disconnectOfficeSmsSettings,
    getN8NStatus,
    getOfficeSmsBalanceHandler,
    getOfficeSmsSettingsHandler,
    getSmsBalance,
    saveOfficeSmsSettings,
    testOfficeSmsSettings
} = require("../controllers/smsController");
const auditMutatingRequest = require("../middleware/auditMiddleware");

router.get(
    "/n8n-config",
    authenticateToken,
    requireRole("admin", "office_admin", "system_super_admin", "staff"),
    getN8NStatus
);

router.get(
    "/balance",
    authenticateToken,
    auditMutatingRequest,
    requireRole("admin", "office_admin", "system_super_admin", "staff"),
    getSmsBalance
);

router.get(
    "/office-config",
    authenticateToken,
    requireRole("admin", "office_admin", "system_super_admin"),
    getOfficeSmsSettingsHandler
);

router.put(
    "/office-config",
    authenticateToken,
    auditMutatingRequest,
    requireRole("admin", "office_admin", "system_super_admin"),
    saveOfficeSmsSettings
);

router.post(
    "/office-config/test",
    authenticateToken,
    auditMutatingRequest,
    requireRole("admin", "office_admin", "system_super_admin"),
    testOfficeSmsSettings
);

router.get(
    "/office-config/balance",
    authenticateToken,
    requireRole("admin", "office_admin", "system_super_admin"),
    getOfficeSmsBalanceHandler
);

router.delete(
    "/office-config",
    authenticateToken,
    auditMutatingRequest,
    requireRole("admin", "office_admin", "system_super_admin"),
    disconnectOfficeSmsSettings
);

module.exports = router;
