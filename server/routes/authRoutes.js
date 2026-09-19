const express = require("express");

const router = express.Router();

const {
    signup,
    login,
    logout,
    getMe,
    getAccountSettings,
    updateAccountSettings,
    createStaffAccount
} = require("../controllers/authController");

const authenticateToken =
    require("../middleware/authMiddleware");

const { requireRole } =
    require("../middleware/authMiddleware");

const {
    loginRateLimiter
} = require("../middleware/loginRateLimiter");
const auditMutatingRequest = require("../middleware/auditMiddleware");


// Public endpoint
router.post("/login", loginRateLimiter, login);
router.post("/logout", authenticateToken, auditMutatingRequest, logout);

// Protected endpoints - auth required
router.get("/me", authenticateToken, getMe);
router.get("/settings", authenticateToken, getAccountSettings);
router.patch("/settings", authenticateToken, updateAccountSettings);
router.get("/account-access", authenticateToken, requireRole("admin", "staff", "branch_staff"), (req, res) => {
    res.json({
        success: true,
        allowed: true,
        role: req.user.role
    });
});

// Admin-only endpoints (authenticateToken first, then requireRole)
router.post("/signup", authenticateToken, requireRole("admin"), signup);
router.post("/staff/create", authenticateToken, requireRole("admin"), createStaffAccount);


module.exports = router;
