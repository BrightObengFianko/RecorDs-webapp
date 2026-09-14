const express = require("express");

const router = express.Router();
const authenticateToken = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/authMiddleware");
const { getN8NStatus, getSmsBalance } = require("../controllers/smsController");
const auditMutatingRequest = require("../middleware/auditMiddleware");

router.get(
    "/n8n-config",
    authenticateToken,
    requireRole("admin", "staff"),
    getN8NStatus
);

router.get(
    "/balance",
    authenticateToken,
    auditMutatingRequest,
    requireRole("admin", "staff"),
    getSmsBalance
);

module.exports = router;
