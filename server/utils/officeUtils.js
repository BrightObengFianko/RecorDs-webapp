function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function isSystemSuperAdmin(user) {
    const role = normalizeRole(user?.role);
    return role === "system_super_admin";
}

function isOfficeSystemSuperAdmin(user) {
    return normalizeRole(user?.role) === "system_super_admin";
}

function isOfficeAdmin(user) {
    return normalizeRole(user?.role) === "office_admin";
}

function isOfficeScoped(user) {
    return !isSystemSuperAdmin(user);
}

function officeScope(alias, user, values, column = "office_id") {
    if (!isOfficeScoped(user)) {
        return "";
    }

    values.push(user?.office_id || null);
    return `${alias ? `${alias}.` : ""}${column} = $${values.length}`;
}

function canAccessOffice(user, officeId) {
    return isSystemSuperAdmin(user) || String(user?.office_id) === String(officeId);
}

module.exports = {
    normalizeRole,
    isSystemSuperAdmin,
    isOfficeSystemSuperAdmin,
    isOfficeAdmin,
    isOfficeScoped,
    officeScope,
    canAccessOffice
};
