const pool = require("../config/database");
const { DEFAULT_BRANCH_NAME } = require("../config/migrate");

async function getDefaultBranchId() {
    const result = await pool.query(
        `
            SELECT id
            FROM branches
            WHERE name = $1
            LIMIT 1
        `,
        [DEFAULT_BRANCH_NAME]
    );

    if (!result.rowCount) {
        return null;
    }

    return result.rows[0].id;
}

async function getBranchById(branchId) {
    if (!branchId) {
        return null;
    }

    const result = await pool.query(
        `
            SELECT id, name, created_at
            FROM branches
            WHERE id = $1
            LIMIT 1
        `,
        [branchId]
    );

    return result.rows[0] || null;
}

async function getBranchNameById(branchId) {
    const branch = await getBranchById(branchId);
    return branch ? branch.name : "";
}

module.exports = {
    getDefaultBranchId,
    getBranchById,
    getBranchNameById
};
