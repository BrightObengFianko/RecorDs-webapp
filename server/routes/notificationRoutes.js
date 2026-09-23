const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = authMiddleware;
const validateIdParam = require("../middleware/validateIdParam");
const {
    listNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications
} = require("../controllers/notificationController");

const router = express.Router();

router.use(authMiddleware, requireRole("admin"));
router.param("id", validateIdParam);
router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/:id/read", markNotificationRead);
router.post("/read-all", markAllNotificationsRead);
router.delete("/clear-all", clearAllNotifications);
router.delete("/:id", deleteNotification);

module.exports = router;
