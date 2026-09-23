const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
    listUsers,
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
    deleteBranch
} = require("../controllers/adminController");
const validateIdParam = require("../middleware/validateIdParam");
const auditMutatingRequest = require("../middleware/auditMiddleware");

router.use(authMiddleware);
router.use(authMiddleware.requireRole("admin"));
router.use(auditMutatingRequest);
router.param("id", validateIdParam);

router.get("/users", listUsers);
router.get("/users/pending", listPendingUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.put("/users/:id/approve", approveUser);
router.put("/users/:id/decline", declineUser);
router.delete("/users/:id", deleteUser);

router.get("/branches", listBranches);
router.post("/branches", createBranch);
router.patch("/branches/:id", updateBranch);
router.delete("/branches/:id", deleteBranch);
router.get("/auth-activity", listAuthActivity);
router.patch("/auth-activity/:id/restore", restoreDeletedCase);
router.get("/auth-activity/:id", getAuthActivityDetails);
router.delete("/auth-activity", clearAuthActivity);

module.exports = router;
