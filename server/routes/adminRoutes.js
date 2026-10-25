const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    listUsers,
    getStaffQuota,
    listPendingUsers,
    approveUser,
    declineUser,
    createUser,
    updateUser,
    deleteUser,
    listBranches,
    listAuthActivity,
    getAuthActivityDetails,
    restoreDeletedCase,
    clearAuthActivity,
    createBranch,
    updateBranch,
    deleteBranch,
    listOffices,
    createOffice,
    updateOffice,
    deleteOffice,
    getOfficeOperationPreview,
    clearOfficeData
} = require("../controllers/adminController");
const {
    listUserSessions,
    forceLogoutSession,
    forceLogoutAllSessions
} = require("../controllers/sessionController");
const validateIdParam = require("../middleware/validateIdParam");
const auditMutatingRequest = require("../middleware/auditMiddleware");

router.use(authMiddleware);
router.use(authMiddleware.requireRole("admin", "office_admin", "system_super_admin"));
router.use(auditMutatingRequest);
router.param("id", validateIdParam);

router.get("/users", listUsers);
router.get("/staff-quota", getStaffQuota);
router.get("/users/:id/sessions", listUserSessions);
router.post("/users/:id/sessions/:sessionId/revoke", forceLogoutSession);
router.post("/users/:id/sessions/revoke-all", forceLogoutAllSessions);
router.get("/users/pending", authMiddleware.requireRole("system_super_admin"), listPendingUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.put("/users/:id/approve", authMiddleware.requireRole("system_super_admin"), approveUser);
router.put("/users/:id/decline", authMiddleware.requireRole("system_super_admin"), declineUser);
router.delete("/users/:id", deleteUser);

router.get("/branches", listBranches);
router.post("/branches", createBranch);
router.patch("/branches/:id", updateBranch);
router.delete("/branches/:id", deleteBranch);
router.get("/offices", authMiddleware.requireRole("system_super_admin"), listOffices);
router.post("/offices", authMiddleware.requireRole("system_super_admin"), createOffice);
router.patch("/offices/:id", authMiddleware.requireRole("system_super_admin"), updateOffice);
router.get("/offices/:id/operation-preview", authMiddleware.requireRole("system_super_admin"), getOfficeOperationPreview);
router.post("/offices/:id/clear-data", authMiddleware.requireRole("system_super_admin"), clearOfficeData);
router.delete("/offices/:id", authMiddleware.requireRole("system_super_admin"), deleteOffice);
router.get("/auth-activity", listAuthActivity);
router.patch("/auth-activity/:id/restore", restoreDeletedCase);
router.get("/auth-activity/:id", getAuthActivityDetails);
router.delete("/auth-activity", clearAuthActivity);

module.exports = router;
