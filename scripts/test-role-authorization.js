const assert = require("node:assert/strict");
const {
    isSystemSuperAdmin,
    isOfficeSystemSuperAdmin
} = require("../server/utils/officeUtils");
const { canAssignRole } = require("../server/controllers/adminController");

const systemSuperAdmin = { role: "system_super_admin", office_id: null };
const officeAdmin = { role: "office_admin", office_id: 10 };
const ordinaryAdmin = { role: "admin", office_id: 10 };

assert.equal(isSystemSuperAdmin(systemSuperAdmin), true);
assert.equal(isOfficeSystemSuperAdmin(systemSuperAdmin), true);
assert.equal(isSystemSuperAdmin(officeAdmin), false);
assert.equal(isSystemSuperAdmin(ordinaryAdmin), false);

for (const role of ["staff", "branch_staff"]) {
    assert.equal(canAssignRole(officeAdmin, role), true);
}

for (const role of ["admin", "office_admin", "system_super_admin"]) {
    assert.equal(canAssignRole(officeAdmin, role), false);
    assert.equal(canAssignRole(ordinaryAdmin, role), false);
    assert.equal(canAssignRole(systemSuperAdmin, role), true);
}

console.log("ROLE_AUTHORIZATION_CHECK_OK");
