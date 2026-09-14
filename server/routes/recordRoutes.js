const express = require("express");

const router = express.Router();

const {
    getRecords,
    getProcessingRecords,
    getDashboardSummary,
    getRecordRegistrars,
    getSmsStatus,
    searchRecords,
    getRecordById,
    createRecord,
    updateRecord,
    updateSmsDetails,
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
        "staff"
    ),
    updateRecord
);

// CLEAR SMS DETAILS OR NOTE

router.patch(
    "/:id/sms-details",
    requireRole(
        "admin",
        "staff"
    ),
    updateSmsDetails
);


// =========================================
// UPDATE STATUS
// =========================================

router.patch(
    "/:id/status",
    requireRole(
        "admin",
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
        "staff",
        "branch_staff"
    ),
    sendSms
);


module.exports = router;
