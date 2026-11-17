const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/subscriptionController");

const router = express.Router();
router.use(authMiddleware, authMiddleware.requireRole("system_super_admin"));
router.get("/overview", controller.getOverview);
router.get("/plans", controller.listPlans);
router.post("/plans", controller.createPlan);
router.get("/offices", controller.listSubscriptions);
router.get("/offices/:officeId/payments", controller.listPayments);
router.post("/offices/:officeId/payments", controller.recordPayment);
router.post("/offices/:officeId/extend", controller.extendSubscription);
router.post("/offices/:officeId/access", controller.updateAccess);

module.exports = router;
