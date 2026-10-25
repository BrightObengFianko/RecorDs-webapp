const express = require("express");

const router = express.Router();

const {
    getRecords,
    getProcessingRecords,
    getDashboardSummary,
    getRecentTodayRecords,
    getRecordRegistrars,
    getSmsStatus,
    searchRecords,
    exportRecords,
    getRecordById,
    createRecord,
    updateRecord,
    updateSmsDetails,
    markRecordReceived,
    approveRecord,
    approveProcessingRecord,
    deleteRecord,
    sendSms
} = require("../controllers/recordController");

const authenticateToken =
    require("../middleware/authMiddleware");

const {
    requireRole
} = require("../middleware/authMiddleware");
const validateIdParam = require("../middleware/validateIdParam");
const auditMutatingRequest = require("../middleware/auditMiddleware");


router.use(
    authenticateToken
);
router.use(auditMutatingRequest);

router.param("id", validateIdParam);


// =========================================
// GET ALL / SEARCH RECORDS
// =========================================

router.get(
    "/",
    getRecords
);

// =========================================
// PROCESSING RECORDS FOR APPROVAL
// =========================================

router.get(
    "/pending-approval",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    getProcessingRecords
);


// =========================================
// SEARCH RECORDS
// =========================================

router.get(
    "/search",
    searchRecords
);

router.get(
    "/export",
    exportRecords
);

// REGISTRARS USED BY RECORDS

router.get(
    "/registrars",
    getRecordRegistrars
);

router.get(
    "/sms-status",
    getSmsStatus
);


// =========================================
// DASHBOARD SUMMARY
// =========================================

router.get(
    "/summary",
    getDashboardSummary
);

router.get(
    "/recent-today",
    getRecentTodayRecords
);


// =========================================
// GET ONE RECORD
// =========================================

router.get(
    "/:id",
    getRecordById
);


// =========================================
// CREATE RECORD
// =========================================

router.post(
    "/",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff",
        "branch_staff"
    ),
    createRecord
);


// =========================================
// UPDATE RECORD
// =========================================

router.patch(
    "/:id",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    updateRecord
);

// CLEAR SMS DETAILS OR NOTE

router.patch(
    "/:id/sms-details",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    updateSmsDetails
);

// MARK READY RECORD AS RECEIVED

router.post(
    "/:id/received",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    markRecordReceived
);


// =========================================
// UPDATE STATUS
// =========================================

router.patch(
    "/:id/status",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    approveRecord
);

// =========================================
// APPROVE PROCESSING RECORD
// =========================================

router.post(
    "/:id/approve",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    approveProcessingRecord
);


// =========================================
// DELETE RECORD
// =========================================

router.delete(
    "/:id",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff"
    ),
    deleteRecord
);


// =========================================
// SEND SMS
// =========================================

router.post(
    "/:id/send-sms",
    requireRole(
        "admin",
        "office_admin",
        "system_super_admin",
        "staff",
        "branch_staff"
    ),
    sendSms
);


module.exports = router;
